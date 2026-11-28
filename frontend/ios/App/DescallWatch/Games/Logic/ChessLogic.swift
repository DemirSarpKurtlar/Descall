import Foundation

// Hamle: chess against the watch, full rules and a small engine that stays quick on a watch.
// Squares 0 ... 63, a1 = 0, h1 = 7, a8 = 56 (file = sq % 8, rank = sq / 8).
// Pieces: 0 empty, 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king; white > 0, black < 0.
// Rules: legal move generation (pins, checks, castling through / out of check, en passant,
// promotion to any piece), checkmate, stalemate, fifty-move rule, threefold repetition and
// insufficient material. Engine: negamax alpha-beta, iterative deepening inside a time box,
// quiescence on captures, MVV-LVA + killer ordering.

enum ChessPiece {
    static let pawn = 1, knight = 2, bishop = 3, rook = 4, queen = 5, king = 6
    static let value = [0, 100, 320, 330, 500, 900, 0]
    static let letters: [Character] = [" ", "P", "N", "B", "R", "Q", "K"]
}

struct ChessMove: Codable, Hashable {
    var from: Int
    var to: Int
    /// Piece type a pawn becomes (2 ... 5), 0 otherwise.
    var promo: Int = 0
    /// 0 normal, 1 double pawn push, 2 en passant, 3 castle.
    var flag: Int = 0

    var uci: String {
        let f = ChessPosition.squareName(from) + ChessPosition.squareName(to)
        return promo == 0 ? f : f + String(ChessPiece.letters[promo]).lowercased()
    }
}

struct ChessUndo {
    var move: ChessMove
    var captured: Int
    var castling: Int
    var ep: Int
    var halfmove: Int
}

struct ChessPosition: Codable, Equatable {
    var board: [Int]
    var whiteToMove = true
    /// K = 1, Q = 2, k = 4, q = 8.
    var castling = 15
    /// En passant target square, -1 = none.
    var ep = -1
    var halfmove = 0
    var fullmove = 1
    var kings = [4, 60]

    static let startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    init() { self.init(fen: ChessPosition.startFEN)! }

    init?(fen: String) {
        let parts = fen.split(separator: " ").map(String.init)
        guard parts.count >= 2 else { return nil }
        var b = [Int](repeating: 0, count: 64)
        let ranks = parts[0].split(separator: "/")
        guard ranks.count == 8 else { return nil }
        for (i, rankText) in ranks.enumerated() {
            let rank = 7 - i
            var file = 0
            for ch in rankText {
                if let n = ch.wholeNumberValue {
                    file += n
                    continue
                }
                guard file < 8, let t = ChessPiece.letters.firstIndex(of: Character(ch.uppercased())), t > 0 else { return nil }
                b[rank * 8 + file] = ch.isUppercase ? t : -t
                file += 1
            }
            guard file == 8 else { return nil }
        }
        board = b
        whiteToMove = parts[1] == "w"
        castling = 0
        if parts.count > 2 {
            for ch in parts[2] {
                switch ch {
                case "K": castling |= 1
                case "Q": castling |= 2
                case "k": castling |= 4
                case "q": castling |= 8
                default: break
                }
            }
        }
        ep = parts.count > 3 ? ChessPosition.square(parts[3]) ?? -1 : -1
        halfmove = parts.count > 4 ? Int(parts[4]) ?? 0 : 0
        fullmove = parts.count > 5 ? Int(parts[5]) ?? 1 : 1
        guard let wk = b.firstIndex(of: 6), let bk = b.firstIndex(of: -6) else { return nil }
        kings = [wk, bk]
    }

    static func squareName(_ sq: Int) -> String {
        let files = Array("abcdefgh")
        return "\(files[sq % 8])\(sq / 8 + 1)"
    }

    static func square(_ name: String) -> Int? {
        let chars = Array(name)
        guard chars.count == 2, let f = "abcdefgh".firstIndex(of: chars[0]), let r = chars[1].wholeNumberValue, (1...8).contains(r) else { return nil }
        return (r - 1) * 8 + "abcdefgh".distance(from: "abcdefgh".startIndex, to: f)
    }

    // MARK: Tables

