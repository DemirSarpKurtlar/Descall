import Foundation
import UIKit
import Capacitor
#if canImport(WidgetKit)
import WidgetKit
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif

// Widgets draft B ("Yuzler"): the web layer's bridge to WidgetKit and ActivityKit.
// JS side: src/lib/nativeWidgets.js (plugin "DescallWidgets").
//
//   setFavorites  the 8 numbered favourite faces + preferences -> App Group, their avatars
//                 cached, friends / person widgets reloaded, Siri shortcuts refreshed
//   reload        reloadTimelines(ofKind:) for the kinds a socket event changed
//   callActivity  start / update / end the call's Live Activity, and the call widget snapshot
//   getState      what this device supports and which Descall widgets are placed
//   clear         sign-out: favourites, cached faces, the Live Activity, every timeline

@objc(DescallWidgetsPlugin)
public class DescallWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DescallWidgetsPlugin"
    public let jsName = "DescallWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setFavorites", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "callActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        DescallWidgetsBridge.installCallControl()
        // A call that ended while the app was not running must not stay on the lock screen.
        DescallLiveCallManager.shared.endOrphans()
    }

    @objc func setFavorites(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") as? [String]) ?? []
        let people: [DescallFavoritePerson] = ((call.getArray("people") as? [[String: Any]]) ?? []).compactMap { d in
            guard let id = d["id"] as? String else { return nil }
            let name = String(((d["name"] as? String) ?? "").prefix(60))
            return DescallFavoritePerson(id: id, name: name.isEmpty ? "?" : name,
                                         username: (d["username"] as? String).map { String($0.prefix(64)) },
                                         avatarUrl: (d["avatarUrl"] as? String).map { String($0.prefix(500)) },
                                         initials: (d["initials"] as? String).map { String($0.prefix(3)) })
        }
        let p = call.getObject("prefs") ?? [:]
        let prefs = DescallWidgetPrefs(showActivity: (p["showActivity"] as? Bool) ?? true,
                                       waveButton: (p["waveButton"] as? Bool) ?? true,
                                       showPreview: (p["showPreview"] as? Bool) ?? true)
        let record = DescallFavoritesRecord(ids: ids, people: people, prefs: prefs)
        let before = DescallWidgetStore.favorites()
        DescallWidgetStore.saveFavorites(record)
        call.resolve(["saved": record.ids.count])
        guard before.ids != record.ids || before.people != record.people || before.prefs != record.prefs else { return }
        Task.detached(priority: .utility) {
            // Faces first (the widgets draw them from disk), then the reload.
            for person in record.people {
                _ = await DescallAvatarCache.appGroupShared.image(id: person.id, url: person.avatarUrl)
            }
            DescallWidgetsBridge.reload([.friends])
            if before.prefs.showPreview != record.prefs.showPreview { DescallWidgetsBridge.reload([.unread]) }
            if #available(iOS 17.0, *) {
                DescallFavoriteShortcuts.refresh(record)
            }
        }
    }

    @objc func reload(_ call: CAPPluginCall) {
        let kinds = ((call.getArray("kinds") as? [String]) ?? []).compactMap(DescallWidgetKind.init(rawValue:))
        DescallWidgetsBridge.reload(kinds)
        call.resolve(["reloaded": kinds.map(\.rawValue)])
    }

    @objc func callActivity(_ call: CAPPluginCall) {
        let payload = call.options as? [String: Any] ?? [:]
        let state = DescallCallState.from(payload: payload)
        DescallLiveCallManager.shared.apply(state, callId: Self.callId(payload))
        call.resolve(["active": state != nil, "liveActivity": DescallLiveCallManager.shared.isRunning])
    }

    static func callId(_ payload: [String: Any]) -> String {
        let link = payload["link"] as? [String: Any] ?? [:]
        let kind = (payload["kind"] as? String) ?? "server"
        let id = [link["channelId"], link["groupId"], link["username"]].compactMap { $0 as? String }.first { !$0.isEmpty } ?? "call"
        return "\(kind):\(id)"
    }

    @objc func getState(_ call: CAPPluginCall) {
        var interactive = false
        if #available(iOS 17.0, *) { interactive = true }
        var activities = false
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) { activities = ActivityAuthorizationInfo().areActivitiesEnabled }
        #endif
        let record = DescallWidgetStore.favorites()
        let base: [String: Any] = [
            "supported": interactive,
            "interactive": interactive,
            "liveActivities": activities,
            "favorites": record.ids,
            "prefs": ["showActivity": record.prefs.showActivity, "waveButton": record.prefs.waveButton, "showPreview": record.prefs.showPreview],
        ]
        #if canImport(WidgetKit)
        WidgetCenter.shared.getCurrentConfigurations { result in
            var installed: [[String: String]] = []
            if case .success(let infos) = result {
                for info in infos {
                    guard let family = DescallWidgetKind.family(ofKind: info.kind) else { continue }
                    installed.append(["kind": family.rawValue, "widget": info.kind, "family": "\(info.family)"])
                }
            }
            var out = base
            out["installed"] = installed
            call.resolve(out)
        }
        #else
        var out = base
        out["installed"] = []
        call.resolve(out)
        #endif
    }

    @objc func clear(_ call: CAPPluginCall) {
        DescallWidgetsBridge.signedOut()
        call.resolve()
    }
}

