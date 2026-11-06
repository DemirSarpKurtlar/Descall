import UIKit
import Capacitor
import WebKit
import AVFoundation
import ObjectiveC

class DescallBridgeViewController: CAPBridgeViewController {
    /// Native animated splash (DescallLaunchSplashView), kept over the WebView
    /// until the web app painted (see "Launch overlay" below).
    private var launchOverlay: UIView?
    /// True once index.html reports that the web boot splash (Aurora, same
    /// picture as the launch screen) has painted with its background decoded.
    private var webSplashPainted = false
    /// Status-bar content colour. White by default (dark themes); the Liquid
    /// Glass light theme asks for black via DescallDisplay.setStatusBarStyle.
    private var statusBarDarkContent = false
    private var keyboardObservers: [NSObjectProtocol] = []
    /// iOS 26 Liquid Glass tab bar over the WebView (DescallGlassTabBar).
    let glassTabBarPlugin = DescallGlassTabBarPlugin()

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        glassTabBarPlugin.relayout()
        keepLaunchOverlayOnTop()
        #if DEBUG
        showGlassTabBarDemoIfAsked()
        DescallNotifyDemo.showIfAsked(in: view)
        DescallToastDemo.showIfAsked(in: view)
        #endif
    }

    #if DEBUG
    /// `-DescallGlassTabBarDemo` (Debug builds only): shows the native bar with
    /// the app's six tabs and sample badges, so CI can screenshot it on the
    /// iOS 26 simulator without signing in.
    private var glassTabBarDemoShown = false
    private func showGlassTabBarDemoIfAsked() {
        guard !glassTabBarDemoShown,
              ProcessInfo.processInfo.arguments.contains("-DescallGlassTabBarDemo"),
              view.window != nil else { return }
        glassTabBarDemoShown = true
        if #available(iOS 26.0, *) {
            let bar = DescallGlassTabBarView()
            bar.overrideUserInterfaceStyle = .dark
            bar.setItems([
                .init(id: "chat", title: "Sohbetler", symbol: "bubble.left.and.bubble.right.fill", badge: "3"),
                .init(id: "groups", title: "Gruplar", symbol: "person.3"),
                .init(id: "servers", title: "Sunucular", symbol: "server.rack"),
                .init(id: "friends", title: "Arkadaşlar", symbol: "person.badge.plus", badge: "1"),
                .init(id: "activity", title: "Aktivite", symbol: "bolt"),
                .init(id: "calls", title: "Aramalar", symbol: "phone"),
            ], selected: "chat")
            bar.attach(to: view)
        }
    }
    #endif

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Back is the web app's own iOS edge swipe (useEdgeSwipeBack), which runs
        // the same back handler as each screen's ‹ button. WebKit's history swipe
        // would fire a second, unrelated back (history.back() / blank page) on the
        // same gesture — keep it off explicitly so only one mechanism exists.
        webView?.allowsBackForwardNavigationGestures = false
        // Link preview is a second long-press callout on top of the message menu.
        // Text selection itself is not a public WKWebView switch that can stay
        // off for chrome and on for the composer, so the web layer owns that
        // split (html.glass-ui user-select / touch-callout, plus selectstart).
        webView?.allowsLinkPreview = false
        // Keyboard.setAccessoryBarVisible({ isVisible: false }) — WKWebView has
        // no public switch, so the content view's inputAccessoryView (the
        // up/down arrows and checkmark) is cleared for every field.
        DescallFormAccessoryBar.hide()
        DispatchQueue.main.async { DescallFormAccessoryBar.hide() }
        observeKeyboardInset()
        showLaunchOverlay()
    }

    deinit {
        keyboardObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// WKWebView often leaves the layout viewport full-screen while the keyboard
    /// covers the composer. Publish the overlap in CSS pixels so the shell can
    /// sit the text field just above the keys. A web view that already shrank
    /// reports 0 here, so the inset is not applied twice.
    private func observeKeyboardInset() {
        let names: [Notification.Name] = [
            UIResponder.keyboardWillChangeFrameNotification,
            UIResponder.keyboardWillShowNotification,
            UIResponder.keyboardDidShowNotification,
            UIResponder.keyboardWillHideNotification,
            UIResponder.keyboardDidHideNotification,
        ]
        for name in names {
            let token = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                self?.publishKeyboardInset(note)
            }
            keyboardObservers.append(token)
        }
    }

    private func publishKeyboardInset(_ note: Notification) {
        guard let webView else { return }
        let overlap = keyboardOverlap(note, webView: webView)
        let px = Int(overlap.rounded())
        let js = "window.__descallNativeKeyboard && window.__descallNativeKeyboard(\(px))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func keyboardOverlap(_ note: Notification, webView: WKWebView) -> CGFloat {
        if note.name == UIResponder.keyboardWillHideNotification
            || note.name == UIResponder.keyboardDidHideNotification {
            return 0
        }
        guard let raw = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return 0 }
        let frame = webView.convert(raw, from: nil)
        let overlap = webView.bounds.intersection(frame)
        if overlap.isNull || overlap.isInfinite { return 0 }
        return min(max(0, overlap.height), webView.bounds.height)
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // WKContentView can load after the first viewDidLoad attempt.
        DescallFormAccessoryBar.hide()
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallKeepAlivePlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(DescallCallKitPlugin())
        bridge?.registerPluginInstance(DescallDisplayPlugin())
        bridge?.registerPluginInstance(glassTabBarPlugin)
        bridge?.registerPluginInstance(DescallKeychainPlugin())
        bridge?.registerPluginInstance(DescallNotifyPlugin())
        bridge?.registerPluginInstance(DescallToastPlugin())
        bridge?.registerPluginInstance(DescallDeepLinkPlugin())
        // After Capacitor set its notification delegate (3.0.0, A4).
        DescallNotificationDelegateProxy.install()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        statusBarDarkContent ? .darkContent : .lightContent
    }

    func setStatusBarContent(dark: Bool) {
        guard statusBarDarkContent != dark else { return }
        statusBarDarkContent = dark
        setNeedsStatusBarAppearanceUpdate()
    }
}