    static let knightTargets: [[Int]] = (0..<64).map { sq in
        let f = sq % 8, r = sq / 8
        return [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]
            .map { (f + $0.0, r + $0.1) }
            .filter { $0.0 >= 0 && $0.0 < 8 && $0.1 >= 0 && $0.1 < 8 }
            .map { $0.1 * 8 + $0.0 }
    }

    static let kingTargets: [[Int]] = (0..<64).map { sq in
        let f = sq % 8, r = sq / 8
        var out: [Int] = []
        for dr in -1...1 {
            for df in -1...1 where df != 0 || dr != 0 {
                let nf = f + df, nr = r + dr
                if nf >= 0, nf < 8, nr >= 0, nr < 8 { out.append(nr * 8 + nf) }
            }
        }
        return out
    }

    /// Directions 0 ... 3 straight (rook), 4 ... 7 diagonal (bishop).
    static let directions: [(Int, Int)] = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]

    /// rays[sq][dir]: squares from sq outwards to the edge.
    static let rays: [[[Int]]] = (0..<64).map { sq in
        directions.map { d in
            var out: [Int] = []
            var f = sq % 8 + d.0, r = sq / 8 + d.1
            while f >= 0, f < 8, r >= 0, r < 8 {
                out.append(r * 8 + f)
                f += d.0
                r += d.1
            }
            return out
        }
    }

    /// Castling rights kept after a move touches a square (rook or king squares).
    static let castleKeep: [Int] = (0..<64).map { sq in
        switch sq {
        case 0: return 15 & ~2
        case 4: return 15 & ~3
        case 7: return 15 & ~1
        case 56: return 15 & ~8
        case 60: return 15 & ~12
        case 63: return 15 & ~4
        default: return 15
        }
    }

    // MARK: Attacks

    /// Is `sq` attacked by white (`byWhite`) or black?
    func attacked(_ sq: Int, byWhite: Bool) -> Bool {
        let s = byWhite ? 1 : -1
        let f = sq % 8, r = sq / 8
        // Pawns attack diagonally forwards, so look one rank behind the square.
        let pr = r - s
        if pr >= 0, pr < 8 {
            if f > 0, board[pr * 8 + f - 1] == s * ChessPiece.pawn { return true }
            if f < 7, board[pr * 8 + f + 1] == s * ChessPiece.pawn { return true }
        }
        for t in ChessPosition.knightTargets[sq] where board[t] == s * ChessPiece.knight { return true }
        for t in ChessPosition.kingTargets[sq] where board[t] == s * ChessPiece.king { return true }
        for d in 0..<8 {
            for t in ChessPosition.rays[sq][d] {
                let p = board[t]
                if p == 0 { continue }
                if p * s > 0 {
                    let type = abs(p)
                    if type == ChessPiece.queen || (d < 4 ? type == ChessPiece.rook : type == ChessPiece.bishop) { return true }
                }
                break
            }
        }
        return false
    }

    var inCheck: Bool { attacked(kings[whiteToMove ? 0 : 1], byWhite: !whiteToMove) }

    // MARK: Move generation

    /// Moves that follow piece rules but may leave the own king in check.
    func pseudoMoves(capturesOnly: Bool = false) -> [ChessMove] {
        var out: [ChessMove] = []
        out.reserveCapacity(48)
        let s = whiteToMove ? 1 : -1
        for sq in 0..<64 {
            let p = board[sq]
            guard p * s > 0 else { continue }
            switch abs(p) {
            case ChessPiece.pawn: pawnMoves(sq, s, capturesOnly, &out)
            case ChessPiece.knight:
                for t in ChessPosition.knightTargets[sq] where board[t] * s <= 0 && (!capturesOnly || board[t] != 0) {
                    out.append(ChessMove(from: sq, to: t))
                }
            case ChessPiece.king:
                for t in ChessPosition.kingTargets[sq] where board[t] * s <= 0 && (!capturesOnly || board[t] != 0) {
                    out.append(ChessMove(from: sq, to: t))
                }
                if !capturesOnly { castleMoves(sq, s, &out) }
            default:
                let type = abs(p)
                let dirs = type == ChessPiece.rook ? 0..<4 : (type == ChessPiece.bishop ? 4..<8 : 0..<8)
                for d in dirs {
                    for t in ChessPosition.rays[sq][d] {
                        let q = board[t]
                        if q == 0 {
                            if !capturesOnly { out.append(ChessMove(from: sq, to: t)) }
                            continue
                        }
                        if q * s < 0 { out.append(ChessMove(from: sq, to: t)) }
                        break
                    }
                }
            }
        }
        return out
    }

    private func pawnMoves(_ sq: Int, _ s: Int, _ capturesOnly: Bool, _ out: inout [ChessMove]) {
        let f = sq % 8, r = sq / 8
        let forward = sq + 8 * s
        let lastRank = s > 0 ? 7 : 0
        let startRank = s > 0 ? 1 : 6
        func add(_ to: Int, _ flag: Int = 0) {
            if to / 8 == lastRank {
                for promo in [ChessPiece.queen, ChessPiece.knight, ChessPiece.rook, ChessPiece.bishop] {
                    out.append(ChessMove(from: sq, to: to, promo: promo, flag: flag))
                }
            } else {
                out.append(ChessMove(from: sq, to: to, flag: flag))
            }
        }
        guard forward >= 0, forward < 64 else { return }
        if board[forward] == 0 {
            // Promotions count as "captures" for quiescence (they change the material).
            if !capturesOnly || forward / 8 == lastRank { add(forward) }
            let double = sq + 16 * s
            if !capturesOnly, r == startRank, board[double] == 0 { out.append(ChessMove(from: sq, to: double, flag: 1)) }
        }
        for df in [-1, 1] {
            let nf = f + df
            guard nf >= 0, nf < 8 else { continue }
            let t = forward + df
            if board[t] * s < 0 { add(t) } else if t == ep { out.append(ChessMove(from: sq, to: t, flag: 2)) }
        }
    }

    private func castleMoves(_ sq: Int, _ s: Int, _ out: inout [ChessMove]) {
        let home = s > 0 ? 4 : 60
        guard sq == home else { return }
        let kingSide = s > 0 ? 1 : 4
        let queenSide = s > 0 ? 2 : 8
        let enemyWhite = s < 0
        if castling & kingSide != 0, board[home + 1] == 0, board[home + 2] == 0, board[home + 3] == s * ChessPiece.rook,
           !attacked(home, byWhite: enemyWhite), !attacked(home + 1, byWhite: enemyWhite), !attacked(home + 2, byWhite: enemyWhite) {
            out.append(ChessMove(from: home, to: home + 2, flag: 3))
        }
        if castling & queenSide != 0, board[home - 1] == 0, board[home - 2] == 0, board[home - 3] == 0, board[home - 4] == s * ChessPiece.rook,
           !attacked(home, byWhite: enemyWhite), !attacked(home - 1, byWhite: enemyWhite), !attacked(home - 2, byWhite: enemyWhite) {
            out.append(ChessMove(from: home, to: home - 2, flag: 3))
        }
    }

    /// Only the moves that do not leave the own king in check.
    func legalMoves() -> [ChessMove] {
        var copy = self
        return pseudoMoves().filter { m in
            let u = copy.make(m)
            let ok = !copy.attacked(copy.kings[copy.whiteToMove ? 1 : 0], byWhite: copy.whiteToMove)
            copy.unmake(u)
            return ok
        }
    }

    // MARK: Make / unmake

    @discardableResult
    mutating func make(_ m: ChessMove) -> ChessUndo {
        let s = whiteToMove ? 1 : -1
        let piece = board[m.from]
        var captured = board[m.to]
        let undo = ChessUndo(move: m, captured: captured, castling: castling, ep: ep, halfmove: halfmove)
        board[m.to] = m.promo != 0 ? m.promo * s : piece
        board[m.from] = 0
        if m.flag == 2 {
            let victim = m.to - 8 * s
            captured = board[victim]
            board[victim] = 0
        } else if m.flag == 3 {
            if m.to > m.from {
                board[m.from + 1] = board[m.from + 3]
                board[m.from + 3] = 0
            } else {
                board[m.from - 1] = board[m.from - 4]
                board[m.from - 4] = 0
            }
        }
        if abs(piece) == ChessPiece.king { kings[s > 0 ? 0 : 1] = m.to }
        castling &= ChessPosition.castleKeep[m.from] & ChessPosition.castleKeep[m.to]
        ep = m.flag == 1 ? (m.from + m.to) / 2 : -1
        halfmove = (abs(piece) == ChessPiece.pawn || captured != 0) ? 0 : halfmove + 1
        if s < 0 { fullmove += 1 }
        whiteToMove.toggle()
        return undo
    }

    mutating func unmake(_ u: ChessUndo) {
        whiteToMove.toggle()
        let s = whiteToMove ? 1 : -1
        let m = u.move
        let moved = m.promo != 0 ? ChessPiece.pawn * s : board[m.to]
        board[m.from] = moved
        board[m.to] = u.captured
        if m.flag == 2 {
            board[m.to - 8 * s] = -ChessPiece.pawn * s
        } else if m.flag == 3 {
            if m.to > m.from {
                board[m.from + 3] = board[m.from + 1]
                board[m.from + 1] = 0
            } else {
                board[m.from - 4] = board[m.from - 1]
                board[m.from - 1] = 0
            }
        }
        if abs(moved) == ChessPiece.king { kings[s > 0 ? 0 : 1] = m.from }
        castling = u.castling
        ep = u.ep
        halfmove = u.halfmove
        if s < 0 { fullmove -= 1 }
    }

    // MARK: Draws and keys

    /// K v K, K + minor v K, K + B v K + B with bishops on one colour.
    var insufficientMaterial: Bool {
        var minors: [(Int, Int)] = []
        for sq in 0..<64 {
            let t = abs(board[sq])
            switch t {
            case 0, ChessPiece.king: continue
            case ChessPiece.knight, ChessPiece.bishop: minors.append((t, sq))
            default: return false
            }
        }
        if minors.count <= 1 { return true }
        if minors.allSatisfy({ $0.0 == ChessPiece.bishop }) {
            let colours = Set(minors.map { ($0.1 % 8 + $0.1 / 8) % 2 })
            return colours.count == 1
        }
        return false
    }

    /// Repetition key (FNV-1a over board, side, castling, en passant); stable across launches.
    var key: UInt64 {
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        func mix(_ v: Int) {
            h ^= UInt64(bitPattern: Int64(v))
            h = h &* 0x0000_0100_0000_01B3
        }
        for p in board { mix(p) }
        mix(whiteToMove ? 1 : 0)
        mix(castling)
        mix(ep)
        return h
    }

    // MARK: Notation

    /// Standard algebraic notation for a legal move ("Nbd7", "exd6", "O-O", "e8=Q+", "Qh4#").
    func san(_ m: ChessMove) -> String {
        let piece = abs(board[m.from])
        var out = ""
        if m.flag == 3 {
            out = m.to > m.from ? "O-O" : "O-O-O"
        } else {
            let capture = board[m.to] != 0 || m.flag == 2
            if piece == ChessPiece.pawn {
                if capture { out += String(ChessPosition.squareName(m.from).prefix(1)) + "x" }
                out += ChessPosition.squareName(m.to)
                if m.promo != 0 { out += "=" + String(ChessPiece.letters[m.promo]) }
            } else {
                out += String(ChessPiece.letters[piece])
                let rivals = legalMoves().filter { $0.to == m.to && $0.from != m.from && abs(board[$0.from]) == piece }
                if !rivals.isEmpty {
                    let name = ChessPosition.squareName(m.from)
                    if !rivals.contains(where: { $0.from % 8 == m.from % 8 }) {
                        out += String(name.prefix(1))
                    } else if !rivals.contains(where: { $0.from / 8 == m.from / 8 }) {
                        out += String(name.suffix(1))
                    } else {
                        out += name
                    }
                }
                if capture { out += "x" }
                out += ChessPosition.squareName(m.to)
            }
        }
        var after = self
        after.make(m)
        if after.inCheck { out += after.legalMoves().isEmpty ? "#" : "+" }
        return out
    }

    /// Leaf counts for move generation tests.
    func perft(_ depth: Int) -> Int {
        guard depth > 0 else { return 1 }
        let moves = legalMoves()
        if depth == 1 { return moves.count }
        var copy = self
        var n = 0
        for m in moves {
            let u = copy.make(m)
            n += copy.perft(depth - 1)
            copy.unmake(u)
        }
        return n
    }

    func move(uci: String) -> ChessMove? { legalMoves().first { $0.uci == uci } }
}

