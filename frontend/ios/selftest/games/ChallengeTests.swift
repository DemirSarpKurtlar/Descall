import Foundation

func testChallenge() {
    // Day numbers and keys.
    var utc = Calendar(identifier: .gregorian)
    utc.timeZone = TimeZone(identifier: "UTC")!
    let d = utc.date(from: DateComponents(year: 2026, month: 11, day: 26, hour: 23, minute: 50))!
    let n = GameDay.number(d, calendar: utc)
    eq(GameDay.key(n), "2026-11-26", "day key")
    eq(GameDay.number(key: "2026-11-26"), n, "key back to day")
    eq(GameDay.number(d.addingTimeInterval(20 * 60), calendar: utc), n + 1, "next day after midnight")
    eq(GameDay.secondsToMidnight(d, calendar: utc), 600, "ten minutes to midnight")
    check(GameDay.number(key: "nope") == nil, "bad key")

    // Daily challenge: stable per day, never the same game two days running, 60 s goals.
    for day in 20_000..<20_060 {
        let a = DailyChallenge.forDay(day), b = DailyChallenge.forDay(day)
        eq(a, b, "stable")
        check(a.game != DailyChallenge.forDay(day + 1).game, "a new game tomorrow")
        check(a.game.modes.contains(a.mode), "challenge mode exists")
        check(a.game != .chess && a.game != .sudoku, "no long games in a minute")
    }
    let c = DailyChallenge.forDay(20_000)
    check(c.isMet(c.target) && !c.isMet(c.target - 1), "goal")
    eq(c.fraction(c.target * 2), 1, "fraction capped")

    // Challenge book: streaks and first completion.
    var book = ChallengeBook()
    check(!book.record(DailyChallenge.forDay(100), progress: 0), "a miss")
    check(book.record(DailyChallenge.forDay(100), progress: 9999), "met")
    check(!book.record(DailyChallenge.forDay(100), progress: 9999), "only the first counts")
    _ = book.record(DailyChallenge.forDay(101), progress: 9999)
    _ = book.record(DailyChallenge.forDay(102), progress: 9999)
    eq(book.streak(today: 102), 3, "three days")
    eq(book.streak(today: 103), 3, "today still open")
    eq(book.streak(today: 104), 0, "broken")
    eq(book.attempts[100], 3, "attempts counted")
    book.prune(today: 300)
    check(book.completed.isEmpty, "old days pruned")

    // Play log: week, streak, merge with the account, upload queue.
    var log = PlayLog()
    log.addTime(125.4, day: 500)
    log.addRound(day: 500, record: true)
    log.addRound(day: 499, record: false)
    log.addTime(40, day: 498)
    let week = log.week(today: 500)
    eq(week.count, 7, "seven days")
    eq(week[6], PlayDay(seconds: 125, rounds: 1, records: 1), "today last")
    eq(log.streak(today: 500), 3, "three days in a row")
    log.merge(remote: [GameDay.key(500): PlayDay(seconds: 60, rounds: 4, records: 0), GameDay.key(497): PlayDay(seconds: 300, rounds: 2, records: 1)])
    eq(log.days[500], PlayDay(seconds: 125, rounds: 4, records: 1), "counters take the larger value")
    eq(log.days[497]?.seconds, 300, "days from the account")
    eq(log.streak(today: 500), 4, "streak with the account's day")
    let pending = log.pending(today: 500)
    check(pending.contains { $0.key == GameDay.key(500) } && !pending.contains { $0.key == GameDay.key(497) }, "only days the watch is ahead on")
    log.markUploaded(pending)
    check(log.pending(today: 500).isEmpty, "uploaded")
    log.addTime(1_000_000, day: 501)
    eq(log.days[501]?.seconds, 86400, "a day holds at most 24 h")
}
