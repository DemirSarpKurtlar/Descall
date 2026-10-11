import UIKit
import Capacitor
import WebKit
import ObjectiveC

class DescallBridgeViewController: CAPBridgeViewController {
    /// LaunchScreen.storyboard's view, kept over the WebView until the first
    /// page load finishes (see "Launch overlay" below).
    private var launchOverlay: UIView?
    private var launchLoadObservation: NSKeyValueObservation?
    /// Status-bar content colour. White by default (dark themes); the Liquid
    /// Glass light theme asks for black via DescallDisplay.setStatusBarStyle.
    private var statusBarDarkContent = false

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
        showLaunchOverlay()
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

/// Without this the system launch screen is replaced by the bare WebView
/// background (#1E1F22) for a moment before index.html paints its boot splash,
/// so the logo blinked out and back in. The launch view stays on top until the
/// first navigation finishes (the HTML splash, which draws the same logo at the
/// same size and position, is painted by then) and then fades out over it.
extension DescallBridgeViewController {
    private func showLaunchOverlay() {
        guard launchOverlay == nil,
              let host = view,
              let overlay = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view
        else { return }
        overlay.frame = host.bounds
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.isUserInteractionEnabled = false
        host.addSubview(overlay)
        launchOverlay = overlay

        launchLoadObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async { self?.hideLaunchOverlay() }
        }
        // Never leave the launch view up if the page load stalls or fails.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.hideLaunchOverlay()
        }
    }

    private func hideLaunchOverlay() {
        launchLoadObservation?.invalidate()
        launchLoadObservation = nil
        guard let overlay = launchOverlay else { return }
        launchOverlay = nil
        UIView.animate(
            withDuration: 0.25,
            delay: 0.05,
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
