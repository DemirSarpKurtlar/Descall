import Foundation

// Widgets draft B selftest: favourites, activity line, refresh policy, the call state the
// Live Activity and the call widget share, avatar file names and colours.
// swiftc -o /tmp/wl App/DescallKit/*.swift App/WidgetShared/DescallWidgetLogic.swift selftest/widgets/main.swift && /tmp/wl

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok {
        failures += 1
        print("FAIL [\(line)] \(what)")
    }
}
func eq<T: Equatable>(_ a: T, _ b: T, _ what: String, line: Int = #line) {
    check(a == b, "\(what): \(a) != \(b)", line: line)
}

// MARK: Kinds

eq(DescallWidgetKind.friends.widgetKinds, ["DescallFriendsWidget", "DescallPersonWidget"], "friends reload covers the person widget")
eq(DescallWidgetKind.family(ofKind: "DescallPersonWidget"), .friends, "person widget belongs to friends")
eq(DescallWidgetKind.family(ofKind: "Other"), nil, "foreign kind")
eq(Set(DescallWidgetKind.allCases.map(\.rawValue)), ["friends", "unread", "voice", "call"], "same names as nativeWidgets.js WIDGET_KINDS")

// MARK: Favourites

eq(DescallFavorites.normalize(["a", "a", "bad id;", "b", "", String(repeating: "x", count: 65)]), ["a", "b"], "valid, unique")
eq(DescallFavorites.normalize((0..<12).map { "f\($0)" }).count, 8, "at most 8")
let friends = [
    DescallFriend(id: "e", username: "ece", name: "Ece", presence: .online),
    DescallFriend(id: "k", username: "kaan", name: "Kaan", presence: .online),
    DescallFriend(id: "b", username: "baris", name: "Barış", presence: .offline),
    DescallFriend(id: "z", username: "zeynep", name: "Zeynep", presence: .idle),
]
eq(DescallFavorites.faces(configured: ["b", "e"], favorites: ["k"], friends: friends, limit: 8).map(\.id), ["b", "e"], "widget's own choice wins, offline kept")
eq(DescallFavorites.faces(configured: [], favorites: ["z", "gone", "k"], friends: friends, limit: 8).map(\.id), ["z", "k"], "app favourites, removed friend drops out")
eq(DescallFavorites.faces(configured: [], favorites: [], friends: friends, limit: 2).map(\.id), ["e", "k"], "nobody chosen: friends online")
let record = DescallFavoritesRecord(ids: ["e", "e", "k"], people: [DescallFavoritePerson(id: "e", name: "Ece", avatarUrl: "http://x"), DescallFavoritePerson(id: "q", name: "Q")], prefs: .standard)
eq(record.ids, ["e", "k"], "record ids normalized")
eq(record.people.map(\.id), ["e"], "people outside the ids dropped")
eq(record.person("e")?.avatarUrl, nil, "https avatars only")
eq(record.person("e")?.initials, "E", "initials")

// MARK: Activity line

let now = Date(timeIntervalSince1970: 1_800_000_000)
eq(DescallActivityLine.make(DescallActivity(kind: "game", label: "Minecraft"), presence: .online), DescallActivityLine(key: "activity.game", argument: "Minecraft", minutes: nil), "game")
eq(DescallActivityLine.make(DescallActivity(kind: "voice", label: "Oyun Gecesi"), presence: .online)?.key, "activity.voiceIn", "voice with channel")
eq(DescallActivityLine.make(DescallActivity(kind: "voice"), presence: .online)?.key, "activity.voice", "voice without channel")
eq(DescallActivityLine.make(DescallActivity(kind: "screen"), presence: .online)?.key, "activity.screen", "screen")
eq(DescallActivityLine.make(DescallActivity(kind: "game"), presence: .online), nil, "game without a name says nothing")
eq(DescallActivityLine.make(nil, presence: .idle)?.key, "activity.idle", "idle from presence")
eq(DescallActivityLine.make(nil, presence: .online), nil, "plain online: no line")
let iso = ISO8601DateFormatter().string(from: now.addingTimeInterval(-12 * 60))
eq(DescallActivityLine.make(DescallActivity(kind: "idle", since: iso), presence: .idle, now: now)?.minutes, 12, "idle for 12 min")
eq(DescallActivityLine.make(DescallActivity(kind: "weird"), presence: .online), nil, "unknown kind")

// MARK: Elapsed

check(DescallElapsed.parts(from: now.addingTimeInterval(-20), now: now)! == ("time.now", 0), "seconds: now")
check(DescallElapsed.parts(from: now.addingTimeInterval(-5 * 60), now: now)! == ("time.min", 5), "5 min")
check(DescallElapsed.parts(from: now.addingTimeInterval(-2 * 3600), now: now)! == ("time.hour", 2), "2 h")
check(DescallElapsed.parts(from: now.addingTimeInterval(-3 * 86400), now: now)! == ("time.day", 3), "3 d")
check(DescallElapsed.parts(from: nil, now: now) == nil, "no date")

// MARK: Refresh policy

