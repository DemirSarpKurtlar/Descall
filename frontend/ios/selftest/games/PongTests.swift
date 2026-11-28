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
            var playerError = 0.0
            var incoming = false
            // A match is first to eleven with long rallies at the harder levels: allow an hour of play.
            while !s.over && frames < 60 * 3600 {
                // A human-like player: follows the ball, but with one aim error per incoming
                // ball (drawn when the ball turns towards the player), so some balls are missed.
                // A fresh error every frame averaged out and the rallies never ended.
                if s.vy < 0 && !incoming { playerError = rng.range(-0.3, 0.3) }
                incoming = s.vy < 0
                s.setPlayer(fraction: GameMath.clamp((s.ballX - PongState.minX) / (PongState.maxX - PongState.minX) + playerError, 0, 1))
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
            check(s.playerScore == PongState.winScore || s.aiScore == PongState.winScore, "first to eleven")
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
            // A match is first to eleven with long rallies at the harder levels: allow an hour of play.
            while !s.over && frames < 60 * 3600 {
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

    // A missed ball is a point for the other side and the match stops at eleven.
    var m = PongState(level: .easy, seed: 9)
    m.serveIn = 0
    m.aiScore = PongState.winScore - 1
    m.ballX = 5; m.ballY = 3; m.vx = 0; m.vy = -80
    m.playerX = 90; m.playerTarget = 90
    var events: [PongEvent] = []
    for _ in 0..<30 { events += m.step(1.0 / 60.0) }
    check(events.contains(.pointAI), "missed ball scores for the AI")
    check(events.contains(.lost) && m.over && !m.playerWon, "match lost at eleven")
    eq(m.step(1).count, 0, "nothing happens after the match")

    testPongContact()
    testPongCrown()
    testPongFeel()
}

/// Owner report (Nov 2026): "the paddle only goes all the way up or all the way down".
func testPongCrown() {
    let span = CrownInput.pongSpan
    check(abs(CrownInput.sweep(delta: 1, span: span) - 1 / span) < 1e-12, "one detent is 1/span of a sweep")
    eq(CrownInput.sweep(delta: CrownInput.recentreAt, span: span), 0, "a recentring jump moves nothing")
    eq(CrownInput.sweep(delta: 1, span: 0), 0, "no span, no movement")
    eq(CrownInput.sweep(delta: .nan, span: span), 0, "a broken value moves nothing")

    // One detent is a small, even step; a full sweep of detents crosses the court exactly.
    var s = PongState(level: .normal, seed: 31)
    s.setPlayer(fraction: 0)
    let travel = PongState.maxX - PongState.minX
    s.nudgePlayer(sweep: CrownInput.sweep(delta: 1, span: span))
    check(abs(s.playerTarget - (PongState.minX + travel / span)) < 1e-9, "one detent moves the target 1/\(Int(span)) of the court")
    check(travel / span < PongState.paddleWidth / 4, "one detent is well under a quarter paddle")
    for _ in 1..<Int(span) { s.nudgePlayer(sweep: CrownInput.sweep(delta: 1, span: span)) }
    check(abs(s.playerTarget - PongState.maxX) < 1e-9, "a full sweep of detents reaches the far end")
    // Turning on past the end leaves no dead zone: one detent back moves again.
    for _ in 0..<40 { s.nudgePlayer(sweep: CrownInput.sweep(delta: 1, span: span)) }
    eq(s.playerTarget, PongState.maxX, "target stays at the end")
    s.nudgePlayer(sweep: CrownInput.sweep(delta: -1, span: span))
    check(s.playerTarget < PongState.maxX - travel / span * 0.99, "one detent back leaves the end at once")

    // The paddle glides: never faster than its top speed, a detent step is smooth (not a
    // jump in one frame) and still lands quickly; a full sweep crosses in about half a second.
    var g = PongState(level: .normal, seed: 32)
    g.serveIn = 100
    g.playerX = PongState.minX; g.playerTarget = PongState.minX
    g.nudgePlayer(sweep: 1 / span)
    _ = g.step(1.0 / 60.0)
    let moved = g.playerX - PongState.minX
    check(moved > 0 && moved < travel / span * 0.8, "a detent step glides over several frames (\(moved))")
    for _ in 0..<9 { _ = g.step(1.0 / 60.0) }
    check(abs(g.playerX - g.playerTarget) < 0.05, "a detent step lands within 1/6 s")
    var far = PongState(level: .normal, seed: 33)
    far.serveIn = 100
    far.playerX = PongState.minX; far.playerTarget = PongState.maxX
    var t = 0.0
    var fastest = 0.0
    while abs(far.playerX - PongState.maxX) > 0.5 && t < 2 {
        let before = far.playerX
        _ = far.step(1.0 / 60.0)
        fastest = max(fastest, (far.playerX - before) * 60)
        t += 1.0 / 60.0
    }
    check(fastest <= PongState.playerMaxSpeed + 1e-6, "paddle never faster than its top speed")
    check(t <= 0.6, "a full sweep crosses the court in about half a second (\(t))")

    // The scene draws the paddles and the ball at the logic's size and place on every watch
    // size: a ball touching the logic's face touches the drawn face.
    for (w, h) in [(162.0, 197.0), (176.0, 215.0), (184.0, 224.0), (198.0, 242.0), (205.0, 251.0)] {
        let l = PongLayout(width: w, height: h)
        let thick = PongState.paddleHeight / 2
        let face = l.player(x: 60).x - l.paddleThickness / 2
        let ball = l.point(x: 60, y: PongState.playerY + thick + PongState.ballRadius)
        check(abs(ball.x + l.ballRadius - face) < 1e-9, "\(Int(w)) pt: ball touches the drawn player face")
        let aiFace = l.ai(x: 60).x + l.paddleThickness / 2
        let aiBall = l.point(x: 60, y: PongState.aiY - thick - PongState.ballRadius)
        check(abs(aiBall.x - l.ballRadius - aiFace) < 1e-9, "\(Int(w)) pt: ball touches the drawn AI face")
        let end = l.player(x: 60).y + l.paddleLength / 2
        check(abs(end - l.point(x: 60 + PongState.paddleWidth / 2, y: PongState.playerY).y) < 1e-9, "\(Int(w)) pt: drawn paddle length is the logic's")
        check(l.point(x: 0, y: 0).x <= w && l.point(x: PongState.width, y: PongState.height).x >= 0, "\(Int(w)) pt: court on screen")
    }
}

/// Raket's feel through the logic: serve, speed-up per hit, smash window, minimum vertical
/// pace, and the match to eleven.
func testPongFeel() {
    // A perfect player against the hard AI: every return is a little faster, never above the
    // cap, and always moves between the paddles at a real pace.
    var s = PongState(level: .hard, seed: 41)
    var lastSpeed = 0.0
    var hits = 0
    var served = false
    var frames = 0
    while hits < 14 && frames < 60 * 120 && !s.over {
        s.setPlayer(fraction: GameMath.clamp((s.ballX - PongState.minX) / (PongState.maxX - PongState.minX), 0, 1))
        for e in s.step(1.0 / 60.0) {
            if e == .serve {
                served = true
                check(abs(s.ballSpeed - PongState.startSpeed) < 1e-6, "serve at the start speed")
                check(abs(s.vy) >= PongState.minVerticalSpeed, "serve goes between the paddles")
                lastSpeed = s.ballSpeed
            }
            if case .playerHit = e {
                hits += 1
                check(s.ballSpeed >= lastSpeed - 1e-6, "a return never slows the ball (\(s.ballSpeed) after \(lastSpeed))")
                check(s.ballSpeed <= PongState.maxBallSpeed + 1e-6, "return under the cap")
                check(s.vy >= min(s.ballSpeed * 0.95, max(s.ballSpeed * PongState.minVertical, PongState.minVerticalSpeed)) - 1e-6, "return goes up the table")
                lastSpeed = s.ballSpeed
            }
            if e == .aiHit { lastSpeed = s.ballSpeed }
            if e == .pointAI || e == .pointPlayer { lastSpeed = 0 }
        }
        frames += 1
    }
    check(served, "the ball is served")
    check(hits >= 14, "a perfect player keeps the rally going (\(hits) returns)")

    // Smash: a tap just before the return sends it a third faster; a tap too early is gone.
    func returnSpeed(tapBefore: Double?) -> Double {
        var m = PongState(level: .normal, seed: 42)
        m.serveIn = 0
        m.ballX = 60; m.ballY = 40; m.vx = 0; m.vy = -60
        m.playerX = 60; m.playerTarget = 60
        let face = PongState.playerY + PongState.paddleHeight / 2 + PongState.ballRadius
        let arrives = (m.ballY - face) / 60
        var t = 0.0
        var tapped = false
        while t < 2 {
            if let lead = tapBefore, !tapped, t >= arrives - lead { m.smash(); tapped = true }
            for e in m.step(1.0 / 120.0) { if case .playerHit = e { return m.ballSpeed } }
            t += 1.0 / 120.0
        }
        return 0
    }
    let plain = returnSpeed(tapBefore: nil)
    let smashed = returnSpeed(tapBefore: 0.15)
    let early = returnSpeed(tapBefore: PongState.smashWindow + 0.2)
    check(plain > 0 && abs(smashed - min(PongState.maxBallSpeed, 60 * 1.33)) < 1e-6, "smash inside the window is a third faster (\(smashed))")
    check(abs(early - plain) < 1e-6, "a tap long before the return does not smash")

    // Levels against a decent human-like player (crown in detents, one aim error per ball):
    // the player wins points at every level, more at easy than at hard, and no point turns
    // into an endless rally (before, normal and hard never missed a fast ball: 0 points).
    func points(_ level: PongLevel) -> (player: Int, ai: Int, longest: Int) {
        var pp = 0, ap = 0, longest = 0
        for seed in UInt64(1)...5 {
            var g = PongState(level: level, seed: seed)
            var rng = GameRNG(seed: seed &* 77)
            var err = 0.0, incoming = false
            var frames = 0
            let detent = (PongState.maxX - PongState.minX) / CrownInput.pongSpan
            while !g.over && frames < 60 * 1800 {
                if g.vy < 0 && !incoming { err = rng.range(-18, 18) }
                incoming = g.vy < 0
                let want = GameMath.clamp(g.ballX + err, PongState.minX, PongState.maxX)
                g.setPlayer(fraction: ((want - PongState.minX) / detent).rounded() * detent / (PongState.maxX - PongState.minX))
                _ = g.step(1.0 / 60.0)
                frames += 1
            }
            check(g.over, "\(level) seed \(seed): a match against a decent player ends inside half an hour")
            pp += g.playerScore
            ap += g.aiScore
            longest = max(longest, g.longestRally)
        }
        return (pp, ap, longest)
    }
    let easy = points(.easy), normal = points(.normal), hard = points(.hard)
    for (name, p) in [("easy", easy), ("normal", normal), ("hard", hard)] {
        check(p.player > 0, "\(name): the player wins points (\(p.player)-\(p.ai))")
        check(p.longest < 300, "\(name): no endless rally (\(p.longest))")
    }
    func share(_ p: (player: Int, ai: Int, longest: Int)) -> Double { Double(p.player) / Double(max(1, p.player + p.ai)) }
    check(share(easy) > share(normal) && share(normal) > share(hard), "harder levels give away fewer points (\(share(easy)), \(share(normal)), \(share(hard)))")

    // Eleven wins, whoever gets there (the UI says "First to 11", no two-point lead).
    var w = PongState(level: .easy, seed: 43)
    w.serveIn = 0
    w.playerScore = PongState.winScore - 1; w.aiScore = PongState.winScore - 1
    w.ballX = 60; w.ballY = 90; w.vx = 0; w.vy = 120
    w.aiX = PongState.minX; w.aiTarget = PongState.minX; w.aiLookIn = 10
    var we: [PongEvent] = []
    for _ in 0..<60 { we += w.step(1.0 / 60.0) }
    check(we.contains(.won) && w.playerWon && w.playerScore == PongState.winScore, "eleven points win the match")
}

/// Owner report (Nov 2026): "the ball sometimes goes through the paddle". Contact is the
/// paddle's whole rectangle, including the paddle's own motion, for both paddles.
func testPongContact() {
    let r = PongState.ballRadius
    let half = PongState.paddleWidth / 2
    let thick = PongState.paddleHeight / 2

    func isPlayerHit(_ e: PongEvent) -> Bool { if case .playerHit = e { return true }; return false }
    func rally(_ s: inout PongState, frames: Int, dt: Double = 1.0 / 60.0) -> [PongEvent] {
        var out: [PongEvent] = []
        for _ in 0..<frames {
            out += s.step(dt)
            if out.contains(where: { isPlayerHit($0) || $0 == .aiHit || $0 == .pointAI || $0 == .pointPlayer }) { break }
        }
        return out
    }
    func playerHit(_ e: [PongEvent]) -> Bool { e.contains { isPlayerHit($0) } }

    // The paddle slides onto a ball that is already past the front face but still level
    // with the paddle's thickness: a return, not a ball that passes through.
    var a = PongState(level: .normal, seed: 21)
    a.serveIn = 0
    a.ballX = 30; a.ballY = PongState.playerY + 0.8; a.vx = 0; a.vy = -40
    a.playerX = 30 + half + r + 3; a.playerTarget = 30
    let ea = rally(&a, frames: 30)
    check(playerHit(ea), "paddle sliding onto a ball inside its thickness returns it")
    check(!ea.contains(.pointAI), "no point lost through the paddle")
    check(a.vy > 0 && a.ballY >= PongState.playerY + thick + r - 1e-9, "returned ball leaves from the front face")

    // Side contact: the ball is level with the paddle's centre line and the paddle's end runs into it.
    var b = PongState(level: .normal, seed: 22)
    b.serveIn = 0
    b.ballX = 80; b.ballY = PongState.playerY; b.vx = 0; b.vy = -30
    b.playerX = 80 - half - r - 2; b.playerTarget = 80
    check(playerHit(rally(&b, frames: 30)), "the paddle's end hits the ball")

    // Every front hit across the whole paddle, at the top speed and a slow 30 fps frame.
    for offset in stride(from: -(half + r) + 0.15, through: half + r - 0.15, by: 0.6) {
        for moving in [false, true] {
            var c = PongState(level: .normal, seed: 23)
            c.serveIn = 0
            c.playerX = 60; c.playerTarget = moving ? 60 + offset * 0.5 : 60
            c.ballX = 60 + offset; c.ballY = 40; c.vx = 0; c.vy = -PongState.maxBallSpeed
            let ec = rally(&c, frames: 40, dt: 1.0 / 30.0)
            check(playerHit(ec), "front hit at offset \(offset) (moving \(moving))")
        }
    }

    // A ball that is already behind the paddle stays a miss, even if the paddle then touches it.
    var d = PongState(level: .normal, seed: 24)
    d.serveIn = 0
    d.ballX = 30; d.ballY = PongState.playerY - thick - 0.8; d.vx = 0; d.vy = -40
    d.playerX = 30 + half + r + 3; d.playerTarget = 30
    let ed = rally(&d, frames: 60)
    check(!playerHit(ed) && ed.contains(.pointAI), "a ball behind the paddle is a point for the AI")

    // The AI paddle has the same contact.
    var e = PongState(level: .normal, seed: 25)
    e.serveIn = 0
    e.ballX = 70; e.ballY = PongState.aiY - 0.8; e.vx = 0; e.vy = 30
    e.aiX = 70 - half - r - 2; e.aiTarget = 70; e.aiLookIn = 10
    let ee = rally(&e, frames: 30)
    check(ee.contains(.aiHit), "AI paddle sliding onto the ball returns it")
    check(e.vy < 0, "AI return goes back towards the player")

    // Spin only bends the ball sideways: the pace between the paddles never shrinks, so the
    // ball never crawls across the table.
    var f = PongState(level: .normal, seed: 26)
    f.serveIn = 0
    f.ballX = 60; f.ballY = 60; f.vx = 110; f.vy = -60; f.spin = 45
    f.playerX = 60; f.playerTarget = 60
    var slowest = Double.infinity
    for _ in 0..<40 {
        _ = f.step(1.0 / 60.0)
        if f.serveIn > 0 || f.vy > 0 { break }
        slowest = min(slowest, abs(f.vy))
    }
    check(slowest >= 60 - 1e-6, "spin and the speed cap keep the pace between the paddles (\(slowest))")
}
