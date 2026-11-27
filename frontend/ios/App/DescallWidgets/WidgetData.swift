import CoreGraphics
import Foundation
import WidgetKit

// Widgets draft B: loading what the widgets show. One API call per timeline (/api/native/*,
// shared Keychain session through DescallKit), the last good answer kept in the extension's
// own Caches folder so an offline phone still shows faces (with "12:04 güncellendi"), and
// the reload policy from DescallWidgetRefresh (back-off on failures, budget friendly).

enum WStatus: Equatable {
    case ok
    case signedOut
    case failed
}

/// Last good answers, per widget kind, in the extension's own container.
enum WidgetDiskCache {
    static var directory: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("DescallWidgetData", isDirectory: true)
    }

    static func save<T: Encodable>(_ value: T, as name: String) {
        guard let dir = directory, let data = try? JSONEncoder().encode(value) else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: dir.appendingPathComponent("\(name).json"), options: .atomic)
    }

    static func load<T: Decodable>(_ type: T.Type, as name: String) -> (value: T, savedAt: Date)? {
        guard let file = directory?.appendingPathComponent("\(name).json"),
              let data = try? Data(contentsOf: file),
              let value = try? JSONDecoder().decode(type, from: data) else { return nil }
        let at = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        return (value, at)
    }

    static func clear() {
        if let dir = directory { try? FileManager.default.removeItem(at: dir) }
    }
}

/// Consecutive failures per kind (the back-off in DescallWidgetRefresh).
enum WidgetFailures {
    static func count(_ kind: DescallWidgetKind) -> Int { UserDefaults.standard.integer(forKey: "widgets.fail.\(kind.rawValue)") }
    static func record(_ kind: DescallWidgetKind, ok: Bool) {
        UserDefaults.standard.set(ok ? 0 : count(kind) + 1, forKey: "widgets.fail.\(kind.rawValue)")
    }
}

struct FaceInput: Sendable {
    let id: String
    let name: String
    let initials: String?
    let url: String?
    let presence: DescallPresence?
    let screen: Bool

    init(_ id: String, _ name: String, _ initials: String?, _ url: String?, _ presence: DescallPresence?, _ screen: Bool) {
        self.id = id
        self.name = name
        self.initials = initials
        self.url = url
        self.presence = presence
        self.screen = screen
    }
}

/// A fetch with the cache behind it: fresh value, or the last good one marked stale, or why not.
struct Loaded<T> {
    var value: T?
    var status: WStatus
    var staleSince: Date?
}

enum WidgetLoader {
    static func client() -> DescallAPIClient? {
        try? DescallAPIClient.current(clientName: "ios-widget")
    }

    static func fetch<T: Codable>(_ kind: DescallWidgetKind, cache name: String, _ work: (DescallAPIClient) async throws -> T) async -> Loaded<T> {
        guard let client = client() else {
            WidgetDiskCache.clear()
            return Loaded(value: nil, status: .signedOut, staleSince: nil)
        }
        do {
            let value = try await work(client)
            WidgetDiskCache.save(value, as: name)
            WidgetFailures.record(kind, ok: true)
            return Loaded(value: value, status: .ok, staleSince: nil)
        } catch {
            let e = DescallAPIError.from(transport: error)
            if e.needsSignIn || e == .banned {
                WidgetDiskCache.clear()
                return Loaded(value: nil, status: .signedOut, staleSince: nil)
            }
            WidgetFailures.record(kind, ok: false)
            if let cached = WidgetDiskCache.load(T.self, as: name) {
                return Loaded(value: cached.value, status: .ok, staleSince: cached.savedAt)
            }
            return Loaded(value: nil, status: .failed, staleSince: nil)
        }
    }

    static func policy(_ kind: DescallWidgetKind, status: WStatus, callActive: Bool = false) -> TimelineReloadPolicy {
        .after(DescallWidgetRefresh.next(kind: kind, failures: WidgetFailures.count(kind), signedOut: status == .signedOut, callActive: callActive))
    }

