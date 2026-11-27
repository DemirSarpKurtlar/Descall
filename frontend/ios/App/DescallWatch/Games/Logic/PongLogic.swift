import Foundation

// Raket: ping pong against the watch. Court units (not points): `width` along the
// paddles, `height` between them. The player's paddle is at y = 0 and the AI's at
// y = height. The scene lays the table across the portrait screen (draft A): the player's
// paddle on the right next to the Digital Crown, which slides it up and down, the AI's
// on the left. A tap just before a return is a smash. The scene only draws this state.

enum PongLevel: String, Codable, CaseIterable {
    case easy, normal, hard

    /// Seconds between two looks at the ball (reaction delay).
    var reaction: Double {
        switch self {
        case .easy: return 0.30
        case .normal: return 0.17
        case .hard: return 0.08
        }
    }

    /// Largest aim error in court units, drawn again on every hit.
    var aimError: Double {
        switch self {
        case .easy: return 17
        case .normal: return 9
        case .hard: return 4
        }
    }

    /// Paddle top speed (court units per second).
    var maxSpeed: Double {
        switch self {
        case .easy: return 66
        case .normal: return 98
        case .hard: return 140
        }
    }

    /// How much of the ball's curve the AI foresees (0 = none, 1 = all).
    var spinRead: Double {
        switch self {
        case .easy: return 0
        case .normal: return 0.5
        case .hard: return 0.9
        }
    }
}

enum PongEvent: Equatable {
    case playerHit(strength: Double)
    case smash
    case aiHit
    case wall
    case pointPlayer
    case pointAI
    case won
    case lost
    case serve
}

struct PongState: Codable, Equatable {
    static let width = 120.0
    static let height = 100.0
    static let paddleWidth = 28.0
    static let paddleHeight = 3.6
    static let paddleInset = 7.0
    static let ballRadius = 2.6
    static let startSpeed = 56.0
    static let maxBallSpeed = 135.0
    static let playerMaxSpeed = 300.0
    static let winScore = 11
    /// Seconds a smash tap stays armed.
    static let smashWindow = 0.3
    /// Share of the speed that always goes up or down after a hit.
    static let minVertical = 0.42

    var level: PongLevel
    var ballX = PongState.width / 2
    var ballY = PongState.height / 2
    var vx = 0.0
    var vy = 0.0
    /// Curve on the ball from a moving paddle (court units per second squared, scaled).
    var spin = 0.0
    var playerX = PongState.width / 2
    var playerVX = 0.0
    var playerTarget = PongState.width / 2
    var aiX = PongState.width / 2
    var aiVX = 0.0
    var aiTarget = PongState.width / 2
    var aiLookIn = 0.0
    var aiError = 0.0
    var playerScore = 0
    var aiScore = 0
    /// Seconds until the next serve (ball waits in the middle).
    var serveIn = 1.0
    /// Next serve goes towards the player (true) or the AI.
    var serveToPlayer = true
    var rally = 0
    var longestRally = 0
    var smashArmed = 0.0
    var smashes = 0
    var over = false
    var rng: GameRNG

    init(level: PongLevel, seed: UInt64) {
        self.level = level
        rng = GameRNG(seed: seed)
    }

    static var playerY: Double { paddleInset }
    static var aiY: Double { height - paddleInset }
    static var minX: Double { paddleWidth / 2 }
    static var maxX: Double { width - paddleWidth / 2 }

    var ballSpeed: Double { (vx * vx + vy * vy).squareRoot() }

    /// Crown position (0 ... 1 across the court) for the player's paddle.
    mutating func setPlayer(fraction: Double) {
        playerTarget = GameMath.clamp(PongState.minX + (PongState.maxX - PongState.minX) * fraction, PongState.minX, PongState.maxX)
    }

    /// A tap: the next return within `smashWindow` goes back a third faster.
    mutating func smash() { smashArmed = PongState.smashWindow }

    mutating func step(_ dt: Double) -> [PongEvent] {
        var events: [PongEvent] = []
        for h in GameMath.substeps(dt) { stepOnce(h, &events) }
        return events
    }

    private mutating func stepOnce(_ dt: Double, _ events: inout [PongEvent]) {
        guard !over else { return }
        smashArmed = max(0, smashArmed - dt)
        movePlayer(dt)
        moveAI(dt)
        if serveIn > 0 {
            serveIn -= dt
            if serveIn <= 0 { serve(); events.append(.serve) }
            return
        }
        let prevY = ballY
        // Spin bends the flight sideways and wears off.
        vx += spin * dt
        spin *= exp(-0.9 * dt)
        let sp = ballSpeed
        if sp > PongState.maxBallSpeed {
            vx *= PongState.maxBallSpeed / sp
            vy *= PongState.maxBallSpeed / sp
        }
        ballX += vx * dt
        ballY += vy * dt
        let r = PongState.ballRadius
        if ballX < r {
            ballX = r + (r - ballX)
            vx = abs(vx)
            spin *= -0.5
            events.append(.wall)
        } else if ballX > PongState.width - r {
            ballX = (PongState.width - r) - (ballX - (PongState.width - r))
            vx = -abs(vx)
            spin *= -0.5
            events.append(.wall)
        }
        let top = PongState.playerY + PongState.paddleHeight / 2 + r
        if vy < 0, prevY >= top, ballY < top, abs(ballX - playerX) <= PongState.paddleWidth / 2 + r {
            ballY = top + (top - ballY)
            let smashed = smashArmed > 0
            bounce(fromPlayer: true, smash: smashed)
            events.append(.playerHit(strength: smashed ? 1 : min(1, abs(playerVX) / 140)))
            if smashed { events.append(.smash) }
        }
        let bottom = PongState.aiY - PongState.paddleHeight / 2 - r
        if vy > 0, prevY <= bottom, ballY > bottom, abs(ballX - aiX) <= PongState.paddleWidth / 2 + r {
            ballY = bottom - (ballY - bottom)
            bounce(fromPlayer: false, smash: false)
            events.append(.aiHit)
        }
        if ballY < -r * 2 {
            aiScore += 1
            pointScored(toPlayer: false, &events)
        } else if ballY > PongState.height + r * 2 {
            playerScore += 1
            pointScored(toPlayer: true, &events)
        }
    }

