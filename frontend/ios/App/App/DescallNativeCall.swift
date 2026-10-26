import Foundation
import UIKit
import AVFoundation
import CallKit
import Network
import WebRTC

/// Native answer path for incoming DM calls (2.10.108).
///
/// WKWebView can't capture the microphone while the iPhone is locked or the
/// app is in the background, and on a VoIP cold start the web app isn't even
/// loaded yet, so a call answered on the CallKit screen used to wait for the
/// user to open Descall ("Bağlanmak için Descall'u açın"). This engine runs
/// in the app process instead, the way WhatsApp / FaceTime-style apps do:
///
///  1. VoIP push → `prepare`: in parallel, read the session token (Keychain),
///     fetch /api/webrtc/ice-config (Cloudflare TURN), open a native
///     Socket.IO connection and ask the server to replay the ringing offer
///     (call:resume-pending). With the offer in hand the peer connection is
///     built and the answer + ICE gathering (TURN allocations) are done while
///     it is still ringing. Nothing is sent and no audio starts.
///  2. CXAnswerCallAction (app not in the foreground) → `answer`: the ready
///     answer and gathered candidates go out at once.
///  3. provider(didActivate:) → `audioSessionActivated`: WebRTC's audio unit
///     starts on CallKit's session (RTCAudioSession manual audio), so audio
///     flows without the app ever being opened. Loudspeaker by default unless
///     headphones / Bluetooth are connected (DescallAudioRouter).
///
/// The caller is any Descall client; signaling is the same as useCall.js
/// (call:answer, call:ice-candidate, renegotiation offers incl. ICE restarts,
/// call:media-state, call:end). Opening the app during such a call shows the
/// in-app native call card (NativeCallCard.jsx) driving this engine.
/// Audio only: a video offer is answered with audio (camera stays off).
final class DescallNativeCall: NSObject {
    static let shared = DescallNativeCall()

    enum Phase: String {
        case preparing, ready, answering, connecting, connected, reconnecting, ended
    }

    private final class Session {
        let uuid: UUID
        let callerId: String
        let callerName: String
        let video: Bool
        let apiBase: String
        var phase: Phase = .preparing
        var answered = false
        var answerSent = false
        var muted = false
        var offerSdp: String?
        var iceServers: [DescallNativeCallLogic.IceServer]?
        var pc: RTCPeerConnection?
        var audioTrack: RTCAudioTrack?
        var localAnswer: RTCSessionDescription?
        var remoteCandidates: [DescallNativeCallLogic.RemoteCandidate] = []
        var localCandidates: [[String: Any]] = []
        var socket: DescallSignalSocket?
        var timeline: DescallNativeCallLogic.Timeline
        var connectedAt: Date?
        var failTimer: DispatchWorkItem?
        var offerTimer: DispatchWorkItem?
        var statsTimer: Timer?
        var negotiating = false
        var pendingRenegotiation: String?
        /// ICE reached connected/completed (can happen while still ringing:
        /// the caller's candidates arrive with the offer).
        var iceConnected = false
        var inboundLogged = false
        /// fail(reason) for telemetry; nil = a normal hang up.
        var failure: String?

        init(info: DescallCallManager.CallInfo, apiBase: String) {
            uuid = info.uuid
            callerId = info.callerId
            callerName = info.callerName
            video = info.video
            self.apiBase = apiBase
            timeline = DescallNativeCallLogic.Timeline(start: Date().timeIntervalSince1970)
        }
    }

    private static let tokenService = "com.descall.session"
    private static let tokenAccount = "descall_token"
    /// Answered but the offer never arrived / ICE never connected.
    private static let connectTimeout: TimeInterval = 30
    /// Connected call whose link stays down (the caller drives ICE restarts).
    private static let reconnectTimeout: TimeInterval = 60
    /// Upper bound for reusing fetched ICE servers; the server's ttlSeconds (halved) usually wins.
    private static let iceCacheTTL: TimeInterval = 90 * 60

    private var session: Session?
    private var factory: RTCPeerConnectionFactory?
    private var iceCache: (at: Date, servers: [DescallNativeCallLogic.IceServer], validFor: TimeInterval)?
    private var pathMonitor: NWPathMonitor?
    private var lastPathSignature = ""

