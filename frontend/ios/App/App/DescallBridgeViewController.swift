import UIKit
import Capacitor

class DescallBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallKeepAlivePlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(DescallCallKitPlugin())
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .lightContent
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
