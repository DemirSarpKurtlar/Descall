import Foundation

func testChess() {
    // Move generation against the standard perft counts.
    let start = ChessPosition()
    eq(start.perft(1), 20, "start perft 1")
    eq(start.perft(2), 400, "start perft 2")
    eq(start.perft(3), 8902, "start perft 3")
    let kiwipete = ChessPosition(fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1")!
    eq(kiwipete.perft(1), 48, "kiwipete perft 1 (castling, pins)")
    eq(kiwipete.perft(2), 2039, "kiwipete perft 2")
    let pos3 = ChessPosition(fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1")!
    eq(pos3.perft(1), 14, "position 3 perft 1")
    eq(pos3.perft(2), 191, "position 3 perft 2")
    eq(pos3.perft(3), 2812, "position 3 perft 3 (en passant, discovered checks)")
    let pos4 = ChessPosition(fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1")!
    eq(pos4.perft(1), 6, "position 4 perft 1 (in check)")
    eq(pos4.perft(2), 264, "position 4 perft 2 (promotions)")
    let pos5 = ChessPosition(fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8")!
    eq(pos5.perft(1), 44, "position 5 perft 1")
    eq(pos5.perft(2), 1486, "position 5 perft 2")

    // make / unmake restores everything.
    var round = kiwipete
    for m in kiwipete.legalMoves() {
        let u = round.make(m)
        round.unmake(u)
        check(round == kiwipete, "make/unmake \(m.uci)")
    }

    // Castling: both sides allowed, then not through an attacked square.
    let castle = ChessPosition(fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")!
    let cm = castle.legalMoves().map { $0.uci }
    check(cm.contains("e1g1") && cm.contains("e1c1"), "both castles")
    let blocked = ChessPosition(fen: "r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1")!
    let bm = blocked.legalMoves().map { $0.uci }
    check(!bm.contains("e1g1") && bm.contains("e1c1"), "no castling through an attacked f1")
    let inCheck = ChessPosition(fen: "r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1")!
    check(!inCheck.legalMoves().contains { $0.flag == 3 }, "no castling out of check")
    var afterCastle = castle
    afterCastle.make(castle.move(uci: "e1g1")!)
    eq(afterCastle.board[5], ChessPiece.rook, "rook jumped to f1")
    eq(afterCastle.board[7], 0, "h1 empty")
    eq(afterCastle.castling & 3, 0, "white lost both rights")

    // En passant: capture removes the passed pawn.
    let ep = ChessPosition(fen: "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3")!
    guard let epMove = ep.move(uci: "e5f6") else { check(false, "en passant move exists"); return }
    eq(epMove.flag, 2, "flagged en passant")
    var afterEp = ep
    afterEp.make(epMove)
    eq(afterEp.board[ChessPosition.square("f5")!], 0, "passed pawn removed")
    eq(ep.san(epMove), "exf6", "en passant notation")
    check(ep.move(uci: "e5d6") == nil, "only the pawn that just moved can be taken en passant")

    // Promotion: four choices.
    let promo = ChessPosition(fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1")!
    eq(promo.legalMoves().filter { $0.from == ChessPosition.square("a7")! }.count, 4, "four promotions")
    eq(promo.san(promo.move(uci: "a7a8q")!), "a8=Q", "promotion notation")

    // Mate and stalemate detection.
    var fool = ChessGame()
    for u in ["f2f3", "e7e5", "g2g4", "d8h4"] {
        guard let m = fool.position.move(uci: u) else { check(false, "fool's mate move \(u)"); return }
        fool.play(m)
    }
    eq(fool.result, .blackMates, "fool's mate")
    eq(fool.sans.last, "Qh4#", "mate notation")
    check(fool.playerLost && !fool.playerWon, "the white player lost")
    let stale = ChessPosition(fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")!
    check(stale.legalMoves().isEmpty && !stale.inCheck, "stalemate position")
    eq(ChessGame.judge(stale, [stale.key]), .stalemate, "stalemate result")
    let bare = ChessPosition(fen: "8/8/4k3/8/8/2KB4/8/8 w - - 0 1")!
    eq(ChessGame.judge(bare, [bare.key]), .material, "king and bishop cannot mate")
    let fifty = ChessPosition(fen: "8/8/4k3/8/8/2KR4/8/8 w - - 100 80")!
    eq(ChessGame.judge(fifty, [fifty.key]), .fiftyMoves, "fifty-move rule")

    // Threefold repetition by shuffling knights.
    var rep = ChessGame()
    for u in ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"] { rep.play(rep.position.move(uci: u)!) }
    eq(rep.result, .repetition, "threefold repetition")

    // Take back restores the player's turn.
    var tb = ChessGame()
    tb.play(tb.position.move(uci: "e2e4")!)
    tb.play(tb.position.move(uci: "e7e5")!)
    check(tb.takeBack(), "take back")
    eq(tb.moves.count, 0, "both moves taken back")
    check(tb.playerToMove, "player to move again")
    var resign = ChessGame()
    resign.resign()
    check(resign.playerLost && resign.result == .resigned, "resign")

    // Disambiguation.
    let knights = ChessPosition(fen: "4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1")!
    eq(knights.san(knights.move(uci: "b1d2")!), "Nbd2", "file disambiguation")

    // Engine: finds mate in one, takes free material, stays inside its time box.
    let backRank = ChessPosition(fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1")!
    var rng = GameRNG(seed: 1)
    for strength in [ChessStrength.normal, .hard] {
        let m = ChessEngine(backRank).bestMove(strength, rng: &rng)
        eq(m?.uci, "a1a8", "\(strength) finds the back-rank mate")
    }
    let hanging = ChessPosition(fen: "4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1")!
    eq(ChessEngine(hanging).bestMove(.normal, rng: &rng)?.uci, "d2d5", "takes a free queen")
    for strength in ChessStrength.allCases {
        let t0 = Date()
        let m = ChessEngine(kiwipete).bestMove(strength, rng: &rng)
        let took = Date().timeIntervalSince(t0)
        check(m != nil && kiwipete.legalMoves().contains(m!), "\(strength) returns a legal move")
        check(took < strength.seconds + 0.8, "\(strength) time box (\(took) s)")
    }
    // Easy still plays a legal move from every position of a short game.
    var game = ChessGame(playerWhite: true)
    var r2 = GameRNG(seed: 3)
    for _ in 0..<16 where game.result == .ongoing {
        guard let m = ChessEngine(game.position).bestMove(.easy, rng: &r2) else { break }
        check(game.play(m), "easy move is legal")
    }
    check(ChessEngine(stale).bestMove(.hard, rng: &rng) == nil, "no move in stalemate")
    let cancel = ChessEngine(start, cancelled: { true }).bestMove(.hard, rng: &rng)
    check(cancel != nil, "a cancelled search still returns a move")
    check(abs(ChessGame().evaluationForWhite) < 1, "start position is about even")
}

