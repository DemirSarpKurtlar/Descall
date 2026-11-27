import Foundation

func testBricks() {
    // Level format.
    let parsed = BrickLevel.parse(["1.2", "#+3x", "....................."])
    eq(parsed.count, 5, "five bricks parsed, unknown characters are empty")
    check(parsed.contains { $0.col == 0 && $0.row == 1 && $0.isSteel }, "steel")
    check(parsed.contains { $0.col == 1 && $0.row == 1 && $0.drops && $0.hp == 1 }, "prism brick drops")
    check(parsed.contains { $0.col == 2 && $0.row == 1 && $0.hp == 3 && $0.maxHP == 3 }, "three hits")
    eq(BrickLevel.parse(Array(repeating: "1111111111111", count: 20)).count, BrickLevel.cols * BrickLevel.maxRows, "rows and columns are cut")
    // 40 levels, each with something to break, mirrored when generated.
    for i in 0..<BrickLevel.count {
        let rows = BrickLevel.rows(forLevel: i)
        check(BrickLevel.parse(rows).contains { !$0.isSteel }, "level \(i + 1) can be cleared")
        check(rows.count <= BrickLevel.maxRows && rows.allSatisfy { $0.count <= BrickLevel.cols }, "level \(i + 1) fits")
        if i >= BrickLevel.all.count { check(rows.allSatisfy { String($0.reversed()) == $0 }, "generated level \(i + 1) is mirrored") }
    }
    eq(BrickLevel.rows(forLevel: 40), BrickLevel.rows(forLevel: 0), "levels repeat after 40")
    eq(BrickLevel.generated(17), BrickLevel.generated(17), "generated levels are stable")

    // A ball breaks bricks, scores, and power-ups apply.
    var s = BrickState(seed: 4)
    let total = s.remaining
    check(s.stuck && s.launch(), "ball waits, then launches")
    check(!s.launch(), "launch only once")
    var events: [BrickEvent] = []
    var frames = 0
    while s.remaining == total && frames < 60 * 30 && !s.over {
        s.setPaddle(fraction: GameMath.clamp((s.balls.first?.x ?? 50) / BrickState.width, 0, 1))
        events += s.step(1.0 / 60.0)
        frames += 1
    }
    check(s.remaining < total, "a brick breaks within 30 s")
    check(s.score > 0, "points for bricks")
    check(events.contains(.broken), "broken event")
    for ball in s.balls {
        check(ball.x >= 0 && ball.x <= BrickState.width && ball.y <= BrickState.height, "ball inside the court")
    }

    var p = BrickState(seed: 2)
    _ = p.launch()
    let lives = p.lives
    p.apply(.life)
    eq(p.lives, lives + 1, "extra life")
    p.apply(.wide)
    check(p.paddleWidth > BrickState.basePaddle, "wide paddle")
    p.apply(.multi)
    eq(p.balls.count, 3, "multi ball adds two")
    p.apply(.shield)
    check(p.shield, "shield up")
    eq(BrickPower.allCases.count, 7, "seven power-ups")

    // Shield saves one ball.
    var sh = BrickState(seed: 3)
    _ = sh.launch()
    sh.apply(.shield)
    sh.balls = [BrickBall(x: 90, y: 3, vx: 0, vy: -80)]
    sh.paddleX = 10; sh.paddleTarget = 10
    _ = sh.step(0.1)
    check(!sh.shield && sh.balls.count == 1 && sh.balls[0].vy > 0, "shield bounced the ball once")

    // Sticky paddle catches, then sends the ball again.
    var st = BrickState(seed: 5)
    _ = st.launch()
    st.apply(.sticky)
    st.balls = [BrickBall(x: st.paddleX, y: 20, vx: 0, vy: -70)]
    var caught = false
    for _ in 0..<60 { _ = st.step(1.0 / 60.0); if st.stuck { caught = true; break } }
    check(caught, "sticky paddle caught the ball")
    check(st.launch() && st.balls.first.map { $0.vy > 0 } == true, "caught ball goes up again")

    // Losing every ball costs a life; the last one ends the game.
    var l = BrickState(seed: 6)
    _ = l.launch()
    l.lives = 1
    l.balls = [BrickBall(x: 90, y: 3, vx: 0, vy: -90)]
    l.paddleX = 10; l.paddleTarget = 10
    var ev: [BrickEvent] = []
    for _ in 0..<30 { ev += l.step(1.0 / 60.0) }
    check(ev.contains(.gameOver) && l.over, "last life lost ends the game")

    // Clearing a level moves on.
    var c = BrickState(seed: 7)
    _ = c.launch()
    c.bricks = [Brick(col: 0, row: 0, hp: 1, maxHP: 1, drops: false), Brick(col: 5, row: 0, hp: -1, maxHP: -1, drops: false)]
    let r = c.rect(of: c.bricks[0])
    c.balls = [BrickBall(x: r.x + r.w / 2, y: r.y - 4, vx: 0, vy: 80)]
    var cleared: [BrickEvent] = []
    for _ in 0..<30 { cleared += c.step(1.0 / 60.0) }
    check(cleared.contains(.levelCleared), "level cleared (steel does not count)")
    eq(c.level, 1, "next level")
    check(c.stuck, "new level starts with the ball on the paddle")
}
