import Foundation

// Yilankavi: snake on a 14 x 14 grid. Swipes turn (queued, never straight back). Modes:
// walls, wrap-around, and a maze with two inner walls. Three speed levels that also speed
// up every 5 pellets. Golden pellets show up now and then for a few seconds and count triple.

enum SnakeMode: String, Codable, CaseIterable {
    case walls, wrap, maze
}

struct GridPoint: Codable, Hashable {
    var x: Int
    var y: Int
}

enum SnakeDir: String, Codable, CaseIterable {
    case up, down, left, right

    var dx: Int { self == .left ? -1 : (self == .right ? 1 : 0) }
    /// Grid y grows downwards (row 0 at the top).
    var dy: Int { self == .up ? -1 : (self == .down ? 1 : 0) }

    var opposite: SnakeDir {
        switch self {
        case .up: return .down
        case .down: return .up
        case .left: return .right
        case .right: return .left
        }
    }
}

enum SnakeEvent: Equatable {
    case ate, ateGolden, speedUp, died, turned
}

struct SnakeState: Codable, Equatable {
    static let cols = 14
    static let rows = 14
    static let goldenSeconds = 6.0

    var mode: SnakeMode
    var obstacles: Set<GridPoint>
    /// 1 slow, 2 normal, 3 fast (chosen before the round).
    var speedLevel: Int
    /// Head first.
    var body: [GridPoint]
    var dir: SnakeDir = .right
    var queue: [SnakeDir] = []
    var food: GridPoint
    var golden: GridPoint?
    var goldenLeft = 0.0
    var eaten = 0
    var score = 0
    var grow = 0
    var over = false
    var rng: GameRNG

    var wrap: Bool { mode == .wrap }

    /// Two inner walls, clear of the start row and the first pellet.
    static func maze() -> Set<GridPoint> {
        var out = Set<GridPoint>()
        for x in 3...10 {
            out.insert(GridPoint(x: x, y: 3))
            out.insert(GridPoint(x: x, y: 10))
        }
        return out
    }

    init(mode: SnakeMode, speedLevel: Int, seed: UInt64) {
        self.mode = mode
        obstacles = mode == .maze ? SnakeState.maze() : []
        self.speedLevel = GameMath.clamp(speedLevel, 1, 3)
        rng = GameRNG(seed: seed)
        let y = SnakeState.rows / 2
        body = [GridPoint(x: 5, y: y), GridPoint(x: 4, y: y), GridPoint(x: 3, y: y)]
        food = GridPoint(x: 10, y: y)
    }

    /// Seconds per move: level base, 6 % quicker every 5 pellets, never under 70 ms.
    var interval: Double {
        let base: Double = [0.26, 0.19, 0.135][speedLevel - 1]
        return max(0.07, base * pow(0.94, Double(eaten / 5)))
    }

    var head: GridPoint { body[0] }

    /// A swipe. Up to two turns are queued so a quick "up, left" lands both.
    @discardableResult
    mutating func turn(_ d: SnakeDir) -> Bool {
        let last = queue.last ?? dir
        guard d != last, d != last.opposite, queue.count < 2 else { return false }
        queue.append(d)
        return true
    }

    /// One move of the head (the view calls it every `interval`).
    mutating func tick(elapsed: Double = 0) -> [SnakeEvent] {
        guard !over else { return [] }
        var events: [SnakeEvent] = []
        if !queue.isEmpty {
            dir = queue.removeFirst()
            events.append(.turned)
        }
        if golden != nil {
            goldenLeft -= elapsed
            if goldenLeft <= 0 { golden = nil }
        }
        var next = GridPoint(x: head.x + dir.dx, y: head.y + dir.dy)
        if wrap {
            next.x = (next.x + SnakeState.cols) % SnakeState.cols
            next.y = (next.y + SnakeState.rows) % SnakeState.rows
        } else if next.x < 0 || next.y < 0 || next.x >= SnakeState.cols || next.y >= SnakeState.rows {
            over = true
            return events + [.died]
        }
        // The tail moves away this tick unless the snake is growing.
        let tailLeaves = grow == 0
        let blocking = tailLeaves ? body.dropLast() : body[...]
        if blocking.contains(next) || obstacles.contains(next) {
            over = true
            return events + [.died]
        }
        body.insert(next, at: 0)
        if grow > 0 { grow -= 1 } else { body.removeLast() }
        if next == food {
            let before = interval
            eaten += 1
            grow += 1
            score += 10 * speedLevel
            events.append(.ate)
            if interval < before { events.append(.speedUp) }
            food = freeCell() ?? food
            if golden == nil, eaten % 4 == 0, let g = freeCell() {
                golden = g
                goldenLeft = SnakeState.goldenSeconds
            }
        } else if let g = golden, next == g {
            golden = nil
            grow += 2
            score += 30 * speedLevel
            events.append(.ateGolden)
        }
        if body.count >= SnakeState.cols * SnakeState.rows - obstacles.count { over = true }
        return events
    }

    /// A random cell not on the snake or another pellet; nil when the board is full.
    mutating func freeCell() -> GridPoint? {
        let taken = Set(body).union([food]).union(golden.map { [$0] } ?? []).union(obstacles)
        let free = (0..<(SnakeState.cols * SnakeState.rows))
            .map { GridPoint(x: $0 % SnakeState.cols, y: $0 / SnakeState.cols) }
            .filter { !taken.contains($0) }
        guard !free.isEmpty else { return nil }
        return free[rng.int(free.count)]
    }
}