// MARK: - Game

enum ChessResult: String, Codable {
    case ongoing, whiteMates, blackMates, stalemate, fiftyMoves, repetition, material, resigned
}

/// One game against the engine: the position, the moves so far, repetition keys, result.
struct ChessGame: Codable, Equatable {
    var position = ChessPosition()
    var playerWhite = true
    var moves: [ChessMove] = []
    var sans: [String] = []
    var keys: [UInt64] = []
    var result: ChessResult = .ongoing
    var captured: [Int] = []

    init(playerWhite: Bool = true) {
        self.playerWhite = playerWhite
        keys = [position.key]
    }

    var playerToMove: Bool { result == .ongoing && position.whiteToMove == playerWhite }
    var lastMove: ChessMove? { moves.last }

    @discardableResult
    mutating func play(_ m: ChessMove) -> Bool {
        guard result == .ongoing, position.legalMoves().contains(m) else { return false }
        sans.append(position.san(m))
        let target = m.flag == 2 ? m.to - (position.whiteToMove ? 8 : -8) : m.to
        if position.board[target] != 0 { captured.append(position.board[target]) }
        position.make(m)
        moves.append(m)
        keys.append(position.key)
        result = ChessGame.judge(position, keys)
        return true
    }

    static func judge(_ p: ChessPosition, _ keys: [UInt64]) -> ChessResult {
        if p.legalMoves().isEmpty {
            if p.inCheck { return p.whiteToMove ? .blackMates : .whiteMates }
            return .stalemate
        }
        if p.halfmove >= 100 { return .fiftyMoves }
        if let last = keys.last, keys.filter({ $0 == last }).count >= 3 { return .repetition }
        if p.insufficientMaterial { return .material }
        return .ongoing
    }

