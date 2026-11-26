import Foundation

func testCore() {
    // Deterministic random numbers.
    var a = GameRNG(seed: 42), b = GameRNG(seed: 42)
    eq((0..<5).map { _ in a.next() }, (0..<5).map { _ in b.next() }, "rng replays")
    var r = GameRNG(seed: 7)
    check((0..<2000).allSatisfy { _ in let v = r.int(10); return v >= 0 && v < 10 }, "rng int range")
    check((0..<2000).allSatisfy { _ in let v = r.unit(); return v >= 0 && v < 1 }, "rng unit range")
    eq(r.int(1), 0, "int(1)")
    eq(r.int(0), 0, "int(0) never traps")

    // Catalog = backend lib/watchGames.js.
    eq(GameId.allCases.count, 10, "ten games")
    check(GameId(rawValue: "tictactoe") == nil, "no tic-tac-toe")
    eq(GameId.sudoku.direction, .low, "sudoku lower is better")
    eq(GameId.runner.direction, .high, "runner higher is better")
    eq(GameId.chess.modes, ["easy", "normal", "hard"], "chess modes")
    eq(GameId.merge.modes, ["classic", "mini"], "merge boards")
    eq(GameId.runner.modes, [""], "runner single table")
    eq(GameId.chess.defaultMode, "normal", "chess default")
    eq(GameId.snake.defaultMode, "walls", "snake default")
    check(GameId.pong.isAction && GameId.runner.isAction && !GameId.chess.isAction, "action games")

    // Admin only, watch only.
    // Owner only: the never-grantable "games" section, which only the owner's home carries.
    check(!WatchGamesGate.isVisible(adminSections: nil), "members never see games")
    check(!WatchGamesGate.isVisible(adminSections: []), "empty list")
    check(!WatchGamesGate.isVisible(adminSections: ["overview", "reports", "system"]), "other admins do not see games")
    check(WatchGamesGate.isVisible(adminSections: ["overview", "staff", "games"]), "the owner sees games")

    // Best rules.
    eq(GameBest.better(.high, 3, 9), 9, "high max")
    eq(GameBest.better(.low, 0, 50), 50, "low: first finish")
    eq(GameBest.better(.low, 40, 50), 40, "low: min")
    eq(GameBest.better(.low, 40, 0), 40, "low: unfinished never wins")
    check(GameBest.improves(.low, old: 0, new: 80), "first time is a record")
    check(!GameBest.improves(.low, old: 60, new: 0), "zero is not a record")
    check(GameBest.improves(.high, old: 5, new: 6) && !GameBest.improves(.high, old: 6, new: 6), "high records")

    // Score book: local records, merge with the account, upload queue.
    var book = GameScoreBook()
    check(book.record(.runner, mode: "", result: 12), "first runner result is a record")
    check(!book.record(.runner, mode: "", result: 7), "worse result is not")
    check(book.record(.sudoku, mode: "hard", result: 300), "first sudoku time")
    check(book.record(.sudoku, mode: "hard", result: 250), "faster sudoku time")
    eq(book.best(.runner, "")?.best, 12, "runner best")
    eq(book.best(.runner, "")?.plays, 2, "runner plays")
    eq(book.best(.sudoku, "hard")?.best, 250, "sudoku best")
    eq(book.pending().count, 2, "two dirty keys")
    book.merge(remote: [
        GameBest(game: "runner", mode: "", best: 30, plays: 9),
        GameBest(game: "sudoku", mode: "hard", best: 400, plays: 1),
        GameBest(game: "chess", mode: "weird", best: 3, plays: 1),
        GameBest(game: "nope", mode: "", best: 3, plays: 1),
    ])
    eq(book.best(.runner, "")?.best, 30, "account best wins when higher")
    eq(book.best(.runner, "")?.plays, 9, "plays take the larger count")
    eq(book.best(.sudoku, "hard")?.best, 250, "watch time stays when faster")
    check(book.entries["chess:weird"] == nil && book.entries["nope:"] == nil, "unknown rows ignored")
    eq(book.pending().map { $0.key }, ["sudoku:hard"], "only the key where the watch is ahead stays dirty")
    let sent = book.pending()
    book.markUploaded(sent)
    check(book.pending().isEmpty, "uploaded")
    check(book.lastSync != nil, "sync time noted")
    eq(book.totalPlays, 11, "total plays")
    // A result recorded while an upload was in flight stays dirty.
    book.record(.sudoku, mode: "hard", result: 240)
    let inFlight = book.pending()
    book.record(.sudoku, mode: "hard", result: 230)
    book.markUploaded(inFlight)
    eq(book.pending().map { $0.key }, ["sudoku:hard"], "newer result kept for the next upload")
    eq(book.best(.sudoku, "hard")?.best, 230, "newest time kept")

    // Saves are versioned and survive a round trip; garbage starts fresh.
    let save = GameSave(mode: "classic", state: MergeState(seed: 3))
    let back = GameSave<MergeState>.decode(save.encoded())
    eq(back?.state, save.state, "save round trip")
    eq(back?.mode, "classic", "save mode")
    check(GameSave<MergeState>.decode(Data("{\"v\":99}".utf8)) == nil, "other version ignored")
    check(GameSave<MergeState>.decode(nil) == nil, "no save")

    // Frame splitting.
    let steps = GameMath.substeps(0.05)
    check(steps.count >= 6 && abs(steps.reduce(0, +) - 0.05) < 1e-9, "substeps cover the frame")
    check(abs(GameMath.substeps(3).reduce(0, +) - 0.1) < 1e-9, "a long hitch is capped")
    check(GameMath.substeps(0).isEmpty && GameMath.substeps(-1).isEmpty, "no time, no steps")
    eq(GameMath.clock(65), "1:05", "clock")
    eq(GameMath.clock(3725), "1:02:05", "clock hours")
}
