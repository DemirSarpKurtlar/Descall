import AppIntents
import Foundation
import SwiftUI
import UIKit

// 4.2: Siri, the Shortcuts app, Spotlight and the Action Button (iOS 17+; older iOS
// simply has none of these). Background intents talk to the API with the shared
// session (DescallKit); the ones that need the app on screen open it through the deep
// link router or hand the action to the running web app (DescallIntentBridge).
//
// Static titles / parameter names: <lang>.lproj/Localizable.strings (English keys).
// Siri phrases: <lang>.lproj/AppShortcuts.strings. Spoken answers: <lang>.lproj/Intents.strings.
// All three in every UI language (selftest: src/lib/nativeIntents.selftest.mjs).

// MARK: - Text

@available(iOS 17.0, *)
enum DescallIntentText {
    static func text(_ key: String, _ args: [CVarArg] = []) -> String {
        let format = Bundle.main.localizedString(forKey: key, value: key, table: "Intents")
        return args.isEmpty ? format : String(format: format, locale: Locale.current, arguments: args)
    }

    static func dialog(_ key: String, _ args: [CVarArg] = []) -> IntentDialog {
        IntentDialog(LocalizedStringResource(stringLiteral: text(key, args)))
    }

    static func status(_ s: DescallStatusChoice) -> String { text("status.\(s.rawValue)") }
    static func presence(_ p: DescallPresence) -> String { text("presence.\(p.rawValue)") }
}

/// A failure Siri reads out (and Shortcuts shows) in the user's language.
@available(iOS 17.0, *)
struct DescallIntentFailure: Error, CustomLocalizedStringResourceConvertible {
    let key: String

    var localizedStringResource: LocalizedStringResource {
        LocalizedStringResource(stringLiteral: DescallIntentText.text(key))
    }

    static func from(_ error: Error, forbidden: String = "error.forbidden") -> DescallIntentFailure {
        if let own = error as? DescallIntentFailure { return own }
        switch DescallAPIError.from(transport: error) {
        case .signedOut: return .init(key: "error.signedOut")
        case .unauthorized: return .init(key: "error.sessionEnded")
        case .banned: return .init(key: "error.banned")
        case .forbidden: return .init(key: forbidden)
        case .notFound: return .init(key: "error.notFound")
        case .rateLimited: return .init(key: "error.rateLimited")
        case .offline: return .init(key: "error.offline")
        case .timeout: return .init(key: "error.timeout")
        case .network: return .init(key: "error.network")
        case .server: return .init(key: "error.server")
        case .badRequest, .decoding, .cancelled: return .init(key: "error.generic")
        }
    }
}

@available(iOS 17.0, *)
enum DescallIntentSupport {
    static func client() throws -> DescallAPIClient {
        do {
            return try DescallAPIClient.current(clientName: "ios-intents")
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    /// Queries feed Siri's suggestions too: signed out or offline means "no suggestions".
    static func quietly<T>(_ work: () async throws -> [T]) async -> [T] {
        (try? await work()) ?? []
    }
}

// MARK: - Entities

@available(iOS 17.0, *)
struct FriendEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Friend")
    static let defaultQuery = FriendQuery()

    let id: String
    let name: String
    let username: String?
    let presence: DescallPresence
    let conv: String

    init(_ friend: DescallFriend) {
        id = friend.id
        name = friend.name
        username = friend.username
        presence = friend.presence
        conv = friend.conv
    }

    var displayRepresentation: DisplayRepresentation {
        let symbol: String
        switch presence {
        case .online: symbol = "person.crop.circle.badge.checkmark"
        case .idle: symbol = "person.crop.circle.badge.clock"
        case .dnd: symbol = "person.crop.circle.badge.minus"
        case .offline: symbol = "person.crop.circle"
        }
        let subtitle = [username.map { "@\($0)" }, DescallIntentText.presence(presence)].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)", image: .init(systemName: symbol))
    }
}

