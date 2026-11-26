import Foundation

// "Saate karsi" daily challenge and the play log behind the hub's weekly summary
// (draft A). Pure: day numbers are whole local days, no clock reads except where a
// Date is passed in.

enum GameDay {
    /// Local calendar day as a whole number (days since 1970-01-01 of that local date).
    static func number(_ date: Date, calendar: Calendar = .current) -> Int {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0)!
        guard let d = utc.date(from: DateComponents(year: c.year, month: c.month, day: c.day)) else { return 0 }
        return Int((d.timeIntervalSince1970 / 86400).rounded(.down))
    }

    /// "2026-11-26" for a day number (the API's day key).
    static func key(_ day: Int) -> String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0)!
        let c = utc.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(day) * 86400))
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    static func number(key: String) -> Int? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0)!
        guard let d = utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        return Int((d.timeIntervalSince1970 / 86400).rounded(.down))
    }

    /// Seconds left until local midnight (the challenge card's countdown).
    static func secondsToMidnight(_ now: Date, calendar: Calendar = .current) -> Int {
        guard let next = calendar.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 0), matchingPolicy: .nextTime) else { return 0 }
        return max(0, Int(next.timeIntervalSince(now)))
    }
}

enum ChallengeGoal: String, Codable {
    /// Reach a tile (Katla), pellets eaten (Yilankavi), lines (Blokaj), spires (Isilti),
    /// bricks (Prizma), points won (Raket), boards cleared (Sonar), hands won (Yirmibir).
    case tile, eaten, lines, spires, bricks, points, cleared, hands
}

struct DailyChallenge: Codable, Equatable {
    static let seconds = 60.0

    var day: Int
    var game: GameId
    var mode: String
    var goal: ChallengeGoal
    var target: Int

    /// Games with a 60-second goal. Chess and sudoku need longer than a minute.
    static let pool: [(GameId, String, ChallengeGoal, Int)] = [
        (.merge, "classic", .tile, 512),
        (.snake, "walls", .eaten, 10),
        (.blocks, "sprint", .lines, 6),
        (.runner, "", .spires, 12),
        (.bricks, "", .bricks, 18),
        (.pong, "easy", .points, 4),
        (.mines, "easy", .cleared, 1),
        (.cards, "", .hands, 4),
    ]

    /// The day's challenge; two days in a row never pick the same game (step 5 of 8).
    static func forDay(_ day: Int) -> DailyChallenge {
        let n = pool.count
        let i = ((day * 5 + 3) % n + n) % n
        let p = pool[i]
        return DailyChallenge(day: day, game: p.0, mode: p.1, goal: p.2, target: p.3)
    }

    func isMet(_ progress: Int) -> Bool { progress >= target }

    /// 0 ... 1 for the progress ring.
    func fraction(_ progress: Int) -> Double { GameMath.clamp(Double(progress) / Double(max(1, target)), 0, 1) }
}

/// Days the challenge was met, and the best progress of each day.
struct ChallengeBook: Codable, Equatable {
    var completed: Set<Int> = []
    var best: [Int: Int] = [:]
    var attempts: [Int: Int] = [:]

    /// A finished 60-second attempt. Returns true when it met the goal for the first time today.
    @discardableResult
    mutating func record(_ c: DailyChallenge, progress: Int) -> Bool {
        attempts[c.day, default: 0] += 1
        best[c.day] = max(best[c.day] ?? 0, progress)
        guard c.isMet(progress), !completed.contains(c.day) else { return false }
        completed.insert(c.day)
        return true
    }

    /// Days in a row with the challenge met, ending today (or yesterday while today is open).
    func streak(today: Int) -> Int {
        var d = completed.contains(today) ? today : today - 1
        var n = 0
        while completed.contains(d) {
            n += 1
            d -= 1
        }
        return n
    }

    mutating func prune(today: Int, keep: Int = 60) {
        completed = completed.filter { $0 > today - keep }
        best = best.filter { $0.key > today - keep }
        attempts = attempts.filter { $0.key > today - keep }
    }
}

struct PlayDay: Codable, Equatable {
    var seconds = 0
    var rounds = 0
    var records = 0
}

/// Seconds played, rounds and records per day (weekly summary, 7-day bars, day streak);
/// mirrored to the account through /api/admin/watch-games/scores ("days").
struct PlayLog: Codable, Equatable {
    var days: [Int: PlayDay] = [:]
    var dirty: Set<Int> = []

    mutating func addTime(_ seconds: Double, day: Int) {
        guard seconds > 0 else { return }
        var d = days[day] ?? PlayDay()
        d.seconds = min(86400, d.seconds + Int(seconds.rounded()))
        days[day] = d
        dirty.insert(day)
    }

    mutating func addRound(day: Int, record: Bool) {
        var d = days[day] ?? PlayDay()
        d.rounds += 1
        if record { d.records += 1 }
        days[day] = d
        dirty.insert(day)
    }

    /// Seven days ending today, oldest first (missing days are zero).
    func week(today: Int) -> [PlayDay] { (0..<7).map { days[today - 6 + $0] ?? PlayDay() } }

    /// Days in a row with any play, ending today (or yesterday).
    func streak(today: Int) -> Int {
        let played: (Int) -> Bool = { (days[$0]?.rounds ?? 0) > 0 || (days[$0]?.seconds ?? 0) >= 30 }
        var d = played(today) ? today : today - 1
        var n = 0
        while played(d) {
            n += 1
            d -= 1
        }
        return n
    }

    /// The account's copy: counters only grow, like the server's merge.
    mutating func merge(remote: [String: PlayDay]) {
        for (key, r) in remote {
            guard let day = GameDay.number(key: key) else { continue }
            let l = days[day] ?? PlayDay()
            let m = PlayDay(seconds: max(l.seconds, r.seconds), rounds: max(l.rounds, r.rounds), records: max(l.records, r.records))
            days[day] = m
            if m == r { dirty.remove(day) } else { dirty.insert(day) }
        }
    }

    /// Dirty days of the last 14 for the upload.
    func pending(today: Int) -> [(key: String, day: PlayDay)] {
        dirty.filter { $0 > today - 14 && $0 <= today + 1 }.sorted().compactMap { d in days[d].map { (GameDay.key(d), $0) } }
    }

    mutating func markUploaded(_ sent: [(key: String, day: PlayDay)]) {
        for s in sent {
            guard let d = GameDay.number(key: s.key), days[d] == s.day else { continue }
            dirty.remove(d)
        }
    }

    mutating func prune(today: Int, keep: Int = 60) {
        days = days.filter { $0.key > today - keep }
        dirty = dirty.filter { $0 > today - keep }
    }
}
