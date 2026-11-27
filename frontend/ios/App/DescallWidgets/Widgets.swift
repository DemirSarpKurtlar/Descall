import AppIntents
import SwiftUI
import WidgetKit

// Widgets draft B ("Yuzler"): people first. Four widgets the owner chose (friends online,
// unread messages, who is in voice, the live call) on the home screen (small, medium,
// large), the lock screen (circular, rectangular, inline, monochrome) and StandBy, plus the
// single-person circular lock screen widget and the call's Live Activity.

@main
struct DescallWidgetsBundle: WidgetBundle {
    var body: some Widget {
        DescallFriendsWidget()
        DescallPersonWidget()
        DescallUnreadWidget()
        DescallVoiceWidget()
        DescallCallWidget()
        DescallLiveCallActivityWidget()
    }
}

// MARK: - Configuration entities

/// A friend to pick in a widget's configuration: favourites first (the app's numbered
/// faces), then every friend from the API. Search works on the API list.
struct WidgetFriendEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Friend")
    static let defaultQuery = WidgetFriendQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", image: .init(systemName: "person.crop.circle"))
    }
}

struct WidgetFriendQuery: EntityStringQuery {
    func entities(for identifiers: [WidgetFriendEntity.ID]) async throws -> [WidgetFriendEntity] {
        let record = DescallWidgetStore.favorites()
        var out: [WidgetFriendEntity] = identifiers.compactMap { id in record.person(id).map { WidgetFriendEntity(id: $0.id, name: $0.name) } }
        let missing = identifiers.filter { id in !out.contains { $0.id == id } }
        if !missing.isEmpty, let client = WidgetLoader.client(), let found = try? await client.friends(ids: missing) {
            out += found.map { WidgetFriendEntity(id: $0.id, name: $0.name) }
        }
        // Keep the order the user arranged.
        return identifiers.compactMap { id in out.first { $0.id == id } }
    }

    func entities(matching string: String) async throws -> [WidgetFriendEntity] {
        guard let client = WidgetLoader.client() else { return [] }
        return ((try? await client.friends(matching: string)) ?? []).map { WidgetFriendEntity(id: $0.id, name: $0.name) }
    }

    func suggestedEntities() async throws -> [WidgetFriendEntity] {
        let record = DescallWidgetStore.favorites()
        var out = record.people.map { WidgetFriendEntity(id: $0.id, name: $0.name) }
        if let client = WidgetLoader.client(), let all = try? await client.friends() {
            for f in all where !out.contains(where: { $0.id == f.id }) { out.append(WidgetFriendEntity(id: f.id, name: f.name)) }
        }
        return Array(out.prefix(60))
    }
}

/// A voice channel to keep first in the voice widget, even when it is empty.
struct WidgetVoiceRoomEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Voice Channel")
    static let defaultQuery = WidgetVoiceRoomQuery()

    let id: String
    let name: String
    let server: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(server)", image: .init(systemName: "speaker.wave.2.fill"))
    }
}

struct WidgetVoiceRoomQuery: EntityStringQuery {
    func entities(for identifiers: [WidgetVoiceRoomEntity.ID]) async throws -> [WidgetVoiceRoomEntity] {
        guard let client = WidgetLoader.client(), let rooms = try? await client.voiceRooms() else { return [] }
        let wanted = Set(identifiers)
        return rooms.filter { wanted.contains($0.channelId) }.map { WidgetVoiceRoomEntity(id: $0.channelId, name: $0.channelName, server: $0.serverName) }
    }

    func entities(matching string: String) async throws -> [WidgetVoiceRoomEntity] {
        guard let client = WidgetLoader.client() else { return [] }
        return ((try? await client.voiceRooms(matching: string)) ?? []).map { WidgetVoiceRoomEntity(id: $0.channelId, name: $0.channelName, server: $0.serverName) }
    }

    func suggestedEntities() async throws -> [WidgetVoiceRoomEntity] {
        try await entities(matching: "")
    }
}

// MARK: - Configuration intents

struct FriendsWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Favorite Faces"
    static let description = IntentDescription("Pick up to 8 faces and their order. Empty: the favourites you chose in Descall.")

    /// Up to 8, in order (1 to 8). Empty: the app's favourites.
    @Parameter(title: "Faces")
    var people: [WidgetFriendEntity]?

    @Parameter(title: "Show Activity", default: true)
    var showActivity: Bool

    @Parameter(title: "Wave Button", default: true)
    var showWave: Bool

    init() {}
}

struct PersonWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Favorite Person"
    static let description = IntentDescription("One face and their status on the lock screen. Empty: your first favourite.")

    @Parameter(title: "Friend")
    var person: WidgetFriendEntity?

    init() {}
}

struct UnreadWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Unread Messages"
    static let description = IntentDescription("New messages as speech bubbles with the sender's face.")

    @Parameter(title: "Show Message Text", default: true)
    var showPreview: Bool

    init() {}
}

