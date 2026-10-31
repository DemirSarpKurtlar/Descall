import Foundation
import UIKit
import PushKit
import CallKit
import Intents
import AVFoundation
import UserNotifications

/// Receives CallKit events for the web layer (implemented by DescallCallKitPlugin).
protocol DescallCallEventSink: AnyObject {
    func deliverCallEvent(_ name: String, _ data: [String: Any])
    /// CallKit just activated the audio session (the plugin un-mutes WKWebView capture).
    func callAudioSessionActivated()
}

/// PushKit (VoIP) + CallKit for incoming DM calls.
///
/// Created in AppDelegate at launch, because iOS delivers a VoIP push to an
/// app it launched in the background before any web JavaScript runs. Every
/// VoIP push is reported to CallKit synchronously inside the PushKit handler
/// (iOS 13+ terminates apps that don't, and stops delivering VoIP pushes).
///
/// CallKit actions are forwarded to JS as "callkitEvent" plugin events. Until
/// JS has registered its listener (e.g. cold start from the lock screen) they
/// are queued and handed over by `drainEvents`.
///
/// Mainland China: CallKit isn't allowed there, so nothing here is set up when
/// the device region is CN (no CXProvider, no PushKit registration, no VoIP
/// token). The app then falls back to the in-app ringing UI.
final class DescallCallManager: NSObject {
    static let shared = DescallCallManager()

    struct CallInfo {
        let uuid: UUID
        var callerId: String
        var callerName: String
        var video: Bool
        var conversationId: String
        var outgoing: Bool
        var answered = false
        /// From the VoIP push: lets the phone report this ring's state while the
        /// web layer is suspended (backend lib/voipStatus.js).
        var calleeId = ""
        var statusToken = ""
        var statusUrl = ""
        /// Answered while the app wasn't active (locked phone): waiting for the
        /// user to open Descall so the web app can join.
        var awaitingJoin = false

        var dictionary: [String: Any] {
            [
                "uuid": uuid.uuidString.lowercased(),
                "callerId": callerId,
                "callerName": callerName,
                "video": video,
                "callType": video ? "video" : "voice",
                "conversationId": conversationId,
                "outgoing": outgoing,
                "answered": answered,
                "awaitingJoin": awaitingJoin,
            ]
        }
    }

    private static let ringTimeout: TimeInterval = 45
    /// Answered on the lock screen: how long to wait for the app to be opened
    /// (the web app can't capture the mic or run WebRTC while locked).
    private static let lockedJoinTimeout: TimeInterval = 60
    private static let maxQueuedEvents = 64

    private(set) var callKitAllowed = false
    private(set) var voipToken: String?
    private var provider: CXProvider?
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?
    /// CXSetHeldCallAction: mute state to restore on resume (native engine calls).
    var heldMuteRestore: [UUID: Bool] = [:]
    private var calls: [UUID: CallInfo] = [:]
    /// Actions JS asked for itself ("answer:<uuid>" ...) — fulfilled without echoing an event back.
    private var jsInitiated = Set<String>()
    private var ringTimers: [UUID: DispatchWorkItem] = [:]
    private var joinTimers: [UUID: DispatchWorkItem] = [:]
    private var queuedEvents: [[String: Any]] = []
    /// Rings that already ended here (end push, timeout, user action): a late
    /// ring push for one of them is reported-then-ended, never rung again.
    private var recentlyEnded: [UUID: Date] = [:]
    private static let recentlyEndedTTL: TimeInterval = 180
    private var jsReady = false
    private weak var sink: DescallCallEventSink?
    /// Between provider(_:didActivate:) and didDeactivate (diagnostics).
    private(set) var callKitAudioActive = false

    private override init() {
        super.init()
    }

    // MARK: - Setup