    private mutating func movePlayer(_ dt: Double) {
        let before = playerX
        let maxStep = PongState.playerMaxSpeed * dt
        playerX = GameMath.clamp(playerX + GameMath.clamp(playerTarget - playerX, -maxStep, maxStep), PongState.minX, PongState.maxX)
        // Smoothed paddle speed: the spin a hit gets.
        let instant = dt > 0 ? (playerX - before) / dt : 0
        playerVX = playerVX * 0.6 + instant * 0.4
    }

    private mutating func moveAI(_ dt: Double) {
        aiLookIn -= dt
        if aiLookIn <= 0 {
            aiLookIn = level.reaction
            aiTarget = aiPlan()
        }
        let before = aiX
        let maxStep = level.maxSpeed * dt
        aiX = GameMath.clamp(aiX + GameMath.clamp(aiTarget - aiX, -maxStep, maxStep), PongState.minX, PongState.maxX)
        aiVX = dt > 0 ? (aiX - before) / dt : 0
    }

    /// Where the AI wants its paddle: the predicted crossing point when the ball comes up,
    /// the middle (plus a little drift) when it goes away.
    func aiPlan() -> Double {
        guard serveIn <= 0, vy > 0 else {
            return GameMath.clamp(PongState.width / 2 + (ballX - PongState.width / 2) * 0.25, PongState.minX, PongState.maxX)
        }
        let x = predictX(atY: PongState.aiY - PongState.paddleHeight / 2 - PongState.ballRadius, spinFactor: level.spinRead)
        return GameMath.clamp(x + aiError, PongState.minX, PongState.maxX)
    }

    /// Ball x when it reaches `y`, folding wall bounces; `spinFactor` of the curve included.
    func predictX(atY y: Double, spinFactor: Double) -> Double {
        guard vy != 0 else { return ballX }
        let t = (y - ballY) / vy
        guard t > 0 else { return ballX }
        // Integrated curve of vx += spin*dt with spin decaying at 0.9/s.
        let k = 0.9
        let curve = spinFactor * spin * (t / k - (1 - exp(-k * t)) / (k * k))
        let raw = ballX + vx * t + curve
        return PongState.fold(raw)
    }

    /// Mirror an x position into the court (wall bounces).
    static func fold(_ x: Double) -> Double {
        let r = ballRadius
        let span = width - 2 * r
        var p = (x - r).truncatingRemainder(dividingBy: 2 * span)
        if p < 0 { p += 2 * span }
        return r + (p <= span ? p : 2 * span - p)
    }

    private mutating func bounce(fromPlayer: Bool, smash: Bool) {
        let paddleX = fromPlayer ? playerX : aiX
        let paddleVX = fromPlayer ? playerVX : aiVX
        let offset = GameMath.clamp((ballX - paddleX) / (PongState.paddleWidth / 2), -1, 1)
        let speed = min(PongState.maxBallSpeed, max(PongState.startSpeed, ballSpeed) * (smash ? 1.33 : 1.045))
        if smash {
            smashArmed = 0
            smashes += 1
        }
        let angle = offset * (Double.pi / 3)
        var nvx = speed * sin(angle) + paddleVX * 0.22
        var nvy = speed * cos(angle)
        let n = (nvx * nvx + nvy * nvy).squareRoot()
        nvx *= speed / n
        nvy *= speed / n
        // Keep the rally moving up and down (never a near-flat ball).
        let minVy = speed * PongState.minVertical
        if nvy < minVy {
            nvy = minVy
            nvx = (nvx < 0 ? -1 : 1) * (speed * speed - minVy * minVy).squareRoot()
        }
        vx = nvx
        vy = fromPlayer ? nvy : -nvy
        spin = GameMath.clamp(paddleVX * 0.35, -45, 45)
        rally += 1
        longestRally = max(longestRally, rally)
        if !fromPlayer { return }
        // A fresh aim error for the AI's next return.
        aiError = rng.range(-level.aimError, level.aimError)
        aiLookIn = min(aiLookIn, level.reaction)
    }

    private mutating func pointScored(toPlayer: Bool, _ events: inout [PongEvent]) {
        events.append(toPlayer ? .pointPlayer : .pointAI)
        rally = 0
        ballX = PongState.width / 2
        ballY = PongState.height / 2
        vx = 0
        vy = 0
        spin = 0
        serveIn = 1.0
        serveToPlayer = !toPlayer
        if playerScore >= PongState.winScore || aiScore >= PongState.winScore {
            over = true
            events.append(playerScore > aiScore ? .won : .lost)
        }
    }

    private mutating func serve() {
        let angle = rng.range(-0.45, 0.45)
        vx = PongState.startSpeed * sin(angle)
        vy = PongState.startSpeed * cos(angle) * (serveToPlayer ? -1 : 1)
        spin = 0
        aiError = rng.range(-level.aimError, level.aimError)
    }

    var playerWon: Bool { over && playerScore > aiScore }
}