    /// Faces with their photos: the extension's own cache first, else the app's (App Group),
    /// else a download into the own cache. Several at once, bounded.
    static func faces(_ items: [FaceInput]) async -> [WFace] {
        await withTaskGroup(of: (Int, CGImage?).self) { group in
            for (i, item) in items.enumerated() {
                group.addTask {
                    if let img = DescallAvatarCache.shared.cachedImage(id: item.id, url: item.url) { return (i, img) }
                    if let img = DescallAvatarCache.appGroupShared.cachedImage(id: item.id, url: item.url) { return (i, img) }
                    return (i, await DescallAvatarCache.shared.image(id: item.id, url: item.url))
                }
            }
            var images = [CGImage?](repeating: nil, count: items.count)
            for await (i, img) in group { images[i] = img }
            return items.enumerated().map { i, item in
                WFace(id: item.id, name: item.name, initials: item.initials ?? DescallText.initials(of: item.name),
                      presence: item.presence, image: images[i], screen: item.screen)
            }
        }
    }
}

// MARK: - Friends (favourite faces)

struct PersonCard: Identifiable {
    let face: WFace
    let line: String?
    let link: URL?
    let wave: DescallWaveMark?
    var id: String { face.id }
}

struct FriendsEntry: TimelineEntry {
    let date: Date
    let status: WStatus
    let cards: [PersonCard]
    let onlineCount: Int
    let showActivity: Bool
    let showWave: Bool
    let staleSince: Date?

    static func sample(_ date: Date = Date()) -> FriendsEntry {
        let names: [(String, String, DescallPresence, String)] = [
            ("s-ece", "Ece", .online, "Minecraft"), ("s-kaan", "Kaan", .online, ""), ("s-selin", "Selin", .online, ""),
            ("s-arda", "Arda", .online, ""), ("s-deniz", "Deniz", .online, ""), ("s-zeynep", "Zeynep", .idle, ""),
            ("s-elif", "Elif", .idle, ""), ("s-mert", "Mert", .dnd, ""),
        ]
        let cards = names.map { id, name, p, game in
            PersonCard(face: WFace(id: id, name: name, initials: String(name.prefix(1)), presence: p),
                       line: game.isEmpty ? WL.activity(DescallActivityLine.make(nil, presence: p)) : WL.t("activity.game", game),
                       link: nil, wave: nil)
        }
        return FriendsEntry(date: date, status: .ok, cards: cards, onlineCount: 8, showActivity: true, showWave: true, staleSince: nil)
    }
}

enum FriendsLoader {
    static func load(configured: [String], showActivity: Bool?, showWave: Bool?, limit: Int) async -> FriendsEntry {
        let record = DescallWidgetStore.favorites()
        let loaded = await WidgetLoader.fetch(.friends, cache: "friends") { try await $0.widgetFriends() }
        let now = Date()
        guard let friends = loaded.value else {
            return FriendsEntry(date: now, status: loaded.status, cards: [], onlineCount: 0, showActivity: true, showWave: false, staleSince: nil)
        }
        let chosen = DescallFavorites.faces(configured: configured, favorites: record.ids, friends: friends, limit: limit)
        let faces = await WidgetLoader.faces(chosen.map {
            FaceInput($0.id, $0.name, $0.initials, $0.avatarUrl ?? record.person($0.id)?.avatarUrl, $0.presence, false)
        })
        let activity = showActivity ?? record.prefs.showActivity
        let cards = zip(chosen, faces).map { friend, face in
            PersonCard(face: face,
                       line: activity ? WL.activity(DescallActivityLine.make(friend.activity, presence: friend.presence, now: now)) : nil,
                       link: friend.username.flatMap { DescallDeepLink.dm(username: $0) },
                       wave: DescallWidgetStore.waveMark(for: friend.id, now: now))
        }
        return FriendsEntry(date: now, status: .ok, cards: cards, onlineCount: friends.filter { $0.presence != .offline }.count,
                            showActivity: activity, showWave: showWave ?? record.prefs.waveButton, staleSince: loaded.staleSince)
    }
}

// MARK: - Unread (speech bubbles)

struct Bubble: Identifiable {
    let id: String
    let face: WFace
    let title: String
    let by: String?
    let text: String?
    let count: Int
    let ago: String?
    let mention: Bool
    let kind: String
    let link: URL?
}

struct UnreadEntry: TimelineEntry {
    let date: Date
    let status: WStatus
    let total: Int
    let conversations: Int
    let bubbles: [Bubble]
    let showPreview: Bool
    let staleSince: Date?

