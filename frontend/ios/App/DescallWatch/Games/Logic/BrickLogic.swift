import Foundation

// Prizma: brick breaker with the Digital Crown paddle. Court units 100 x 150, y up.
// Levels come from a small text format (BrickLevel.parse), one string per row:
//   "."  empty          "1" "2" "3"  brick with that many hits
//   "#"  steel (never breaks, not needed to clear the level)
//   "+"  prism brick: one hit, always drops a power-up

enum BrickPower: String, Codable, CaseIterable {
    /// Paddle 50 % wider for a while.
    case wide
    /// Two extra balls.
    case multi
    /// Balls slow down for a while.
    case slow
    /// One more life.
    case life
    /// Balls go through bricks for a while.
    case pierce
    /// The paddle catches the ball; a tap (or 2 s) sends it again.
    case sticky
    /// A glowing floor that saves one fallen ball.
    case shield
}

enum BrickEvent: Equatable {
    case hit, broken, steel, paddle, wall, power(BrickPower), lifeLost, levelCleared, gameOver, launch
}

struct Brick: Codable, Equatable {
    var col: Int
    var row: Int
    /// Hits left; -1 = steel.
    var hp: Int
    var maxHP: Int
    var drops: Bool

    var isSteel: Bool { hp < 0 }
}

enum BrickLevel {
    static let cols = 10
    static let maxRows = 9

    /// Levels in a round: 6 drawn by hand, the rest built from the level number.
    static let count = 40

    /// Hand-drawn levels (original patterns), then generated ones (BrickLevel.generated).
    static let all: [[String]] = [
        ["..........",
         ".11111111.",
         ".12222221.",
         ".11+11+11.",
         ".11111111."],
        ["1.1.1.1.1.",
         ".2.2.2.2.2",
         "1.1+1.1+1.",
         ".2.2.2.2.2",
         "3.3.3.3.3."],
        ["....33....",
         "...3223...",
         "..321+23..",
         ".32111123.",
         "##......##",
         ".1111111.."],
        ["2222222222",
         "#........#",
         "#.+3333+.#",
         "#........#",
         "1111111111"],
        ["+........+",
         ".3......3.",
         "..2.##.2..",
         "...1111...",
         "..2.##.2..",
         ".3......3.",
         "+........+"],
        ["3333333333",
         "2#2#22#2#2",
         "1111++1111",
         "2#2#22#2#2",
         "3333333333",
         ".........."],
    ]

    /// Parses one level. Unknown characters are empty, rows are cut to 10 columns and the
    /// level to 9 rows, so a bad entry can never crash the game.
    static func parse(_ rows: [String]) -> [Brick] {
        var out: [Brick] = []
        for (r, line) in rows.prefix(maxRows).enumerated() {
            for (c, ch) in line.prefix(cols).enumerated() {
                switch ch {
                case "1", "2", "3":
                    let hp = Int(String(ch)) ?? 1
                    out.append(Brick(col: c, row: r, hp: hp, maxHP: hp, drops: false))
                case "+": out.append(Brick(col: c, row: r, hp: 1, maxHP: 1, drops: true))
                case "#": out.append(Brick(col: c, row: r, hp: -1, maxHP: -1, drops: false))
                default: continue
                }
            }
        }
        return out
    }

    /// Level rows for an index (0-based). After level 40 the round starts again, faster.
    static func rows(forLevel index: Int) -> [String] {
        let i = ((index % count) + count) % count
        return i < all.count ? all[i] : generated(i)
    }

    static func bricks(forLevel index: Int) -> [Brick] { parse(rows(forLevel: index)) }