    private override init() {
        super.init()
    }

    // MARK: - Queries (main thread)

    /// This engine owns the call (answered natively): JS must not end / answer it.
    func owns(_ uuid: UUID) -> Bool {
        guard let s = session, s.uuid == uuid else { return false }
        return s.answered && s.phase != .ended
    }

    var isActive: Bool { session.map { $0.answered && $0.phase != .ended } ?? false }

    func canAnswer(_ uuid: UUID) -> Bool {
        guard let s = session, s.uuid == uuid else { return false }
        return s.phase != .ended
    }

    func state() -> [String: Any] {
        guard let s = session else { return ["active": false] }
        var d: [String: Any] = [
            "active": s.answered && s.phase != .ended,
            "uuid": s.uuid.uuidString.lowercased(),
            "callerId": s.callerId,
            "callerName": s.callerName,
            "phase": s.phase.rawValue,
            "muted": s.muted,
            "video": s.video,
            "metrics": s.timeline.dictionary,
        ]
        if let at = s.connectedAt { d["connectedAt"] = Int(at.timeIntervalSince1970 * 1000) }
        return d
    }

    // MARK: - 1. Ringing: prepare everything in parallel

    /// Called from the PushKit handler right after reportNewIncomingCall.
    /// Returns false when the native path can't run (no session token).
    @discardableResult
    func prepare(_ info: DescallCallManager.CallInfo) -> Bool {
        if let s = session, s.phase != .ended {
            return s.uuid == info.uuid
        }
        guard let token = KeychainStore.read(service: Self.tokenService, account: Self.tokenAccount), !token.isEmpty else {
            NSLog("[DescallNativeCall] no session token; web app will join")
            return false
        }
        let s = Session(info: info, apiBase: DescallNativeCallLogic.apiBase(statusUrl: info.statusUrl))
        session = s
        s.timeline.mark("push", at: Date().timeIntervalSince1970)
        setupAudioSessionManual()
        fetchIceServers(s, token: token)
        openSocket(s, token: token)
        startPathMonitor()
        emitState()
        return true
    }

    private func openSocket(_ s: Session, token: String) {
        guard let url = DescallNativeCallLogic.socketURL(apiBase: s.apiBase) else { return }
        let socket = DescallSignalSocket(url: url, auth: ["token": token, "platform": "ios", "client": "ios-native-call"])
        s.socket = socket
        socket.onConnect = { [weak self, weak s, weak socket] in
            guard let self = self, let s = s, let socket = socket, self.session === s else { return }
            s.timeline.mark("socket", at: Date().timeIntervalSince1970)
            if s.offerSdp == nil {
                socket.emit("call:resume-pending", ["callUuids": [s.uuid.uuidString.lowercased()]])
            } else if s.answerSent {
                // Back after a signaling drop: tell the caller we're still here.
                self.sendMediaState(s, requestState: true)
            }
        }
        socket.onEvent = { [weak self, weak s] name, payload in
            guard let self = self, let s = s, self.session === s else { return }
            self.handleSignal(s, name: name, payload: payload)
        }
        socket.onAuthError = { [weak self, weak s] message in
            NSLog("[DescallNativeCall] socket auth failed: \(message)")
            guard let self = self, let s = s, self.session === s else { return }
            if !s.answered { self.abandon(s) } else { self.fail(s, reason: "auth") }
        }
        socket.connect()
    }

