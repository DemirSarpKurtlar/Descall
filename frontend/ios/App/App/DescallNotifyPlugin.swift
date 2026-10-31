import Capacitor
import Foundation
import UserNotifications

/// 3.0.0 (A4): hands the scoped notification token to the extensions
/// (Keychain, access group `group.com.descall.app`). JS name: DescallNotify.
/// The token is never logged and only works for /api/messages/quick-*.
@objc(DescallNotifyPlugin)
public class DescallNotifyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallNotifyPlugin"
    public let jsName = "DescallNotify"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setActionToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearActionToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setUiLocale", returnType: CAPPluginReturnPromise),
    ]

    @objc func setActionToken(_ call: CAPPluginCall) {
        let token = call.getString("token") ?? ""
        let userId = call.getString("userId") ?? ""
        let apiBase = call.getString("apiBase") ?? ""
        let expiresAt = call.getDouble("expiresAt") ?? 0
        guard !token.isEmpty, !userId.isEmpty, expiresAt > Date().timeIntervalSince1970 else {
            call.reject("invalid")
            return
        }
        guard DescallNotify.isAllowedApiBase(apiBase) else {
            call.reject("api_base_not_allowed")
            return
        }
        let saved = DescallNotifyTokenStore.save(.init(token: token, userId: userId, apiBase: apiBase, expiresAt: expiresAt))
        if saved { call.resolve() } else { call.reject("keychain") }
    }

    @objc func clearActionToken(_ call: CAPPluginCall) {
        DescallNotifyTokenStore.clear()
        call.resolve()
    }

    /// UI language of the web app (LocaleContext, on boot and on change). The App Group
    /// copy is read by the notification extensions, CallKit hints and the Watch bridge.
    @objc func setUiLocale(_ call: CAPPluginCall) {
        guard let lang = DescallNotifyLang.match(call.getString("locale")) else {
            call.reject("unknown_locale")
            return
        }
        let defaults = UserDefaults(suiteName: DescallNotify.appGroup)
        let changed = defaults?.string(forKey: DescallNotifyLang.uiLocaleKey) != lang.rawValue
        defaults?.set(lang.rawValue, forKey: DescallNotifyLang.uiLocaleKey)
        if changed {
            DispatchQueue.main.async { AppDelegate.registerNotificationCategories() }
        }
        call.resolve()
    }
}

/// Sits in front of Capacitor's notification delegate. "Okundu" and
/// "1 saat sessize al" chosen where the content extension did not run (for
/// example on Apple Watch) are done here without opening a chat; everything
/// else (taps, calls, "Sohbeti aç") goes to Capacitor unchanged.
final class DescallNotificationDelegateProxy: NSObject, UNUserNotificationCenterDelegate {
    static let shared = DescallNotificationDelegateProxy()
    private weak var inner: UNUserNotificationCenterDelegate?

    static func install() {
        let center = UNUserNotificationCenter.current()
        guard let current = center.delegate, !(current is DescallNotificationDelegateProxy) else { return }
        shared.inner = current
        center.delegate = shared
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if let inner, inner.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            inner.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            completionHandler([])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let action = response.actionIdentifier
        let content = response.notification.request.content
        if action == DescallNotify.Action.read || action == DescallNotify.Action.mute,
           let payload = DescallNotifyPayload(userInfo: content.userInfo) {
            if action == DescallNotify.Action.mute {
                DescallNotifyDefaults.muteForAnHour(payload.conversation)
                completionHandler()
                return
            }
            guard let api = DescallNotifyAPI() else {
                completionHandler()
                return
            }
            api.markRead(conversation: payload.conversation) { _ in completionHandler() }
            return
        }
        if let inner, inner.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            inner.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            completionHandler()
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, openSettingsFor notification: UNNotification?) {
        inner?.userNotificationCenter?(center, openSettingsFor: notification)
    }
}