    /// Takes back the last full move (the engine's reply and the player's move).
    mutating func takeBack() -> Bool {
        // The player's turn: take back the engine's reply too. The engine's turn: one move.
        // Playing black with only the engine's opening move on the board there is nothing of
        // the player's to take back (taking that move alone left the engine to move and
        // nobody thinking, so the game stood still).
        let count: Int
        if engineToMove {
            count = moves.isEmpty ? 0 : 1
        } else {
            count = moves.count >= 2 ? 2 : 0
        }
        guard count > 0 else { return false }
        let keep = Array(moves.dropLast(count))
        var replay = ChessGame(playerWhite: playerWhite)
        for m in keep { replay.play(m) }
        self = replay
        return true
    }

    private var engineToMove: Bool { position.whiteToMove != playerWhite }

    /// The player gives up (the UI asks first).
    mutating func resign() {
        guard result == .ongoing else { return }
        result = .resigned
    }

    var isDraw: Bool { [.stalemate, .fiftyMoves, .repetition, .material].contains(result) }

    /// Material and position from white's side in pawns (for the evaluation bar).
    var evaluationForWhite: Double {
        let s = Double(ChessEngine.evaluate(position)) / 100
        return position.whiteToMove ? s : -s
    }

    var playerWon: Bool {
        (result == .whiteMates && playerWhite) || (result == .blackMates && !playerWhite)
    }
    var playerLost: Bool {
        result == .resigned || (result == .whiteMates && !playerWhite) || (result == .blackMates && playerWhite)
    }
}

