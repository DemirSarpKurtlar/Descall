import Foundation
import Capacitor
import CallKit

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
}