// MARK: - Launch overlay (3.7.29: animated splash)

/// LaunchScreen.storyboard color (SplashBackground: light #F4F4F6, dark #1E2029),
/// the exact background of the splash videos, so launch → video is one picture.
let descallSplashBaseColor = UIColor(named: "SplashBackground")
    ?? UIColor(red: 30 / 255, green: 32 / 255, blue: 41 / 255, alpha: 1)

/// Weak proxy so WKUserContentController does not retain the view controller.
final class DescallSplashMessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: DescallBridgeViewController?
    init(_ target: DescallBridgeViewController) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.webSplashDidPaint()
    }
}

/// The launch screen is a plain SplashBackground color. Over the WebView the
/// native splash plays the one-shot Konsept 2 logo animation (light or dark
/// MP4, same background), loops while the web app is still loading, and fades
/// into the app once index.html removed its #boot-splash (the app painted).
/// Reduce Motion: the static last frame instead of the video. Fallback: 12 s.
extension DescallBridgeViewController {
    static let splashPaintedHandler = "descallSplashPainted"

    private func showLaunchOverlay() {
        view?.backgroundColor = descallSplashBaseColor
        webView?.backgroundColor = descallSplashBaseColor
        webView?.scrollView.backgroundColor = descallSplashBaseColor
        guard launchOverlay == nil, let host = view else { return }
        let dark = UIScreen.main.traitCollection.userInterfaceStyle != .light
        let splash = DescallLaunchSplashView(frame: host.bounds, dark: dark)
        splash.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        splash.layer.zPosition = 10_000
        host.addSubview(splash)
        launchOverlay = splash

        if let controller = webView?.configuration.userContentController {
            controller.removeScriptMessageHandler(forName: Self.splashPaintedHandler)
            controller.add(DescallSplashMessageProxy(self), name: Self.splashPaintedHandler)
        }
        splash.onOneShotFinished = { [weak self] in self?.pollAppPainted() }
        splash.start()
        // Never leave the splash up if the page load stalls or fails.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            self?.hideLaunchOverlay()
        }
    }

    /// Re-raises the launch splash over anything added later (the Liquid
    /// Glass tab bar brings itself to front). Returns true while it is up.
    @discardableResult
    func keepLaunchOverlayOnTop() -> Bool {
        guard let overlay = launchOverlay else { return false }
        overlay.superview?.bringSubviewToFront(overlay)
        return true
    }

    func webSplashDidPaint() {
        webSplashPainted = true
    }

    /// After the one-shot: leave as soon as the web boot splash is gone.
    /// Until then the loop keeps playing.
    private func pollAppPainted() {
        guard launchOverlay != nil else { return }
        let js = "(function(){var r=document.getElementById('root');return document.getElementById('boot-splash')||!r||!r.firstElementChild?0:1})()"
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self, self.launchOverlay != nil else { return }
            if (result as? NSNumber)?.intValue == 1 {
                self.hideLaunchOverlay()
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                self?.pollAppPainted()
            }
        }
    }

    private func hideLaunchOverlay() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.splashPaintedHandler)
        guard let overlay = launchOverlay else { return }
        launchOverlay = nil
        UIView.animate(
            withDuration: 0.35,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState],
            animations: { overlay.alpha = 0 },
            completion: { _ in
                (overlay as? DescallLaunchSplashView)?.stop()
                overlay.removeFromSuperview()
                self.glassTabBarPlugin.revealAfterLaunchSplash()
            }
        )
    }
}