    static func sample(_ date: Date = Date()) -> UnreadEntry {
        let rows: [(String, String, String?, String, Int, String, Bool)] = [
            ("s-ece", "Ece", nil, "Akşam 9'da sese gelir misin? Kaan da geliyor", 3, "dm", false),
            ("s-kaan", "Kampüs Ekibi", "Kaan", "Notları attım, sınavdan önce bakın", 4, "group", false),
            ("s-arda", "Gece Kuşu", "Arda", "@Demir cuma turnuvası kesinleşti", 4, "channel", true),
            ("s-zeynep", "Zeynep", nil, "Bir fotoğraf gönderdi", 1, "dm", false),
        ]
        let bubbles = rows.enumerated().map { i, r in
            Bubble(id: "\(i)", face: WFace(id: r.0, name: r.2 ?? r.1, initials: String((r.2 ?? r.1).prefix(1))), title: r.1, by: r.2,
                   text: r.3, count: r.4, ago: WL.t("time.min", [2, 5, 18, 26][i]), mention: r.6, kind: r.5, link: nil)
        }
        return UnreadEntry(date: date, status: .ok, total: 12, conversations: 4, bubbles: bubbles, showPreview: true, staleSince: nil)
    }
}

enum UnreadLoader {
    static func load(showPreview: Bool?) async -> UnreadEntry {
        let record = DescallWidgetStore.favorites()
        let preview = showPreview ?? record.prefs.showPreview
        let loaded = await WidgetLoader.fetch(.unread, cache: "summary") { try await $0.widgetSummary() }
        let now = Date()
        guard let summary = loaded.value else {
            return UnreadEntry(date: now, status: loaded.status, total: 0, conversations: 0, bubbles: [], showPreview: preview, staleSince: nil)
        }
        let rows = Array(summary.unread.top.prefix(5))
        let faces = await WidgetLoader.faces(rows.map { row in
            let faceId = row.peerId ?? row.targetId
            return FaceInput(faceId, row.by ?? row.title, row.initials, row.avatarUrl, nil, false)
        })
        let bubbles = zip(rows, faces).map { row, face in
            Bubble(id: row.conv, face: face, title: row.title, by: row.by, text: preview ? row.preview : nil, count: row.count,
                   ago: WL.ago(row.at.flatMap(DescallDates.parse), now: now), mention: row.mention ?? false, kind: row.kind, link: row.deepLink)
        }
        return UnreadEntry(date: now, status: .ok, total: summary.unread.total, conversations: summary.unread.top.count,
                           bubbles: bubbles, showPreview: preview, staleSince: loaded.staleSince)
    }
}

// MARK: - Voice (face clusters)

struct RoomCard: Identifiable {
    let id: String
    let serverName: String
    let channelName: String
    let count: Int
    let faces: [WFace]
    let here: Bool
    let speaker: String?
    let since: String?
    let link: URL?
    let serverFace: WFace
}

struct VoiceEntry: TimelineEntry {
    let date: Date
    let status: WStatus
    let rooms: [RoomCard]
    let people: Int
    let staleSince: Date?

    static func sample(_ date: Date = Date()) -> VoiceEntry {
        func f(_ id: String, _ n: String) -> WFace { WFace(id: id, name: n, initials: String(n.prefix(1))) }
        let rooms = [
            RoomCard(id: "v1", serverName: "Gece Kuşu", channelName: "Oyun Gecesi", count: 5,
                     faces: [f("s-kaan", "Kaan"), f("s-deniz", "Deniz"), f("s-selin", "Selin"), f("s-arda", "Arda")],
                     here: true, speaker: "Kaan", since: nil, link: nil, serverFace: f("srv-gk", "Gece Kuşu")),
            RoomCard(id: "v2", serverName: "Kampüs Ekibi", channelName: "Ders Çalışma", count: 2,
                     faces: [f("s-zeynep", "Zeynep"), f("s-elif", "Elif")], here: false, speaker: nil,
                     since: WL.t("time.hour", 1), link: nil, serverFace: f("srv-ke", "Kampüs Ekibi")),
            RoomCard(id: "v3", serverName: "Yapımcılar", channelName: "Stüdyo", count: 2,
                     faces: [f("s-mert", "Mert"), f("s-can", "Can")], here: false, speaker: nil,
                     since: WL.t("time.min", 9), link: nil, serverFace: f("srv-yp", "Yapımcılar")),
        ]
        return VoiceEntry(date: date, status: .ok, rooms: rooms, people: 9, staleSince: nil)
    }
}

