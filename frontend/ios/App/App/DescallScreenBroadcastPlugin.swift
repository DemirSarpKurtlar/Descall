import Foundation
import UIKit
import ReplayKit
import Combine
import Capacitor
import LiveKit

/// Whole-screen sharing from iPhone / iPad (docs/ios-screen-share.md), exposed
/// to JS as `DescallScreenBroadcast` (src/lib/iosScreenBroadcast.js).
///
/// WKWebView has no getDisplayMedia, so the screen comes from a ReplayKit
/// Broadcast Upload Extension (DescallBroadcast, LiveKit `LKSampleHandler`).
/// The extension only hands frames over the App Group socket; this app process
/// publishes them with the LiveKit Swift SDK in a second room connection, the
/// user's screen companion `<userId>:screen` (token from
/// GET /api/webrtc/livekit-screen-token: screen share only, no subscribe).
/// Voice itself stays in the web layer (livekit-client in WKWebView).
///
///   getStatus()  { available, reason?, broadcasting, phase, extension }
///   start({ url, token, anchor?, showPicker?, maxHeight?, fps? })
///                connect the companion room; show the system picker
///                preselected to Descall unless a broadcast already runs
///   stop({ reason? })  ask the extension to finish, leave the room
///   "state" event  { phase, broadcasting, reason?, at } (DescallScreenBroadcastLogic.Phase)
@objc(DescallScreenBroadcastPlugin)
public class DescallScreenBroadcastPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallScreenBroadcastPlugin"
    public let jsName = "DescallScreenBroadcast"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        DispatchQueue.main.async {
            DescallScreenBroadcast.shared.onEvent = { [weak self] payload in
                self?.notifyListeners("state", data: payload)
            }
            DescallScreenBroadcast.shared.activate()
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(DescallScreenBroadcast.shared.status())
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let parsed = DescallScreenBroadcastLogic.parseRequest(
            url: call.getString("url"),
            token: call.getString("token"),
            showPicker: call.getBool("showPicker"),
            maxHeight: call.getInt("maxHeight"),
            fps: call.getInt("fps")
        )
        let request: DescallScreenBroadcastLogic.Request
        switch parsed {
        case let .success(value): request = value
        case let .failure(error):
            call.reject("Invalid screen broadcast request.", error.rawValue)
            return
        }
        let anchor = call.getObject("anchor")
        let anchorValues = (
            Self.number(anchor?["x"]),
            Self.number(anchor?["y"]),
            Self.number(anchor?["width"]),
            Self.number(anchor?["height"])
        )
        DispatchQueue.main.async {
            let host = self.bridge?.viewController?.view
            let webView = self.bridge?.webView
            DescallScreenBroadcast.shared.start(request, anchor: anchorValues, host: host, webView: webView) { phase, failure in
                if let failure {
                    call.reject("Screen broadcast unavailable.", failure)
                } else {
                    call.resolve(["phase": phase ?? "connecting"])
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "stopped"
        DispatchQueue.main.async {
            DescallScreenBroadcast.shared.stop(reason: reason)
            call.resolve()
        }
    }

    private static func number(_ value: Any?) -> Double? {
        if let n = value as? NSNumber { return n.doubleValue }
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        return nil
    }
}

/// The companion room + broadcast lifecycle. Main thread only.
final class DescallScreenBroadcast: NSObject, RoomDelegate, @unchecked Sendable {
    static let shared = DescallScreenBroadcast()
    typealias Logic = DescallScreenBroadcastLogic
    typealias Phase = DescallScreenBroadcastLogic.Phase

    /// Product name of the extension target (DescallBroadcast.appex in PlugIns).
    static let extensionProductName = "DescallBroadcast"

    static var extensionBundleId: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "RTCScreenSharingExtension") as? String, !value.isEmpty {
            return value
        }
        return "\(Bundle.main.bundleIdentifier ?? "com.descall.app").broadcast"
    }

    static var appGroupId: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String, !value.isEmpty {
            return value
        }
        return "group.\(Bundle.main.bundleIdentifier ?? "com.descall.app")"
    }

    var onEvent: (([String: Any]) -> Void)?

    private var phase: Phase = .idle
    private var room: Room?
    private var request: Logic.Request?
    /// Bumped per session so late async results of an older session are ignored.
    private var session = 0
    private var activated = false
    private var broadcastSubscription: AnyCancellable?
    private var pickerView: RPSystemBroadcastPickerView?
    private var pickerTimer: DispatchWorkItem?
    private var orphanTimer: DispatchWorkItem?
    private var stopTimer: DispatchWorkItem?
    private var capturedObserver: NSObjectProtocol?

    func activate() {
        guard !activated else { return }
        activated = true
        // Publication is driven here (the room may connect after the broadcast started).
        BroadcastManager.shared.shouldPublishTrack = false
        broadcastSubscription = BroadcastManager.shared.isBroadcastingPublisher
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isBroadcasting in
                self?.broadcastChanged(isBroadcasting)
            }
        // An extension killed by the system (memory) never posts "stopped";
        // the screen stops being captured, which ends the share here too.
        capturedObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.capturedChanged()
        }
    }

    private func capturedChanged() {
        guard !UIScreen.main.isCaptured, phase == .live || phase == .stopping else { return }
        let current = session
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, self.session == current, !UIScreen.main.isCaptured else { return }
            guard self.phase == .live || self.phase == .stopping else { return }
            self.finish(reason: self.phase == .stopping ? "user-stopped" : "broadcast-ended")
        }
    }

    func availability() -> (available: Bool, reason: String?) {
        #if targetEnvironment(simulator)
        return (false, "simulator")
        #else
        guard let plugIns = Bundle.main.builtInPlugInsURL else { return (false, "no-extension") }
        let appex = plugIns.appendingPathComponent("\(Self.extensionProductName).appex")
        guard FileManager.default.fileExists(atPath: appex.path) else { return (false, "no-extension") }
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId) != nil else {
            return (false, "no-app-group")
        }
        return (true, nil)
        #endif
    }

    func status() -> [String: Any] {
        let check = self.availability()
        var result: [String: Any] = [
            "available": check.available,
            "broadcasting": BroadcastManager.shared.isBroadcasting,
            "phase": phase.rawValue,
            "extension": Self.extensionBundleId,
        ]
        if let reason = check.reason { result["reason"] = reason }
        return result
    }

    // MARK: - Start / stop

    func start(_ request: Logic.Request,
               anchor: (Double?, Double?, Double?, Double?),
               host: UIView?,
               webView: UIView?,
               completion: @escaping (_ phase: String?, _ failure: String?) -> Void)
    {
        let check = self.availability()
        guard check.available else {
            completion(nil, check.reason ?? "no-extension")
            return
        }
        switch phase {
        case .live, .stopping, .connecting:
            completion(phase.rawValue, nil)
            return
        case .waiting:
            if request.showPicker { showPicker(anchor: anchor, host: host, webView: webView) }
            completion(phase.rawValue, nil)
            return
        case .idle, .ended, .error, .orphan:
            break
        }

        cancel(&orphanTimer)
        session += 1
        let current = session
        self.request = request
        setPhase(.connecting)
        if request.showPicker, !BroadcastManager.shared.isBroadcasting {
            showPicker(anchor: anchor, host: host, webView: webView)
            schedulePickerTimeout(session: current)
        }

        // WKWebView owns the voice audio session; the companion room has no audio.
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        let box = Logic.captureBox(maxHeight: request.maxHeight)
        let captureOptions = ScreenShareCaptureOptions(
            dimensions: Dimensions(width: Int32(box.width), height: Int32(box.height)),
            fps: request.fps,
            showCursor: false,
            appAudio: false,
            useBroadcastExtension: true,
            // One path on every iOS version: the broadcast extension (iOS 27's
            // in-process ScreenCaptureKit picker is not used).
            useScreenCaptureKit: false
        )
        let publishOptions = VideoPublishOptions(
            screenShareEncoding: VideoEncoding(
                maxBitrate: Logic.maxBitrate(maxHeight: request.maxHeight, fps: request.fps),
                maxFps: request.fps
            ),
            // Software VP8: keeps encoding while the app is in the background and
            // every Descall client (web, Electron, iOS) decodes it.
            preferredCodec: .vp8
        )
        let roomOptions = RoomOptions(
            defaultScreenShareCaptureOptions: captureOptions,
            defaultVideoPublishOptions: publishOptions,
            dataStreamOptions: DataStreamOptions(),
            adaptiveStream: false,
            dynacast: true,
            suspendLocalVideoTracksInBackground: false
        )
        let connectOptions = ConnectOptions(autoSubscribe: false)
        let room = Room(delegate: self, connectOptions: connectOptions, roomOptions: roomOptions)
        self.room = room
        completion(Phase.connecting.rawValue, nil)

        Task { [weak self] in
            do {
                try await room.connect(url: request.url, token: request.token, connectOptions: connectOptions, roomOptions: roomOptions)
                DispatchQueue.main.async { self?.roomConnected(session: current) }
            } catch {
                DispatchQueue.main.async { self?.fail(session: current, reason: "connect-failed") }
            }
        }
    }

    func stop(reason: String) {
        cancel(&pickerTimer)
        cancel(&orphanTimer)
        removePicker()
        if BroadcastManager.shared.isBroadcasting {
            if phase == .live || phase == .connecting || phase == .waiting || phase == .orphan {
                setPhase(.stopping, reason: reason)
            }
            BroadcastManager.shared.requestStop()
            // The extension normally ends within a second; never stay "stopping".
            let current = session
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.session == current, self.phase == .stopping else { return }
                self.finish(reason: reason)
            }
            stopTimer = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: work)
            return
        }
        if phase != .idle { finish(reason: reason) }
    }

    // MARK: - Broadcast state

    private func broadcastChanged(_ isBroadcasting: Bool) {
        let connected = room?.connectionState == .connected
        let next = Logic.phaseAfterBroadcastChange(current: phase, isBroadcasting: isBroadcasting, roomConnected: connected)
        if isBroadcasting {
            removePicker()
            cancel(&pickerTimer)
            switch next {
            case .orphan:
                // Started from Control Center: ask JS for a session, end it if none comes.
                setPhase(.orphan, reason: "external-start")
                scheduleOrphanTimeout()
            case .live:
                publishScreen(session: session)
            default:
                break // still connecting: roomConnected publishes
            }
            return
        }
        if phase == .orphan {
            cancel(&orphanTimer)
            setPhase(.ended, reason: "broadcast-ended")
            phase = .idle
            return
        }
        if next == .ended {
            finish(reason: phase == .stopping ? "user-stopped" : "broadcast-ended")
        }
    }

    private func roomConnected(session current: Int) {
        guard session == current, room != nil else { return }
        if BroadcastManager.shared.isBroadcasting {
            publishScreen(session: current)
        } else if request?.showPicker == false {
            // Control Center broadcast ended while the room was connecting.
            finish(reason: "broadcast-ended")
        } else {
            setPhase(.waiting)
        }
    }

    private func publishScreen(session current: Int) {
        guard session == current, let room else { return }
        Task { [weak self] in
            do {
                let publication = try await room.localParticipant.setScreenShare(enabled: true)
                DispatchQueue.main.async {
                    guard let self, self.session == current else { return }
                    if publication != nil {
                        self.cancel(&self.stopTimer)
                        self.setPhase(.live)
                    } else if BroadcastManager.shared.isBroadcasting {
                        self.fail(session: current, reason: "publish-failed")
                    }
                }
            } catch {
                DispatchQueue.main.async { self?.fail(session: current, reason: "publish-failed") }
            }
        }
    }

    // MARK: - RoomDelegate

    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.room === room else { return }
            if self.phase == .stopping {
                self.finish(reason: "user-stopped")
            } else {
                self.fail(session: self.session, reason: "room-disconnected")
            }
        }
    }

    // MARK: - End

    private func fail(session current: Int, reason: String) {
        guard session == current, phase != .idle else { return }
        if BroadcastManager.shared.isBroadcasting { BroadcastManager.shared.requestStop() }
        finish(reason: reason, failed: true)
    }

    private func finish(reason: String, failed: Bool = false) {
        session += 1
        cancel(&pickerTimer)
        cancel(&orphanTimer)
        cancel(&stopTimer)
        removePicker()
        let ending = room
        room = nil
        request = nil
        setPhase(failed ? .error : .ended, reason: reason)
        phase = .idle
        guard let ending else { return }
        Task {
            _ = try? await ending.localParticipant.setScreenShare(enabled: false)
            await ending.disconnect()
        }
    }

    private func setPhase(_ next: Phase, reason: String? = nil) {
        phase = next
        let payload = Logic.eventPayload(phase: next, broadcasting: BroadcastManager.shared.isBroadcasting, reason: reason)
        onEvent?(payload)
    }

    // MARK: - Timers

    private func schedulePickerTimeout(session current: Int) {
        cancel(&pickerTimer)
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.session == current else { return }
            guard self.phase == .waiting || self.phase == .connecting else { return }
            guard !BroadcastManager.shared.isBroadcasting else { return }
            self.finish(reason: "picker-timeout")
        }
        pickerTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Logic.pickerTimeout, execute: work)
    }

    private func scheduleOrphanTimeout() {
        cancel(&orphanTimer)
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.phase == .orphan else { return }
            BroadcastManager.shared.requestStop()
            self.setPhase(.ended, reason: "no-session")
            self.phase = .idle
        }
        orphanTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Logic.orphanTimeout, execute: work)
    }

    private func cancel(_ work: inout DispatchWorkItem?) {
        work?.cancel()
        work = nil
    }

    // MARK: - System picker

    /// RPSystemBroadcastPickerView preselected to the Descall extension. It is
    /// kept (invisible) in the view hierarchy at the Share Screen button, so the
    /// iPad popover has a source to point at.
    private func showPicker(anchor: (Double?, Double?, Double?, Double?), host: UIView?, webView: UIView?) {
        removePicker()
        guard let host else {
            BroadcastManager.shared.requestActivation()
            return
        }
        let rect = Logic.anchorRect(
            x: anchor.0, y: anchor.1, width: anchor.2, height: anchor.3,
            hostWidth: Double((webView ?? host).bounds.width),
            hostHeight: Double((webView ?? host).bounds.height)
        )
        var frame = CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
        if let webView, webView !== host { frame = host.convert(frame, from: webView) }
        let picker = RPSystemBroadcastPickerView(frame: frame)
        picker.preferredExtension = Self.extensionBundleId
        picker.showsMicrophoneButton = false
        picker.alpha = 0.011
        picker.isAccessibilityElement = false
        picker.accessibilityElementsHidden = true
        host.addSubview(picker)
        pickerView = picker
        DispatchQueue.main.async { [weak self, weak picker] in
            guard let self, let picker, self.pickerView === picker else { return }
            if let button = Self.firstButton(in: picker) {
                button.sendActions(for: .touchUpInside)
            } else {
                BroadcastManager.shared.requestActivation()
            }
        }
    }

    private func removePicker() {
        pickerView?.removeFromSuperview()
        pickerView = nil
    }

    private static func firstButton(in view: UIView) -> UIButton? {
        for subview in view.subviews {
            if let button = subview as? UIButton { return button }
            if let nested = firstButton(in: subview) { return nested }
        }
        return nil
    }
}
