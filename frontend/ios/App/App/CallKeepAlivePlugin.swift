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
/// DM calls with CallKit (DescallCallManager, since 2.9.133) skip this plugin:
/// CallKit activates the audio session for them. It is still used for group /
/// server voice, and for DM calls where CallKit isn't available (mainland China).
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