    /// A mirrored pattern from the level number: denser and tougher further in, a few
    /// steel and prism bricks, never an empty level.
    static func generated(_ index: Int) -> [String] {
        var rng = GameRNG(seed: 0xB71C_0000 &+ UInt64(index) &* 7919)
        let rowCount = min(maxRows, 4 + index / 8)
        let density = min(0.85, 0.45 + Double(index) * 0.012)
        var out: [String] = []
        for r in 0..<rowCount {
            var half: [Character] = []
            for _ in 0..<(cols / 2) {
                if !rng.chance(density) { half.append("."); continue }
                let roll = rng.unit()
                if roll < 0.06 + Double(index) * 0.002 { half.append("#") }
                else if roll < 0.14 { half.append("+") }
                else {
                    let hp = 1 + rng.int(min(3, 1 + index / 10))
                    half.append(Character(String(min(3, hp + (r == 0 ? 1 : 0)))))
                }
            }
            out.append(String(half + half.reversed()))
        }
        if !parse(out).contains(where: { !$0.isSteel }) { out[0] = "1111111111" }
        return out
    }
}

struct BrickBall: Codable, Equatable {
    var x: Double
    var y: Double
    var vx: Double
    var vy: Double
}

struct BrickDrop: Codable, Equatable {
    var power: BrickPower
    var x: Double
    var y: Double
}

struct BrickState: Codable, Equatable {
    static let width = 100.0
    static let height = 150.0
    static let paddleY = 8.0
    static let paddleHeight = 3.4
    static let basePaddle = 22.0
    static let ballRadius = 2.2
    static let brickTop = 138.0
    static let brickHeight = 5.0
    static let brickGap = 1.0
    static let powerSeconds = 12.0
    static let dropSpeed = 34.0

    var level = 0
    var bricks: [Brick]
    var balls: [BrickBall] = []
    var drops: [BrickDrop] = []
    var paddleX = BrickState.width / 2
    var paddleTarget = BrickState.width / 2
    var lives = 3
    var score = 0
    /// Bricks broken since the ball last touched the paddle (points multiplier).
    var combo = 0
    var wideLeft = 0.0
    var slowLeft = 0.0
    var pierceLeft = 0.0
    /// Ball resting on the paddle until launched (tap or 2 s).
    var stuck = true
    var stuckFor = 0.0
    var stickyLeft = 0.0
    var shield = false
    /// Where on the paddle a caught ball rests (offset from the centre).
    var stuckOffset = 0.0
    var bricksBroken = 0
    var powersCaught = 0
    var over = false
    var rng: GameRNG

    init(seed: UInt64, level: Int = 0) {
        rng = GameRNG(seed: seed)
        self.level = level
        bricks = BrickLevel.bricks(forLevel: level)
    }

    var paddleWidth: Double { BrickState.basePaddle * (wideLeft > 0 ? 1.5 : 1) }
    var brickWidth: Double { (BrickState.width - BrickState.brickGap * Double(BrickLevel.cols + 1)) / Double(BrickLevel.cols) }
    /// Ball speed for this level (faster after every cleared round of levels).
    var baseSpeed: Double { 70 + Double(min(level, 30)) * 1.6 }
    var remaining: Int { bricks.filter { !$0.isSteel }.count }

    func rect(of b: Brick) -> (x: Double, y: Double, w: Double, h: Double) {
        let w = brickWidth
        let x = BrickState.brickGap + Double(b.col) * (w + BrickState.brickGap)
        let y = BrickState.brickTop - Double(b.row) * (BrickState.brickHeight + BrickState.brickGap) - BrickState.brickHeight
        return (x, y, w, BrickState.brickHeight)
    }

    mutating func setPaddle(fraction: Double) {
        let half = paddleWidth / 2
        paddleTarget = GameMath.clamp(half + (BrickState.width - 2 * half) * fraction, half, BrickState.width - half)
    }

    mutating func launch() -> Bool {
        guard stuck, !over else { return false }
        stuck = false
        let angle = rng.range(-0.5, 0.5)
        if balls.isEmpty {
            balls = [BrickBall(x: paddleX, y: restY, vx: baseSpeed * sin(angle), vy: baseSpeed * cos(angle))]
        } else {
            // A caught ball leaves at the angle of where it rests on the paddle.
            let a = GameMath.clamp(stuckOffset / (paddleWidth / 2), -1, 1) * 1.05
            for i in balls.indices {
                balls[i].x = paddleX + stuckOffset
                balls[i].y = restY
                balls[i].vx = baseSpeed * sin(a)
                balls[i].vy = baseSpeed * cos(a)
            }
        }
        stuckOffset = 0
        return true
    }