enum DescallWidgetsBridge {
    static func reload(_ kinds: [DescallWidgetKind]) {
        #if canImport(WidgetKit)
        for kind in Set(kinds) {
            for widgetKind in kind.widgetKinds { WidgetCenter.shared.reloadTimelines(ofKind: widgetKind) }
        }
        #endif
    }

    static func installCallControl() {
        DescallCallControl.shared.setHandler { action in
            let outcome = await DescallIntentBridge.shared.run(action, timeout: 4, queueIfNotReady: false)
            return outcome.ok
        }
    }

    /// Sign-out (DescallSharedSessionSync.signedOut, JS clear()).
    static func signedOut() {
        DescallWidgetStore.clear()
        DescallLiveCallManager.shared.apply(nil, callId: "")
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

/// Starts, updates and ends the call's Live Activity. Speaker changes are spaced out (the
/// system throttles frequent updates and the face would flicker); everything else goes now.
/// A heartbeat keeps the stale date ahead while the call runs, so a crashed app leaves a card
/// that turns stale within two minutes instead of a call that seems to go on for hours.
final class DescallLiveCallManager: @unchecked Sendable {
    static let shared = DescallLiveCallManager()
    static let speakerSpacing: TimeInterval = 1.2
    static let staleAfter: TimeInterval = 120
    static let heartbeat: TimeInterval = 60

    private let queue = DispatchQueue(label: "com.descall.livecall")
    private var current: DescallCallState?
    private var currentId = ""
    private var lastSent = Date.distantPast
    private var pending: DispatchWorkItem?
    private var beat: DispatchSourceTimer?
    private var activityId: String?

    var isRunning: Bool { queue.sync { activityId != nil } }

    func apply(_ state: DescallCallState?, callId: String) {
        queue.async { self.applyLocked(state, callId: callId) }
    }

    private func applyLocked(_ state: DescallCallState?, callId: String) {
        DescallWidgetStore.saveCall(state)
        guard let state else {
            let wasActive = current != nil
            current = nil
            currentId = ""
            pending?.cancel()
            pending = nil
            stopHeartbeat()
            endAll()
            if wasActive { DescallWidgetsBridge.reload([.call, .voice]) }
            return
        }
        let previous = current
        let sameCall = callId == currentId
        current = state
        currentId = callId
        cacheFaces(state)
        if previous == nil || !sameCall {
            pending?.cancel()
            pending = nil
            endAll()
            start(state, callId: callId)
            startHeartbeat()
            DescallWidgetsBridge.reload([.call, .voice])
            return
        }
        if let previous, state.differsOnlyBySpeaker(from: previous) {
            let wait = Self.speakerSpacing - Date().timeIntervalSince(lastSent)
            if wait > 0 {
                if pending == nil {
                    let work = DispatchWorkItem { [weak self] in
                        guard let self else { return }
                        self.pending = nil
                        if let s = self.current { self.update(s) }
                    }
                    pending = work
                    queue.asyncAfter(deadline: .now() + wait, execute: work)
                }
                return
            }
        }
        pending?.cancel()
        pending = nil
        update(state)
        if previous?.muted != state.muted || previous?.deafened != state.deafened {
            DescallWidgetsBridge.reload([.call])
        }
    }

    /// Faces of the call into the App Group (the Live Activity draws them from there). The
    /// JS payload carries no URLs for the strip, so the favourites' and session's known
    /// avatars are used; others show initials until the app caches them.
    private func cacheFaces(_ state: DescallCallState) {
        let favorites = DescallWidgetStore.favorites()
        let known = Dictionary(favorites.people.map { ($0.id, $0.avatarUrl) }, uniquingKeysWith: { a, _ in a })
        let session = DescallSessionStore.load()
        let ids = state.participants.map(\.id) + [state.speaker?.id].compactMap { $0 }
        Task.detached(priority: .utility) {
            var fetched = false
            for id in Set(ids) {
                var url: String? = known[id] ?? nil
                if url == nil, id == session?.userId { url = session?.avatarUrl }
                guard url != nil, DescallAvatarCache.appGroupShared.cachedImage(id: id, url: url) == nil else { continue }
                if await DescallAvatarCache.appGroupShared.image(id: id, url: url) != nil { fetched = true }
            }
            if fetched {
                // Redraw with the photos that just arrived.
                self.queue.async { if let s = self.current { self.update(s) } }
            }
        }
    }

    private func startHeartbeat() {
        stopHeartbeat()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + Self.heartbeat, repeating: Self.heartbeat)
        t.setEventHandler { [weak self] in
            guard let self, let s = self.current else { return }
            DescallWidgetStore.saveCall(s)
            self.update(s)
        }
        t.resume()
        beat = t
    }

    private func stopHeartbeat() {
        beat?.cancel()
        beat = nil
    }

    // MARK: ActivityKit

    private func start(_ state: DescallCallState, callId: String) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            let attrs = DescallCallAttributes(callId: callId, kind: state.kind)
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(Self.staleAfter), relevanceScore: 100)
            let activity = try Activity.request(attributes: attrs, content: content, pushType: nil)
            activityId = activity.id
            lastSent = Date()
        } catch {
            activityId = nil
        }
        #endif
    }

    private func update(_ state: DescallCallState) {
        lastSent = Date()
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *), let id = activityId,
              let activity = Activity<DescallCallAttributes>.activities.first(where: { $0.id == id }) else { return }
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(Self.staleAfter), relevanceScore: 100)
        Task { await activity.update(content) }
        #endif
    }

    private func endAll() {
        activityId = nil
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<DescallCallAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
        #endif
    }

    /// Launch: no call is running yet, so any Descall call activity left over is ended.
    func endOrphans() {
        queue.async {
            guard self.current == nil else { return }
            self.endAll()
            DescallWidgetStore.saveCall(nil)
        }
    }
}

/// Every favourite gets Siri shortcuts without setup: the parameterised App Shortcuts
/// ("Message Ece on Descall") resolve to the favourites first (FriendQuery.suggestedEntities),
/// and each favourite's chat and call are donated so Siri suggests them and the Shortcuts app
/// lists them ("Kaan'ı ara").
@available(iOS 17.0, *)
enum DescallFavoriteShortcuts {
    static func refresh(_ record: DescallFavoritesRecord) {
        DescallAppShortcuts.updateAppShortcutParameters()
        for person in record.people.prefix(DescallFavorites.max) {
            let friend = DescallFriend(id: person.id, username: person.username, name: person.name, avatarUrl: person.avatarUrl)
            var open = DescallOpenFriendIntent()
            open.target = FriendEntity(friend)
            open.donate()
            var callIntent = DescallCallFriendIntent()
            callIntent.friend = FriendEntity(friend)
            callIntent.donate()
        }
    }
}