struct VoiceWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Who's in Voice"
    static let description = IntentDescription("Voice channels as clusters of the faces inside.")

    @Parameter(title: "Pinned Channel")
    var pinned: WidgetVoiceRoomEntity?

    init() {}
}

// MARK: - Providers

struct FriendsProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> FriendsEntry { .sample() }

    func snapshot(for configuration: FriendsWidgetIntent, in context: Context) async -> FriendsEntry {
        if context.isPreview { return .sample() }
        return await load(configuration, context)
    }

    func timeline(for configuration: FriendsWidgetIntent, in context: Context) async -> Timeline<FriendsEntry> {
        let entry = await load(configuration, context)
        return Timeline(entries: [entry], policy: WidgetLoader.policy(.friends, status: entry.status))
    }

    private func load(_ c: FriendsWidgetIntent, _ context: Context) async -> FriendsEntry {
        let limit: Int
        switch context.family {
        case .systemLarge: limit = 8
        case .systemSmall, .systemMedium, .accessoryRectangular: limit = 4
        default: limit = 8
        }
        return await FriendsLoader.load(configured: (c.people ?? []).map(\.id), showActivity: c.showActivity, showWave: c.showWave, limit: limit)
    }
}

struct PersonProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> FriendsEntry { .sample() }

    func snapshot(for configuration: PersonWidgetIntent, in context: Context) async -> FriendsEntry {
        if context.isPreview { return .sample() }
        return await FriendsLoader.load(configured: configuration.person.map { [$0.id] } ?? [], showActivity: false, showWave: false, limit: 1)
    }

    func timeline(for configuration: PersonWidgetIntent, in context: Context) async -> Timeline<FriendsEntry> {
        let entry = await FriendsLoader.load(configured: configuration.person.map { [$0.id] } ?? [], showActivity: false, showWave: false, limit: 1)
        return Timeline(entries: [entry], policy: WidgetLoader.policy(.friends, status: entry.status))
    }
}

struct UnreadProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> UnreadEntry { .sample() }

    func snapshot(for configuration: UnreadWidgetIntent, in context: Context) async -> UnreadEntry {
        if context.isPreview { return .sample() }
        return await UnreadLoader.load(showPreview: configuration.showPreview)
    }

    func timeline(for configuration: UnreadWidgetIntent, in context: Context) async -> Timeline<UnreadEntry> {
        let entry = await UnreadLoader.load(showPreview: configuration.showPreview)
        return Timeline(entries: [entry], policy: WidgetLoader.policy(.unread, status: entry.status))
    }
}

struct VoiceProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> VoiceEntry { .sample() }

    func snapshot(for configuration: VoiceWidgetIntent, in context: Context) async -> VoiceEntry {
        if context.isPreview { return .sample() }
        return await VoiceLoader.load(pinnedChannelId: configuration.pinned?.id)
    }

    func timeline(for configuration: VoiceWidgetIntent, in context: Context) async -> Timeline<VoiceEntry> {
        let entry = await VoiceLoader.load(pinnedChannelId: configuration.pinned?.id)
        return Timeline(entries: [entry], policy: WidgetLoader.policy(.voice, status: entry.status))
    }
}

struct CallProvider: TimelineProvider {
    func placeholder(in context: Context) -> CallEntry { .sample() }

    func getSnapshot(in context: Context, completion: @escaping (CallEntry) -> Void) {
        if context.isPreview { return completion(.sample()) }
        Task { completion(await CallLoader.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CallEntry>) -> Void) {
        Task {
            let entry = await CallLoader.load()
            completion(Timeline(entries: [entry], policy: WidgetLoader.policy(.call, status: .ok, callActive: entry.state != nil)))
        }
    }
}

// MARK: - Widgets

struct DescallFriendsWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: DescallWidgetKind.friendsKind, intent: FriendsWidgetIntent.self, provider: FriendsProvider()) { entry in
            FriendsWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Friends Online")
        .description("Your favourite faces and what they are doing. Tap a face to open the chat.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

struct DescallPersonWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: DescallWidgetKind.personKind, intent: PersonWidgetIntent.self, provider: PersonProvider()) { entry in
            PersonAccessoryView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Favorite Person")
        .description("One face and their status on the lock screen.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct DescallUnreadWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: DescallWidgetKind.unreadKind, intent: UnreadWidgetIntent.self, provider: UnreadProvider()) { entry in
            UnreadWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Unread Messages")
        .description("New messages as speech bubbles with the sender's face. Tap one to open that chat.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DescallVoiceWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: DescallWidgetKind.voiceKind, intent: VoiceWidgetIntent.self, provider: VoiceProvider()) { entry in
            VoiceWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Who's in Voice")
        .description("Voice channels as clusters of the faces inside. Join with one tap.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DescallCallWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: DescallWidgetKind.callKind, provider: CallProvider()) { entry in
            CallWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Live Call")
        .description("Who is speaking, with mute and leave, while you are in a call.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