    /// TURN is only issued to a signed-in caller (2.11.2): send the Keychain session token.
    /// Credentials are per user and short-lived; the cache honours the server's ttlSeconds.
    private func fetchIceServers(_ s: Session, token: String) {
        if let cache = iceCache, DescallNativeCallLogic.iceCacheUsable(cachedAt: cache.at, validFor: cache.validFor, now: Date()), DescallNativeCallLogic.hasTurn(cache.servers) {
            s.iceServers = cache.servers
            s.timeline.mark("ice", at: Date().timeIntervalSince1970)
            return
        }
        guard let url = URL(string: s.apiBase + "/api/webrtc/ice-config") else {
            s.iceServers = DescallNativeCallLogic.defaultIceServers
            return
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { [weak self, weak s] data, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            let servers = ok ? data.map { DescallNativeCallLogic.iceServers(fromJSON: $0) } ?? [] : []
            let validFor = DescallNativeCallLogic.iceCacheValidity(fromJSON: ok ? data : nil, fallback: Self.iceCacheTTL)
            DispatchQueue.main.async {
                guard let self = self, let s = s, self.session === s else { return }
                if servers.isEmpty {
                    s.iceServers = self.iceCache?.servers ?? DescallNativeCallLogic.defaultIceServers
                } else {
                    s.iceServers = servers
                    self.iceCache = (Date(), servers, validFor)
                }
                s.timeline.mark("ice", at: Date().timeIntervalSince1970)
                NSLog("[DescallNativeCall] ice servers=\(s.iceServers?.count ?? 0) turn=\(DescallNativeCallLogic.hasTurn(s.iceServers ?? []))")
                self.buildPeerIfReady(s)
            }
        }.resume()
    }

    // MARK: - Signaling

    private func handleSignal(_ s: Session, name: String, payload: [String: Any]) {
        switch name {
        case "call:offer":
            let fromId = ((payload["fromUser"] as? [String: Any])?["id"] as? String) ?? ""
            let callUuid = (payload["callUuid"] as? String)?.lowercased() ?? ""
            guard fromId == s.callerId || callUuid == s.uuid.uuidString.lowercased() else { return }
            guard let sdp = DescallNativeCallLogic.offerSdp(payload["offer"]) else { return }
            if s.offerSdp == nil {
                s.offerSdp = sdp
                s.timeline.mark("offer", at: Date().timeIntervalSince1970)
                s.offerTimer?.cancel()
                buildPeerIfReady(s)
            } else if s.answerSent {
                // Renegotiation inside the call (camera, screen share, ICE restart).
                renegotiate(s, sdp: sdp)
            } else if s.pc == nil {
                s.offerSdp = sdp // fresher SDP while still ringing
            }
        case "call:ice-candidate":
            guard (payload["fromUserId"] as? String) == s.callerId,
                  let c = DescallNativeCallLogic.remoteCandidate(payload["candidate"]) else { return }
            if let pc = s.pc, pc.remoteDescription != nil {
                addRemote(pc, c)
            } else {
                s.remoteCandidates.append(c)
            }
        case "call:ended", "call:cancelled", "call:declined":
            guard (payload["fromUserId"] as? String) == s.callerId else { return }
            remoteEnded(s, reason: s.answered ? .remoteEnded : .unanswered)
        case "call:ring-ended", "call:answered-elsewhere", "call:declined-elsewhere":
            let callUuid = (payload["callUuid"] as? String)?.lowercased() ?? ""
            guard !s.answered, callUuid.isEmpty || callUuid == s.uuid.uuidString.lowercased(),
                  (payload["fromUserId"] as? String).map({ $0 == s.callerId }) ?? true else { return }
            let reason = (payload["reason"] as? String) ?? name
            remoteEnded(s, reason: reason.contains("declined") ? .declinedElsewhere : reason.contains("answered") ? .answeredElsewhere : .remoteEnded)
        case "call:resume-pending:result":
            guard let calls = payload["calls"] as? [[String: Any]] else { return }
            for entry in calls where (entry["callUuid"] as? String)?.lowercased() == s.uuid.uuidString.lowercased() {
                let st = entry["state"] as? String ?? ""
                if st == "ended" && !s.answered { remoteEnded(s, reason: .remoteEnded) }
            }
        case "call:media-state":
            guard (payload["fromUserId"] as? String) == s.callerId else { return }
            if (payload["requestState"] as? Bool) == true { sendMediaState(s, requestState: false) }
        default:
            break
        }
    }

    private func sendMediaState(_ s: Session, requestState: Bool) {
        s.socket?.emit("call:media-state", [
            "toUserId": s.callerId,
            "muted": s.muted,
            "cameraOn": false,
            "deafened": false,
            "requestState": requestState,
        ])
    }

    // MARK: - Peer connection

    private func peerFactory() -> RTCPeerConnectionFactory {
        if let f = factory { return f }
        RTCInitializeSSL()
        let f = RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
        factory = f
        return f
    }

    private func buildPeerIfReady(_ s: Session) {
        guard s.pc == nil, s.phase != .ended, let offer = s.offerSdp, let servers = s.iceServers else { return }
        let config = RTCConfiguration()
        config.iceServers = servers.map { RTCIceServer(urlStrings: $0.urls, username: $0.username, credential: $0.credential) }
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        config.continualGatheringPolicy = .gatherContinually
        config.iceCandidatePoolSize = 2
        config.tcpCandidatePolicy = .enabled
        config.candidateNetworkPolicy = .all
        config.keyType = .ECDSA
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["DtlsSrtpKeyAgreement": "true"])
        let f = peerFactory()
        guard let pc = f.peerConnection(with: config, constraints: constraints, delegate: self) else {
            NSLog("[DescallNativeCall] peer connection failed")
            fail(s, reason: "pc")
            return
        }
        s.pc = pc
        // Voice processing (AEC / NS / AGC / high-pass) is the iOS VoiceProcessingIO
        // unit WebRTC's audio device uses; the constraints keep the software path on too.
        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: [
            "googEchoCancellation": "true",
            "googAutoGainControl": "true",
            "googNoiseSuppression": "true",
            "googHighpassFilter": "true",
        ], optionalConstraints: nil)
        let source = f.audioSource(with: audioConstraints)
        let track = f.audioTrack(with: source, trackId: "descall-native-mic")
        track.isEnabled = !s.muted
        s.audioTrack = track
        _ = pc.add(track, streamIds: ["descall-native"])

