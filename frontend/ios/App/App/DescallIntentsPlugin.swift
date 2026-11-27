import Foundation
import UIKit
import Capacitor
import Intents
import SwiftUI
#if canImport(WidgetKit)
import WidgetKit
#endif

// 4.2: Siri / Shortcuts / Spotlight / Action Button (DescallAppIntents.swift) and the
// bridge they need into the running web app. JS side: src/lib/nativeIntents.js.

/// Keeps DescallKit's shared session (DescallSessionStore) in step with the app's own
/// session: token from DescallKeychainPlugin (sign-in, every refresh, sign-out), profile
/// and API origin from JS (DescallIntents.syncSession).
enum DescallSharedSessionSync {
    /// The web app's token key (src/lib/secureToken.js SECURE_TOKEN_KEY).
    static let tokenKey = "descall_token"
    static let legacyService = "com.descall.session"

    static func tokenChanged(_ token: String) {
        guard !token.isEmpty else { return signedOut() }
        if var session = DescallSessionStore.load() {
            guard session.token != token else { return }
            session.token = token
            session.updatedAt = Date()
            DescallSessionStore.save(session)
        } else {
            DescallSessionStore.save(DescallSession(token: token, locale: DescallNotifyLang.storedUiLocale()))
        }
        afterChange()
    }

    static func updateProfile(userId: String?, username: String?, displayName: String?, avatarUrl: String?,
                              apiBase: String?, locale: String?) {
        // The token always comes from the app's own Keychain item, never from JS.
        if DescallSessionStore.load() == nil, let token = KeychainStore.read(service: legacyService, account: tokenKey), !token.isEmpty {
            DescallSessionStore.save(DescallSession(token: token))
        }
        let changed = DescallSessionStore.update { s in
            if let userId, s.userId != userId {
                // Another account on this device: drop the old profile fields first.
                s.displayName = nil
                s.avatarUrl = nil
            }
            s.userId = userId ?? s.userId
            s.username = username ?? s.username
            s.displayName = displayName ?? s.displayName
            s.avatarUrl = avatarUrl.flatMap { $0.hasPrefix("https://") ? $0 : nil } ?? s.avatarUrl
            if let apiBase { s.apiBase = DescallAPIBase.validated(apiBase) }
            s.locale = locale ?? s.locale
        }
        if changed != nil { afterChange() }
    }

    static func signedOut() {
        DescallSessionStore.clear()
        DescallIntentBridge.shared.reset()
        // Siri suggestions and Spotlight must not keep showing this account's friends.
        INInteraction.deleteAll(completion: nil)
        // Widgets draft B: favourites, cached faces and the call card go too.
        DescallWidgetsBridge.signedOut()
        afterChange()
    }

    /// Users who signed in before 4.2: copy the session once at launch.
    static func migrateIfNeeded() {
        guard DescallSessionStore.load() == nil,
              let token = KeychainStore.read(service: legacyService, account: tokenKey), !token.isEmpty else { return }
        DescallSessionStore.save(DescallSession(token: token, locale: DescallNotifyLang.storedUiLocale()))
        afterChange()
    }

    static func afterChange() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        if #available(iOS 17.0, *) {
            // Friend / voice channel names in the Siri phrases follow the account.
            DescallAppShortcuts.updateAppShortcutParameters()
        }
    }
}

/// What an App Intent asks the web layer to do, and the web layer's answer.
struct DescallIntentOutcome {
    let ok: Bool
    let error: String?
    let state: [String: Any]

    static func failed(_ error: String) -> DescallIntentOutcome { DescallIntentOutcome(ok: false, error: error, state: [:]) }
}

/// The running web app as seen from an App Intent (same process). JS reports the call
/// state (reportCallState) and runs the actions (listener "action" -> completeAction).
/// An action that needs the app on screen (join voice) waits in a queue until JS takes it.
final class DescallIntentBridge {
    static let shared = DescallIntentBridge()

    struct CallState {
        var active = false
        /// "dm", "group" or "server".
        var kind = ""
        var title = ""
        var muted = false
        var deafened = false
    }

    private let lock = NSLock()
    private var call = CallState()
    private var waiters: [String: CheckedContinuation<DescallIntentOutcome, Never>] = [:]
    private var queued: [(action: [String: Any], at: Date)] = []
    private weak var plugin: DescallIntentsPlugin?
    static let queueTTL: TimeInterval = 90

    func attach(_ plugin: DescallIntentsPlugin) {
        lock.lock()
        self.plugin = plugin
        lock.unlock()
    }

    var callState: CallState {
        lock.lock()
        defer { lock.unlock() }
        return call
    }

    func setCallState(_ state: CallState) {
        lock.lock()
        call = state
        lock.unlock()
    }

    func reset() {
        lock.lock()
        call = CallState()
        queued.removeAll()
        let pending = waiters
        waiters.removeAll()
        lock.unlock()
        for (_, cont) in pending { cont.resume(returning: .failed("signed_out")) }
    }