/// Native splash: SplashBackground + the one-shot video, then the loop.
/// Videos ship as data assets (Assets.xcassets/SplashVideo-*.dataset) and are
/// written once to the temporary directory, because AVPlayer needs a file URL.
final class DescallLaunchSplashView: UIView {
    var onOneShotFinished: (() -> Void)?
    private let dark: Bool
    private let oneShotLayer = AVPlayerLayer()
    private let loopLayer = AVPlayerLayer()
    private var oneShotPlayer: AVPlayer?
    private var loopPlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var endObserver: NSObjectProtocol?
    private var finished = false
    private var stillLayer: CALayer?

    init(frame: CGRect, dark: Bool) {
        self.dark = dark
        super.init(frame: frame)
        backgroundColor = descallSplashBaseColor
        isUserInteractionEnabled = false
        accessibilityElementsHidden = true
        for l in [loopLayer, oneShotLayer] {
            l.videoGravity = .resizeAspectFill
            l.frame = bounds
            layer.addSublayer(l)
        }
    }

    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        oneShotLayer.frame = bounds
        loopLayer.frame = bounds
        stillLayer?.frame = bounds
        CATransaction.commit()
    }

    private func videoURL(_ kind: String) -> URL? {
        let name = "SplashVideo-\(kind)-\(dark ? "dark" : "light")"
        guard let asset = NSDataAsset(name: name) else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("descall-\(name)-\(asset.data.count).mp4")
        if !FileManager.default.fileExists(atPath: url.path) {
            do { try asset.data.write(to: url, options: .atomic) } catch { return nil }
        }
        return url
    }

    func start() {
        guard !UIAccessibility.isReduceMotionEnabled, let oneShot = videoURL("oneshot") else {
            showStill()
            DispatchQueue.main.async { [weak self] in self?.finishOneShot() }
            return
        }
        // The loop waits, prerolled, under the one-shot so the switch has no gap.
        if let loop = videoURL("loop") {
            let player = AVQueuePlayer()
            player.isMuted = true
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: loop))
            loopLayer.player = player
            loopPlayer = player
        }
        let item = AVPlayerItem(url: oneShot)
        let player = AVPlayer(playerItem: item)
        player.isMuted = true
        player.actionAtItemEnd = .pause
        oneShotLayer.player = player
        oneShotPlayer = player
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in self?.finishOneShot() }
        player.play()
    }

    private func finishOneShot() {
        guard !finished else { return }
        finished = true
        if let loop = loopPlayer {
            loop.play()
            // One loop frame later, drop the paused one-shot on top.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.oneShotLayer.isHidden = true
            }
        }
        onOneShotFinished?()
    }

    /// Reduce Motion: the last frame of the one-shot (the finished logo tile).
    private func showStill() {
        guard let url = videoURL("oneshot") else { return }
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        let time = CMTimeSubtract(asset.duration, CMTime(value: 1, timescale: 30))
        guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { return }
        let still = CALayer()
        still.frame = bounds
        still.contents = image
        still.contentsGravity = .resizeAspectFill
        still.masksToBounds = true
        layer.addSublayer(still)
        stillLayer = still
    }

    func stop() {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        oneShotPlayer?.pause()
        loopPlayer?.pause()
        looper?.disableLooping()
        oneShotLayer.player = nil
        loopLayer.player = nil
    }
}