// MARK: - Engine

enum ChessStrength: String, Codable, CaseIterable {
    case easy, normal, hard

    var maxDepth: Int { self == .easy ? 2 : (self == .normal ? 4 : 8) }
    /// Thinking time box in seconds.
    var seconds: Double { self == .easy ? 0.35 : (self == .normal ? 0.9 : 2.0) }
}

final class ChessEngine {
    static let mate = 100_000
    private var pos: ChessPosition
    private var nodes = 0
    private var deadline = Date.distantFuture
    private var stopped = false
    private var killers = [[ChessMove?]](repeating: [nil, nil], count: 64)
    private let cancelled: () -> Bool
    private(set) var reachedDepth = 0

    init(_ position: ChessPosition, cancelled: @escaping () -> Bool = { false }) {
        pos = position
        self.cancelled = cancelled
    }

    // Piece-square bonuses (white's view, a1 = 0), built from simple shapes: centre pull for
    // minor pieces, pawns gain as they advance, rooks like the 7th rank, kings hide early
    // and centralise late.
    static let pst: [[Int]] = {
        var t = [[Int]](repeating: [Int](repeating: 0, count: 64), count: 7)
        for sq in 0..<64 {
            let f = Double(sq % 8), r = Double(sq / 8)
            let centre = max(abs(f - 3.5), abs(r - 3.5))  // 0.5 centre ... 3.5 edge
            let pull = Int((3.5 - centre) * 10)            // 0 ... 30
            let fileCentre = 3.5 - abs(f - 3.5)              // 0.5 ... 3.5
            t[1][sq] = sq / 8 == 0 || sq / 8 == 7 ? 0 : Int(r - 1) * 8 + (r >= 3 ? Int(fileCentre * 4) : 0) - ((f == 3 || f == 4) && r == 1 ? 10 : 0)
            t[2][sq] = pull * 2 - 30
            t[3][sq] = pull - 10
            t[4][sq] = (r == 6 ? 20 : 0) + (f == 3 || f == 4 ? 5 : 0)
            t[5][sq] = pull / 2 - 5
            t[6][sq] = r == 0 ? (f == 1 || f == 2 || f == 6 ? 20 : (f == 3 || f == 4 ? 0 : 5)) : -Int(r) * 12
        }
        return t
    }()

