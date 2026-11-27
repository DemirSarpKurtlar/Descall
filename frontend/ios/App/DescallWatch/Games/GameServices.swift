import Foundation
import SwiftUI
import WatchKit

// Apple Watch games: haptics, local storage (bests, saves, play log, challenge), the
// owner-only score sync and the admin alert watcher. Owner only, watch only.

// MARK: - Haptics

enum GameHapticLevel: String, Codable, CaseIterable {
    case strong, light, off
}

/// The draft's haptic language: hit .click, wall .directionUp, point .success, miss
/// .failure, record a three-beat pattern, countdown .start each second, chess AI move
/// .notification, check .retry.
enum GameHaptic {
    case hit, wall, point, miss, record, tick, aiMove, check, select, start

    var essential: Bool {
        switch self {
        case .point, .miss, .record, .aiMove, .check, .start: return true
        default: return false
        }
    }
}

/// Not tied to an actor: SpriteKit scenes call it from their frame callback (main thread).
enum GameHaptics {
    private static var lastAt = Date.distantPast
    /// Mirrors GameCenter.haptics (set there).
    static var level: GameHapticLevel = .strong

    static func play(_ h: GameHaptic) {
        guard level != .off, !(level == .light && !h.essential) else { return }
        // Never a buzz storm: at most one tap every 45 ms.
        let now = Date()
        guard now.timeIntervalSince(lastAt) > 0.045 || h.essential else { return }
        lastAt = now
        let device = WKInterfaceDevice.current()
        switch h {
        case .hit, .select: device.play(.click)
        case .wall: device.play(.directionUp)
        case .point: device.play(.success)
        case .miss: device.play(.failure)
        case .tick, .start: device.play(.start)
        case .aiMove: device.play(.notification)
        case .check: device.play(.retry)
        case .record:
            device.play(.success)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { device.play(.click) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) { device.play(.success) }
        }
    }
}

// MARK: - Storage and sync

struct GameSaveMeta: Codable, Equatable {
    var game: GameId
    var mode: String
    var savedAt: Date
    /// One line for the "Devam et" card ("23. hamle · Sıra sende").
    var summary: String
}

struct GamesScoresReply: Decodable {
    struct Day: Decodable { var day: String; var seconds: Int; var rounds: Int; var records: Int }
    var scores: [GameBest]
    var days: [Day]
    var storage: String?

    enum K: String, CodingKey { case scores, days, storage }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        scores = c.lossy(.scores)
        days = c.lossy(.days)
        storage = try? c.decodeIfPresent(String.self, forKey: .storage)
    }
}

enum GameSyncState: Equatable {
    case idle, syncing, ok, offline, unavailable
}

/// Not bound to an actor (game models read it); every change happens on the main thread,
/// the network sync runs on the main actor with the WatchStore.
final class GameCenter: ObservableObject {
    static let shared = GameCenter()

    @Published private(set) var book: GameScoreBook
    @Published private(set) var log: PlayLog
    @Published private(set) var challenges: ChallengeBook
    @Published private(set) var saves: [String: GameSaveMeta]
    /// Last eight results per game + mode (the result screen's bars).
    @Published private(set) var recent: [String: [Int]]
    @Published private(set) var lastPlayed: [String: Date]
    @Published var haptics: GameHapticLevel {
        didSet {
            defaults.set(haptics.rawValue, forKey: Keys.haptics)
            GameHaptics.level = haptics
        }
    }
    @Published private(set) var syncState: GameSyncState = .idle
    /// The day's ghost trace for Işıltı (best run of today).
    @Published private(set) var ghost: (day: Int, score: Int, trace: [Double])?

    private let defaults: UserDefaults
    private var syncing = false

    enum Keys {
        static let book = "descall.games.book"
        static let log = "descall.games.log"
        static let challenges = "descall.games.challenges"
        static let saves = "descall.games.saves"
        static let recent = "descall.games.recent"
        static let lastPlayed = "descall.games.lastPlayed"
        static let haptics = "descall.games.haptics"
        static let ghost = "descall.games.ghost"
        static func save(_ g: GameId) -> String { "descall.games.save.\(g.rawValue)" }
    }