/// Hides the iPhone form accessory bar (‹ › ✓) for the whole Capacitor shell.
enum DescallFormAccessoryBar {
    private static var swizzled = false
    private static var observing = false

    static func hide() {
        swizzleIfPossible()
        observeKeyboard()
        stripAccessory(passes: 4)
    }

    /// Replace WKContentView's own getter. An inherited UIView method must not
    /// count — that set a "done" flag before WebKit's real implementation loaded.
    private static func swizzleIfPossible() {
        if swizzled { return }
        let selector = NSSelectorFromString("inputAccessoryView")
        guard let cls: AnyClass = NSClassFromString("WKContentView"),
              implements(cls, selector),
              let method = class_getInstanceMethod(cls, selector)
        else { return }
        let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        method_setImplementation(method, imp_implementationWithBlock(block))
        swizzled = true
    }

    private static func implements(_ cls: AnyClass, _ selector: Selector) -> Bool {
        var count: UInt32 = 0
        guard let methods = class_copyMethodList(cls, &count) else { return false }
        defer { free(UnsafeMutableRawPointer(methods)) }
        for index in 0..<Int(count) where method_getName(methods[index]) == selector {
            return true
        }
        return false
    }

    private static func observeKeyboard() {
        if observing { return }
        observing = true
        let names: [Notification.Name] = [
            UIResponder.keyboardWillShowNotification,
            UIResponder.keyboardDidShowNotification,
            UIResponder.keyboardWillChangeFrameNotification,
        ]
        for name in names {
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
                swizzleIfPossible()
                stripAccessory(passes: 8)
            }
        }
    }

    /// The bar is WKFormAccessoryView, drawn over the bottom of the web view
    /// even when the getter swizzle misses. Hide that view only.
    private static func stripAccessory(passes: Int) {
        for window in everyWindow() {
            hideFormAccessory(in: window, depth: 0)
        }
        guard passes > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.04) {
            stripAccessory(passes: passes - 1)
        }
    }

    private static func everyWindow() -> [UIWindow] {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
    }

    private static func hideFormAccessory(in view: UIView, depth: Int) {
        if depth > 14 { return }
        let name = NSStringFromClass(type(of: view))
        if name.contains("FormAccessory") {
            view.isHidden = true
            view.alpha = 0
            view.isUserInteractionEnabled = false
        }
        for child in view.subviews {
            hideFormAccessory(in: child, depth: depth + 1)
        }
    }
}

/// Owns the single web bridge view controller.
///
/// Normally SceneDelegate creates it when the window scene connects. When a
/// VoIP push launches the app in the background and no scene is connected,
/// the bridge is loaded early so the web app (socket + WebRTC) can start
/// while CallKit rings; the scene adopts that same controller later.
enum DescallBridgeHost {
    private static var preloaded: DescallBridgeViewController?

    static func takeOrCreate() -> DescallBridgeViewController {
        if let vc = preloaded {
            preloaded = nil
            return vc
        }
        return DescallBridgeViewController()
    }

    static func preloadIfNoScene() {
        guard preloaded == nil, UIApplication.shared.connectedScenes.isEmpty else { return }
        let vc = DescallBridgeViewController()
        vc.loadViewIfNeeded()
        preloaded = vc
    }
}
