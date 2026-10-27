import Foundation
import Capacitor

/// 3.0.1: deep links into the app. `descall://…` (CFBundleURLTypes) and
/// https://descall.com universal links (Associated Domains) reach
/// SceneDelegateProxy, which posts the Capacitor open-URL notifications; on a
/// cold start it posts them once plugins are loaded but before the web app is.
/// This plugin keeps the latest of our URLs until JS takes it
/// (`takePending`) and fires "url" so a running app reads it at once.
/// Routing is done in JS (src/lib/deepLinks.js). JS name: DescallDeepLink.
@objc(DescallDeepLinkPlugin)
public class DescallDeepLinkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallDeepLinkPlugin"
    public let jsName = "DescallDeepLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
    ]

    private let lock = NSLock()
    private var pending: String?

    static func accepts(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "descall" { return true }
        guard scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "descall.com" || host == "www.descall.com"
    }

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(handleOpen(_:)), name: .capacitorOpenURL, object: nil)
        center.addObserver(self, selector: #selector(handleOpen(_:)), name: .capacitorOpenUniversalLink, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleOpen(_ note: Notification) {
        guard let info = note.object as? [String: Any], let url = info["url"] as? URL,
              Self.accepts(url) else { return }
        lock.lock()
        pending = url.absoluteString
        lock.unlock()
        notifyListeners("url", data: [:])
    }

    @objc func takePending(_ call: CAPPluginCall) {
        lock.lock()
        let value = pending
        pending = nil
        lock.unlock()
        if let value {
            call.resolve(["url": value])
        } else {
            call.resolve(["url": NSNull()])
        }
    }
}
