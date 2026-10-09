import UIKit
import Capacitor
import WebKit

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
        showLaunchOverlay()
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallKeepAlivePlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(DescallCallKitPlugin())
        bridge?.registerPluginInstance(DescallDisplayPlugin())
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