    /// Run `type` in the web app and wait for its answer (or `timeout`).
    /// queueIfNotReady: keep it for the web app to take once loaded (the app is opening).
    func run(_ type: String, payload: [String: String] = [:], timeout: TimeInterval, queueIfNotReady: Bool) async -> DescallIntentOutcome {
        let id = UUID().uuidString
        let action: [String: Any] = ["id": id, "type": type, "payload": payload]
        return await withCheckedContinuation { (cont: CheckedContinuation<DescallIntentOutcome, Never>) in
            lock.lock()
            waiters[id] = cont
            lock.unlock()
            DispatchQueue.main.async {
                if let plugin = self.currentPlugin(), plugin.webListening {
                    plugin.deliver(action)
                } else if queueIfNotReady {
                    self.lock.lock()
                    self.queued.append((action: action, at: Date()))
                    self.lock.unlock()
                } else {
                    self.complete(id: id, outcome: .failed("not_running"))
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
                    self.complete(id: id, outcome: .failed("timeout"))
                }
            }
        }
    }

    private func currentPlugin() -> DescallIntentsPlugin? {
        lock.lock()
        defer { lock.unlock() }
        return plugin
    }

    /// Resumes the waiting intent once; later answers for the same id are ignored.
    func complete(id: String, outcome: DescallIntentOutcome) {
        lock.lock()
        let cont = waiters.removeValue(forKey: id)
        lock.unlock()
        cont?.resume(returning: outcome)
    }

    /// Queued actions younger than queueTTL (older ones answer "expired").
    func takeQueued() -> [[String: Any]] {
        lock.lock()
        let items = queued
        queued.removeAll()
        lock.unlock()
        let now = Date()
        var fresh: [[String: Any]] = []
        for item in items {
            if now.timeIntervalSince(item.at) <= Self.queueTTL {
                fresh.append(item.action)
            } else if let id = item.action["id"] as? String {
                complete(id: id, outcome: .failed("expired"))
            }
        }
        return fresh
    }

    /// Opens a descall:// link in the app (DescallDeepLinkPlugin routes it, also on a cold start).
    static func open(_ url: URL) {
        DescallDeepLinkPlugin.deliverFromIntent(url)
    }
}

/// JS name: DescallIntents (src/lib/nativeIntents.js). iOS only.
@objc(DescallIntentsPlugin)
public class DescallIntentsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallIntentsPlugin"
    public let jsName = "DescallIntents"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportCallState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "donate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentShortcuts", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        DescallIntentBridge.shared.attach(self)
    }

    /// A page listener exists (it goes away with a reload until the page adds it again).
    var webListening: Bool { hasListeners("action") }

    func deliver(_ action: [String: Any]) {
        notifyListeners("action", data: action)
    }

    @objc func getAvailability(_ call: CAPPluginCall) {
        var intents = false
        if #available(iOS 17.0, *) { intents = true }
        call.resolve([
            "intents": intents,
            "appShortcuts": intents,
            "siriTips": intents,
            "signedInForSiri": DescallSessionStore.load() != nil,
        ])
    }

    @objc func syncSession(_ call: CAPPluginCall) {
        let userId = call.getString("userId")
        guard userId.map({ !$0.isEmpty && $0.count <= 64 }) ?? false else {
            call.reject("Missing userId")
            return
        }
        DescallSharedSessionSync.updateProfile(
            userId: userId,
            username: call.getString("username").map { String($0.prefix(64)) },
            displayName: call.getString("displayName").map { String($0.prefix(80)) },
            avatarUrl: call.getString("avatarUrl").map { String($0.prefix(500)) },
            apiBase: call.getString("apiBase"),
            locale: call.getString("locale").map { String($0.prefix(16)) }
        )
        call.resolve(["shared": DescallSessionStore.load() != nil])
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        DescallSharedSessionSync.signedOut()
        call.resolve()
    }

    @objc func reportCallState(_ call: CAPPluginCall) {
        var state = DescallIntentBridge.CallState()
        state.active = call.getBool("active") ?? false
        if state.active {
            state.kind = call.getString("kind") ?? ""
            state.title = String((call.getString("title") ?? "").prefix(80))
            state.muted = call.getBool("muted") ?? false
            state.deafened = call.getBool("deafened") ?? false
        }
        DescallIntentBridge.shared.setCallState(state)
        call.resolve()
    }

    @objc func takePendingActions(_ call: CAPPluginCall) {
        call.resolve(["actions": DescallIntentBridge.shared.takeQueued()])
    }

    @objc func completeAction(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Missing id")
            return
        }
        let outcome = DescallIntentOutcome(
            ok: call.getBool("ok") ?? false,
            error: call.getString("error"),
            state: call.getObject("state") ?? [:]
        )
        DescallIntentBridge.shared.complete(id: id, outcome: outcome)
        call.resolve()
    }

    /// Something the user just did in the app, so Siri can suggest it later
    /// ({ kind: "openFriend" | "joinVoice" | "setStatus", ... }). iOS 17+, else a no-op.
    @objc func donate(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.resolve(["donated": false])
            return
        }
        let kind = call.getString("kind") ?? ""
        let done = DescallIntentDonations.donate(kind: kind, data: call.options as? [String: Any] ?? [:])
        call.resolve(["donated": done])
    }

    /// Native sheet with the voice shortcuts (Siri tips) and a link to the Shortcuts app.
    @objc func presentShortcuts(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("Unavailable", "UNAVAILABLE")
            return
        }
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            let controller = UIHostingController(rootView: DescallShortcutsSheet(onClose: { [weak host] in
                host?.dismiss(animated: true)
            }))
            controller.overrideUserInterfaceStyle = .dark
            controller.modalPresentationStyle = .pageSheet
            if let sheet = controller.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
                sheet.preferredCornerRadius = 28
            }
            (host.presentedViewController ?? host).present(controller, animated: true)
            call.resolve()
        }
    }
}
