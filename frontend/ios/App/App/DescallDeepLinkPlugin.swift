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

    /// 4.2: links opened by an App Intent (Siri, Shortcuts, Spotlight). The intent can run
    /// before this plugin is loaded on a cold start, so the link waits here until load().
    static let intentOpenURL = Notification.Name("DescallIntentOpenURL")
    private static let stashLock = NSLock()
    private static var stashed: String?

    static func deliverFromIntent(_ url: URL) {
        guard accepts(url) else { return }
        stashLock.lock()
        stashed = url.absoluteString
        stashLock.unlock()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: intentOpenURL, object: ["url": url])
        }
    }

    private static func takeStash() -> String? {
        stashLock.lock()
        defer { stashLock.unlock() }
        let value = stashed
        stashed = nil
        return value
    }

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
        center.addObserver(self, selector: #selector(handleOpen(_:)), name: Self.intentOpenURL, object: nil)
        if let stashed = Self.takeStash() {
            lock.lock()
            pending = stashed
            lock.unlock()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleOpen(_ note: Notification) {
        guard let info = note.object as? [String: Any], let url = info["url"] as? URL,
              Self.accepts(url) else { return }
        if note.name == Self.intentOpenURL { _ = Self.takeStash() }
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