enum VoiceLoader {
    static func load(pinnedChannelId: String?) async -> VoiceEntry {
        let loaded = await WidgetLoader.fetch(.voice, cache: "voice") { (client: DescallAPIClient) async throws -> [DescallVoiceRoom] in
            var rooms = try await client.voiceRooms(occupiedOnly: true)
            if let pin = pinnedChannelId, !rooms.contains(where: { $0.channelId == pin }),
               let pinned = try? await client.voiceRooms().first(where: { $0.channelId == pin }) {
                rooms.insert(pinned, at: 0)
            }
            return rooms
        }
        let now = Date()
        guard var rooms = loaded.value else {
            return VoiceEntry(date: now, status: loaded.status, rooms: [], people: 0, staleSince: nil)
        }
        if let pin = pinnedChannelId, let i = rooms.firstIndex(where: { $0.channelId == pin }) {
            rooms.insert(rooms.remove(at: i), at: 0)
        }
        let call = DescallWidgetStore.call(now: now)
        var cards: [RoomCard] = []
        for room in rooms.prefix(3) {
            let faces = await WidgetLoader.faces(room.occupants.prefix(4).map { FaceInput($0.id, $0.name, $0.initials, $0.avatarUrl, nil, $0.screen ?? false) })
            let here = call?.channelId == room.channelId
            cards.append(RoomCard(id: room.channelId, serverName: room.serverName, channelName: room.channelName, count: room.occupantCount,
                                  faces: faces, here: here, speaker: here ? call?.speaker?.name : nil,
                                  since: WL.ago(room.since.flatMap(DescallDates.parse), now: now),
                                  link: DescallDeepLink.server(room.serverId, channel: room.channelId),
                                  serverFace: WFace(id: "srv-\(room.serverId)", name: room.serverName, initials: DescallText.initials(of: room.serverName))))
        }
        return VoiceEntry(date: now, status: .ok, rooms: cards, people: rooms.reduce(0) { $0 + $1.occupantCount }, staleSince: loaded.staleSince)
    }
}

// MARK: - Call

struct CallEntry: TimelineEntry {
    let date: Date
    let state: DescallCallState?
    let faces: [WFace]
    let speaker: WFace?
    /// No call: favourites to call (tap opens the DM).
    let favorites: [PersonCard]

    static func sample(_ date: Date = Date()) -> CallEntry {
        let people = [("s-demir", "Demir", true), ("s-kaan", "Kaan", false), ("s-deniz", "Deniz", false), ("s-selin", "Selin", false), ("s-arda", "Arda", false)]
        let state = DescallCallState(kind: "server", title: "Oyun Gecesi", subtitle: "Gece Kuşu", startedAt: date.addingTimeInterval(-724),
                                     speaker: DescallCallPerson(id: "s-kaan", name: "Kaan", speaking: true),
                                     participants: people.map { DescallCallPerson(id: $0.0, name: $0.1, me: $0.2, screen: $0.0 == "s-arda", speaking: $0.0 == "s-kaan") },
                                     participantCount: 5)
        let faces = people.map { WFace(id: $0.0, name: $0.1, initials: String($0.1.prefix(1)), screen: $0.0 == "s-arda") }
        return CallEntry(date: date, state: state, faces: faces, speaker: faces[1], favorites: [])
    }
}

enum CallLoader {
    static func load() async -> CallEntry {
        let now = Date()
        guard let state = DescallWidgetStore.call(now: now) else {
            let record = DescallWidgetStore.favorites()
            let faces = await WidgetLoader.faces(record.people.prefix(4).map { FaceInput($0.id, $0.name, $0.initials, $0.avatarUrl, nil, false) })
            let cards = zip(record.people.prefix(4), faces).map { p, face in
                PersonCard(face: face, line: nil, link: p.username.flatMap { DescallDeepLink.dm(username: $0) }, wave: nil)
            }
            return CallEntry(date: now, state: nil, faces: [], speaker: nil, favorites: cards)
        }
        // The Live Activity's faces: the app cached them in the App Group.
        let faces = state.participants.map { p in
            WFace(id: p.id, name: p.name, initials: p.initials, image: DescallAvatarCache.appGroupShared.cachedImage(id: p.id, url: nil), screen: p.screen)
        }
        let speaker = state.speaker.map { s in
            faces.first { $0.id == s.id } ?? WFace(id: s.id, name: s.name, initials: s.initials,
                                                   image: DescallAvatarCache.appGroupShared.cachedImage(id: s.id, url: nil))
        }
        return CallEntry(date: now, state: state, faces: faces, speaker: speaker, favorites: [])
    }
}
