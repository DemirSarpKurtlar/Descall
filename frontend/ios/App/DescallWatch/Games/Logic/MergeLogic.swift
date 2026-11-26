import Foundation

// Katla: slide the board (4 x 4 classic or 3 x 3 mini), equal tiles fuse into their sum.
// Cells hold the exponent (0 empty, 1 = 2, 2 = 4, ... 11 = 2048). Rules: a tile fuses at
// most once per move, fusing starts from the side the board slides towards, a move that
// changes nothing does not spawn. Three undos per game.

enum MergeDir: String, Codable, CaseIterable {
    case up, down, left, right
}

struct MergeMove: Equatable {
    var moved: Bool
    var gained: Int
    /// Cell indexes (row * 4 + col) where a fusion happened this move.
    var merged: [Int]
    var spawned: Int?
}

struct MergeBoard: Codable, Equatable {
    var cells: [Int]
    var score: Int
}

struct MergeState: Codable, Equatable {
    static let maxUndo = 3

    /// Side length: 4 classic, 3 mini.
    var size: Int
    var cells: [Int]
    var score = 0
    var history: [MergeBoard] = []
    var undosUsed = 0
    var moves = 0
    var won = false
    /// The player kept going after reaching 2048.
    var continued = false
    var rng: GameRNG

    init(seed: UInt64, size: Int = 4) {
        rng = GameRNG(seed: seed)
        self.size = size == 3 ? 3 : 4
        cells = Array(repeating: 0, count: self.size * self.size)
        _ = spawn()
        _ = spawn()
    }

    /// Test helper: a given board, no spawns.
    init(cells: [Int], seed: UInt64 = 1) {
        rng = GameRNG(seed: seed)
        size = cells.count == 9 ? 3 : 4
        self.cells = cells
    }

    static func value(_ exponent: Int) -> Int { exponent == 0 ? 0 : 1 << exponent }

    var maxTile: Int { MergeState.value(cells.max() ?? 0) }

    /// Slides one line towards index 0. Returns the new line and the points gained.
    static func slide(_ line: [Int]) -> (line: [Int], gained: Int, mergedAt: [Int]) {
        let tiles = line.filter { $0 != 0 }
        var out: [Int] = []
        var gained = 0
        var mergedAt: [Int] = []
        var i = 0
        while i < tiles.count {
            if i + 1 < tiles.count, tiles[i] == tiles[i + 1] {
                let e = tiles[i] + 1
                out.append(e)
                gained += value(e)
                mergedAt.append(out.count - 1)
                i += 2
            } else {
                out.append(tiles[i])
                i += 1
            }
        }
        while out.count < line.count { out.append(0) }
        return (out, gained, mergedAt)
    }

    /// Cell indexes of one line, ordered from the side the board slides towards.
    static func lineIndexes(_ dir: MergeDir, _ n: Int, size s: Int = 4) -> [Int] {
        switch dir {
        case .left: return (0..<s).map { n * s + $0 }
        case .right: return (0..<s).map { n * s + (s - 1 - $0) }
        case .up: return (0..<s).map { $0 * s + n }
        case .down: return (0..<s).map { (s - 1 - $0) * s + n }
        }
    }

    /// The board after a slide, without changing the state (for hints and game over).
    func preview(_ dir: MergeDir) -> (cells: [Int], gained: Int, merged: [Int]) {
        var next = cells
        var gained = 0
        var merged: [Int] = []
        for n in 0..<size {
            let idx = MergeState.lineIndexes(dir, n, size: size)
            let r = MergeState.slide(idx.map { cells[$0] })
            for (k, cell) in idx.enumerated() { next[cell] = r.line[k] }
            gained += r.gained
            merged += r.mergedAt.map { idx[$0] }
        }
        return (next, gained, merged)
    }

    mutating func move(_ dir: MergeDir) -> MergeMove {
        let r = preview(dir)
        guard r.cells != cells else { return MergeMove(moved: false, gained: 0, merged: [], spawned: nil) }
        history.append(MergeBoard(cells: cells, score: score))
        if history.count > MergeState.maxUndo { history.removeFirst() }
        moves += 1
        cells = r.cells
        score += r.gained
        if !won, (cells.max() ?? 0) >= winExponent { won = true }
        let spawned = spawn()
        return MergeMove(moved: true, gained: r.gained, merged: r.merged, spawned: spawned)
    }

    /// A 2 (90 %) or a 4 (10 %) on a random empty cell.
    @discardableResult
    mutating func spawn() -> Int? {
        let empty = cells.indices.filter { cells[$0] == 0 }
        guard !empty.isEmpty else { return nil }
        let at = empty[rng.int(empty.count)]
        cells[at] = rng.chance(0.9) ? 1 : 2
        return at
    }

    /// 2048 on the classic board, 256 on the mini board.
    var winExponent: Int { size == 3 ? 8 : 11 }

    var undosLeft: Int { max(0, MergeState.maxUndo - undosUsed) }
    var canUndo: Bool { !history.isEmpty && undosLeft > 0 }

    mutating func undo() -> Bool {
        guard canUndo, let last = history.popLast() else { return false }
        cells = last.cells
        score = last.score
        undosUsed += 1
        return true
    }

    var canMove: Bool { MergeDir.allCases.contains { preview($0).cells != cells } }
    var isOver: Bool { !canMove }
}
