import Foundation

// Apple Watch games (admin only, owner request Nov 2026): the shared, UI-free core.
// Foundation only, so ios/selftest/games compiles every *Logic.swift file with swiftc on
// any Mac (no SwiftUI, SpriteKit or WatchKit here).

/// Deterministic random numbers (SplitMix64). Saved games and selftests replay exactly;
/// a new round seeds from the system generator.
struct GameRNG: RandomNumberGenerator, Codable, Equatable {
    var state: UInt64

    init(seed: UInt64) { state = seed }

    static func fresh() -> GameRNG { GameRNG(seed: UInt64.random(in: 1...UInt64.max)) }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// 0 ..< n (n > 0).
    mutating func int(_ n: Int) -> Int {
        guard n > 1 else { return 0 }
        return Int(next() % UInt64(n))
    }

    /// 0 ..< 1.
    mutating func unit() -> Double { Double(next() >> 11) / Double(UInt64(1) << 53) }

    mutating func range(_ lo: Double, _ hi: Double) -> Double { lo + (hi - lo) * unit() }

    mutating func chance(_ p: Double) -> Bool { unit() < p }
}

/// Which way a game's best result points.
enum ScoreDirection: String, Codable {
    /// Bigger is better (points, wins).
    case high
    /// Smaller is better (seconds to solve); 0 = not finished yet.
    case low
}

/// What the number of a game's result means, for the copy ("1:42", "12 wins", "3 480").
enum ScoreKind: String, Codable {
    case points, wins, seconds
}

/// The ten watch games. Ids and modes are the backend catalog (lib/watchGames.js); keep
/// both lists the same. No tic-tac-toe (owner rule).
enum GameId: String, CaseIterable, Codable, Identifiable {
    case pong, bricks, snake, merge, blocks, mines, sudoku, chess, runner, cards

    var id: String { rawValue }

    var direction: ScoreDirection {
        switch self {
        case .mines, .sudoku: return .low
        default: return .high
        }
    }

    var kind: ScoreKind {
        switch self {
        case .mines, .sudoku: return .seconds
        case .pong, .chess: return .wins
        default: return .points
        }
    }

    /// Modes with a best score of their own ("" = one table for the game).
    var modes: [String] {
        switch self {
        case .pong, .chess: return ["easy", "normal", "hard"]
        case .mines, .sudoku: return ["easy", "medium", "hard"]
        case .snake: return ["walls", "wrap", "maze"]
        case .merge: return ["classic", "mini"]
        case .blocks: return ["marathon", "sprint"]
        default: return [""]
        }
    }

    var defaultMode: String { (self == .pong || self == .chess || self == .mines || self == .sudoku) ? modes[1] : modes[0] }

    /// Action games run in SpriteKit; boards are SwiftUI Canvas / views.
    var isAction: Bool { self == .pong || self == .bricks || self == .runner }
}

/// Who may see the games: the owner account only (home.adminSections carries the
/// never-grantable "games" section only for the owner, backend lib/adminPermissions.js
/// OWNER_WATCH) and only on the Apple Watch. The iPhone and iPad apps never contain this
/// code; the server refuses the score API for everyone else as well.
enum WatchGamesGate {
    static let section = "games"

    static func isVisible(adminSections: [String]?) -> Bool {
        adminSections?.contains(section) ?? false
    }
}

/// The best result of one game + mode, and how many rounds were played.
struct GameBest: Codable, Equatable {
    var game: String
    var mode: String
    var best: Int
    var plays: Int

    var key: String { GameBest.key(game, mode) }
    static func key(_ game: String, _ mode: String) -> String { "\(game):\(mode)" }

    /// The better of two results in a direction (0 never wins for `.low`).
    static func better(_ dir: ScoreDirection, _ a: Int, _ b: Int) -> Int {
        switch dir {
        case .high: return max(a, b)
        case .low:
            if a <= 0 { return max(0, b) }
            if b <= 0 { return a }
            return min(a, b)
        }
    }

    /// true when `new` beats `old` (a first finished `.low` result always does).
    static func improves(_ dir: ScoreDirection, old: Int, new: Int) -> Bool {
        switch dir {
        case .high: return new > old
        case .low: return new > 0 && (old <= 0 || new < old)
        }
    }
}

/// Local best scores (the watch is the source of truth while offline) plus the keys that
/// still have to reach the account. Pure; WatchGameScores (UI layer) keeps it in
/// UserDefaults and talks to /api/admin/watch-games/scores.
struct GameScoreBook: Codable, Equatable {
    var entries: [String: GameBest] = [:]
    /// Changed since the last successful upload.
    var dirty: Set<String> = []
    var lastSync: Date?

    func best(_ game: GameId, _ mode: String) -> GameBest? { entries[GameBest.key(game.rawValue, mode)] }

