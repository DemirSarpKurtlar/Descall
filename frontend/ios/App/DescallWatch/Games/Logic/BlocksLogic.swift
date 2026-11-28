import Foundation

// Blokaj: falling blocks. Marathon (levels without end) or sprint (two minutes). 10 x 22 board (the top 2 rows are hidden spawn rows), seven
// four-cell pieces from a shuffled bag of seven, rotation with wall kicks, hold (once per
// piece), ghost piece, lock delay, line clears with combos, a level every 10 lines.
// Grid y grows downwards.

enum BlockKind: Int, Codable, CaseIterable {
    case i = 1, o, t, s, z, j, l

    /// Box size the piece rotates in.
    var box: Int { self == .i ? 4 : (self == .o ? 2 : 3) }

    /// Spawn shape (rotation 0) as (x, y) inside the box.
    var spawnCells: [GridPoint] {
        let p: [(Int, Int)]
        switch self {
        case .i: p = [(0, 1), (1, 1), (2, 1), (3, 1)]
        case .o: p = [(0, 0), (1, 0), (0, 1), (1, 1)]
        case .t: p = [(1, 0), (0, 1), (1, 1), (2, 1)]
        case .s: p = [(1, 0), (2, 0), (0, 1), (1, 1)]
        case .z: p = [(0, 0), (1, 0), (1, 1), (2, 1)]
        case .j: p = [(0, 0), (0, 1), (1, 1), (2, 1)]
        case .l: p = [(2, 0), (0, 1), (1, 1), (2, 1)]
        }
        return p.map { GridPoint(x: $0.0, y: $0.1) }
    }

    /// Cells for a rotation (0 spawn, 1 right, 2 flipped, 3 left): quarter turns clockwise
    /// inside the box, so every piece turns around its own centre.
    func cells(rotation: Int) -> [GridPoint] {
        var cells = spawnCells
        let n = box
        for _ in 0..<((rotation % 4 + 4) % 4) {
            cells = cells.map { GridPoint(x: n - 1 - $0.y, y: $0.x) }
        }
        return cells.sorted { ($0.y, $0.x) < ($1.y, $1.x) }
    }
}

enum BlocksEvent: Equatable {
    case moved, rotated, softDrop, hardDrop(cells: Int), locked, cleared(rows: [Int]), levelUp(Int), held, gameOver, timeUp
}

struct ActivePiece: Codable, Equatable {
    var kind: BlockKind
    var rotation = 0
    /// Box top-left on the board.
    var x: Int
    var y: Int

    var cells: [GridPoint] { kind.cells(rotation: rotation).map { GridPoint(x: x + $0.x, y: y + $0.y) } }
}

struct BlocksState: Codable, Equatable {
    static let cols = 10
    static let rows = 22
    static let hiddenRows = 2
    static let lockDelay = 0.5
    static let maxLockResets = 15

    /// Row-major, 0 = empty, else BlockKind raw value.
    var board: [Int]
    var piece: ActivePiece
    var hold: BlockKind?
    var holdUsed = false
    var queue: [BlockKind] = []
    var score = 0
    var lines = 0
    var level = 1
    var combo = -1
    var fallTimer = 0.0
    var lockTimer = 0.0
    var lockResets = 0
    var over = false
    /// Sprint: the round ends after this many seconds (nil = marathon).
    var timeLimit: Double?
    var elapsed = 0.0
    var rng: GameRNG

    static let sprintSeconds = 120.0

    var timeLeft: Double? { timeLimit.map { max(0, $0 - elapsed) } }

    init(seed: UInt64, startLevel: Int = 1, sprint: Bool = false) {
        timeLimit = sprint ? BlocksState.sprintSeconds : nil
        rng = GameRNG(seed: seed)
        board = Array(repeating: 0, count: BlocksState.cols * BlocksState.rows)
        level = max(1, startLevel)
        piece = ActivePiece(kind: .t, x: 3, y: 0)
        refill()
        piece = spawnPiece(queue.removeFirst())
        refill()
    }

    // MARK: Board

    func cell(_ x: Int, _ y: Int) -> Int {
        guard x >= 0, x < BlocksState.cols, y >= 0, y < BlocksState.rows else { return -1 }
        return board[y * BlocksState.cols + x]
    }

    func fits(_ p: ActivePiece) -> Bool { p.cells.allSatisfy { cell($0.x, $0.y) == 0 } }

    /// Gravity in seconds per row (guideline curve), never under 50 ms.
    var gravity: Double { max(0.05, pow(0.8 - Double(level - 1) * 0.007, Double(level - 1))) }

    var ghost: ActivePiece {
        var g = piece
        while true {
            var down = g
            down.y += 1
            if !fits(down) { return g }
            g = down
        }
    }

    var next: [BlockKind] { Array(queue.prefix(3)) }

    private mutating func refill() {
        while queue.count < 7 {
            var bag = BlockKind.allCases
            bag.shuffle(using: &rng)
            queue += bag
        }
    }

    private func spawnPiece(_ kind: BlockKind) -> ActivePiece {
        ActivePiece(kind: kind, x: kind == .o ? 4 : 3, y: kind == .i ? 0 : 1)
    }

    // MARK: Input

    private var grounded: Bool {
        var down = piece
        down.y += 1
        return !fits(down)
    }

    private mutating func touchedLock() {
        if grounded, lockResets < BlocksState.maxLockResets {
            lockTimer = 0
            lockResets += 1
        }
    }

    @discardableResult
    mutating func move(_ dx: Int) -> Bool {
        guard !over else { return false }
        var p = piece
        p.x += dx
        guard fits(p) else { return false }
        piece = p
        touchedLock()
        return true
    }

