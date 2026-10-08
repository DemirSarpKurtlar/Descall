import Foundation
import UIKit
import PushKit
import CallKit
import AVFoundation

/// Receives CallKit events for the web layer (implemented by DescallCallKitPlugin).
protocol DescallCallEventSink: AnyObject {
    func deliverCallEvent(_ name: String, _ data: [String: Any])
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
            ]
        }
    }

    private static let ringTimeout: TimeInterval = 45
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
    private var queuedEvents: [[String: Any]] = []
    private var jsReady = false
    private weak var sink: DescallCallEventSink?

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
        return CallInfo(
            uuid: uuid,
            callerId: callerId,
            callerName: name.isEmpty ? "Descall" : name,
            video: video,
            conversationId: string(payload["conversationId"]).isEmpty ? callerId : string(payload["conversationId"]),
            outgoing: false
        )
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

    // MARK: - Audio session

    /// Category only; CallKit activates and deactivates the session itself
    /// (provider(_:didActivate:) / didDeactivate).
    private func configureAudioSession(video: Bool) {
        let session = AVAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.allowBluetooth, .allowBluetoothA2DP]
        if video { options.insert(.defaultToSpeaker) }
        do {
            try session.setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat, options: options)
        } catch {
            NSLog("[DescallCallKit] audio session category failed: \(error.localizedDescription)")
        }
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
        calls.removeAll()
        jsInitiated.removeAll()
        emit("reset")
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        configureAudioSession(video: action.isVideo)
        action.fulfill()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let uuid = action.callUUID
        cancelRingTimeout(uuid)
        let video = calls[uuid]?.video ?? false
        calls[uuid]?.answered = true
        configureAudioSession(video: video)
        let fromJs = jsInitiated.remove("answer:\(uuid.uuidString)") != nil
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
        // CallKit activated the shared session at call priority. WKWebView's
        // WebRTC uses this same app audio session, so JS only needs to resume
        // its media elements (there is no native RTCAudioSession to hand over).
        emit("audioSessionActivated")
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        emit("audioSessionDeactivated")
    }
}