    static func isMainlandChinaRegion() -> Bool {
        let code: String?
        if #available(iOS 16, *) {
            code = Locale.current.region?.identifier
        } else {
            code = Locale.current.regionCode
        }
        return code?.uppercased() == "CN"
    }

    /// Call once from application(_:didFinishLaunchingWithOptions:).
    func start() {
        guard voipRegistry == nil, provider == nil else { return }
        callKitAllowed = !Self.isMainlandChinaRegion()
        guard callKitAllowed else { return }

        let provider = CXProvider(configuration: Self.providerConfiguration())
        provider.setDelegate(self, queue: nil) // main queue
        self.provider = provider

        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
    }

    private static func providerConfiguration() -> CXProviderConfiguration {
        // CXProviderConfiguration() takes the name from CFBundleDisplayName ("Descall").
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        // Calls (incl. missed) appear in the Phone app's Recents; tapping one
        // relaunches Descall with INStartCallIntent → handleStartCallIntent → JS "startCallIntent".
        config.includesCallsInRecents = true
        config.ringtoneSound = nil // system default ringtone
        // iconTemplateImageData stays unset: the only logo asset is the full-colour,
        // opaque app icon, which renders as a solid square as a template mask.
        return config
    }

    private func makeUpdate(_ info: CallInfo) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: info.callerId.isEmpty ? "descall" : info.callerId)
        update.localizedCallerName = info.callerName
        update.hasVideo = info.video
        update.supportsHolding = true
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        return update
    }

    // MARK: - JS bridge plumbing

    func attach(sink: DescallCallEventSink) {
        self.sink = sink
    }

    /// The web view (re)loaded: hold events until its listener drains them.
    func jsDetached() {
        jsReady = false
    }

    func drainEvents(for sink: DescallCallEventSink) -> [[String: Any]] {
        self.sink = sink
        jsReady = true
        let events = queuedEvents
        queuedEvents.removeAll()
        return events
    }

    /// Events from helpers (DescallAudioRouter) — same queue/delivery as CallKit events.
    func emitEvent(_ name: String, _ data: [String: Any] = [:]) {
        emit(name, data)
    }

    private func emit(_ name: String, _ data: [String: Any] = [:]) {
        if jsReady, let sink = sink {
            sink.deliverCallEvent(name, data)
            return
        }
        queuedEvents.append(["event": name, "data": data])
        if queuedEvents.count > Self.maxQueuedEvents {
            queuedEvents.removeFirst(queuedEvents.count - Self.maxQueuedEvents)
        }
    }

    // MARK: - Incoming VoIP push

    private static func string(_ value: Any?) -> String {
        switch value {
        case let s as String: return s
        case let n as NSNumber: return n.stringValue
        default: return ""
        }
    }

    static func parse(_ payload: [AnyHashable: Any]) -> CallInfo {
        let uuid = UUID(uuidString: string(payload["callUuid"])) ?? UUID()
        let videoValue = payload["video"]
        let video: Bool
        if let flag = videoValue as? Bool {
            video = flag
        } else {
            let raw = string(videoValue).lowercased()
            video = raw == "1" || raw == "true" || string(payload["callType"]) == "video"
        }
        let callerId = string(payload["callerId"])
        let name = string(payload["callerName"])
        var info = CallInfo(
            uuid: uuid,
            callerId: callerId,
            callerName: name.isEmpty ? "Descall" : name,
            video: video,
            conversationId: string(payload["conversationId"]).isEmpty ? callerId : string(payload["conversationId"]),
            outgoing: false
        )
        info.calleeId = string(payload["calleeId"])
        info.statusToken = string(payload["statusToken"])
        let url = string(payload["statusUrl"])
        info.statusUrl = url.lowercased().hasPrefix("https://") ? url : ""
        return info
    }

    private func noteEnded(_ uuid: UUID) {
        let now = Date()
        recentlyEnded[uuid] = now
        recentlyEnded = recentlyEnded.filter { now.timeIntervalSince($0.value) < Self.recentlyEndedTTL }
    }

    private func endedRecently(_ uuid: UUID) -> Bool {
        guard let at = recentlyEnded[uuid] else { return false }
        return Date().timeIntervalSince(at) < Self.recentlyEndedTTL
    }

    static func endReason(_ raw: String) -> CXCallEndedReason {
        switch raw {
        case "answeredElsewhere": return .answeredElsewhere
        case "declinedElsewhere": return .declinedElsewhere
        case "unanswered": return .unanswered
        case "failed": return .failed
        default: return .remoteEnded
        }
    }

    /// VoIP "call-end" push (backend lib/callRingFanout.js): the ring was
    /// answered or declined on another device (e.g. Descall on Windows), the
    /// caller hung up, or nobody answered. This is the only channel that
    /// reaches a locked / suspended / killed iPhone, whose web layer and
    /// socket are not running, so without it CallKit kept saying "arıyor".
    ///
    /// iOS requires a CallKit report for every VoIP push:
    ///  - known ringing call → reportNewIncomingCall with the same UUID (CallKit
    ///    answers callUUIDAlreadyExists, which counts) and then
    ///    reportCall(endedAt:reason:) with .answeredElsewhere / .declinedElsewhere
    ///    / .remoteEnded / .unanswered;
    ///  - a call this phone answered itself → left alone (that answer is the
    ///    reason the other devices stop);
    ///  - unknown UUID (app relaunched after the ring) → report, then end at once.
    fileprivate func handleCallEndPush(_ payload: [AnyHashable: Any], completion: @escaping () -> Void) {
        let rawUuid = Self.string(payload["callUuid"])
        let reason = Self.endReason(Self.string(payload["reason"]))
        guard let provider = provider, let uuid = UUID(uuidString: rawUuid) else {
            // Nothing to identify: still satisfy PushKit with a throwaway call.
            reportAndEndPlaceholder(UUID(), payload: payload, reason: reason, completion: completion)
            return
        }
        if let info = calls[uuid] {
            provider.reportNewIncomingCall(with: uuid, update: makeUpdate(info)) { [weak self] _ in
                DispatchQueue.main.async {
                    defer { completion() }
                    guard let self = self, let current = self.calls[uuid] else { return }
                    if current.answered || current.outgoing { return }
                    self.reportEnded(uuid, reason: reason)
                    var data = current.dictionary
                    data["reason"] = Self.string(payload["reason"])
                    self.emit("endedElsewhere", data)
                }
            }
            return
        }
        reportAndEndPlaceholder(uuid, payload: payload, reason: reason, completion: completion)
    }

    private func reportAndEndPlaceholder(_ uuid: UUID, payload: [AnyHashable: Any], reason: CXCallEndedReason,
                                         completion: @escaping () -> Void) {
        guard let provider = provider else {
            completion()
            return
        }
        noteEnded(uuid)
        var info = Self.parse(payload)
        info = CallInfo(uuid: uuid, callerId: info.callerId, callerName: info.callerName,
                        video: false, conversationId: info.conversationId, outgoing: false)
        provider.reportNewIncomingCall(with: uuid, update: makeUpdate(info)) { _ in
            DispatchQueue.main.async {
                provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
                completion()
            }
        }
    }

    fileprivate func handleIncomingVoipPush(_ payload: [AnyHashable: Any], completion: @escaping () -> Void) {
        let info = Self.parse(payload)
        guard let provider = provider else {
            completion()
            return
        }
        if calls[info.uuid] == nil && endedRecently(info.uuid) {
            // The end push (or a local end) beat this ring: never ring a dead call.
            reportAndEndPlaceholder(info.uuid, payload: payload, reason: .remoteEnded, completion: completion)
            return
        }
        let alreadyKnown = calls[info.uuid] != nil
        let busy = !alreadyKnown && !calls.isEmpty
        if !alreadyKnown && !busy {
            calls[info.uuid] = info
        }

        // Reported synchronously in the PushKit handler, as iOS requires.
        provider.reportNewIncomingCall(with: info.uuid, update: makeUpdate(info)) { [weak self] error in
            DispatchQueue.main.async {
                defer { completion() }
                guard let self = self else { return }
                if let error = error {
                    let code = (error as? CXErrorCodeIncomingCallError)?.code
                    if code == .callUUIDAlreadyExists {
                        return // same ring delivered twice; the existing call keeps ringing
                    }
                    if !alreadyKnown && !busy {
                        self.calls.removeValue(forKey: info.uuid)
                    }
                    var data = info.dictionary
                    data["reason"] = Self.incomingErrorName(error)
                    self.emit("incomingReportFailed", data)
                    return
                }
                if busy {
                    // Already in another call: report-then-end keeps the PushKit
                    // contract without stealing the current call.
                    provider.reportCall(with: info.uuid, endedAt: Date(), reason: .unanswered)
                    var data = info.dictionary
                    data["reason"] = "busy"
                    self.emit("incomingReportFailed", data)
                    return
                }
                self.scheduleRingTimeout(info.uuid)
                // 2.10.108: get the native answer path ready while it rings
                // (token, TURN config, signaling, offer, ICE). Nothing is sent
                // unless the call is answered on the CallKit screen.
                DescallNativeCall.shared.prepare(self.calls[info.uuid] ?? info)
                self.emit("incomingPush", info.dictionary)
                DescallBridgeHost.preloadIfNoScene()
            }
        }
    }

    private static func incomingErrorName(_ error: Error) -> String {
        guard let code = (error as? CXErrorCodeIncomingCallError)?.code else { return "failed" }
        switch code {
        case .callUUIDAlreadyExists: return "exists"
        case .filteredByDoNotDisturb: return "dnd"
        case .filteredByBlockList: return "blocked"
        case .unentitled: return "unentitled"
        default: return "failed"
        }
    }

    private func scheduleRingTimeout(_ uuid: UUID) {
        ringTimers[uuid]?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, let info = self.calls[uuid], !info.answered else { return }
            self.ringTimers.removeValue(forKey: uuid)
            DescallNativeCall.shared.cancel(uuid)
            self.calls.removeValue(forKey: uuid)
            self.noteEnded(uuid)
            self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            self.emit("ringTimeout", info.dictionary)
        }
        ringTimers[uuid] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.ringTimeout, execute: work)
    }

    private func cancelRingTimeout(_ uuid: UUID) {
        ringTimers.removeValue(forKey: uuid)?.cancel()
    }

    // MARK: - Answered on the lock screen

    /// Lock-screen hints in the UI language (DescallNotifyStrings table, English fallback).
    private static var strings: DescallNotifyStrings {
        DescallNotifyStrings(lang: DescallNotifyLang.current())
    }

    /// WKWebView can't use the microphone (or reliably run the web app) while
    /// the phone is locked, so a call answered on the lock screen can only be
    /// joined once the user opens Descall. Until then: say so on the CallKit
    /// screen and in a notification, keep the caller waiting (server
    /// "answering"), and give up cleanly after `lockedJoinTimeout`.
    private func beginAwaitingJoin(_ uuid: UUID) {
        guard var info = calls[uuid], !info.awaitingJoin else { return }
        info.awaitingJoin = true
        calls[uuid] = info

        let hint = Self.strings.text("call.openToConnect")
        let update = makeUpdate(info)
        update.localizedCallerName = "\(info.callerName) · \(hint)"
        provider?.reportCall(with: uuid, updated: update)

        postLocalNotification(
            id: "descall-call-join-\(uuid.uuidString.lowercased())",
            title: info.callerName,
            body: Self.strings.text("call.unlockToJoin")
        )
        postCallStatus(info, status: "answering")

        joinTimers[uuid]?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.lockedJoinTimedOut(uuid) }
        joinTimers[uuid] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lockedJoinTimeout, execute: work)
    }

    /// The web app joined the call (JS → callJoined).
    func callJoined(_ uuid: UUID) {
        guard let info = calls[uuid], info.awaitingJoin else { return }
        finishAwaitingJoin(uuid)
        provider?.reportCall(with: uuid, updated: makeUpdate(info))
    }

    private func finishAwaitingJoin(_ uuid: UUID) {
        joinTimers.removeValue(forKey: uuid)?.cancel()
        calls[uuid]?.awaitingJoin = false
        removeLocalNotification(id: "descall-call-join-\(uuid.uuidString.lowercased())")
    }

    private func lockedJoinTimedOut(_ uuid: UUID) {
        joinTimers.removeValue(forKey: uuid)
        guard let info = calls[uuid], info.awaitingJoin else { return }
        finishAwaitingJoin(uuid)
        calls.removeValue(forKey: uuid)
        provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        postCallStatus(info, status: "failed")
        postLocalNotification(
            id: "descall-call-missed-\(uuid.uuidString.lowercased())",
            title: info.callerName,
            body: Self.strings.text("call.joinFailedLocked")
        )
        emit("joinTimeout", info.dictionary)
    }

    private func postLocalNotification(id: String, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = nil
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                NSLog("[DescallCallKit] local notification failed: \(error.localizedDescription)")
            }
        }
    }

    private func removeLocalNotification(id: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
    }

    /// Tell the backend what happened to this ring (the web layer may be suspended).
    private func postCallStatus(_ info: CallInfo, status: String) {
        guard !info.statusToken.isEmpty, !info.calleeId.isEmpty,
              let url = URL(string: info.statusUrl), url.scheme == "https" else { return }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "callUuid": info.uuid.uuidString.lowercased(),
            "calleeId": info.calleeId,
            "token": info.statusToken,
            "status": status,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "descall-call-status") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                NSLog("[DescallCallKit] call status \(status) failed: \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                NSLog("[DescallCallKit] call status \(status) HTTP \(http.statusCode)")
            }
            DispatchQueue.main.async {
                if task != .invalid {
                    UIApplication.shared.endBackgroundTask(task)
                    task = .invalid
                }
            }
        }.resume()
    }

    // MARK: - Audio session

    /// WKWebView's WebRTC engine (WebKit's media process) owns the capture and
    /// playback audio units and configures the app's shared AVAudioSession
    /// itself once getUserMedia runs. Changing the category/mode while that
    /// capture is running tears its audio unit down, and the microphone track
    /// keeps "working" but sends silence (2.9.133: "ses karşıya gitmiyor").
    ///
    /// So the category is only set while nothing is capturing yet (e.g. a call
    /// answered on the lock screen before the web app started its mic), and
    /// is never touched mid-capture. Output routing is done separately with
    /// overrideOutputAudioPort (DescallAudioRouter), which doesn't disturb it.
    private func prepareAudioSessionIfIdle(video: Bool) {
        let session = AVAudioSession.sharedInstance()
        guard session.category != .playAndRecord else { return }
        do {
            // .defaultToSpeaker: voice calls must not open on the earpiece.
            // Wired headphones and Bluetooth still take the route (iOS leaves
            // an external port alone). Category is only set while idle.
            try session.setCategory(
                .playAndRecord,
                mode: video ? .videoChat : .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            // Fullband Opus capture/playback; 10 ms IO keeps latency low.
            try? session.setPreferredSampleRate(48000)
            try? session.setPreferredIOBufferDuration(0.01)
        } catch {
            NSLog("[DescallCallKit] audio session category failed: \(error.localizedDescription)")
        }
    }

    /// Non-personal snapshot of the audio session for call diagnostics.
    func audioDiagnostics() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        var data: [String: Any] = [
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "options": Int(session.categoryOptions.rawValue),
            "outputs": session.currentRoute.outputs.map { $0.portType.rawValue },
            "inputs": session.currentRoute.inputs.map { $0.portType.rawValue },
            "inputAvailable": session.isInputAvailable,
            "otherAudioPlaying": session.isOtherAudioPlaying,
            "sampleRate": session.sampleRate,
            "callKitAudioActive": callKitAudioActive,
            "callKitCalls": calls.count,
            "callKitAllowed": callKitAllowed,
        ]
        switch session.recordPermission {
        case .granted: data["recordPermission"] = "granted"
        case .denied: data["recordPermission"] = "denied"
        default: data["recordPermission"] = "undetermined"
        }
        return data
    }

    // MARK: - Requests from JS (main thread)

    enum StatusResult: String {
        case reported, exists, busy, dnd, blocked, unentitled, failed, unavailable
    }

    func reportIncomingFromJs(_ info: CallInfo, completion: @escaping (StatusResult) -> Void) {
        guard let provider = provider else { return completion(.unavailable) }
        if calls[info.uuid] != nil { return completion(.exists) }
        if !calls.isEmpty { return completion(.busy) }
        calls[info.uuid] = info
        provider.reportNewIncomingCall(with: info.uuid, update: makeUpdate(info)) { [weak self] error in
            DispatchQueue.main.async {
                guard let self = self else { return completion(.failed) }
                if let error = error {
                    let name = Self.incomingErrorName(error)
                    if name != "exists" { self.calls.removeValue(forKey: info.uuid) }
                    return completion(StatusResult(rawValue: name) ?? .failed)
                }
                self.scheduleRingTimeout(info.uuid)
                completion(.reported)
            }
        }
    }

    func startOutgoingFromJs(_ info: CallInfo, completion: @escaping (Error?) -> Void) {
        guard provider != nil else {
            return completion(NSError(domain: "DescallCallKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "CallKit unavailable"]))
        }
        var outgoing = info
        outgoing.answered = true
        calls[info.uuid] = outgoing
        let handle = CXHandle(type: .generic, value: info.callerId.isEmpty ? "descall" : info.callerId)
        let action = CXStartCallAction(call: info.uuid, handle: handle)
        action.isVideo = info.video
        callController.request(CXTransaction(action: action)) { [weak self] error in
            DispatchQueue.main.async {
                guard let self = self else { return completion(error) }
                if let error = error {
                    self.calls.removeValue(forKey: info.uuid)
                    return completion(error)
                }
                // Show the peer's name instead of the raw handle.
                self.provider?.reportCall(with: info.uuid, updated: self.makeUpdate(info))
                completion(nil)
            }
        }
    }

    func reportOutgoingConnected(_ uuid: UUID) {
        guard calls[uuid] != nil else { return }
        provider?.reportOutgoingCall(with: uuid, connectedAt: Date())
    }

    func answerFromJs(_ uuid: UUID, completion: @escaping (Error?) -> Void) {
        guard let info = calls[uuid] else { return completion(nil) }
        if info.answered { return completion(nil) }
        let key = "answer:\(uuid.uuidString)"
        jsInitiated.insert(key)
        callController.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { [weak self] error in
            DispatchQueue.main.async {
                if error != nil { self?.jsInitiated.remove(key) }
                completion(error)
            }
        }
    }

    func setMutedFromJs(_ uuid: UUID, muted: Bool, completion: @escaping (Error?) -> Void) {
        guard calls[uuid] != nil else { return completion(nil) }
        let key = "mute:\(uuid.uuidString)"
        jsInitiated.insert(key)
        callController.request(CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))) { [weak self] error in
            DispatchQueue.main.async {
                if error != nil { self?.jsInitiated.remove(key) }
                completion(error)
            }
        }
    }

    /// The user ended the call in the web UI (CXEndCallAction).
    func endFromJs(_ uuid: UUID, completion: @escaping (Error?) -> Void) {
        guard calls[uuid] != nil else { return completion(nil) }
        let key = "end:\(uuid.uuidString)"
        jsInitiated.insert(key)
        callController.request(CXTransaction(action: CXEndCallAction(call: uuid))) { [weak self] error in
            DispatchQueue.main.async {
                guard let self = self else { return completion(error) }
                if error != nil {
                    // Transaction refused (e.g. call already gone): report it ended anyway.
                    self.jsInitiated.remove(key)
                    self.reportEnded(uuid, reason: .remoteEnded)
                }
                completion(nil)
            }
        }
    }

    /// The call ended somewhere else (caller cancelled, answered/declined on
    /// another device, missed, failed).
    func reportEnded(_ uuid: UUID, reason: CXCallEndedReason) {
        cancelRingTimeout(uuid)
        DescallNativeCall.shared.cancel(uuid)
        finishAwaitingJoin(uuid)
        calls.removeValue(forKey: uuid)
        noteEnded(uuid)
        provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
    }

    /// The native engine ended its call (remote hang-up, failure).
    func nativeCallEnded(_ uuid: UUID, reason: CXCallEndedReason) {
        let info = calls[uuid]
        if calls[uuid] != nil || !endedRecently(uuid) {
            reportEnded(uuid, reason: reason)
        }
        var data = info?.dictionary ?? ["uuid": uuid.uuidString.lowercased()]
        data["handledNatively"] = true
        emit("end", data)
    }

    /// Native hang-up from the in-app call card (not a JS-initiated CallKit end,
    /// so CXEndCallAction routes it to the native engine).
    func requestNativeEnd(_ uuid: UUID, completion: @escaping (Error?) -> Void) {
        let tx = CXTransaction(action: CXEndCallAction(call: uuid))
        callController.request(tx) { [weak self] error in
            DispatchQueue.main.async {
                if error != nil {
                    DescallNativeCall.shared.hangUp(uuid)
                    self?.reportEnded(uuid, reason: .remoteEnded)
                }
                completion(nil)
            }
        }
    }

    /// Mute from the in-app call card: through CallKit so its UI stays in sync.
    func requestNativeMute(_ uuid: UUID, muted: Bool, completion: @escaping (Error?) -> Void) {
        let tx = CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))
        callController.request(tx) { error in
            DispatchQueue.main.async {
                if error != nil { DescallNativeCall.shared.setMuted(muted) }
                completion(nil)
            }
        }
    }

    private func postCallStatusIfKnown(_ uuid: UUID, status: String) {
        guard let info = calls[uuid], !info.statusUrl.isEmpty else { return }
        postCallStatus(info, status: status)
    }

    func activeCalls() -> [[String: Any]] {
        calls.values.map { $0.dictionary }
    }
}

