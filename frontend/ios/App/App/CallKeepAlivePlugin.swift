import Foundation
import Capacitor
import AVFoundation

/// iOS counterpart of the Android CallKeepAlive foreground service.
///
/// Android keeps the WebView alive with a microphone/mediaPlayback foreground
/// service. iOS has no equivalent service. An active AVAudioSession in
/// .playAndRecord, plus the audio background mode, is what keeps an in-progress
/// WebRTC call running when the app is backgrounded.
///
/// This is not CallKit. Incoming rings still use the existing alert push
/// (category INCOMING_CALL) and the web call UI. PushKit/CallKit is intentionally
/// not enabled: Apple requires every VoIP push to report a CallKit call, and the
/// current backend sends alert pushes, not VoIP pushes.
@objc(CallKeepAlivePlugin)
public class CallKeepAlivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallKeepAlivePlugin"
    public let jsName = "CallKeepAlive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var sessionActive = false

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            do {
                try session.setCategory(
                    .playAndRecord,
                    mode: .voiceChat,
                    options: [.allowBluetooth, .defaultToSpeaker]
                )
                try session.setActive(true)
                self.sessionActive = true
                call.resolve()
            } catch {
                call.reject("Failed to start call audio session: \(error.localizedDescription)")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.sessionActive else {
                call.resolve()
                return
            }
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
                self.sessionActive = false
                call.resolve()
            } catch {
                self.sessionActive = false
                call.reject("Failed to stop call audio session: \(error.localizedDescription)")
            }
        }
    }
}
