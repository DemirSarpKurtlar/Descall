import Foundation
import Capacitor
import CallKit
import WebKit

/// JS face of DescallCallManager: registerPlugin("DescallCallKit").
/// All events arrive as one "callkitEvent" listener with { event, data }.
@objc(DescallCallKitPlugin)
public class DescallCallKitPlugin: CAPPlugin, CAPBridgedPlugin, DescallCallEventSink {
    public let identifier = "DescallCallKitPlugin"
    public let jsName = "DescallCallKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoipToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveCalls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportIncomingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOutgoingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportOutgoingCallConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "answerCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "callJoined", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAudioRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAudioRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAudioDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reactivateCapture", returnType: CAPPluginReturnPromise),
    ]

    private var manager: DescallCallManager { DescallCallManager.shared }

    override public func load() {
        DispatchQueue.main.async {
            self.manager.jsDetached()
            self.manager.attach(sink: self)
        }
    }

    func deliverCallEvent(_ name: String, _ data: [String: Any]) {
        notifyListeners("callkitEvent", data: ["event": name, "data": data])
    }

    /// WebKit mutes its capture when the audio session is interrupted (CallKit
    /// activating the session while getUserMedia was already running). Ask it
    /// to resume; harmless when capture isn't muted.
    func callAudioSessionActivated() {
        reactivateWebViewCapture()
    }

    @discardableResult
    private func reactivateWebViewCapture() -> [String: Any] {
        guard let webView = bridge?.webView else { return ["webView": false] }
        let mic = webView.microphoneCaptureState
        let camera = webView.cameraCaptureState
        if mic == .muted {
            webView.setMicrophoneCaptureState(.active, completionHandler: nil)
        }
        return [
            "webView": true,
            "micCaptureState": Self.captureStateName(mic),
            "cameraCaptureState": Self.captureStateName(camera),
            "micReactivated": mic == .muted,
        ]
    }

    private static func captureStateName(_ state: WKMediaCaptureState) -> String {
        switch state {
        case .none: return "none"
        case .active: return "active"
        case .muted: return "muted"
        @unknown default: return "unknown"
        }
    }

    private func callUuid(_ call: CAPPluginCall) -> UUID? {
        guard let raw = call.getString("uuid"), let uuid = UUID(uuidString: raw) else {
            call.reject("A valid call uuid is required")
            return nil
        }
        return uuid
    }

    private func makeInfo(_ call: CAPPluginCall, uuid: UUID, outgoing: Bool) -> DescallCallManager.CallInfo {
        let peerId = call.getString("callerId") ?? call.getString("calleeId") ?? ""
        let name = call.getString("callerName") ?? call.getString("calleeName") ?? ""
        return DescallCallManager.CallInfo(
            uuid: uuid,
            callerId: peerId,
            callerName: name.isEmpty ? "Descall" : name,
            video: call.getBool("video") ?? false,
            conversationId: call.getString("conversationId") ?? peerId,
            outgoing: outgoing
        )
    }

    private func finish(_ call: CAPPluginCall, _ error: Error?) {
        if let error = error {
            call.reject(error.localizedDescription)
        } else {
            call.resolve()
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "available": self.manager.callKitAllowed,
                "reason": self.manager.callKitAllowed ? "" : "region",
            ])
        }
    }

    @objc func getVoipToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let token = self.manager.voipToken {
                call.resolve(["token": token])
            } else {
                call.resolve([:])
            }
        }
    }

    @objc func drainEvents(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["events": self.manager.drainEvents(for: self)])
        }
    }

    @objc func getActiveCalls(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["calls": self.manager.activeCalls()])
        }
    }

    @objc func reportIncomingCall(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        let info = makeInfo(call, uuid: uuid, outgoing: false)
        DispatchQueue.main.async {
            self.manager.reportIncomingFromJs(info) { status in
                call.resolve(["status": status.rawValue])
            }
        }
    }

    @objc func startOutgoingCall(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        let info = makeInfo(call, uuid: uuid, outgoing: true)
        DispatchQueue.main.async {
            self.manager.startOutgoingFromJs(info) { self.finish(call, $0) }
        }
    }

    @objc func reportOutgoingCallConnected(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        DispatchQueue.main.async {
            self.manager.reportOutgoingConnected(uuid)
            call.resolve()
        }
    }

    @objc func answerCall(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        DispatchQueue.main.async {
            self.manager.answerFromJs(uuid) { self.finish(call, $0) }
        }
    }

    @objc func setMuted(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        let muted = call.getBool("muted") ?? false
        DispatchQueue.main.async {
            self.manager.setMutedFromJs(uuid, muted: muted) { self.finish(call, $0) }
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        DispatchQueue.main.async {
            self.manager.endFromJs(uuid) { self.finish(call, $0) }
        }
    }

    /// reason: remoteEnded | unanswered | answeredElsewhere | declinedElsewhere | failed
    @objc func reportCallEnded(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        let reason: CXCallEndedReason
        switch call.getString("reason") ?? "" {
        case "unanswered", "missed": reason = .unanswered
        case "answeredElsewhere": reason = .answeredElsewhere
        case "declinedElsewhere": reason = .declinedElsewhere
        case "failed": reason = .failed
        default: reason = .remoteEnded
        }
        DispatchQueue.main.async {
            self.manager.reportEnded(uuid, reason: reason)
            call.resolve()
        }
    }

    /// The web app joined this CallKit call (clears the "open Descall" hint / timeout).
    @objc func callJoined(_ call: CAPPluginCall) {
        guard let uuid = callUuid(call) else { return }
        DispatchQueue.main.async {
            self.manager.callJoined(uuid)
            call.resolve()
        }
    }

    // MARK: - Call audio routing + diagnostics (works with or without CallKit)

    @objc func beginCallAudio(_ call: CAPPluginCall) {
        let video = call.getBool("video") ?? false
        DispatchQueue.main.async {
            DescallAudioRouter.shared.begin(video: video)
            call.resolve(DescallAudioRouter.shared.state())
        }
    }

    @objc func endCallAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            DescallAudioRouter.shared.end()
            call.resolve()
        }
    }

    @objc func getAudioRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(DescallAudioRouter.shared.state())
        }
    }

    /// route: "receiver" | "speaker" | "system" | "input:<uid>"
    @objc func setAudioRoute(_ call: CAPPluginCall) {
        let route = call.getString("route") ?? ""
        DispatchQueue.main.async {
            if DescallAudioRouter.shared.select(route) {
                call.resolve(DescallAudioRouter.shared.state())
            } else {
                call.reject("Unknown audio route")
            }
        }
    }

    @objc func getAudioDiagnostics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var data = self.manager.audioDiagnostics()
            if let webView = self.bridge?.webView {
                data["micCaptureState"] = Self.captureStateName(webView.microphoneCaptureState)
                data["cameraCaptureState"] = Self.captureStateName(webView.cameraCaptureState)
            }
            data["route"] = DescallAudioRouter.shared.state()["selected"] ?? ""
            call.resolve(data)
        }
    }

    @objc func reactivateCapture(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.reactivateWebViewCapture())
        }
    }
}