// MARK: - PKPushRegistryDelegate

extension DescallCallManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        voipToken = token
        emit("voipToken", ["token": token])
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        let old = voipToken ?? ""
        voipToken = nil
        emit("voipTokenInvalidated", ["token": old])
    }

    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }
        let kind = Self.string(payload.dictionaryPayload["type"])
        if kind == "call-end" {
            handleCallEndPush(payload.dictionaryPayload, completion: completion)
            return
        }
        handleIncomingVoipPush(payload.dictionaryPayload, completion: completion)
    }
}

// MARK: - CXProviderDelegate

extension DescallCallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        ringTimers.values.forEach { $0.cancel() }
        ringTimers.removeAll()
        for uuid in Array(joinTimers.keys) { finishAwaitingJoin(uuid) }
        calls.removeAll()
        jsInitiated.removeAll()
        DescallNativeCall.shared.reset()
        emit("reset")
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        prepareAudioSessionIfIdle(video: action.isVideo)
        action.fulfill()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let uuid = action.callUUID
        cancelRingTimeout(uuid)
        let video = calls[uuid]?.video ?? false
        calls[uuid]?.answered = true
        prepareAudioSessionIfIdle(video: video)
        let fromJs = jsInitiated.remove("answer:\(uuid.uuidString)") != nil
        // .inactive = CallKit's full-screen ring over the open app; only a
        // backgrounded / locked app can't join by itself.
        let appBackgrounded = UIApplication.shared.applicationState == .background
        let native = DescallNativeCall.shared
        if !fromJs && appBackgrounded && native.canAnswer(uuid) {
            // 2.10.108: answered on the lock screen / with the app killed or in
            // the background → connect natively, no need to open Descall.
            native.answer(uuid)
            postCallStatusIfKnown(uuid, status: "answering")
            var data = calls[uuid]?.dictionary ?? ["uuid": uuid.uuidString.lowercased()]
            data["answered"] = true
            data["native"] = true
            emit("nativeCallAnswered", data)
            action.fulfill()
            return
        }
        native.cancel(uuid)
        if !fromJs && appBackgrounded {
            beginAwaitingJoin(uuid)
        }
        if !fromJs {
            var data = calls[uuid]?.dictionary ?? ["uuid": uuid.uuidString.lowercased()]
            data["answered"] = true
            emit("answer", data)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let uuid = action.callUUID
        cancelRingTimeout(uuid)
        finishAwaitingJoin(uuid)
        let info = calls.removeValue(forKey: uuid)
        noteEnded(uuid)
        let fromJs = jsInitiated.remove("end:\(uuid.uuidString)") != nil
        let native = DescallNativeCall.shared
        var handledNatively = false
        if native.owns(uuid) {
            native.hangUp(uuid) // call:end on the native socket
            handledNatively = true
        } else if !fromJs {
            // Declined on the ring screen: the native socket (if up) sends it.
            handledNatively = native.decline(uuid)
        } else {
            native.cancel(uuid)
        }
        if !fromJs {
            var data = info?.dictionary ?? ["uuid": uuid.uuidString.lowercased()]
            if handledNatively { data["handledNatively"] = true }
            emit("end", data)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let uuid = action.callUUID
        let fromJs = jsInitiated.remove("mute:\(uuid.uuidString)") != nil
        if DescallNativeCall.shared.owns(uuid) {
            DescallNativeCall.shared.setMuted(action.isMuted)
            action.fulfill()
            return
        }
        if !fromJs {
            emit("mute", ["uuid": uuid.uuidString.lowercased(), "muted": action.isMuted])
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        // Hold (e.g. a cellular call "Hold & Accept"): mic muted while held; the
        // previous mute state comes back on resume. The peer stays connected.
        let uuid = action.callUUID
        if DescallNativeCall.shared.owns(uuid) {
            if action.isOnHold {
                heldMuteRestore[uuid] = DescallNativeCall.shared.isMuted
                DescallNativeCall.shared.setMuted(true)
            } else {
                DescallNativeCall.shared.setMuted(heldMuteRestore.removeValue(forKey: uuid) ?? false)
            }
        } else {
            emit("hold", ["uuid": uuid.uuidString.lowercased(), "held": action.isOnHold])
        }
        action.fulfill()
    }


    /// Phone app Recents / Siri: "call back" a Descall contact. The handle is
    /// the Descall user id (CXHandle .generic, see makeUpdate).
    func handleStartCallIntent(_ userActivity: NSUserActivity) -> Bool {
        guard let intent = userActivity.interaction?.intent else { return false }
        var handle: String?
        var video = false
        if let i = intent as? INStartCallIntent {
            handle = i.contacts?.first?.personHandle?.value
            video = i.callCapability == .videoCall
        } else if let i = intent as? INStartAudioCallIntent {
            handle = i.contacts?.first?.personHandle?.value
        } else if let i = intent as? INStartVideoCallIntent {
            handle = i.contacts?.first?.personHandle?.value
            video = true
        }
        guard let userId = handle, !userId.isEmpty, userId != "descall" else { return false }
        emit("startCallIntent", ["userId": userId, "video": video])
        return true
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        NSLog("[DescallCallKit] action timed out: \(type(of: action))")
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit activated the shared session at call priority. Category was
        // set in prepareAudioSessionIfIdle, before fulfill. Do not setCategory
        // again here: WebKit may already be capturing, and changing it tears
        // the audio unit down. The loudspeaker port is applied by the router
        // without touching the category. JS recaptures the mic only after ICE
        // is connected (iosCallMic), so the call does not stay on "Bağlanıyor…".
        let outputs = audioSession.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
        NSLog("[DescallCallKit] didActivate category=\(audioSession.category.rawValue) mode=\(audioSession.mode.rawValue) outputs=\(outputs)")
        callKitAudioActive = true
        if DescallNativeCall.shared.isActive {
            // Native call: WebRTC's audio unit starts on CallKit's session.
            // The WebView mic is not involved (no capture reactivation).
            DescallNativeCall.shared.audioSessionActivated(audioSession)
        } else {
            sink?.callAudioSessionActivated()
        }
        DescallAudioRouter.shared.sessionActivated()
        emit("audioSessionActivated", audioDiagnostics())
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        callKitAudioActive = false
        DescallNativeCall.shared.audioSessionDeactivated(audioSession)
        emit("audioSessionDeactivated")
    }
}

// MARK: - Audio output routing (receiver / speaker / Bluetooth / headset)

/// Call audio output control for the web app (setSinkId does nothing in
/// WKWebView on iOS, so the in-call audio menu needs a native path).
///
/// - Only `overrideOutputAudioPort` and `setPreferredInput` are used. The
///   category/mode is never changed mid-call: that would tear down the audio
///   unit WebKit's WebRTC engine is capturing with (silent microphone).
/// - WebKit re-configures the shared session when capture starts and on
///   device changes, which resets an override. Route changes are observed
///   (debounced) and the chosen route is re-asserted a few times per choice.
/// - A newly connected headset / Bluetooth / car route is followed. WebKit
///   resetting the built-in port to the receiver is not: voice and video
///   calls stay on the loudspeaker unless the user picked the earpiece.
/// - Defaults: loudspeaker, unless wired headphones or Bluetooth (or car /
///   AirPlay / USB) are connected.
final class DescallAudioRouter: NSObject {
    static let shared = DescallAudioRouter()

    private enum Choice: Equatable {
        case system          // leave it to iOS (headset, AirPods, car, AirPlay)
        case receiver
        case speaker
        case input(String)   // preferred input port uid (Bluetooth HFP, wired headset mic, USB)
    }

    private static let maxAssertsPerChoice = 6
    private static let settleDelay: TimeInterval = 0.3

    private(set) var active = false
    private var video = false
    private var choice: Choice = .system
    private var assertsLeft = maxAssertsPerChoice
    private var pending: DispatchWorkItem?
    private var selfChangeUntil = Date.distantPast
    /// CallKit didActivate ran (possibly before JS called begin).
    private var speakerArmed = false
    /// In-call menu picked a route; don't snap that back to the loudspeaker.
    private var userPicked = false
    /// One delayed speaker retry. Immediate retries while ICE is checking
    /// fight WebKit and the call stays on "Bağlanıyor…".
    private var followUp: DispatchWorkItem?

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(routeChanged(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(interruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    // MARK: Port helpers

    private static func isBuiltIn(_ port: AVAudioSession.Port) -> Bool {
        port == .builtInReceiver || port == .builtInSpeaker
    }

    private static func kind(_ port: AVAudioSession.Port) -> String {
        switch port {
        case .builtInReceiver: return "receiver"
        case .builtInSpeaker: return "speaker"
        case .builtInMic: return "receiver"
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: return "bluetooth"
        case .headphones, .headsetMic: return "headphones"
        case .carAudio: return "car"
        case .airPlay: return "airplay"
        case .usbAudio: return "usb"
        default: return "other"
        }
    }

    private var session: AVAudioSession { AVAudioSession.sharedInstance() }

    private func currentOutputs() -> [AVAudioSession.Port] {
        session.currentRoute.outputs.map { $0.portType }
    }

    private func externalConnected() -> Bool {
        currentOutputs().contains { !Self.isBuiltIn($0) }
    }

    /// Headphones / Bluetooth / car / AirPlay / USB, including a device that
    /// is connected but not the current output yet.
    private func prefersExternalRoute() -> Bool {
        if externalConnected() { return true }
        let externalIn: [AVAudioSession.Port] = [.headsetMic, .bluetoothHFP, .bluetoothLE, .usbAudio, .carAudio]
        return session.availableInputs?.contains { externalIn.contains($0.portType) } ?? false
    }

    private func wiredHeadphonesConnected() -> Bool {
        currentOutputs().contains(.headphones) ||
            (session.availableInputs?.contains { $0.portType == .headsetMic } ?? false)
    }

    private func defaultChoice() -> Choice {
        if prefersExternalRoute() { return .system }
        return .speaker
    }

    /// Loudspeaker port override. Does not touch the category (safe mid-capture).
    private func forceBuiltInSpeaker() {
        if prefersExternalRoute() { return }
        selfChangeUntil = Date().addingTimeInterval(0.8)
        if !currentOutputs().contains(.builtInSpeaker) {
            try? session.overrideOutputAudioPort(.speaker)
        }
    }

    // MARK: Public API (main thread)

    /// A DM call started ringing out / became active. Keeps an earlier user
    /// choice when called again during the same call.
    func begin(video: Bool) {
        let first = !active
        active = true
        self.video = video
        if first {
            userPicked = false
            choice = defaultChoice()
        }
        assertsLeft = Self.maxAssertsPerChoice
        NSLog("[DescallAudioRoute] begin video=\(self.video) external=\(prefersExternalRoute())")
        apply()
        emitState()
    }

    /// The call ended: drop overrides so other audio plays normally again.
    func end() {
        guard active else { return }
        active = false
        speakerArmed = false
        userPicked = false
        pending?.cancel()
        pending = nil
        followUp?.cancel()
        followUp = nil
        choice = .system
        selfChangeUntil = Date().addingTimeInterval(0.8)
        try? session.overrideOutputAudioPort(.none)
        try? session.setPreferredInput(nil)
    }

    /// "receiver" | "speaker" | "system" | "input:<uid>"
    func select(_ id: String) -> Bool {
        userPicked = true
        switch id {
        case "receiver": choice = .receiver
        case "speaker": choice = .speaker
        case "system", "auto", "default": choice = .system
        default:
            guard id.hasPrefix("input:") else { return false }
            choice = .input(String(id.dropFirst("input:".count)))
        }
        if !active {
            // Chosen before the call is tracked (shouldn't happen): still act on it.
            active = true
        }
        assertsLeft = Self.maxAssertsPerChoice
        apply()
        emitState()
        // Report again once iOS has settled on the new route.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.emitState() }
        return true
    }

    /// CallKit (re)activated the session. WebKit's media process reconfigures
    /// the shared AVAudioSession (there is no app-owned RTCAudioSession) and
    /// that reset lands voice calls on the receiver. Re-apply the loudspeaker
    /// unless headphones / Bluetooth are connected. Safe before JS calls begin
    /// (killed-app answer: didActivate is queued before the web view exists).
    func sessionActivated() {
        speakerArmed = true
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleDelay) { [weak self] in
            guard let self = self, self.speakerArmed || self.active else { return }
            if self.active {
                if !self.userPicked && !self.prefersExternalRoute() {
                    self.choice = .speaker
                }
                self.assertsLeft = max(self.assertsLeft, 2)
                self.apply()
                self.emitState()
            } else {
                self.forceBuiltInSpeaker()
            }
        }
    }

    // MARK: Applying

    private func apply() {
        guard active else { return }
        let s = session
        let outs = currentOutputs()
        selfChangeUntil = Date().addingTimeInterval(0.8)
        do {
            switch choice {
            case .system:
                // Back to the connected headset / AirPods / A2DP speaker from a speaker override.
                if outs.contains(.builtInSpeaker) {
                    try s.overrideOutputAudioPort(.none)
                }
            case .speaker:
                if !outs.contains(.builtInSpeaker) {
                    try s.overrideOutputAudioPort(.speaker)
                }
            case .receiver:
                if externalConnected(), !wiredHeadphonesConnected(),
                   let mic = s.availableInputs?.first(where: { $0.portType == .builtInMic }),
                   s.preferredInput?.uid != mic.uid {
                    // Leave Bluetooth HFP: the built-in mic pulls output to the receiver.
                    try s.setPreferredInput(mic)
                }
                if outs.contains(.builtInSpeaker) {
                    try s.overrideOutputAudioPort(.none)
                }
            case .input(let uid):
                guard let port = s.availableInputs?.first(where: { $0.uid == uid }) else {
                    choice = defaultChoice()
                    return apply()
                }
                if outs.contains(.builtInSpeaker) {
                    try s.overrideOutputAudioPort(.none)
                }
                if s.preferredInput?.uid != uid {
                    try s.setPreferredInput(port)
                }
            }
        } catch {
            NSLog("[DescallAudioRoute] apply failed: \(error.localizedDescription)")
        }
    }

    private func matchesChoice() -> Bool {
        let outs = currentOutputs()
        switch choice {
        case .system: return true
        case .speaker: return outs.contains(.builtInSpeaker)
        case .receiver:
            return outs.contains(.builtInReceiver) || wiredHeadphonesConnected()
        case .input(let uid):
            return session.currentRoute.inputs.contains { $0.uid == uid }
        }
    }

    @objc private func routeChanged(_ note: Notification) {
        let raw = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
        let reason = AVAudioSession.RouteChangeReason(rawValue: raw) ?? .unknown
        DispatchQueue.main.async { [weak self] in self?.handleRouteChange(reason) }
    }

    @objc private func interruption(_ note: Notification) {
        let raw = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) ?? 0
        guard let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        let opts = AVAudioSession.InterruptionOptions(rawValue: (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0)
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.active || self.speakerArmed else { return }
            guard type == .ended, opts.contains(.shouldResume) else { return }
            if self.active {
                self.assertsLeft = max(self.assertsLeft, 2)
                self.apply()
                self.emitState()
            } else {
                self.forceBuiltInSpeaker()
            }
        }
    }

    private func handleRouteChange(_ reason: AVAudioSession.RouteChangeReason) {
        guard active || speakerArmed else { return }
        let ours = Date() < selfChangeUntil
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.active || self.speakerArmed else { return }
            if !self.active {
                // Answered before JS began the route (killed / locked). Keep
                // the loudspeaker; a headset that just connected wins.
                // Don't stack overrides on our own route change.
                if reason == .newDeviceAvailable || self.prefersExternalRoute() { return }
                if ours {
                    self.scheduleSpeakerFollowUp()
                    return
                }
                if !self.currentOutputs().contains(.builtInSpeaker) {
                    self.forceBuiltInSpeaker()
                }
                return
            }
            switch reason {
            case .newDeviceAvailable:
                // AirPods / headset / car connected: follow it.
                self.choice = .system
                self.assertsLeft = Self.maxAssertsPerChoice
                self.apply()
            case .oldDeviceUnavailable:
                // Headset gone: loudspeaker, unless something external remains.
                self.choice = self.defaultChoice()
                self.assertsLeft = Self.maxAssertsPerChoice
                self.apply()
            default:
                if ours {
                    // Re-applying here fights WebKit in a loop while ICE is
                    // checking, and the call stays on "Bağlanıyor…".
                    self.scheduleSpeakerFollowUp()
                } else if self.prefersExternalRoute() {
                    self.choice = .system
                    self.assertsLeft = Self.maxAssertsPerChoice
                    self.apply()
                } else if !self.matchesChoice() && self.assertsLeft > 0 {
                    // A later receiver reset (not our own override) is corrected
                    // once. The in-call menu can still pick the earpiece.
                    self.assertsLeft -= 1
                    self.apply()
                }
            }
            self.emitState()
        }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleDelay, execute: work)
    }

    /// One speaker retry after ICE has had a chance to finish. Not a loop.
    private func scheduleSpeakerFollowUp() {
        guard followUp == nil else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.followUp = nil
            guard self.active || self.speakerArmed else { return }
            guard !self.userPicked, !self.prefersExternalRoute(), !self.matchesChoice() else { return }
            guard self.assertsLeft > 0 else { return }
            self.assertsLeft -= 1
            if self.active {
                self.apply()
                self.emitState()
            } else {
                self.forceBuiltInSpeaker()
            }
        }
        followUp = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0, execute: work)
    }

    // MARK: State for JS

    func state() -> [String: Any] {
        let s = session
        let outs = s.currentRoute.outputs
        let currentInputs = s.currentRoute.inputs
        var routes: [[String: Any]] = []
        let wired = wiredHeadphonesConnected()
        if !wired {
            routes.append(["id": "receiver", "kind": "receiver", "name": ""])
        }
        routes.append(["id": "speaker", "kind": "speaker", "name": ""])
        var listedInputUids = Set<String>()
        for input in s.availableInputs ?? [] where input.portType != .builtInMic {
            listedInputUids.insert(input.uid)
            routes.append(["id": "input:\(input.uid)", "kind": Self.kind(input.portType), "name": input.portName])
        }
        // Output-only routes (Bluetooth A2DP speakers, AirPlay, wired headphones without mic).
        for out in outs where !Self.isBuiltIn(out.portType) {
            let representedByInput = currentInputs.contains { listedInputUids.contains($0.uid) }
            if !representedByInput && !routes.contains(where: { ($0["id"] as? String) == "system" }) {
                routes.append(["id": "system", "kind": Self.kind(out.portType), "name": out.portName])
            }
        }

        let selected: String
        if outs.contains(where: { $0.portType == .builtInSpeaker }) {
            selected = "speaker"
        } else if outs.contains(where: { $0.portType == .builtInReceiver }) {
            selected = "receiver"
        } else if let input = currentInputs.first(where: { listedInputUids.contains($0.uid) }) {
            selected = "input:\(input.uid)"
        } else if outs.contains(where: { !Self.isBuiltIn($0.portType) }) {
            selected = "system"
        } else {
            selected = ""
        }
        let current = outs.first.map { Self.kind($0.portType) } ?? "none"
        return [
            "active": active,
            "current": current,
            "selected": selected,
            "routes": routes,
        ]
    }

    private func emitState() {
        guard active else { return }
        DescallCallManager.shared.emitEvent("audioRoute", state())
    }
}