func mins(_ d: Date) -> Int { Int(d.timeIntervalSince(now) / 60) }
eq(mins(DescallWidgetRefresh.next(kind: .friends, now: now)), 30, "friends every 30 min")
eq(mins(DescallWidgetRefresh.next(kind: .unread, now: now)), 20, "unread every 20 min")
eq(mins(DescallWidgetRefresh.next(kind: .voice, now: now)), 15, "voice every 15 min")
eq(mins(DescallWidgetRefresh.next(kind: .call, now: now, callActive: true)), 15, "call while active")
eq(mins(DescallWidgetRefresh.next(kind: .call, now: now)), 60, "no call: hourly")
eq(mins(DescallWidgetRefresh.next(kind: .unread, now: now, failures: 1)), 5, "first failure: 5 min")
eq(mins(DescallWidgetRefresh.next(kind: .unread, now: now, failures: 3)), 20, "third failure: 20 min")
eq(mins(DescallWidgetRefresh.next(kind: .unread, now: now, failures: 40)), 60, "back-off capped at an hour")
eq(mins(DescallWidgetRefresh.next(kind: .friends, now: now, signedOut: true)), 360, "signed out: 6 h")

// MARK: Call state from the JS payload

let payload: [String: Any] = [
    "active": true, "kind": "server", "title": "Oyun Gecesi", "subtitle": "Gece Kuşu", "startedAt": 1_700_000_000_000.0,
    "muted": true, "deafened": false,
    "speaker": ["id": "k", "name": "Kaan", "initials": "K", "speaking": true],
    "participants": (0..<9).map { ["id": "p\($0)", "name": "P\($0)", "me": $0 == 0, "screen": $0 == 3] as [String: Any] } + [["id": "bad id;", "name": "X"] as [String: Any]],
    "participantCount": 9,
    "link": ["serverId": "s1", "channelId": "v1"],
]
if let st = DescallCallState.from(payload: payload) {
    eq(st.kind, "server", "kind")
    eq(st.participants.count, 6, "six faces at most (4 KB content state)")
    eq(st.participantCount, 9, "count kept")
    eq(st.speaker?.name, "Kaan", "speaker")
    eq(st.muted, true, "muted")
    eq(st.link, "descall://server/s1/v1", "tap opens the channel")
    eq(st.channelId, "v1", "voice widget marks the room")
    eq(st.startedAt.timeIntervalSince1970, 1_700_000_000, "start time from ms")
    check(st.participants.first?.me == true, "me flag")
    check(st.participants.contains { $0.screen }, "screen flag")
    var other = st
    other.speaker = DescallCallPerson(id: "p2", name: "P2")
    check(other.differsOnlyBySpeaker(from: st), "speaker change detected")
    var muted = other
    muted.muted = false
    check(!muted.differsOnlyBySpeaker(from: st), "mute change is not a speaker change")
    check(!st.differsOnlyBySpeaker(from: st), "same state")
    let data = try? JSONEncoder().encode(st)
    check((data?.count ?? 9999) < 4096, "content state fits ActivityKit's 4 KB")
    eq(data.flatMap { try? JSONDecoder().decode(DescallCallState.self, from: $0) }, st, "round trip")
} else {
    check(false, "payload parses")
}
eq(DescallCallState.from(payload: ["active": false]), nil, "no call")
eq(DescallCallState.from(payload: ["active": true, "kind": "dm", "link": ["username": "ece"]])?.link, "descall://dm/ece", "DM link")
eq(DescallCallState.from(payload: ["active": true, "kind": "zzz"])?.kind, "server", "unknown kind")
check(abs((DescallCallState.from(payload: ["active": true])?.startedAt.timeIntervalSinceNow ?? -99)) < 2, "no start time: now")

// MARK: Avatars

eq(DescallAvatarKey.fileName(id: "11111111-1111-4111-8111-111111111111", url: "https://cdn.x/a.png")?.hasPrefix("11111111-1111-4111-8111-111111111111_"), true, "id then underscore")
eq(DescallAvatarKey.fileName(id: "a", url: "https://cdn.x/a.png"), DescallAvatarKey.fileName(id: "a", url: "https://cdn.x/a.png"), "stable")
check(DescallAvatarKey.fileName(id: "a", url: "https://cdn.x/a.png") != DescallAvatarKey.fileName(id: "a", url: "https://cdn.x/b.png"), "new photo, new file")
eq(DescallAvatarKey.fileName(id: "a", url: "http://cdn.x/a.png"), nil, "https only")
eq(DescallAvatarKey.fileName(id: "../a", url: "https://cdn.x/a.png"), nil, "no path tricks")
eq(DescallAvatarPalette.index(for: "ece"), DescallAvatarPalette.index(for: "ece"), "stable colour")
check((0..<DescallAvatarPalette.pairs.count).contains(DescallAvatarPalette.index(for: "anything")), "colour in range")

// MARK: Wave

eq(DescallWaveMark.from(error: .rateLimited), .limit, "429 -> limit mark")
eq(DescallWaveMark.from(error: .offline), .failed, "offline -> failed mark")

if failures > 0 {
    print("Widgets selftest: \(failures) failure(s)")
    exit(1)
}
print("Widgets selftest ok")
