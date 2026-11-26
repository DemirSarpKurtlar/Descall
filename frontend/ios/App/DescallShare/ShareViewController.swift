import SwiftUI
import UIKit

/// Entry point of the "Paylaş > Descall" share extension (com.descall.app.share). The system
/// shows it as a sheet over the app the person shares from; the SwiftUI sheet inside is
/// draft A (ShareViews.swift). The session comes from the shared Keychain (DescallKit), the
/// transfer runs in a background URLSession (ShareTransport) the app finishes if needed.
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private var model: ShareSheetModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        let model = ShareSheetModel(context: extensionContext)
        self.model = model
        let host = UIHostingController(rootView: ShareRootView(model: model))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        model.hostController = self
        model.start()
    }
}