    static let kingEnd: [Int] = (0..<64).map { sq in
        let f = Double(sq % 8), r = Double(sq / 8)
        return Int((3.5 - max(abs(f - 3.5), abs(r - 3.5))) * 14) - 20
    }

    /// Static score from the side to move's view.
    static func evaluate(_ p: ChessPosition) -> Int {
        var score = 0
        var heavy = 0
        var bishops = [0, 0]
        for sq in 0..<64 {
            let pc = p.board[sq]
            guard pc != 0 else { continue }
            let t = abs(pc)
            if t == ChessPiece.queen { heavy += 2 } else if t == ChessPiece.rook || t == ChessPiece.bishop || t == ChessPiece.knight { heavy += 1 }
            if t == ChessPiece.bishop { bishops[pc > 0 ? 0 : 1] += 1 }
        }
        let endgame = heavy <= 4
        for sq in 0..<64 {
            let pc = p.board[sq]
            guard pc != 0 else { continue }
            let t = abs(pc)
            let view = pc > 0 ? sq : sq ^ 56
            let pstScore = t == ChessPiece.king && endgame ? kingEnd[view] : pst[t][view]
            let v = ChessPiece.value[t] + pstScore
            score += pc > 0 ? v : -v
        }
        if bishops[0] >= 2 { score += 30 }
        if bishops[1] >= 2 { score -= 30 }
        return p.whiteToMove ? score : -score
    }

    private func timeUp() -> Bool {
        if stopped { return true }
        nodes += 1
        if nodes & 1023 == 0, Date() >= deadline || cancelled() { stopped = true }
        return stopped
    }

    private func order(_ moves: [ChessMove], best: ChessMove?, ply: Int) -> [ChessMove] {
        let k = ply < killers.count ? killers[ply] : [nil, nil]
        return moves.map { m -> (ChessMove, Int) in
            var s = 0
            if m == best { s = 1_000_000 }
            let victim = abs(pos.board[m.to])
            if victim != 0 || m.flag == 2 {
                s += 10_000 + ChessPiece.value[max(victim, 1)] * 10 - ChessPiece.value[abs(pos.board[m.from])] / 10
            }
            if m.promo != 0 { s += 9_000 + ChessPiece.value[m.promo] }
            if m == k[0] { s += 800 } else if m == k[1] { s += 700 }
            return (m, s)
        }
        .sorted { $0.1 > $1.1 }
        .map { $0.0 }
    }