    private var restY: Double { BrickState.paddleY + BrickState.paddleHeight / 2 + BrickState.ballRadius + 0.2 }

    mutating func step(_ dt: Double) -> [BrickEvent] {
        var events: [BrickEvent] = []
        guard !over else { return events }
        for h in GameMath.substeps(dt) {
            stepOnce(h, &events)
            if over { break }
        }
        return events
    }

    private mutating func stepOnce(_ dt: Double, _ events: inout [BrickEvent]) {
        let half = paddleWidth / 2
        let maxStep = 240 * dt
        paddleX = GameMath.clamp(paddleX + GameMath.clamp(paddleTarget - paddleX, -maxStep, maxStep), half, BrickState.width - half)
        wideLeft = max(0, wideLeft - dt)
        slowLeft = max(0, slowLeft - dt)
        pierceLeft = max(0, pierceLeft - dt)
        stickyLeft = max(0, stickyLeft - dt)
        if stuck {
            for i in balls.indices {
                balls[i].x = paddleX + stuckOffset
                balls[i].y = restY
            }
            stuckFor += dt
            if stuckFor >= 2.0, launch() { events.append(.launch) }
            return
        }
        let speedScale = slowLeft > 0 ? 0.65 : 1
        var kept: [BrickBall] = []
        for var ball in balls {
            moveBall(&ball, dt * speedScale, &events)
            if ball.y < BrickState.ballRadius, ball.vy < 0, shield {
                shield = false
                ball.vy = abs(ball.vy)
                ball.y = BrickState.ballRadius
                events.append(.wall)
            }
            if ball.y > -BrickState.ballRadius * 2 { kept.append(ball) }
            if stuck { break }
        }
        if stuck {
            // Sticky paddle caught a ball: keep just that one waiting on the paddle.
            balls = kept.isEmpty ? [] : [kept[kept.count - 1]]
            moveDrops(dt, &events)
            return
        }
        balls = kept
        moveDrops(dt, &events)
        if remaining == 0 {
            events.append(.levelCleared)
            nextLevel()
            return
        }
        if balls.isEmpty {
            lives -= 1
            combo = 0
            drops = []
            wideLeft = 0
            slowLeft = 0
            pierceLeft = 0
            stickyLeft = 0
            if lives <= 0 {
                over = true
                events.append(.gameOver)
            } else {
                events.append(.lifeLost)
                stuck = true
                stuckFor = 0
            }
        }
    }

    private mutating func moveBall(_ ball: inout BrickBall, _ dt: Double, _ events: inout [BrickEvent]) {
        let r = BrickState.ballRadius
        let prevY = ball.y
        ball.x += ball.vx * dt
        ball.y += ball.vy * dt
        if ball.x < r { ball.x = 2 * r - ball.x; ball.vx = abs(ball.vx); events.append(.wall) }
        if ball.x > BrickState.width - r { ball.x = 2 * (BrickState.width - r) - ball.x; ball.vx = -abs(ball.vx); events.append(.wall) }
        if ball.y > BrickState.height - r { ball.y = 2 * (BrickState.height - r) - ball.y; ball.vy = -abs(ball.vy); events.append(.wall) }
        // Paddle: angle from where it hits, like the court's own physics.
        let top = BrickState.paddleY + BrickState.paddleHeight / 2 + r
        if ball.vy < 0, prevY >= top, ball.y < top, abs(ball.x - paddleX) <= paddleWidth / 2 + r {
            let offset = GameMath.clamp((ball.x - paddleX) / (paddleWidth / 2), -1, 1)
            let speed = max(baseSpeed, (ball.vx * ball.vx + ball.vy * ball.vy).squareRoot())
            let angle = offset * 1.05
            ball.vx = speed * sin(angle)
            ball.vy = speed * cos(angle)
            ball.y = top + (top - ball.y)
            combo = 0
            events.append(.paddle)
            if stickyLeft > 0 {
                stuck = true
                stuckFor = 0
                stuckOffset = ball.x - paddleX
                return
            }
        }
        collideBricks(&ball, &events)
    }