        pc.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: offer)) { [weak self, weak s] error in
            DispatchQueue.main.async {
                guard let self = self, let s = s, self.session === s else { return }
                if let error = error {
                    NSLog("[DescallNativeCall] setRemote failed: \(error.localizedDescription)")
                    self.fail(s, reason: "remote-sdp")
                    return
                }
                let queued = s.remoteCandidates
                s.remoteCandidates.removeAll()
                queued.forEach { self.addRemote(pc, $0) }
                self.createAnswer(s, pc)
            }
        }
    }

    private func createAnswer(_ s: Session, _ pc: RTCPeerConnection) {
        let constraints = RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": "false"], optionalConstraints: nil)
        pc.answer(for: constraints) { [weak self, weak s] sdp, error in
            DispatchQueue.main.async {
                guard let self = self, let s = s, self.session === s else { return }
                guard let sdp = sdp, error == nil else {
                    NSLog("[DescallNativeCall] createAnswer failed: \(error?.localizedDescription ?? "nil")")
                    self.fail(s, reason: "answer")
                    return
                }
                let tuned = RTCSessionDescription(type: .answer, sdp: DescallNativeCallLogic.tuneOpusSdp(sdp.sdp))
                pc.setLocalDescription(tuned) { [weak self, weak s] error in
                    DispatchQueue.main.async {
                        guard let self = self, let s = s, self.session === s else { return }
                        if let error = error {
                            NSLog("[DescallNativeCall] setLocal failed: \(error.localizedDescription)")
                            self.fail(s, reason: "local-sdp")
                            return
                        }
                        s.localAnswer = tuned
                        s.timeline.mark("answerReady", at: Date().timeIntervalSince1970)
                        if s.phase == .preparing { s.phase = .ready }
                        if s.answered { self.sendAnswer(s) }
                        self.emitState()
                    }
                }
            }
        }
    }

    private func renegotiate(_ s: Session, sdp: String) {
        guard let pc = s.pc else { return }
        if s.negotiating {
            s.pendingRenegotiation = sdp
            return
        }
        s.negotiating = true
        pc.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: sdp)) { [weak self, weak s] error in
            DispatchQueue.main.async {
                guard let self = self, let s = s, self.session === s else { return }
                if let error = error {
                    NSLog("[DescallNativeCall] renegotiation setRemote failed: \(error.localizedDescription)")
                    self.finishNegotiation(s)
                    return
                }
                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                pc.answer(for: constraints) { [weak self, weak s] answer, error in
                    DispatchQueue.main.async {
                        guard let self = self, let s = s, self.session === s, let answer = answer, error == nil else {
                            if let self = self, let s = s { self.finishNegotiation(s) }
                            return
                        }
                        let tuned = RTCSessionDescription(type: .answer, sdp: DescallNativeCallLogic.tuneOpusSdp(answer.sdp))
                        pc.setLocalDescription(tuned) { [weak self, weak s] error in
                            DispatchQueue.main.async {
                                guard let self = self, let s = s, self.session === s else { return }
                                if error == nil {
                                    s.socket?.emit("call:answer", ["toUserId": s.callerId, "answer": ["type": "answer", "sdp": tuned.sdp]])
                                }
                                self.finishNegotiation(s)
                            }
                        }
                    }
                }
            }
        }
    }

    private func finishNegotiation(_ s: Session) {
        s.negotiating = false
        if let next = s.pendingRenegotiation {
            s.pendingRenegotiation = nil
            renegotiate(s, sdp: next)
        }
    }

    private func addRemote(_ pc: RTCPeerConnection, _ c: DescallNativeCallLogic.RemoteCandidate) {
        pc.add(RTCIceCandidate(sdp: c.sdp, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid)) { error in
            if let error = error { NSLog("[DescallNativeCall] addIceCandidate: \(error.localizedDescription)") }
        }
    }

    // MARK: - 2. Answered on CallKit

    /// CXAnswerCallAction while the app is not in the foreground.
    func answer(_ uuid: UUID) {
        guard let s = session, s.uuid == uuid, s.phase != .ended else { return }
        s.answered = true
        s.phase = .answering
        s.timeline.mark("answered", at: Date().timeIntervalSince1970)
        configureAudioSessionForCall()
        DescallAudioRouter.shared.begin(video: false)
        if s.localAnswer != nil {
            sendAnswer(s)
        } else if s.offerSdp == nil {
            // The socket may still be connecting; ask again once it is.
            s.socket?.emit("call:resume-pending", ["callUuids": [s.uuid.uuidString.lowercased()]])
        }
        armFailTimer(s, after: Self.connectTimeout, reason: "connect-timeout")
        // 2.10.113: ICE often connects while the phone is still ringing. The
        // state callback ignored that (not answered yet) and never fired again,
        // so the call never left "connecting": no stats probe / time-to-audio,
        // and the 30 s connect timer hung up a call that was working.
        if s.iceConnected { markConnected(s) }
        // CallKit may already have activated the session (didActivate before
        // this engine owned the call): start WebRTC's audio unit now.
        if DescallCallManager.shared.callKitAudioActive && !RTCAudioSession.sharedInstance().isAudioEnabled {
            NSLog("[DescallNativeCall] audio session already active at answer; enabling audio")
            audioSessionActivated(AVAudioSession.sharedInstance())
        }
        emitState()
    }

    private func markConnected(_ s: Session) {
        s.failTimer?.cancel()
        if s.connectedAt == nil {
            s.connectedAt = Date()
            s.timeline.mark("iceConnected", at: Date().timeIntervalSince1970)
            startStatsProbe(s)
        }
        s.phase = .connected
        enableRemoteAudio(s)
    }

    /// Remote audio tracks play through WebRTC's audio unit; make sure none is
    /// left disabled (renegotiation can hand us a fresh receiver track).
    private func enableRemoteAudio(_ s: Session) {
        guard let pc = s.pc else { return }
        var count = 0
        for t in pc.transceivers where t.mediaType == .audio {
            if let track = t.receiver.track, !track.isEnabled {
                track.isEnabled = true
                count += 1
            }
        }
        if count > 0 { NSLog("[DescallNativeCall] enabled \(count) remote audio track(s)") }
    }

    private func sendAnswer(_ s: Session) {
        guard !s.answerSent, let answer = s.localAnswer else { return }
        s.answerSent = true
        s.phase = .connecting
        s.socket?.emit("call:answer", ["toUserId": s.callerId, "answer": ["type": "answer", "sdp": answer.sdp]])
        s.timeline.mark("answerSent", at: Date().timeIntervalSince1970)
        let queued = s.localCandidates
        s.localCandidates.removeAll()
        for c in queued {
            s.socket?.emit("call:ice-candidate", ["toUserId": s.callerId, "candidate": c])
        }
        sendMediaState(s, requestState: true)
        emitState()
    }

    // MARK: - 3. Audio (CallKit owns activation)

    /// WebRTC must not activate the session itself: CallKit does, at call priority.
    private func setupAudioSessionManual() {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.useManualAudio = true
        rtc.isAudioEnabled = false
        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.voiceChat.rawValue
        // Loudspeaker unless headphones / Bluetooth (earlier product decision).
        config.categoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
        config.sampleRate = 48000
        config.ioBufferDuration = 0.01
        RTCAudioSessionConfiguration.setWebRTC(config)
    }

    /// Category/mode only (no activation): CXAnswerCallAction, before fulfill.
    private func configureAudioSessionForCall() {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }
        do {
            try rtc.setConfiguration(RTCAudioSessionConfiguration.webRTC())
        } catch {
            NSLog("[DescallNativeCall] audio configuration failed: \(error.localizedDescription)")
        }
    }

    func audioSessionActivated(_ audioSession: AVAudioSession) {
        guard let s = session, s.answered, s.phase != .ended else { return }
        let rtc = RTCAudioSession.sharedInstance()
        rtc.audioSessionDidActivate(audioSession)
        rtc.isAudioEnabled = true
        enableRemoteAudio(s)
        let outputs = audioSession.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
        NSLog("[DescallNativeCall] audio enabled category=\(audioSession.category.rawValue) mode=\(audioSession.mode.rawValue) outputs=\(outputs)")
        s.timeline.mark("audioSession", at: Date().timeIntervalSince1970)
        emitState()
    }

    func audioSessionDeactivated(_ audioSession: AVAudioSession) {
        guard session != nil || RTCAudioSession.sharedInstance().isAudioEnabled else { return }
        let rtc = RTCAudioSession.sharedInstance()
        rtc.audioSessionDidDeactivate(audioSession)
        rtc.isAudioEnabled = false
    }

    // MARK: - Controls

    var isMuted: Bool { session?.muted ?? false }

    func setMuted(_ muted: Bool) {
        guard let s = session, s.answered else { return }
        s.muted = muted
        s.audioTrack?.isEnabled = !muted
        sendMediaState(s, requestState: false)
        emitState()
    }

    /// CXEndCallAction on a call this engine answered: hang up.
    func hangUp(_ uuid: UUID) {
        guard let s = session, s.uuid == uuid else { return }
        if s.answered {
            s.socket?.emit("call:end", ["toUserId": s.callerId])
        }
        teardown(s, notifyCallKit: nil)
    }

    /// Declined on CallKit before answering. Returns true when the decline
    /// went out on the native socket (the web app must not send it again).
    func decline(_ uuid: UUID) -> Bool {
        guard let s = session, s.uuid == uuid, !s.answered else { return false }
        let sent = s.socket?.connected == true
        if sent { s.socket?.emit("call:decline", ["toUserId": s.callerId]) }
        // Let the frame flush before closing the socket.
        DispatchQueue.main.asyncAfter(deadline: .now() + (sent ? 0.6 : 0)) { [weak self] in
            self?.teardown(s, notifyCallKit: nil)
        }
        return sent
    }

    /// CallKit provider reset: drop everything without signalling.
    func reset() {
        guard let s = session else { return }
        teardown(s, notifyCallKit: nil)
    }

    /// The JS layer is taking this ring (foreground answer) or it ended: drop prep.
    func cancel(_ uuid: UUID) {
        guard let s = session, s.uuid == uuid, !s.answered else { return }
        teardown(s, notifyCallKit: nil)
    }

    // MARK: - Ending

    private func remoteEnded(_ s: Session, reason: CXCallEndedReason) {
        teardown(s, notifyCallKit: reason)
    }

    private func abandon(_ s: Session) {
        // Not answered yet: the web app path still works, just drop native prep.
        teardown(s, notifyCallKit: nil)
    }

    private func fail(_ s: Session, reason: String) {
        NSLog("[DescallNativeCall] failed: \(reason) \(s.timeline.summary)")
        s.failure = reason
        if s.answered {
            s.socket?.emit("call:end", ["toUserId": s.callerId])
            teardown(s, notifyCallKit: .failed)
        } else {
            teardown(s, notifyCallKit: nil)
        }
    }

    private func armFailTimer(_ s: Session, after seconds: TimeInterval, reason: String) {
        s.failTimer?.cancel()
        let work = DispatchWorkItem { [weak self, weak s] in
            guard let self = self, let s = s, self.session === s else { return }
            self.fail(s, reason: reason)
        }
        s.failTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    private func teardown(_ s: Session, notifyCallKit reason: CXCallEndedReason?) {
        guard s.phase != .ended else { return }
        let wasAnswered = s.answered
        s.phase = .ended
        s.failTimer?.cancel()
        s.offerTimer?.cancel()
        s.statsTimer?.invalidate()
        s.statsTimer = nil
        s.audioTrack?.isEnabled = false
        s.pc?.close()
        s.pc = nil
        if wasAnswered {
            s.timeline.mark("ended", at: Date().timeIntervalSince1970)
        }
        let socket = s.socket
        s.socket = nil
        if wasAnswered, sendTelemetry(s, socket: socket) {
            // Let the telemetry frame flush before closing the socket.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { socket?.close() }
        } else {
            socket?.close()
        }
        if wasAnswered {
            persistMetrics(s)
            let rtc = RTCAudioSession.sharedInstance()
            rtc.isAudioEnabled = false
            DescallAudioRouter.shared.end()
        }
        stopPathMonitor()
        emitState()
        if session === s { session = nil }
        if let reason = reason {
            DescallCallManager.shared.nativeCallEnded(s.uuid, reason: reason)
        }
    }

    // MARK: - Metrics

    private func startStatsProbe(_ s: Session) {
        guard s.statsTimer == nil else { return }
        var ticks = 0
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self, weak s] timer in
            guard let self = self, let s = s, self.session === s, let pc = s.pc else { timer.invalidate(); return }
            ticks += 1
            if ticks > 75 {
                timer.invalidate()
                s.statsTimer = nil
                if s.timeline.ms("firstAudio") == nil {
                    // Field data for "iOS doesn't hear the caller": nothing arrived.
                    NSLog("[DescallNativeCall] no inbound audio 15 s after connect · audioEnabled=\(RTCAudioSession.sharedInstance().isAudioEnabled) callKitAudio=\(DescallCallManager.shared.callKitAudioActive) · \(s.timeline.summary)")
                    s.timeline.mark("noInboundAudio", at: Date().timeIntervalSince1970)
                    self.emitState()
                }
                return
            }
            pc.statistics { report in
                var packets = 0
                var level: Double = 0
                var samples = 0
                for stat in report.statistics.values where stat.type == "inbound-rtp" {
                    if (stat.values["kind"] as? String) == "audio" {
                        packets += (stat.values["packetsReceived"] as? NSNumber)?.intValue ?? 0
                        level = max(level, (stat.values["audioLevel"] as? NSNumber)?.doubleValue ?? 0)
                        samples += (stat.values["totalSamplesReceived"] as? NSNumber)?.intValue ?? 0
                    }
                }
                guard packets > 0 else { return }
                DispatchQueue.main.async {
                    guard self.session === s, s.timeline.ms("firstAudio") == nil else { return }
                    s.timeline.mark("firstAudio", at: Date().timeIntervalSince1970)
                    s.statsTimer?.invalidate()
                    s.statsTimer = nil
                    let rtc = RTCAudioSession.sharedInstance()
                    if !rtc.isAudioEnabled && DescallCallManager.shared.callKitAudioActive {
                        // Packets arrive but the audio unit is off: nothing would play.
                        NSLog("[DescallNativeCall] inbound audio with audio unit off; enabling")
                        rtc.isAudioEnabled = true
                    }
                    self.enableRemoteAudio(s)
                    NSLog("[DescallNativeCall] time-to-audio \(s.timeline.answerToAudioMs ?? -1) ms · packets=\(packets) samples=\(samples) level=\(level) audioEnabled=\(rtc.isAudioEnabled) · \(s.timeline.summary)")
                    self.emitState()
                }
            }
        }
        s.statsTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func persistMetrics(_ s: Session) {
        var d = s.timeline.dictionary
        d["at"] = Int(Date().timeIntervalSince1970)
        d["turn"] = DescallNativeCallLogic.hasTurn(s.iceServers ?? [])
        UserDefaults.standard.set(d, forKey: "descall.nativeCallMetrics")
    }

    private static let pendingTelemetryKey = "descall.nativeCallTelemetryPending"

    /// 3.0.0 (A0): one aggregate summary per natively answered call over the
    /// native socket (path "native"); queued in UserDefaults when offline and
    /// drained by the web app on its next socket connect. Returns true when sent.
    private func sendTelemetry(_ s: Session, socket: DescallSignalSocket?) -> Bool {
        let payload = DescallNativeCallLogic.telemetry(
            s.timeline,
            video: s.video,
            result: DescallNativeCallLogic.telemetryResult(s.timeline, failure: s.failure),
            turn: DescallNativeCallLogic.hasTurn(s.iceServers ?? [])
        )
        if let socket = socket, socket.connected {
            socket.emit("call:telemetry", payload)
            return true
        }
        let list = UserDefaults.standard.array(forKey: Self.pendingTelemetryKey) as? [[String: Any]] ?? []
        UserDefaults.standard.set(DescallNativeCallLogic.appendPending(list, payload), forKey: Self.pendingTelemetryKey)
        return false
    }

    static func drainPendingTelemetry() -> [[String: Any]] {
        let list = UserDefaults.standard.array(forKey: pendingTelemetryKey) as? [[String: Any]] ?? []
        UserDefaults.standard.removeObject(forKey: pendingTelemetryKey)
        return list
    }

    static func lastMetrics() -> [String: Any] {
        (UserDefaults.standard.dictionary(forKey: "descall.nativeCallMetrics")) ?? [:]
    }

    private func emitState() {
        DescallCallManager.shared.emitEvent("nativeCall", state())
    }

    // MARK: - Network changes

    private func startPathMonitor() {
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let sig = "\(path.status)-\(path.availableInterfaces.map { $0.name }.joined(separator: ","))"
            DispatchQueue.main.async {
                guard let self = self else { return }
                if !self.lastPathSignature.isEmpty, sig != self.lastPathSignature, path.status == .satisfied {
                    // Wi-Fi ↔ cellular: the old TCP socket is dead; reconnect signaling now.
                    self.session?.socket?.reconnectNow()
                }
                self.lastPathSignature = sig
            }
        }
        monitor.start(queue: DispatchQueue(label: "descall.native-call.path"))
        pathMonitor = monitor
    }

    private func stopPathMonitor() {
        pathMonitor?.cancel()
        pathMonitor = nil
        lastPathSignature = ""
    }
}

