import UIKit
import Capacitor
import WebKit
import ObjectiveC

class DescallBridgeViewController: CAPBridgeViewController {
    /// LaunchScreen.storyboard's view, kept over the WebView until the first
    /// page load finishes (see "Launch overlay" below).
    private var launchOverlay: UIView?
    private var launchLoadObservation: NSKeyValueObservation?
    /// True once index.html reports that the web boot splash (Aurora, same
    /// picture as the launch screen) has painted with its background decoded.
    private var webSplashPainted = false
    private var launchPageLoaded = false
    /// Status-bar content colour. White by default (dark themes); the Liquid
    /// Glass light theme asks for black via DescallDisplay.setStatusBarStyle.
    private var statusBarDarkContent = false
    private var keyboardObservers: [NSObjectProtocol] = []
    /// iOS 26 Liquid Glass tab bar over the WebView (DescallGlassTabBar).
    let glassTabBarPlugin = DescallGlassTabBarPlugin()

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        glassTabBarPlugin.relayout()
        #if DEBUG
        showGlassTabBarDemoIfAsked()
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

// MARK: - Launch overlay

/// Aurora splash, base color of the launch image (#0D1030).
let descallSplashBaseColor = UIColor(red: 13 / 255, green: 16 / 255, blue: 48 / 255, alpha: 1)

/// Weak proxy so WKUserContentController does not retain the view controller.
final class DescallSplashMessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: DescallBridgeViewController?
    init(_ target: DescallBridgeViewController) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.webSplashDidPaint()
    }
}

/// The launch screen (LaunchAurora) stays over the WebView until index.html
/// reports, through the `descallSplashPainted` message handler, that its boot
/// splash has painted the same picture (background image decoded, two frames
/// later). Only then does the launch view go, so the handoff is invisible.
/// Fallbacks: 1.5 s after the first page load (an older web bundle never
/// posts), and 5 s in any case.
extension DescallBridgeViewController {
    static let splashPaintedHandler = "descallSplashPainted"

    private func showLaunchOverlay() {
        view?.backgroundColor = descallSplashBaseColor
        webView?.backgroundColor = descallSplashBaseColor
        webView?.scrollView.backgroundColor = descallSplashBaseColor
        guard launchOverlay == nil,
              let host = view,
              let overlay = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view
        else { return }
        overlay.frame = host.bounds
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.isUserInteractionEnabled = false
        host.addSubview(overlay)
        launchOverlay = overlay

        if let controller = webView?.configuration.userContentController {
            controller.removeScriptMessageHandler(forName: Self.splashPaintedHandler)
            controller.add(DescallSplashMessageProxy(self), name: Self.splashPaintedHandler)
        }
        launchLoadObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async { self?.launchPageDidLoad() }
        }
        // Never leave the launch view up if the page load stalls or fails.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.hideLaunchOverlay()
        }
    }

    func webSplashDidPaint() {
        webSplashPainted = true
        hideLaunchOverlay()
    }

    private func launchPageDidLoad() {
        guard !launchPageLoaded else { return }
        launchPageLoaded = true
        if webSplashPainted { hideLaunchOverlay(); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.hideLaunchOverlay()
        }
    }

    private func hideLaunchOverlay() {
        launchLoadObservation?.invalidate()
        launchLoadObservation = nil
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.splashPaintedHandler)
        guard let overlay = launchOverlay else { return }
        launchOverlay = nil
        // Same picture underneath: a short cross-fade only hides sub-pixel
        // differences between the baked image and the live glass.
        UIView.animate(
            withDuration: 0.2,
            delay: 0,
            options: [.curveEaseOut, .beginFromCurrentState],
            animations: { overlay.alpha = 0 },
            completion: { _ in overlay.removeFromSuperview() }
        )
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