@available(iOS 17.0, *)
struct FriendQuery: EntityStringQuery {
    func entities(for identifiers: [FriendEntity.ID]) async throws -> [FriendEntity] {
        guard !identifiers.isEmpty else { return [] }
        do {
            return try await DescallIntentSupport.client().friends(ids: identifiers).map(FriendEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    func entities(matching string: String) async throws -> [FriendEntity] {
        do {
            return try await DescallIntentSupport.client().friends(matching: string).map(FriendEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    /// Favourite faces first (widgets draft B): "Message Ece on Descall" works for each of
    /// them without setup once DescallFavoriteShortcuts refreshed the parameters.
    func suggestedEntities() async throws -> [FriendEntity] {
        await DescallIntentSupport.quietly {
            let all = try await DescallIntentSupport.client().friends()
            let favorites = DescallWidgetStore.favorites().ids
            let rank = Dictionary(favorites.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
            let ordered = all.enumerated().sorted { a, b in
                (rank[a.element.id] ?? Int.max, a.offset) < (rank[b.element.id] ?? Int.max, b.offset)
            }.map(\.element)
            return ordered.prefix(40).map(FriendEntity.init)
        }
    }
}

@available(iOS 17.0, *)
struct VoiceRoomEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Voice Channel")
    static let defaultQuery = VoiceRoomQuery()

    let id: String
    let serverId: String
    let serverName: String
    let channelName: String
    let type: String
    let occupantCount: Int

    init(_ room: DescallVoiceRoom) {
        id = room.channelId
        serverId = room.serverId
        serverName = room.serverName
        channelName = room.channelName
        type = room.type
        occupantCount = room.occupantCount
    }

    var displayRepresentation: DisplayRepresentation {
        let people = occupantCount > 0
            ? DescallIntentText.text("voice.people.count", [occupantCount])
            : DescallIntentText.text("voice.people.none")
        return DisplayRepresentation(title: "\(channelName)", subtitle: "\(serverName) · \(people)",
                                     image: .init(systemName: type == "stage" ? "music.mic" : "speaker.wave.2.fill"))
    }
}

@available(iOS 17.0, *)
struct VoiceRoomQuery: EntityStringQuery {
    func entities(for identifiers: [VoiceRoomEntity.ID]) async throws -> [VoiceRoomEntity] {
        do {
            let wanted = Set(identifiers)
            return try await DescallIntentSupport.client().voiceRooms().filter { wanted.contains($0.channelId) }.map(VoiceRoomEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    func entities(matching string: String) async throws -> [VoiceRoomEntity] {
        do {
            return try await DescallIntentSupport.client().voiceRooms(matching: string).map(VoiceRoomEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    func suggestedEntities() async throws -> [VoiceRoomEntity] {
        await DescallIntentSupport.quietly {
            let all = try await DescallIntentSupport.client().voiceRooms()
            return all.prefix(30).map(VoiceRoomEntity.init)
        }
    }
}

@available(iOS 17.0, *)
struct PlaceEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Place")
    static let defaultQuery = PlaceQuery()

    let id: String
    let kind: String
    let title: String
    let subtitle: String?
    let link: URL?

    init(_ destination: DescallDestination) {
        id = destination.id
        kind = destination.kind
        title = destination.title
        subtitle = destination.subtitle
        link = destination.deepLink
    }

    var displayRepresentation: DisplayRepresentation {
        let symbol = kind == "group" ? "person.3.fill" : kind == "channel" ? "number" : "server.rack"
        if let sub = subtitle {
            return DisplayRepresentation(title: "\(title)", subtitle: "\(sub)", image: .init(systemName: symbol))
        }
        return DisplayRepresentation(title: "\(title)", image: .init(systemName: symbol))
    }
}

@available(iOS 17.0, *)
struct PlaceQuery: EntityStringQuery {
    func entities(for identifiers: [PlaceEntity.ID]) async throws -> [PlaceEntity] {
        do {
            let wanted = Set(identifiers)
            return try await DescallIntentSupport.client().destinations().filter { wanted.contains($0.id) }.map(PlaceEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    func entities(matching string: String) async throws -> [PlaceEntity] {
        do {
            return try await DescallIntentSupport.client().destinations(matching: string).map(PlaceEntity.init)
        } catch {
            throw DescallIntentFailure.from(error)
        }
    }

    func suggestedEntities() async throws -> [PlaceEntity] {
        await DescallIntentSupport.quietly {
            let all = try await DescallIntentSupport.client().destinations()
            return all.prefix(40).map(PlaceEntity.init)
        }
    }
}

@available(iOS 17.0, *)
enum StatusOption: String, AppEnum, CaseIterable {
    case online, idle, dnd, invisible

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Status")
    static let caseDisplayRepresentations: [StatusOption: DisplayRepresentation] = [
        .online: DisplayRepresentation(title: "Online", image: .init(systemName: "circle.fill")),
        .idle: DisplayRepresentation(title: "Idle", image: .init(systemName: "moon.fill")),
        .dnd: DisplayRepresentation(title: "Do Not Disturb", image: .init(systemName: "minus.circle.fill")),
        .invisible: DisplayRepresentation(title: "Invisible", image: .init(systemName: "circle.dotted")),
    ]

    var choice: DescallStatusChoice { DescallStatusChoice(rawValue: rawValue) ?? .online }
}

// MARK: - Background intents (no app on screen)

@available(iOS 17.0, *)
struct DescallSendMessageIntent: AppIntent {
    static let title: LocalizedStringResource = "Send a Message"
    static let description = IntentDescription("Sends a Descall message to a friend without opening the app.")
    static let openAppWhenRun = false

    @Parameter(title: "Friend")
    var friend: FriendEntity

    @Parameter(title: "Message")
    var message: String

    static var parameterSummary: some ParameterSummary {
        Summary("Send \(\.$message) to \(\.$friend)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DescallIntentFailure(key: "error.message.empty") }
        guard let text = DescallMessageRules.cleaned(trimmed) else { throw DescallIntentFailure(key: "error.message.tooLong") }
        let client = try DescallIntentSupport.client()
        let preview = text.count > 80 ? String(text.prefix(79)) + "…" : text
        try await requestConfirmation(
            result: .result(dialog: DescallIntentText.dialog("confirm.send", [preview, friend.name])),
            confirmationActionName: .send,
            showPrompt: true
        )
        do {
            try await client.sendMessage(conv: friend.conv, text: text)
        } catch {
            throw DescallIntentFailure.from(error, forbidden: "error.send.forbidden")
        }
        return .result(dialog: DescallIntentText.dialog("dialog.send.done", [friend.name]))
    }
}

@available(iOS 17.0, *)
struct DescallSetStatusIntent: AppIntent {
    static let title: LocalizedStringResource = "Set Status"
    static let description = IntentDescription("Changes your Descall status: online, idle, do not disturb or invisible.")
    static let openAppWhenRun = false

    @Parameter(title: "Status")
    var status: StatusOption

    static var parameterSummary: some ParameterSummary {
        Summary("Set status to \(\.$status)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            try await DescallIntentSupport.client().setStatus(status.choice)
        } catch {
            throw DescallIntentFailure.from(error)
        }
        return .result(dialog: DescallIntentText.dialog("dialog.status.done", [DescallIntentText.status(status.choice)]))
    }
}

@available(iOS 17.0, *)
struct DescallUnreadIntent: AppIntent {
    static let title: LocalizedStringResource = "Unread Messages"
    static let description = IntentDescription("Tells you how many unread Descall messages you have and where they are.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog & ShowsSnippetView {
        let unread: DescallUnread
        do {
            unread = try await DescallIntentSupport.client().summary().unread
        } catch {
            throw DescallIntentFailure.from(error)
        }
        var spoken: String
        switch unread.total {
        case 0: spoken = DescallIntentText.text("dialog.unread.none")
        case 1: spoken = DescallIntentText.text("dialog.unread.one")
        default: spoken = DescallIntentText.text("dialog.unread.many", [unread.total])
        }
        if unread.total > 1, let top = unread.top.first, top.count * 2 >= unread.total {
            spoken += " " + DescallIntentText.text("dialog.unread.from", [top.title])
        }
        return .result(value: unread.total,
                       dialog: IntentDialog(LocalizedStringResource(stringLiteral: spoken)),
                       view: DescallUnreadSnippet(unread: unread))
    }
}

@available(iOS 17.0, *)
struct DescallWhoIsOnlineIntent: AppIntent {
    static let title: LocalizedStringResource = "Who's Online"
    static let description = IntentDescription("Lists your Descall friends who are online right now.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ReturnsValue<[FriendEntity]> & ProvidesDialog & ShowsSnippetView {
        let glance: DescallFriendsGlance
        do {
            glance = try await DescallIntentSupport.client().summary().friends
        } catch {
            throw DescallIntentFailure.from(error)
        }
        let online = glance.online
        let spoken: String
        switch online.count {
        case 0: spoken = DescallIntentText.text("dialog.online.none")
        case 1: spoken = DescallIntentText.text("dialog.online.one", [online[0].name])
        case 2: spoken = DescallIntentText.text("dialog.online.two", [online[0].name, online[1].name])
        default:
            spoken = DescallIntentText.text("dialog.online.many", [online[0].name, online[1].name, max(1, glance.onlineCount - 2)])
        }
        return .result(value: online.map(FriendEntity.init),
                       dialog: IntentDialog(LocalizedStringResource(stringLiteral: spoken)),
                       view: DescallOnlineSnippet(online: online, total: glance.onlineCount))
    }
}

// MARK: - Call controls (the running app, through DescallIntentBridge)

@available(iOS 17.0, *)
enum DescallCallControl {
    /// Runs mute / deafen / leave in the web app's active call and returns its answer.
    static func run(_ type: String) async throws -> DescallIntentOutcome {
        let bridge = DescallIntentBridge.shared
        guard bridge.callState.active else { throw DescallIntentFailure(key: "error.call.none") }
        let outcome = await bridge.run(type, timeout: 4, queueIfNotReady: false)
        guard outcome.ok else {
            throw DescallIntentFailure(key: outcome.error == "no_call" ? "error.call.none" : "error.call.failed")
        }
        return outcome
    }
}

@available(iOS 17.0, *)
struct DescallToggleMuteIntent: AppIntent {
    static let title: LocalizedStringResource = "Mute or Unmute"
    static let description = IntentDescription("Mutes or unmutes your microphone in the current Descall call or voice channel.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = try await DescallCallControl.run("toggleMute")
        let muted = (outcome.state["muted"] as? Bool) ?? !DescallIntentBridge.shared.callState.muted
        return .result(dialog: DescallIntentText.dialog(muted ? "dialog.mute.on" : "dialog.mute.off"))
    }
}

@available(iOS 17.0, *)
struct DescallToggleDeafenIntent: AppIntent {
    static let title: LocalizedStringResource = "Deafen or Undeafen"
    static let description = IntentDescription("Turns the sound of the current Descall call or voice channel off or back on.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = try await DescallCallControl.run("toggleDeafen")
        let deafened = (outcome.state["deafened"] as? Bool) ?? !DescallIntentBridge.shared.callState.deafened
        return .result(dialog: DescallIntentText.dialog(deafened ? "dialog.deafen.on" : "dialog.deafen.off"))
    }
}

@available(iOS 17.0, *)
struct DescallLeaveCallIntent: AppIntent {
    static let title: LocalizedStringResource = "Leave Call"
    static let description = IntentDescription("Leaves the current Descall call or voice channel.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let title = DescallIntentBridge.shared.callState.title
        _ = try await DescallCallControl.run("leave")
        return .result(dialog: title.isEmpty
            ? DescallIntentText.dialog("dialog.leave.generic")
            : DescallIntentText.dialog("dialog.leave.done", [title]))
    }
}

// MARK: - Intents that open the app

@available(iOS 17.0, *)
struct DescallOpenFriendIntent: OpenIntent {
    static let title: LocalizedStringResource = "Open Conversation"
    static let description = IntentDescription("Opens your direct messages with a friend in Descall.")
    static let openAppWhenRun = true

    @Parameter(title: "Friend")
    var target: FriendEntity

    func perform() async throws -> some IntentResult {
        let url = target.username.flatMap { DescallDeepLink.dm(username: $0) } ?? DescallDeepLink.friends
        DescallIntentBridge.open(url)
        return .result()
    }
}

@available(iOS 17.0, *)
struct DescallOpenPlaceIntent: OpenIntent {
    static let title: LocalizedStringResource = "Open Server or Group"
    static let description = IntentDescription("Opens a Descall server, channel or group.")
    static let openAppWhenRun = true

    @Parameter(title: "Place")
    var target: PlaceEntity

    func perform() async throws -> some IntentResult {
        DescallIntentBridge.open(target.link ?? DescallDeepLink.home)
        return .result()
    }
}

/// Widgets draft B: "Kaan'ı ara". A voice call needs the microphone and the call screen, so
/// it runs in the app (cold start too: the bridge queues it until the page is ready). Donated
/// for every favourite face (DescallFavoriteShortcuts), so Siri suggests it and the
/// Shortcuts app lists one per favourite.
@available(iOS 17.0, *)
struct DescallCallFriendIntent: AppIntent {
    static let title: LocalizedStringResource = "Call a Friend"
    static let description = IntentDescription("Opens Descall and starts a voice call with a friend.")
    static let openAppWhenRun = true

    @Parameter(title: "Friend")
    var friend: FriendEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Call \(\.$friend)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await DescallIntentBridge.shared.run("callFriend", payload: [
            "userId": friend.id,
            "username": friend.username ?? "",
        ], timeout: 15, queueIfNotReady: true)
        if outcome.ok || outcome.error == "timeout" || outcome.error == "not_running" {
            return .result(dialog: DescallIntentText.dialog("dialog.call.calling", [friend.name]))
        }
        switch outcome.error {
        case "busy": throw DescallIntentFailure(key: "error.call.busy")
        case "not_friend": throw DescallIntentFailure(key: "error.forbidden")
        case "mic_denied": throw DescallIntentFailure(key: "error.voice.mic")
        case "signed_out": throw DescallIntentFailure(key: "error.signedOut")
        default: throw DescallIntentFailure(key: "error.call.failed")
        }
    }
}

/// Joining needs the microphone and the call screen, so it always runs in the app.
@available(iOS 17.0, *)
struct DescallJoinVoiceIntent: AppIntent {
    static let title: LocalizedStringResource = "Join Voice Channel"
    static let description = IntentDescription("Opens Descall and joins a voice channel.")
    static let openAppWhenRun = true

    @Parameter(title: "Voice Channel")
    var room: VoiceRoomEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Join \(\.$room)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await DescallIntentBridge.shared.run("joinVoice", payload: [
            "serverId": room.serverId,
            "channelId": room.id,
            "channelName": room.channelName,
            "type": room.type,
        ], timeout: 15, queueIfNotReady: true)
        if outcome.ok {
            return .result(dialog: DescallIntentText.dialog("dialog.voice.joined", [room.channelName]))
        }
        switch outcome.error {
        case "timeout", "not_running":
            // Still connecting in the app: the app is open on the channel, nothing failed yet.
            return .result(dialog: DescallIntentText.dialog("dialog.voice.joining", [room.channelName]))
        case "no_permission": throw DescallIntentFailure(key: "error.voice.noPermission")
        case "mic_denied": throw DescallIntentFailure(key: "error.voice.mic")
        case "signed_out": throw DescallIntentFailure(key: "error.signedOut")
        default: throw DescallIntentFailure(key: "error.voice.failed")
        }
    }
}

// MARK: - Siri phrases (App Shortcuts: Siri, Spotlight, Shortcuts app, Action Button)

@available(iOS 17.0, *)
struct DescallAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: DescallSendMessageIntent(), phrases: [
            "Send a message with \(.applicationName)",
            "Send a \(.applicationName) message",
            "Message \(\.$friend) on \(.applicationName)",
        ], shortTitle: "Send Message", systemImageName: "paperplane.fill")
        AppShortcut(intent: DescallUnreadIntent(), phrases: [
            "How many unread messages do I have on \(.applicationName)",
            "Check my \(.applicationName) messages",
            "Any new messages on \(.applicationName)",
        ], shortTitle: "Unread", systemImageName: "envelope.badge.fill")
        AppShortcut(intent: DescallWhoIsOnlineIntent(), phrases: [
            "Who's online on \(.applicationName)",
            "Which friends are online on \(.applicationName)",
        ], shortTitle: "Who's Online", systemImageName: "person.2.fill")
        AppShortcut(intent: DescallToggleMuteIntent(), phrases: [
            "Mute \(.applicationName)",
            "Unmute \(.applicationName)",
            "Mute my mic on \(.applicationName)",
        ], shortTitle: "Mute", systemImageName: "mic.slash.fill")
        AppShortcut(intent: DescallToggleDeafenIntent(), phrases: [
            "Deafen \(.applicationName)",
            "Undeafen \(.applicationName)",
        ], shortTitle: "Deafen", systemImageName: "speaker.slash.fill")
        AppShortcut(intent: DescallLeaveCallIntent(), phrases: [
            "Leave the \(.applicationName) call",
            "Hang up \(.applicationName)",
        ], shortTitle: "Leave Call", systemImageName: "phone.down.fill")
        AppShortcut(intent: DescallSetStatusIntent(), phrases: [
            "Set my \(.applicationName) status",
            "Set my \(.applicationName) status to \(\.$status)",
        ], shortTitle: "Set Status", systemImageName: "circle.badge.checkmark")
        AppShortcut(intent: DescallJoinVoiceIntent(), phrases: [
            "Join a voice channel on \(.applicationName)",
            "Join \(\.$room) on \(.applicationName)",
        ], shortTitle: "Join Voice", systemImageName: "speaker.wave.2.fill")
        AppShortcut(intent: DescallOpenFriendIntent(), phrases: [
            "Open a chat in \(.applicationName)",
            "Chat with \(\.$target) on \(.applicationName)",
        ], shortTitle: "Open Chat", systemImageName: "bubble.left.and.bubble.right.fill")
        AppShortcut(intent: DescallOpenPlaceIntent(), phrases: [
            "Open a server in \(.applicationName)",
            "Open \(\.$target) in \(.applicationName)",
        ], shortTitle: "Open Server", systemImageName: "server.rack")
    }
}

// MARK: - Donations (Siri suggestions)

@available(iOS 17.0, *)
enum DescallIntentDonations {
    /// What the user just did in the app (src/lib/nativeIntents.js donateIntent).
    static func donate(kind: String, data: [String: Any]) -> Bool {
        func str(_ key: String, _ max: Int = 80) -> String? {
            (data[key] as? String).map { String($0.prefix(max)) }.flatMap { $0.isEmpty ? nil : $0 }
        }
        switch kind {
        case "openFriend":
            guard let id = str("id", 64), let name = str("name") else { return false }
            var intent = DescallOpenFriendIntent()
            intent.target = FriendEntity(DescallFriend(id: id, username: str("username", 64), name: name))
            intent.donate()
            return true
        case "joinVoice":
            guard let serverId = str("serverId", 64), let channelId = str("channelId", 64) else { return false }
            var intent = DescallJoinVoiceIntent()
            intent.room = VoiceRoomEntity(DescallVoiceRoom(serverId: serverId, serverName: str("serverName") ?? "",
                                                           channelId: channelId, channelName: str("channelName") ?? "",
                                                           type: str("type", 8) == "stage" ? "stage" : "voice"))
            intent.donate()
            return true
        case "setStatus":
            guard let raw = str("status", 12), let status = StatusOption(rawValue: raw) else { return false }
            var intent = DescallSetStatusIntent()
            intent.status = status
            intent.donate()
            return true
        default:
            return false
        }
    }
}

// MARK: - Snippet views (Siri / Shortcuts result cards)

private let descallAccent = Color(red: 88 / 255, green: 122 / 255, blue: 245 / 255)

@available(iOS 17.0, *)
struct DescallUnreadSnippet: View {
    let unread: DescallUnread

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(DescallIntentText.text("snippet.unread.title")).font(.headline)
                Spacer()
                Text("\(unread.total)").font(.system(.title, design: .rounded).weight(.bold)).monospacedDigit()
                    .foregroundStyle(descallAccent)
            }
            HStack(spacing: 8) {
                chip("snippet.unread.dms", unread.dms, "person.fill")
                chip("snippet.unread.groups", unread.groups, "person.3.fill")
                chip("snippet.unread.channels", unread.channels, "number")
            }
            ForEach(Array(unread.top.prefix(4).enumerated()), id: \.offset) { _, row in
                HStack {
                    Text(row.title).font(.subheadline).lineLimit(1)
                    Spacer()
                    Text("\(row.count)").font(.subheadline.weight(.semibold)).monospacedDigit()
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(descallAccent.opacity(0.22)))
                }
            }
        }
        .padding()
    }

    private func chip(_ key: String, _ value: Int, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("\(value)", systemImage: symbol).font(.subheadline.weight(.semibold))
            Text(DescallIntentText.text(key)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.thinMaterial))
    }
}

@available(iOS 17.0, *)
struct DescallOnlineSnippet: View {
    let online: [DescallFriend]
    let total: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(DescallIntentText.text("snippet.online.title")).font(.headline)
                Spacer()
                Text("\(total)").font(.headline).monospacedDigit().foregroundStyle(descallAccent)
            }
            ForEach(online.prefix(6)) { friend in
                HStack(spacing: 10) {
                    Text(friend.initials).font(.caption.weight(.bold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(descallAccent))
                        .overlay(alignment: .bottomTrailing) {
                            Circle().fill(dotColor(friend.presence)).frame(width: 9, height: 9)
                                .overlay(Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 1.5))
                        }
                    VStack(alignment: .leading, spacing: 0) {
                        Text(friend.name).font(.subheadline).lineLimit(1)
                        if let custom = friend.customStatus {
                            Text(custom).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                }
            }
            if total > 6 {
                Text(DescallIntentText.text("snippet.online.more", [total - 6])).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private func dotColor(_ p: DescallPresence) -> Color {
        switch p {
        case .online: return Color(red: 0.2, green: 0.78, blue: 0.45)
        case .idle: return Color(red: 0.98, green: 0.69, blue: 0.2)
        case .dnd: return Color(red: 0.93, green: 0.3, blue: 0.32)
        case .offline: return .gray
        }
    }
}

// MARK: - "Siri'ye ekle" sheet (Settings > Voice shortcuts)

@available(iOS 17.0, *)
struct DescallShortcutsSheet: View {
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(DescallIntentText.text("tips.subtitle")).font(.subheadline).foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
                Section {
                    SiriTipView(intent: DescallUnreadIntent(), isVisible: .constant(true))
                    SiriTipView(intent: DescallSendMessageIntent(), isVisible: .constant(true))
                    SiriTipView(intent: DescallToggleMuteIntent(), isVisible: .constant(true))
                    SiriTipView(intent: DescallWhoIsOnlineIntent(), isVisible: .constant(true))
                    SiriTipView(intent: DescallSetStatusIntent(), isVisible: .constant(true))
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                Section {
                    ShortcutsLink()
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: [Color(red: 0.07, green: 0.08, blue: 0.12), Color(red: 0.12, green: 0.14, blue: 0.24)],
                                       startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle(DescallIntentText.text("tips.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(DescallIntentText.text("tips.done"), action: onClose).tint(descallAccent)
                }
            }
        }
        .tint(descallAccent)
    }
}