    /// A finished round. Returns true for a new best.
    @discardableResult
    mutating func record(_ game: GameId, mode: String, result: Int) -> Bool {
        let key = GameBest.key(game.rawValue, mode)
        var e = entries[key] ?? GameBest(game: game.rawValue, mode: mode, best: 0, plays: 0)
        let isNew = GameBest.improves(game.direction, old: e.best, new: result)
        e.best = GameBest.better(game.direction, e.best, max(0, result))
        e.plays += 1
        entries[key] = e
        dirty.insert(key)
        return isNew
    }

    /// The account's copy arrived: keep the better best and the larger play count per key.
    /// Keys where the watch is ahead stay (or become) dirty so the next upload sends them.
    mutating func merge(remote: [GameBest], at now: Date = Date()) {
        for r in remote {
            guard let game = GameId(rawValue: r.game), game.modes.contains(r.mode) else { continue }
            let key = r.key
            let local = entries[key]
            let merged = GameBest(
                game: r.game, mode: r.mode,
                best: GameBest.better(game.direction, local?.best ?? 0, r.best),
                plays: max(local?.plays ?? 0, r.plays)
            )
            entries[key] = merged
            if merged.best != r.best || merged.plays != r.plays { dirty.insert(key) } else { dirty.remove(key) }
        }
        lastSync = now
    }

    /// Rows to upload (dirty keys only, catalog order).
    func pending() -> [GameBest] {
        entries.values.filter { dirty.contains($0.key) }.sorted { $0.key < $1.key }
    }

    mutating func markUploaded(_ rows: [GameBest], at now: Date = Date()) {
        for r in rows where entries[r.key] == r { dirty.remove(r.key) }
        lastSync = now
    }

    var totalPlays: Int { entries.values.reduce(0) { $0 + $1.plays } }
}

/// A saved round on the watch (wrist down, app backgrounded): versioned JSON per game.
struct GameSave<State: Codable>: Codable {
    static var currentVersion: Int { 1 }
    var v: Int
    var mode: String
    var savedAt: Date
    var state: State

    init(mode: String, state: State, savedAt: Date = Date()) {
        v = GameSave.currentVersion
        self.mode = mode
        self.state = state
        self.savedAt = savedAt
    }

    func encoded() -> Data? { try? JSONEncoder().encode(self) }

    /// nil for another version or a broken blob (the game then starts fresh).
    static func decode(_ data: Data?) -> GameSave<State>? {
        guard let data, let save = try? JSONDecoder().decode(GameSave<State>.self, from: data), save.v == currentVersion else { return nil }
        return save
    }
}

/// Small math helpers shared by the action games.
enum GameMath {
    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(hi, max(lo, v)) }
    static func clamp(_ v: Int, _ lo: Int, _ hi: Int) -> Int { min(hi, max(lo, v)) }
    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

    /// "1:05" for seconds.
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }

    /// Splits a long frame into steps no longer than `maxStep` (no tunnelling through a
    /// paddle after a hitch), and caps the frame so a resume never jumps.
    static func substeps(_ dt: Double, maxStep: Double = 1.0 / 120.0, cap: Double = 0.1) -> [Double] {
        let total = clamp(dt, 0, cap)
        guard total > 0 else { return [] }
        let n = max(1, Int((total / maxStep).rounded(.up)))
        return Array(repeating: total / Double(n), count: n)
    }
}

/// Draft A: a critical admin signal pauses the game and offers the admin section.
enum GameAlertKind: String, Codable, Equatable {
    /// Overview health "critical".
    case health
    /// Errors in the last hour reached the panel's alarm line and grew since the round began.
    case errors
    /// Open reports piling up (hot targets) while playing.
    case reports
}

enum GameAlertRule {
    /// Same line the admin home uses for the red errors row.
    static let errorAlarm = 25
    static let errorGrowth = 10
    static let reportAlarm = 10

    /// The alert to raise for an overview reading, or nil. `baseline*` are the readings at
    /// the start of the round; `already` are the kinds shown this round (never twice).
    static func evaluate(level: String?, errors: Int?, reports: Int?, hot: Int, baselineErrors: Int?, baselineReports: Int?, already: Set<GameAlertKind>) -> GameAlertKind? {
        if level == "critical", !already.contains(.health) { return .health }
        if let e = errors, e >= errorAlarm, e >= (baselineErrors ?? 0) + errorGrowth, !already.contains(.errors) { return .errors }
        if let r = reports, hot > 0, r >= reportAlarm, r > (baselineReports ?? r), !already.contains(.reports) { return .reports }
        return nil
    }

    /// Admin section the alert jumps to (nil = the admin home).
    static func section(_ kind: GameAlertKind) -> String? {
        switch kind {
        case .health, .errors: return "errors"
        case .reports: return "reports"
        }
    }
}