    private mutating func collideBricks(_ ball: inout BrickBall, _ events: inout [BrickEvent]) {
        let r = BrickState.ballRadius
        for i in bricks.indices {
            let b = rect(of: bricks[i])
            let cx = GameMath.clamp(ball.x, b.x, b.x + b.w)
            let cy = GameMath.clamp(ball.y, b.y, b.y + b.h)
            let dx = ball.x - cx, dy = ball.y - cy
            guard dx * dx + dy * dy <= r * r else { continue }
            let piercing = pierceLeft > 0 && !bricks[i].isSteel
            if !piercing {
                // Reflect on the side with the smallest overlap.
                let overlapX = min(ball.x + r - b.x, b.x + b.w - (ball.x - r))
                let overlapY = min(ball.y + r - b.y, b.y + b.h - (ball.y - r))
                if overlapX < overlapY {
                    ball.vx = ball.x < b.x + b.w / 2 ? -abs(ball.vx) : abs(ball.vx)
                    ball.x += ball.vx < 0 ? -overlapX : overlapX
                } else {
                    ball.vy = ball.y < b.y + b.h / 2 ? -abs(ball.vy) : abs(ball.vy)
                    ball.y += ball.vy < 0 ? -overlapY : overlapY
                }
            }
            if bricks[i].isSteel {
                events.append(.steel)
                return
            }
            bricks[i].hp -= piercing ? bricks[i].hp : 1
            if bricks[i].hp <= 0 {
                combo += 1
                score += (50 + level * 10) * min(combo, 5)
                let brick = bricks.remove(at: i)
                bricksBroken += 1
                events.append(.broken)
                if brick.drops || rng.chance(0.11) {
                    let power = BrickPower.allCases[rng.int(BrickPower.allCases.count)]
                    drops.append(BrickDrop(power: power, x: b.x + b.w / 2, y: b.y))
                }
            } else {
                score += 10
                events.append(.hit)
            }
            return
        }
    }

    private mutating func moveDrops(_ dt: Double, _ events: inout [BrickEvent]) {
        var kept: [BrickDrop] = []
        for var d in drops {
            d.y -= BrickState.dropSpeed * dt
            let caught = d.y <= BrickState.paddleY + BrickState.paddleHeight && d.y >= BrickState.paddleY - 3 && abs(d.x - paddleX) <= paddleWidth / 2 + 2
            if caught {
                apply(d.power)
                events.append(.power(d.power))
            } else if d.y > -4 {
                kept.append(d)
            }
        }
        drops = kept
    }

    mutating func apply(_ power: BrickPower) {
        score += 25
        powersCaught += 1
        switch power {
        case .sticky: stickyLeft = BrickState.powerSeconds
        case .shield: shield = true
        case .wide: wideLeft = BrickState.powerSeconds
        case .slow: slowLeft = BrickState.powerSeconds
        case .pierce: pierceLeft = BrickState.powerSeconds * 0.6
        case .life: lives = min(9, lives + 1)
        case .multi:
            guard let lead = balls.first, balls.count < 6 else { return }
            let speed = max(baseSpeed, (lead.vx * lead.vx + lead.vy * lead.vy).squareRoot())
            for a in [-0.6, 0.6] {
                balls.append(BrickBall(x: lead.x, y: lead.y, vx: speed * sin(a), vy: abs(speed * cos(a))))
            }
        }
    }

    private mutating func nextLevel() {
        level += 1
        bricks = BrickLevel.bricks(forLevel: level)
        balls = []
        drops = []
        combo = 0
        stuck = true
        stuckFor = 0
        score += 500
    }
}
