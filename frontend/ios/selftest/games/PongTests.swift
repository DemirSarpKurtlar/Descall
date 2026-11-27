import Foundation

func testPong() {
    // Fold mirrors positions into the court.
    let r = PongState.ballRadius
    check(abs(PongState.fold(50) - 50) < 1e-9, "fold inside")
    check(abs(PongState.fold(-10) - (2 * r + 10)) < 1e-9, "fold left wall")
    check(abs(PongState.fold(PongState.width + 10) - (PongState.width - 2 * r - 10)) < 1e-9, "fold right wall")
    for x in stride(from: -400.0, through: 400.0, by: 7.3) {
        let f = PongState.fold(x)
        check(f >= r - 1e-9 && f <= PongState.width - r + 1e-9, "fold \(x) stays in court")
    }

    // AI bounds: on every level, over many rallies, the AI paddle stays in the court,
    // never moves faster than its top speed and only re-aims after its reaction delay.
    for level in PongLevel.allCases {
        for seed in UInt64(1)...6 {
            var s = PongState(level: level, seed: seed)
            var rng = GameRNG(seed: seed &* 31)
            var lastTarget = s.aiTarget
            var sinceRetarget = 0.0
            var minGap = Double.infinity
            let dt = 1.0 / 60.0
            var frames = 0
            var hitsAI = 0, hitsPlayer = 0
            while !s.over && frames < 60 * 600 {
                // A wobbly player who follows the ball with noise.
                s.setPlayer(fraction: GameMath.clamp((s.ballX - PongState.minX) / (PongState.maxX - PongState.minX) + rng.range(-0.25, 0.25), 0, 1))
                let beforeX = s.aiX
                let events = s.step(dt)
                frames += 1
                for e in events {
                    if e == .aiHit { hitsAI += 1 }
                    if case .playerHit(let strength) = e {
                        hitsPlayer += 1
                        check(strength >= 0 && strength <= 1, "hit strength in 0...1")
                    }
                }
                check(s.aiX >= PongState.minX - 1e-9 && s.aiX <= PongState.maxX + 1e-9, "\(level) AI paddle inside the court")
                check(s.playerX >= PongState.minX - 1e-9 && s.playerX <= PongState.maxX + 1e-9, "player paddle inside the court")
                check(abs(s.aiX - beforeX) <= level.maxSpeed * dt + 1e-6, "\(level) AI speed capped")
                check(s.ballSpeed <= PongState.maxBallSpeed + 1e-6, "ball speed capped")
                check(s.ballX >= r - 1e-6 && s.ballX <= PongState.width - r + 1e-6, "ball inside the side walls")
                if s.aiTarget != lastTarget {
                    minGap = min(minGap, sinceRetarget)
                    lastTarget = s.aiTarget
                    sinceRetarget = 0
                }
                sinceRetarget += dt
            }
            check(s.over, "\(level) seed \(seed): the match ends")
            check(s.playerScore == PongState.winScore || s.aiScore == PongState.winScore, "first to seven")
            check(hitsAI > 0 && hitsPlayer > 0, "both sides return the ball")
            // Retargets come at most once per reaction window (one frame of slack).
            check(minGap + dt >= level.reaction - 1e-9 || minGap == .infinity, "\(level) reaction delay respected (\(minGap))")
        }
    }

    // Harder levels are stronger: hard beats easy's results against the same player.
    func aiPoints(_ level: PongLevel) -> Int {
        var total = 0
        for seed in UInt64(10)...15 {
            var s = PongState(level: level, seed: seed)
            var frames = 0
            while !s.over && frames < 60 * 600 {
                s.setPlayer(fraction: GameMath.clamp((s.ballX - PongState.minX) / (PongState.maxX - PongState.minX), 0, 1))
                _ = s.step(1.0 / 60.0)
                frames += 1
            }
            total += s.aiScore - s.playerScore
        }
        return total
    }
    check(aiPoints(.hard) >= aiPoints(.easy), "hard AI does at least as well as easy")

    // Paddle speed puts spin on the ball, and spin curves the flight.
    var s = PongState(level: .normal, seed: 5)
    s.serveIn = 0
    s.ballX = 50; s.ballY = 20; s.vx = 0; s.vy = -60
    s.playerX = 30; s.playerTarget = 30
    for _ in 0..<5 { _ = s.step(1.0 / 60.0) }
    s.setPlayer(fraction: 1)
    var hit = false
    for _ in 0..<40 {
        for e in s.step(1.0 / 60.0) { if case .playerHit = e { hit = true } }
        if hit { break }
    }
    check(hit, "moving paddle meets the ball")
    check(s.spin > 0, "rightward paddle gives rightward spin (\(s.spin))")
    check(s.vy > 0, "ball goes back up")
    check(s.vy >= s.ballSpeed * PongState.minVertical - 1e-6, "never a flat return")
    let vx0 = s.vx
    _ = s.step(0.05)
    check(s.vx > vx0, "spin bends the ball")

    // A missed ball is a point for the other side and the match stops at seven.
    var m = PongState(level: .easy, seed: 9)
    m.serveIn = 0
    m.aiScore = PongState.winScore - 1
    m.ballX = 5; m.ballY = 3; m.vx = 0; m.vy = -80
    m.playerX = 90; m.playerTarget = 90
    var events: [PongEvent] = []
    for _ in 0..<30 { events += m.step(1.0 / 60.0) }
    check(events.contains(.pointAI), "missed ball scores for the AI")
    check(events.contains(.lost) && m.over && !m.playerWon, "match lost at seven")
    eq(m.step(1).count, 0, "nothing happens after the match")
}