// MARK: - RTCPeerConnectionDelegate

extension DescallNativeCall: RTCPeerConnectionDelegate {
    private func current(_ pc: RTCPeerConnection) -> Session? {
        guard let s = session, s.pc === pc else { return nil }
        return s
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let payload = DescallNativeCallLogic.candidatePayload(sdp: candidate.sdp, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex)
        DispatchQueue.main.async {
            guard let s = self.current(peerConnection) else { return }
            if s.answerSent {
                s.socket?.emit("call:ice-candidate", ["toUserId": s.callerId, "candidate": payload])
            } else {
                s.localCandidates.append(payload)
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        DispatchQueue.main.async {
            guard let s = self.current(peerConnection) else { return }
            switch newState {
            case .connected, .completed:
                s.iceConnected = true
            case .disconnected, .failed, .closed:
                s.iceConnected = false
            default:
                break
            }
            // Before the answer: remembered above, applied by answer().
            guard s.answered else { return }
            switch newState {
            case .connected, .completed:
                self.markConnected(s)
            case .disconnected:
                if s.phase == .connected { s.phase = .reconnecting }
                self.armFailTimer(s, after: Self.reconnectTimeout, reason: "lost")
            case .failed:
                s.phase = .reconnecting
                self.armFailTimer(s, after: Self.reconnectTimeout, reason: "lost")
            default:
                break
            }
            self.emitState()
        }
    }
}