    /// SRS kick offsets for a rotation from `from` to `to`, (x right, y down).
    static func kicks(_ kind: BlockKind, from: Int, to: Int) -> [GridPoint] {
        if kind == .o { return [GridPoint(x: 0, y: 0)] }
        let up: [(Int, Int)]
        switch (kind == .i, from, to) {
        case (false, 0, 1), (false, 2, 1): up = [(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)]
        case (false, 1, 0), (false, 1, 2): up = [(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)]
        case (false, 2, 3), (false, 0, 3): up = [(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)]
        case (false, 3, 2), (false, 3, 0): up = [(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)]
        case (true, 0, 1), (true, 3, 2): up = [(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)]
        case (true, 1, 0), (true, 2, 3): up = [(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)]
        case (true, 1, 2), (true, 0, 3): up = [(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)]
        case (true, 2, 1), (true, 3, 0): up = [(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)]
        default: up = [(0, 0)]
        }
        // The published table counts y upwards; the board counts it downwards.
        return up.map { GridPoint(x: $0.0, y: -$0.1) }
    }

    @discardableResult
    mutating func rotate(clockwise: Bool) -> Bool {
        guard !over else { return false }
        let from = piece.rotation
        let to = (from + (clockwise ? 1 : 3)) % 4
        for k in BlocksState.kicks(piece.kind, from: from, to: to) {
            var p = piece
            p.rotation = to
            p.x += k.x
            p.y += k.y
            if fits(p) {
                piece = p
                touchedLock()
                return true
            }
        }
        return false
    }

    /// One row down now (1 point).
    mutating func softDrop() -> [BlocksEvent] {
        guard !over else { return [] }
        var p = piece
        p.y += 1
        if fits(p) {
            piece = p
            score += 1
            fallTimer = 0
            return [.softDrop]
        }
        return lock()
    }

    /// Straight down and lock (2 points per row).
    mutating func hardDrop() -> [BlocksEvent] {
        guard !over else { return [] }
        let g = ghost
        let rows = g.y - piece.y
        piece = g
        score += rows * 2
        return [.hardDrop(cells: rows)] + lock()
    }

    /// Swap with the held piece, once per piece. Empty when not allowed; `.gameOver` when the
    /// piece that comes in has no room (it used to end the round without an event, so the
    /// game froze with no result screen).
    @discardableResult
    mutating func holdPiece() -> [BlocksEvent] {
        guard !over, !holdUsed else { return [] }
        let current = piece.kind
        if let h = hold {
            piece = spawnPiece(h)
        } else {
            piece = spawnPiece(queue.removeFirst())
            refill()
        }
        hold = current
        holdUsed = true
        fallTimer = 0
        lockTimer = 0
        lockResets = 0
        guard fits(piece) else {
            over = true
            return [.held, .gameOver]
        }
        return [.held]
    }

    // MARK: Time

    mutating func update(_ dt: Double) -> [BlocksEvent] {
        guard !over else { return [] }
        elapsed += dt
        if let limit = timeLimit, elapsed >= limit {
            over = true
            return [.timeUp]
        }
        if grounded {
            lockTimer += dt
            if lockTimer >= BlocksState.lockDelay { return lock() }
            return []
        }
        fallTimer += dt
        while fallTimer >= gravity, !grounded {
            fallTimer -= gravity
            piece.y += 1
        }
        if grounded { fallTimer = 0 }
        return []
    }

    // MARK: Lock and clear

    private mutating func lock() -> [BlocksEvent] {
        var events: [BlocksEvent] = [.locked]
        for c in piece.cells where c.y >= 0 && c.y < BlocksState.rows && c.x >= 0 && c.x < BlocksState.cols {
            board[c.y * BlocksState.cols + c.x] = piece.kind.rawValue
        }
        // Locked fully inside the hidden rows: the stack reached the top.
        let toppedOut = piece.cells.allSatisfy { $0.y < BlocksState.hiddenRows }
        let full = fullRows()
        if !full.isEmpty {
            clear(full)
            let base = [0, 100, 300, 500, 800][min(full.count, 4)]
            combo += 1
            score += base * level + (combo > 0 ? 50 * combo * level : 0)
            let before = level
            lines += full.count
            level = max(level, 1 + lines / 10)
            events.append(.cleared(rows: full))
            if level > before { events.append(.levelUp(level)) }
        } else {
            combo = -1
        }
        piece = spawnPiece(queue.removeFirst())
        refill()
        holdUsed = false
        fallTimer = 0
        lockTimer = 0
        lockResets = 0
        if toppedOut || !fits(piece) {
            over = true
            events.append(.gameOver)
        }
        return events
    }

    func fullRows() -> [Int] {
        (0..<BlocksState.rows).filter { y in (0..<BlocksState.cols).allSatisfy { board[y * BlocksState.cols + $0] != 0 } }
    }

    /// Removes the rows and drops everything above them.
    mutating func clear(_ rows: [Int]) {
        let remove = Set(rows)
        var kept: [[Int]] = []
        for y in 0..<BlocksState.rows where !remove.contains(y) {
            kept.append(Array(board[(y * BlocksState.cols)..<((y + 1) * BlocksState.cols)]))
        }
        let empty = Array(repeating: Array(repeating: 0, count: BlocksState.cols), count: rows.count)
        board = (empty + kept).flatMap { $0 }
    }

    /// Test helper: put cells on the board.
    mutating func fill(row y: Int, except holes: Set<Int> = [], kind: Int = 1) {
        for x in 0..<BlocksState.cols where !holes.contains(x) { board[y * BlocksState.cols + x] = kind }
    }
}