    private struct GhostBlob: Codable { var day: Int; var score: Int; var trace: [Double] }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        func load<T: Decodable>(_ key: String, _ fallback: T) -> T {
            guard let d = defaults.data(forKey: key), let v = try? JSONDecoder().decode(T.self, from: d) else { return fallback }
            return v
        }
        book = load(Keys.book, GameScoreBook())
        log = load(Keys.log, PlayLog())
        challenges = load(Keys.challenges, ChallengeBook())
        saves = load(Keys.saves, [String: GameSaveMeta]())
        recent = load(Keys.recent, [String: [Int]]())
        lastPlayed = load(Keys.lastPlayed, [String: Date]())
        haptics = GameHapticLevel(rawValue: defaults.string(forKey: Keys.haptics) ?? "") ?? .strong
        GameHaptics.level = haptics
        if let g: GhostBlob = load(Keys.ghost, GhostBlob?.none) { ghost = (g.day, g.score, g.trace) }
        if WatchDemo.screen != nil { seedDemo() }
        let today = GameDay.number(Date())
        log.prune(today: today)
        challenges.prune(today: today)
    }

    private func persist<T: Encodable>(_ value: T, _ key: String) {
        guard WatchDemo.screen == nil, let d = try? JSONEncoder().encode(value) else { return }
        defaults.set(d, forKey: key)
    }

    var today: Int { GameDay.number(Date()) }
    var todayChallenge: DailyChallenge { DailyChallenge.forDay(today) }

    func best(_ g: GameId, _ mode: String) -> GameBest? { book.best(g, mode) }

    /// Best of the game's default mode (or its best mode) for the hub row.
    func headline(_ g: GameId) -> (value: String, mode: String)? {
        let rows = g.modes.compactMap { m in book.best(g, m).map { (m, $0) } }.filter { $0.1.plays > 0 }
        guard !rows.isEmpty else { return nil }
        let pick = rows.first { $0.0 == g.defaultMode } ?? rows[0]
        return (GameFormat.result(g, pick.1.best), GL.mode(g, pick.0))
    }

    var chessMasterUnlocked: Bool { (book.best(.chess, "normal")?.best ?? 0) > 0 || (book.best(.chess, "hard")?.plays ?? 0) > 0 }

    // MARK: Rounds

    /// A finished round: best score, recent bars, play log. Returns the previous best and
    /// whether this is a new record.
    @discardableResult
    func finishRound(_ g: GameId, mode: String, result: Int, counts: Bool = true) -> (isRecord: Bool, previous: Int?) {
        let key = GameBest.key(g.rawValue, mode)
        let previous = book.best(g, mode).flatMap { $0.plays > 0 ? $0.best : nil }
        var record = false
        if counts {
            record = book.record(g, mode: mode, result: result)
            var r = recent[key] ?? []
            r.append(result)
            recent[key] = Array(r.suffix(8))
            persist(recent, Keys.recent)
            persist(book, Keys.book)
        }
        log.addRound(day: today, record: record)
        persist(log, Keys.log)
        lastPlayed[g.rawValue] = Date()
        persist(lastPlayed, Keys.lastPlayed)
        return (record, previous)
    }

    func addPlayTime(_ seconds: Double) {
        guard seconds > 0 else { return }
        log.addTime(seconds, day: today)
        persist(log, Keys.log)
    }

    @discardableResult
    func recordChallenge(_ c: DailyChallenge, progress: Int) -> Bool {
        let first = challenges.record(c, progress: progress)
        persist(challenges, Keys.challenges)
        return first
    }

    func noteRunnerRun(score: Int, trace: [Double]) {
        let day = today
        if let g = ghost, g.day == day, g.score >= score { return }
        ghost = (day, score, trace)
        persist(GhostBlob(day: day, score: score, trace: trace), Keys.ghost)
    }

    func todaysGhost() -> [Double]? {
        guard let g = ghost, g.day == today else { return nil }
        return g.trace
    }

    // MARK: Saves (wrist down, app in the background)

    func save(_ g: GameId, data: Data, mode: String, summary: String) {
        guard WatchDemo.screen == nil else { return }
        defaults.set(data, forKey: Keys.save(g))
        saves[g.rawValue] = GameSaveMeta(game: g, mode: mode, savedAt: Date(), summary: summary)
        persist(saves, Keys.saves)
    }

    func loadSave(_ g: GameId) -> Data? { defaults.data(forKey: Keys.save(g)) }

    func clearSave(_ g: GameId) {
        defaults.removeObject(forKey: Keys.save(g))
        guard saves[g.rawValue] != nil else { return }
        saves[g.rawValue] = nil
        persist(saves, Keys.saves)
    }

    /// The most recent saved round (the hub's "Devam et" card).
    var latestSave: GameSaveMeta? { saves.values.max { $0.savedAt < $1.savedAt } }

    // MARK: Sync with the owner's account (/api/admin/watch-games/scores)

    @MainActor
    func sync(_ store: WatchStore) async {
        guard !syncing else { return }
        syncing = true
        syncState = .syncing
        defer { syncing = false }
        do {
            let remote = try await store.adminGet("/watch-games/scores", as: GamesScoresReply.self)
            guard remote.storage != "unavailable" else {
                syncState = .unavailable
                return
            }
            apply(remote)
            let rows = book.pending()
            let days = log.pending(today: today)
            if !rows.isEmpty || !days.isEmpty {
                let body: [String: Any] = [
                    "scores": rows.map { ["game": $0.game, "mode": $0.mode, "best": $0.best, "plays": $0.plays] },
                    "days": days.map { ["day": $0.key, "seconds": $0.day.seconds, "rounds": $0.day.rounds, "records": $0.day.records] },
                ]
                let data = try await store.send("POST", "/api/admin/watch-games/scores", body)
                book.markUploaded(rows)
                log.markUploaded(days)
                if let reply = try? JSONDecoder().decode(GamesScoresReply.self, from: data) {
                    if reply.storage == "unavailable" {
                        syncState = .unavailable
                        return
                    }
                    apply(reply)
                }
            }
            persist(book, Keys.book)
            persist(log, Keys.log)
            syncState = .ok
        } catch let e as WatchError {
            syncState = e.isOffline ? .offline : (e == .noSession ? .offline : .unavailable)
        } catch {
            syncState = .offline
        }
    }

    private func apply(_ r: GamesScoresReply) {
        book.merge(remote: r.scores)
        var days: [String: PlayDay] = [:]
        for d in r.days { days[d.day] = PlayDay(seconds: d.seconds, rounds: d.rounds, records: d.records) }
        log.merge(remote: days)
    }

    // MARK: Demo (CI screenshots)

    private func seedDemo() {
        let rows: [(GameId, String, Int, Int)] = [
            (.pong, "hard", 11, 14), (.bricks, "", 48230, 22), (.snake, "walls", 186, 31), (.merge, "classic", 24512, 12),
            (.blocks, "marathon", 61900, 9), (.mines, "medium", 102, 18), (.sudoku, "hard", 378, 7), (.chess, "normal", 14, 30),
            (.runner, "", 87, 64), (.cards, "", 1240, 40),
        ]
        var b = GameScoreBook()
        for r in rows { b.entries[GameBest.key(r.0.rawValue, r.1)] = GameBest(game: r.0.rawValue, mode: r.1, best: r.2, plays: r.3) }
        book = b
        var l = PlayLog()
        let t = GameDay.number(Date())
        for (i, mins) in [12, 25, 8, 31, 19, 27, 12].enumerated() {
            l.days[t - 6 + i] = PlayDay(seconds: mins * 60, rounds: max(1, mins / 4), records: i == 3 || i == 5 || i == 6 ? 1 : 0)
        }
        log = l
        recent[GameBest.key("bricks", "")] = [31000, 36000, 29000, 40000, 44000, 38000, 47090, 48230]
        saves["chess"] = GameSaveMeta(game: .chess, mode: "normal", savedAt: Date(), summary: GL.t("moveCount", ["n": "23"]) + " · " + GL.t("yourTurn"))
        lastPlayed = ["pong": Date().addingTimeInterval(-86400), "snake": Date().addingTimeInterval(-3 * 86400)]
        syncState = .ok
    }
}

