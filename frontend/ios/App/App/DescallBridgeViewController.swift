import UIKit
import Capacitor

class DescallBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallKeepAlivePlugin())
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .lightContent
    }
}
