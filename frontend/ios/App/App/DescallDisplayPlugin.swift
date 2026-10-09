import Foundation
import UIKit
import Capacitor

/// Display / accessibility / power state for the Liquid Glass UI (2.9.151),
/// exposed to JS as `DescallDisplay` (src/lib/glassDisplay.js).
///
/// WKWebView does not surface these to CSS, so the web layer cannot see them:
///   reduceTransparency – Settings › Accessibility › Display › Reduce Transparency
///   darkerColors       – Settings › Accessibility › Display › Increase Contrast
///   lowPower           – Low Power Mode
///   thermal            – ProcessInfo thermal state (nominal | fair | serious | critical)
///   machine            – hardware identifier (e.g. "iPhone17,1") for the device tier
/// `getState()` resolves with that object; a `change` event carries the same
/// object whenever one of them flips. `setStatusBarStyle({ style: "light" | "dark" })`
/// picks white or black status-bar content for the active theme.
@objc(DescallDisplayPlugin)
public class DescallDisplayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallDisplayPlugin"
    public let jsName = "DescallDisplay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStatusBarStyle", returnType: CAPPluginReturnPromise),
    ]

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        let names: [Notification.Name] = [
            UIAccessibility.reduceTransparencyStatusDidChangeNotification,
            UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
            Notification.Name.NSProcessInfoPowerStateDidChange,
            ProcessInfo.thermalStateDidChangeNotification,
        ]
        for name in names {
            let token = center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self = self else { return }
                self.notifyListeners("change", data: self.currentState())
            }
            observers.append(token)
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.currentState())
        }
    }

    @objc func setStatusBarStyle(_ call: CAPPluginCall) {
        let dark = call.getString("style") == "dark"
        DispatchQueue.main.async {
            if let vc = self.bridge?.viewController as? DescallBridgeViewController {
                vc.setStatusBarContent(dark: dark)
            }
            call.resolve()
        }
    }

    private func currentState() -> [String: Any] {
        return [
            "reduceTransparency": UIAccessibility.isReduceTransparencyEnabled,
            "darkerColors": UIAccessibility.isDarkerSystemColorsEnabled,
            "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermal": Self.thermalName(ProcessInfo.processInfo.thermalState),
            "machine": Self.machineIdentifier(),
        ]
    }

    private static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "nominal"
        }
    }

    private static func machineIdentifier() -> String {
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return sim
        }
        var info = utsname()
        uname(&info)
        return withUnsafePointer(to: &info.machine) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
    }
}