    private func quiesce(_ alphaIn: Int, _ beta: Int, _ ply: Int) -> Int {
        if timeUp() { return 0 }
        var alpha = alphaIn
        let stand = ChessEngine.evaluate(pos)
        if stand >= beta { return beta }
        if stand > alpha { alpha = stand }
        if ply > 40 { return alpha }
        for m in order(pos.pseudoMoves(capturesOnly: true), best: nil, ply: min(ply, 63)) {
            let u = pos.make(m)
            if pos.attacked(pos.kings[pos.whiteToMove ? 1 : 0], byWhite: pos.whiteToMove) {
                pos.unmake(u)
                continue
            }
            let score = -quiesce(-beta, -alpha, ply + 1)
            pos.unmake(u)
            if stopped { return 0 }
            if score >= beta { return beta }
            if score > alpha { alpha = score }
        }
        return alpha
    }

    private func search(_ depth: Int, _ alphaIn: Int, _ beta: Int, _ ply: Int) -> Int {
        if timeUp() { return 0 }
        if depth <= 0 { return quiesce(alphaIn, beta, ply) }
        if ply > 0, pos.halfmove >= 100 { return 0 }
        var alpha = alphaIn
        let checked = pos.inCheck
        // Check extension: a forcing line is not cut off one move short.
        let d = checked ? depth + 1 : depth
        var any = false
        for m in order(pos.pseudoMoves(), best: nil, ply: min(ply, 63)) {
            let u = pos.make(m)
            if pos.attacked(pos.kings[pos.whiteToMove ? 1 : 0], byWhite: pos.whiteToMove) {
                pos.unmake(u)
                continue
            }
            any = true
            let score = -search(d - 1, -beta, -alpha, ply + 1)
            pos.unmake(u)
            if stopped { return 0 }
            if score >= beta {
                if pos.board[m.to] == 0, m.promo == 0, ply < killers.count, killers[ply][0] != m {
                    killers[ply][1] = killers[ply][0]
                    killers[ply][0] = m
                }
                return beta
            }
            if score > alpha { alpha = score }
        }
        if !any { return checked ? -ChessEngine.mate + ply : 0 }
        return alpha
    }

    /// Root scores with a full window (each move's own value), used by the easy level.
    private func rootScores(_ moves: [ChessMove], depth: Int) -> [(ChessMove, Int)] {
        var out: [(ChessMove, Int)] = []
        for m in moves {
            let u = pos.make(m)
            let s = -search(depth - 1, -ChessEngine.mate - 1, ChessEngine.mate + 1, 1)
            pos.unmake(u)
            if stopped { break }
            out.append((m, s))
        }
        return out
    }

    /// The engine's move: iterative deepening until the depth cap or the time box ends.
    /// Always returns a legal move while one exists, even when time is already up.
    func bestMove(_ strength: ChessStrength, rng: inout GameRNG, now: Date = Date()) -> ChessMove? {
        let legal = pos.legalMoves()
        guard !legal.isEmpty else { return nil }
        if legal.count == 1 { return legal[0] }
        deadline = now.addingTimeInterval(strength.seconds)
        stopped = false
        nodes = 0
        if strength == .easy {
            // A real but forgiving opponent: any move within 90 centipawns of the best.
            let scored = rootScores(legal, depth: strength.maxDepth)
            guard let top = scored.map({ $0.1 }).max() else { return legal[rng.int(legal.count)] }
            if top >= ChessEngine.mate - 100 { return scored.first { $0.1 == top }?.0 }
            let near = scored.filter { $0.1 >= top - 90 }.map { $0.0 }
            return near.isEmpty ? legal[0] : near[rng.int(near.count)]
        }
        var best = order(legal, best: nil, ply: 0)[0]
        for depth in 1...strength.maxDepth {
            var alpha = -ChessEngine.mate - 1
            var iterationBest: ChessMove?
            for m in order(legal, best: best, ply: 0) {
                let u = pos.make(m)
                let score = -search(depth - 1, -ChessEngine.mate - 1, -alpha, 1)
                pos.unmake(u)
                if stopped { break }
                if score > alpha || iterationBest == nil {
                    alpha = score
                    iterationBest = m
                }
            }
            // A cut-short iteration only holds moves that were searched to the end.
            if let ib = iterationBest { best = ib }
            if stopped { break }
            reachedDepth = depth
            if alpha >= ChessEngine.mate - 100 { break }
        }
        return best
    }
}
