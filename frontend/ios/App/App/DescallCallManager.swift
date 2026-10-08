import Foundation
import UIKit
import PushKit
import CallKit
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
    private var calls: [UUID: CallInfo] = [:]
    /// Actions JS asked for itself ("answer:<uuid>" ...) — fulfilled without echoing an event back.
    private var jsInitiated = Set<String>()
    private var ringTimers: [UUID: DispatchWorkItem] = [:]
    private var joinTimers: [UUID: DispatchWorkItem] = [:]
    private var queuedEvents: [[String: Any]] = []
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
        // Recents entries would relaunch the app with a start-call intent that
        // Descall doesn't handle yet, so calls are kept out of the Phone app.
        config.includesCallsInRecents = false
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
        update.supportsHolding = false
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

    fileprivate func handleIncomingVoipPush(_ payload: [AnyHashable: Any], completion: @escaping () -> Void) {
        let info = Self.parse(payload)
        guard let provider = provider else {
            completion()
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
            self.calls.removeValue(forKey: uuid)
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

    private static var turkish: Bool {
        (Locale.preferredLanguages.first ?? "").lowercased().hasPrefix("tr")
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

        let hint = Self.turkish ? "Bağlanmak için Descall'u açın" : "Open Descall to connect"
        let update = makeUpdate(info)
        update.localizedCallerName = "\(info.callerName) · \(hint)"
        provider?.reportCall(with: uuid, updated: update)

        postLocalNotification(
            id: "descall-call-join-\(uuid.uuidString.lowercased())",
            title: info.callerName,
            body: Self.turkish
                ? "Aramaya bağlanmak için iPhone'un kilidini açıp Descall'a dokunun."
                : "Unlock your iPhone and tap Descall to join the call."
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
            body: Self.turkish
                ? "Arama bağlanamadı: telefon kilitliyken katılınamadı. Geri aramak için Descall'u açın."
                : "Couldn't connect the call while your iPhone was locked. Open Descall to call back."
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
            try session.setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat, options: [.allowBluetooth])
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
        finishAwaitingJoin(uuid)
        calls.removeValue(forKey: uuid)
        provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
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
        let fromJs = jsInitiated.remove("end:\(uuid.uuidString)") != nil
        if !fromJs {
            emit("end", info?.dictionary ?? ["uuid": uuid.uuidString.lowercased()])
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let uuid = action.callUUID
        let fromJs = jsInitiated.remove("mute:\(uuid.uuidString)") != nil
        if !fromJs {
            emit("mute", ["uuid": uuid.uuidString.lowercased(), "muted": action.isMuted])
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        // Holding isn't supported (supportsHolding = false).
        action.fail()
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        NSLog("[DescallCallKit] action timed out: \(type(of: action))")
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit activated the shared session at call priority. If WebKit was
        // already capturing (outgoing call, or answered while the app was open)
        // that capture is interrupted and its track goes silent: the plugin
        // un-mutes WKWebView capture and JS re-acquires the microphone
        // (useCall.refreshMicrophone) on "audioSessionActivated".
        callKitAudioActive = true
        sink?.callAudioSessionActivated()
        DescallAudioRouter.shared.sessionActivated()
        emit("audioSessionActivated", audioDiagnostics())
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        callKitAudioActive = false
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
/// - A route change the app didn't cause (CallKit's speaker button, Control
///   Center, AirPods connecting) is adopted as the new choice and reported to
///   JS ("audioRoute" event), so the in-app menu and CallKit stay in sync.
/// - Defaults: video → speaker, voice → receiver, unless a headset /
///   Bluetooth / car route is connected (then audio stays there).
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

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(routeChanged(_:)),
            name: AVAudioSession.routeChangeNotification,
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

    private func wiredHeadphonesConnected() -> Bool {
        currentOutputs().contains(.headphones) ||
            (session.availableInputs?.contains { $0.portType == .headsetMic } ?? false)
    }

    private func defaultChoice() -> Choice {
        if externalConnected() { return .system }
        return video ? .speaker : .receiver
    }

    /// The choice that matches what iOS is playing through right now.
    private func choiceFromCurrentRoute() -> Choice {
        let outs = currentOutputs()
        if outs.contains(.builtInSpeaker) { return .speaker }
        if outs.contains(.builtInReceiver) { return .receiver }
        return .system
    }

    // MARK: Public API (main thread)

    /// A DM call started ringing out / became active. Keeps an earlier user
    /// choice when called again during the same call.
    func begin(video: Bool) {
        let first = !active
        active = true
        self.video = video
        if first { choice = defaultChoice() }
        assertsLeft = Self.maxAssertsPerChoice
        apply()
        emitState()
    }

    /// The call ended: drop overrides so other audio plays normally again.
    func end() {
        guard active else { return }
        active = false
        pending?.cancel()
        pending = nil
        choice = .system
        selfChangeUntil = Date().addingTimeInterval(0.8)
        try? session.overrideOutputAudioPort(.none)
        try? session.setPreferredInput(nil)
    }

    /// "receiver" | "speaker" | "system" | "input:<uid>"
    func select(_ id: String) -> Bool {
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

    /// CallKit (re)activated the session: WebKit may have reset the route.
    func sessionActivated() {
        guard active else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleDelay) { [weak self] in
            guard let self = self, self.active else { return }
            self.assertsLeft = max(self.assertsLeft, 2)
            self.apply()
            self.emitState()
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

    private func handleRouteChange(_ reason: AVAudioSession.RouteChangeReason) {
        guard active else { return }
        let ours = Date() < selfChangeUntil
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.active else { return }
            switch reason {
            case .newDeviceAvailable:
                // AirPods / headset / car connected: follow it (iPhone convention).
                self.choice = .system
                self.assertsLeft = Self.maxAssertsPerChoice
                self.apply()
            case .oldDeviceUnavailable:
                // Headset gone: back to this call type's default.
                self.choice = self.defaultChoice()
                self.assertsLeft = Self.maxAssertsPerChoice
                self.apply()
            default:
                if !ours && (reason == .override || self.externalConnected()) {
                    // CallKit speaker button / Control Center / system picker: adopt it.
                    let adopted = self.choiceFromCurrentRoute()
                    if adopted != self.choice {
                        self.choice = adopted
                        self.assertsLeft = Self.maxAssertsPerChoice
                    }
                } else if !self.matchesChoice() && self.assertsLeft > 0 {
                    // WebKit reconfigured the session (capture start, category change): re-assert.
                    self.assertsLeft -= 1
                    self.apply()
                }
            }
            self.emitState()
        }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleDelay, execute: work)
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
