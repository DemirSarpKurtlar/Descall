import UIKit
import Capacitor

class DescallBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallKeepAlivePlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .lightContent
    }
}
