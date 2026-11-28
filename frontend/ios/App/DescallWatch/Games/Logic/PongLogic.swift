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

    /// How much a fast ball adds to the aim error (share of `aimError` at the top speed).
    /// Without it the normal and hard AI never missed a fast ball, so a good rally only
    /// ended with the player's own mistake and points could run to hundreds of hits.
    var pressure: Double {
        switch self {
        case .easy: return 0.6
        case .normal: return 1.25
        case .hard: return 3.6
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
    /// Paddle top speed: the paddle crosses the court in about 0.45 s at most.
    static let playerMaxSpeed = 210.0
    /// How quickly the paddle closes the gap to the crown's target (per second): the crown
    /// moves in detents, the paddle glides between them instead of jumping.
    static let playerFollow = 28.0
    static let winScore = 11
    /// Seconds a smash tap stays armed.
    static let smashWindow = 0.3
    /// Extra AI aim error after a smash (court units).
    static let smashPressure = 6.0
    /// Share of the speed that always goes up or down after a hit.
    static let minVertical = 0.42
    /// Slowest pace between the paddles (court units per second): the ball never crawls.
    static let minVerticalSpeed = 26.0

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

    /// A crown turn: `sweep` is the share of a full sweep across the court (CrownInput).
    /// Turning on past an end never builds up a dead zone: one detent back moves again.
    mutating func nudgePlayer(sweep: Double) {
        let lo = PongState.minX, hi = PongState.maxX
        playerTarget = GameMath.clamp(GameMath.clamp(playerTarget, lo, hi) + sweep * (hi - lo), lo, hi)
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
        // Paddle positions at the start of the substep, for the swept contact below.
        let playerFrom = playerX, aiFrom = aiX
        movePlayer(dt)
        moveAI(dt)
        if serveIn > 0 {
            serveIn -= dt
            if serveIn <= 0 { serve(); events.append(.serve) }
            return
        }
        let prevX = ballX, prevY = ballY
        // Spin bends the flight sideways and wears off.
        vx += spin * dt
        spin *= exp(-0.9 * dt)
        capSpeed()
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
        let thick = PongState.paddleHeight / 2
        let ballPath = (x0: prevX, y0: prevY, x1: ballX, y1: ballY)
        // Player: the ball comes down and its centre is not yet behind the paddle's back face
        // (a ball that is already behind stays a miss).
        if vy < 0, let t = PongState.contact(ball: ballPath, paddle: (playerFrom, playerX), paddleY: PongState.playerY) {
            let cy = prevY + (ballY - prevY) * t
            if cy >= PongState.playerY - thick {
                let face = PongState.playerY + thick + r
                ballX = GameMath.clamp(prevX + (ballX - prevX) * t, r, PongState.width - r)
                // Leaves from the front face (mirrored when it crossed the face this step,
                // set on the face when the paddle came at it from the side).
                ballY = prevY >= face ? face + (face - min(ballY, face)) : face
                let smashed = smashArmed > 0
                bounce(fromPlayer: true, smash: smashed)
                events.append(.playerHit(strength: smashed ? 1 : min(1, abs(playerVX) / 140)))
                if smashed { events.append(.smash) }
            }
        }
        if vy > 0, let t = PongState.contact(ball: ballPath, paddle: (aiFrom, aiX), paddleY: PongState.aiY) {
            let cy = prevY + (ballY - prevY) * t
            if cy <= PongState.aiY + thick {
                let face = PongState.aiY - thick - r
                ballX = GameMath.clamp(prevX + (ballX - prevX) * t, r, PongState.width - r)
                ballY = prevY <= face ? face - (max(ballY, face) - face) : face
                bounce(fromPlayer: false, smash: false)
                events.append(.aiHit)
            }
        }
        if ballY < -r * 2 {
            aiScore += 1
            pointScored(toPlayer: false, &events)
        } else if ballY > PongState.height + r * 2 {
            playerScore += 1
            pointScored(toPlayer: true, &events)
        }
    }

    /// Ball against a paddle's whole rectangle (front face, thickness and both ends), swept
    /// over one substep with the ball and the paddle both moving. Returns the first sampled
    /// moment of contact (0 ... 1 of the step), nil for none. A substep moves the ball about
    /// one unit and the paddle under two, so eight samples sit far closer than the radius.
    static func contact(ball: (x0: Double, y0: Double, x1: Double, y1: Double), paddle: (x0: Double, x1: Double), paddleY: Double) -> Double? {
        let hw = paddleWidth / 2, hh = paddleHeight / 2, r = ballRadius
        for k in 1...8 {
            let t = Double(k) / 8
            let bx = ball.x0 + (ball.x1 - ball.x0) * t
            let by = ball.y0 + (ball.y1 - ball.y0) * t
            let px = paddle.x0 + (paddle.x1 - paddle.x0) * t
            let dx = bx - GameMath.clamp(bx, px - hw, px + hw)
            let dy = by - GameMath.clamp(by, paddleY - hh, paddleY + hh)
            if dx * dx + dy * dy <= r * r { return t }
        }
        return nil
    }

    /// Top speed. Spin only bends the ball sideways, so the sideways part gives way and the
    /// pace between the paddles stays (scaling both let a curved ball crawl).
    private mutating func capSpeed() {
        let top = PongState.maxBallSpeed
        guard ballSpeed > top else { return }
        let along = min(abs(vy), top * 0.95)
        vy = vy < 0 ? -along : along
        vx = (vx < 0 ? -1 : 1) * (top * top - along * along).squareRoot()
    }

    private mutating func movePlayer(_ dt: Double) {
        let before = playerX
        let maxStep = PongState.playerMaxSpeed * dt
        let glide = (playerTarget - playerX) * min(1, PongState.playerFollow * dt)
        playerX = GameMath.clamp(playerX + GameMath.clamp(glide, -maxStep, maxStep), PongState.minX, PongState.maxX)
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
        // Keep the rally moving up and down (never a near-flat ball, never a crawl).
        let minVy = min(speed * 0.95, max(speed * PongState.minVertical, PongState.minVerticalSpeed))
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
        // A fresh aim error for the AI's next return: wider for a fast ball and a smash.
        let pace = GameMath.clamp((speed - PongState.startSpeed) / (PongState.maxBallSpeed - PongState.startSpeed), 0, 1)
        let reach = level.aimError * (1 + level.pressure * pace) + (smash ? PongState.smashPressure : 0)
        aiError = rng.range(-reach, reach)
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

/// Where PongScene draws the court (draft A, portrait): court y (between the paddles) runs
/// from the right edge (player) to the left (AI), court x (along the paddles) from the bottom
/// up. The paddles and the ball are drawn at the logic's own size and place, so a hit on
/// the watch looks like a hit (they used to be drawn 2 units behind the logic's paddle face).
struct PongLayout: Equatable {
    var width: Double
    var height: Double

    static let marginX = 16.0
    static let marginY = 12.0

    /// Points per court unit between the paddles (screen x) and along them (screen y).
    var depthScale: Double { (width - 2 * PongLayout.marginX) / PongState.height }
    var sideScale: Double { (height - 2 * PongLayout.marginY) / PongState.width }

    func point(x: Double, y: Double) -> (x: Double, y: Double) {
        (width - PongLayout.marginX - y * depthScale, PongLayout.marginY + x * sideScale)
    }

    /// Paddle size on screen: thickness across (screen x), length along (screen y).
    var paddleThickness: Double { PongState.paddleHeight * depthScale }
    var paddleLength: Double { PongState.paddleWidth * sideScale }
    /// Ball radius on screen, at the scale of the flight between the paddles.
    var ballRadius: Double { PongState.ballRadius * depthScale }

    /// Centres of the two paddles for their court x.
    func player(x: Double) -> (x: Double, y: Double) { point(x: x, y: PongState.playerY) }
    func ai(x: Double) -> (x: Double, y: Double) { point(x: x, y: PongState.aiY) }
}
