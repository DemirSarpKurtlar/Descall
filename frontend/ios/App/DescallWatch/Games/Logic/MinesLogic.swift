import Foundation

// Sonar Sweep: the mine sweeper genre. Mines are placed on the first tap, never on that
// cell or its neighbours, so the first tap always opens an area. Long press flags, a tap
// on an opened number whose flags are complete opens its neighbours (chord).

enum MinesLevel: String, Codable, CaseIterable {
    case easy, medium, hard

    var cols: Int { self == .easy ? 8 : (self == .medium ? 10 : 12) }
    var rows: Int { self == .easy ? 8 : (self == .medium ? 12 : 14) }
    var mines: Int { self == .easy ? 9 : (self == .medium ? 18 : 30) }
}

enum MinesCell: Codable, Equatable {
    case hidden, flagged, open
}

enum MinesEvent: Equatable {
    case opened(Int), flagged, unflagged, boom, won, nothing
}

struct MinesState: Codable, Equatable {
    var level: MinesLevel
    var cols: Int
    var rows: Int
    var mineCount: Int
    /// Empty until the first tap.
    var mines: Set<Int> = []
    var cells: [MinesCell]
    var placed = false
    var lost = false
    var won = false
    var explodedAt: Int?
    var elapsed = 0.0
    var rng: GameRNG

    init(level: MinesLevel, seed: UInt64) {
        self.level = level
        cols = level.cols
        rows = level.rows
        mineCount = level.mines
        cells = Array(repeating: .hidden, count: level.cols * level.rows)
        rng = GameRNG(seed: seed)
    }

    var over: Bool { lost || won }
    var flags: Int { cells.filter { $0 == .flagged }.count }
    var minesLeft: Int { mineCount - flags }

    func index(_ x: Int, _ y: Int) -> Int { y * cols + x }

    func neighbours(_ i: Int) -> [Int] {
        let x = i % cols, y = i / cols
        var out: [Int] = []
        for dy in -1...1 {
            for dx in -1...1 where dx != 0 || dy != 0 {
                let nx = x + dx, ny = y + dy
                if nx >= 0, ny >= 0, nx < cols, ny < rows { out.append(index(nx, ny)) }
            }
        }
        return out
    }

    func count(_ i: Int) -> Int { neighbours(i).filter { mines.contains($0) }.count }

    /// Mines anywhere except the first cell and (when the board has room) its neighbours.
    mutating func place(avoiding first: Int) {
        var banned = Set([first])
        let around = neighbours(first)
        if cols * rows - mineCount >= around.count + 1 { banned.formUnion(around) }
        var pool = (0..<(cols * rows)).filter { !banned.contains($0) }
        pool.shuffle(using: &rng)
        mines = Set(pool.prefix(mineCount))
        placed = true
    }

    /// Tap. Opens a hidden cell (flood fill on zeros) or chords an opened number.
    mutating func reveal(_ i: Int) -> MinesEvent {
        guard !over, i >= 0, i < cells.count else { return .nothing }
        if !placed { place(avoiding: i) }
        switch cells[i] {
        case .flagged: return .nothing
        case .open: return chord(i)
        case .hidden:
            if mines.contains(i) { return explode(i) }
            let n = flood(i)
            return checkWin() ? .won : .opened(n)
        }
    }

    /// Long press: flag or unflag a hidden cell.
    mutating func toggleFlag(_ i: Int) -> MinesEvent {
        guard !over, i >= 0, i < cells.count else { return .nothing }
        switch cells[i] {
        case .hidden: cells[i] = .flagged; return .flagged
        case .flagged: cells[i] = .hidden; return .unflagged
        case .open: return .nothing
        }
    }

    private mutating func chord(_ i: Int) -> MinesEvent {
        let around = neighbours(i)
        guard around.filter({ cells[$0] == .flagged }).count == count(i) else { return .nothing }
        var opened = 0
        for n in around where cells[n] == .hidden {
            if mines.contains(n) { return explode(n) }
            opened += flood(n)
        }
        if checkWin() { return .won }
        return opened > 0 ? .opened(opened) : .nothing
    }

    private mutating func flood(_ start: Int) -> Int {
        var stack = [start]
        var opened = 0
        while let i = stack.popLast() {
            guard cells[i] == .hidden, !mines.contains(i) else { continue }
            cells[i] = .open
            opened += 1
            if count(i) == 0 { stack += neighbours(i).filter { cells[$0] == .hidden } }
        }
        return opened
    }

    private mutating func explode(_ i: Int) -> MinesEvent {
        lost = true
        explodedAt = i
        for m in mines where cells[m] != .flagged { cells[m] = .open }
        return .boom
    }

    private mutating func checkWin() -> Bool {
        let hiddenSafe = cells.indices.contains { cells[$0] != .open && !mines.contains($0) }
        guard !hiddenSafe else { return false }
        won = true
        for m in mines { cells[m] = .flagged }
        return true
    }

    /// Whole seconds for the score (lower is better).
    var seconds: Int { max(1, Int(elapsed.rounded(.up))) }
}