// MARK: - Critical admin alerts while playing (draft A)

struct GameAlert: Equatable {
    var kind: GameAlertKind
    var errors: Int?
    var reports: Int?
}

@MainActor
final class GameAlertWatcher: ObservableObject {
    @Published var alert: GameAlert?
    private var baselineErrors: Int?
    private var baselineReports: Int?
    private var shown: Set<GameAlertKind> = []
    private var started = false

    /// Polls the overview every 60 s while a round is open (the task ends with the view).
    func run(_ store: WatchStore) async {
        if WatchDemo.screen == "game-alert" {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            alert = GameAlert(kind: .errors, errors: 41, reports: nil)
            return
        }
        while !Task.isCancelled {
            if let o = try? await store.adminGet("/overview", as: AdminOverview.self) {
                let errors = o.system?.errorsLastHour
                let reports = o.safety?.openReports
                if !started {
                    started = true
                    baselineErrors = errors
                    baselineReports = reports
                    // A health already critical when the round began is shown once too.
                }
                if alert == nil, let kind = GameAlertRule.evaluate(level: o.health?.level, errors: errors, reports: reports, hot: o.safety?.hotCount ?? 0, baselineErrors: baselineErrors, baselineReports: baselineReports, already: shown) {
                    shown.insert(kind)
                    alert = GameAlert(kind: kind, errors: errors, reports: reports)
                }
            }
            try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
        }
    }

    func dismiss() { alert = nil }
}

extension Notification.Name {
    /// A games screen asks the admin page to open a section (object: AdminRoute?).
    static let descallGamesOpenAdmin = Notification.Name("descall.games.openAdmin")
}

enum GameRouter {
    /// Leave the games and open an admin section (nil = admin home).
    static func openAdmin(section: String?) {
        let route: AdminRoute?
        switch section {
        case "errors": route = .errors
        case "reports": route = .reports
        default: route = nil
        }
        NotificationCenter.default.post(name: .descallGamesOpenAdmin, object: route.map { AdminRouteBox(route: $0) })
    }
}

/// AdminRoute holds payloads, so it travels boxed in the notification.
final class AdminRouteBox: NSObject {
    let route: AdminRoute
    init(route: AdminRoute) { self.route = route }
}
