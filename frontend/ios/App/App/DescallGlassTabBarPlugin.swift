import Foundation
import UIKit
import Capacitor

/// `DescallGlassTabBar` (src/lib/nativeGlassTabBar.js): the mobile tab bar as
/// a real iOS 26 Liquid Glass UITabBar (DescallGlassTabBarView) over the
/// WebView. Below iOS 26 `isAvailable` resolves false and the web keeps its
/// own CSS glass bar; every other call is then a no-op.
///
///   isAvailable()                         -> { available }
///   show({ tabs: [{ id, title, symbol, badge? }], selected, style })
///                                         -> { shown, height }
///   update({ selected?, badges?: { id: "3" | null }, style? })
///   hide()
///   events: "select" { id }, "layout" { height }  (height in CSS px, 0 when hidden)
@objc(DescallGlassTabBarPlugin)
public class DescallGlassTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallGlassTabBarPlugin"
    public let jsName = "DescallGlassTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
    ]

    /// Held as UIView so the stored property itself needs no availability.
    private var barView: UIView?

    static var isSupported: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": Self.isSupported])
    }

    @objc func show(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve(["shown": false, "height": 0])
            return
        }
        let tabs = Self.parseTabs(call.getArray("tabs") ?? [])
        let selected = call.getString("selected")
        let style = call.getString("style")
        DispatchQueue.main.async {
            guard !tabs.isEmpty, let host = self.bridge?.viewController?.view else {
                call.resolve(["shown": false, "height": 0])
                return
            }
            let bar = self.ensureBar(in: host)
            Self.applyStyle(style, to: bar)
            bar.setItems(tabs, selected: selected)
            bar.isHidden = false
            bar.attach(to: host)
            call.resolve(["shown": true, "height": bar.bounds.height])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.resolve(); return }
        let selected = call.getString("selected")
        let hasSelected = call.options["selected"] != nil
        let badges = call.getObject("badges")
        let style = call.getString("style")
        DispatchQueue.main.async {
            guard let bar = self.barView as? DescallGlassTabBarView else { call.resolve(); return }
            if let badges {
                var map: [String: String?] = [:]
                for (key, value) in badges { map.updateValue(Self.badgeText(value), forKey: key) }
                bar.setBadges(map)
            }
            if hasSelected { bar.select(selected) }
            Self.applyStyle(style, to: bar)
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.barView?.isHidden = true
            call.resolve()
        }
    }

    /// Called by DescallBridgeViewController.viewDidLayoutSubviews (rotation,
    /// safe-area changes).
    func relayout() {
        guard #available(iOS 26.0, *), let bar = barView as? DescallGlassTabBarView else { return }
        bar.relayout()
    }

    @available(iOS 26.0, *)
    private func ensureBar(in host: UIView) -> DescallGlassTabBarView {
        if let bar = barView as? DescallGlassTabBarView { return bar }
        let bar = DescallGlassTabBarView()
        bar.onSelect = { [weak self] id in
            self?.notifyListeners("select", data: ["id": id])
        }
        bar.onLayout = { [weak self] height in
            self?.notifyListeners("layout", data: ["height": height])
        }
        barView = bar
        return bar
    }

    @available(iOS 26.0, *)
    private static func applyStyle(_ style: String?, to bar: DescallGlassTabBarView) {
        switch style {
        case "light": bar.overrideUserInterfaceStyle = .light
        case "dark": bar.overrideUserInterfaceStyle = .dark
        case nil: break
        default: bar.overrideUserInterfaceStyle = .unspecified
        }
    }

    @available(iOS 26.0, *)
    static func parseTabs(_ raw: [Any]) -> [DescallGlassTabBarView.Item] {
        raw.compactMap { entry in
            guard let dict = entry as? [String: Any],
                  let id = dict["id"] as? String, !id.isEmpty,
                  let title = dict["title"] as? String else { return nil }
            let symbol = (dict["symbol"] as? String) ?? "circle"
            return DescallGlassTabBarView.Item(id: id, title: title, symbol: symbol, badge: badgeText(dict["badge"]))
        }
    }

    static func badgeText(_ value: Any?) -> String? {
        switch value {
        case let n as NSNumber: return n.intValue > 0 ? (n.intValue > 99 ? "99+" : n.stringValue) : nil
        case let s as String: return s.isEmpty || s == "0" ? nil : s
        default: return nil
        }
    }
}
