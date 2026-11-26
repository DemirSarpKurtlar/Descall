import Foundation

func testSnake() {
    var s = SnakeState(mode: .walls, speedLevel: 2, seed: 1)
    eq(s.body.count, 3, "starts with three cells")
    check(!s.turn(.left), "no turning straight back")
    check(!s.turn(.right), "same direction is not a turn")
    check(s.turn(.up), "turn up")
    check(s.turn(.left), "a second queued turn")
    check(!s.turn(.down), "never reverse against the queued turn")
    _ = s.tick()
    eq(s.dir, .up, "first queued turn applied")
    _ = s.tick()
    eq(s.dir, .left, "second queued turn applied")

    // Walls: hitting the edge ends the round.
    var w = SnakeState(mode: .walls, speedLevel: 1, seed: 2)
    w.food = GridPoint(x: 0, y: 0)
    var died = false
    for _ in 0..<20 { if w.tick().contains(.died) { died = true; break } }
    check(died && w.over, "wall kills")

    // Wrap: the head comes out on the other side.
    var r = SnakeState(mode: .wrap, speedLevel: 1, seed: 3)
    r.food = GridPoint(x: 0, y: 0)
    for _ in 0..<20 { _ = r.tick() }
    check(!r.over, "wrap does not kill")
    check(r.head.x >= 0 && r.head.x < SnakeState.cols, "head inside after wrapping")

    // Eating grows and scores; food never lands on the snake.
    var e = SnakeState(mode: .walls, speedLevel: 3, seed: 4)
    e.food = GridPoint(x: e.head.x + 1, y: e.head.y)
    let ev = e.tick()
    check(ev.contains(.ate), "ate")
    eq(e.score, 30, "10 x speed level")
    _ = e.tick()
    eq(e.body.count, 4, "grew by one")
    for _ in 0..<200 {
        var t = e
        if let f = t.freeCell() { check(!t.body.contains(f) && f != t.food, "free cell is free") }
        e.food = e.freeCell() ?? e.food
    }

    // Self collision: a tight loop into the body.
    var c = SnakeState(mode: .wrap, speedLevel: 1, seed: 5)
    c.body = [GridPoint(x: 5, y: 5), GridPoint(x: 4, y: 5), GridPoint(x: 4, y: 6), GridPoint(x: 5, y: 6), GridPoint(x: 6, y: 6)]
    c.dir = .right
    c.food = GridPoint(x: 0, y: 0)
    c.turn(.down)
    check(c.tick().contains(.died), "running into the body kills")
    // Moving into the cell the tail leaves is fine.
    var tail = SnakeState(mode: .wrap, speedLevel: 1, seed: 6)
    tail.body = [GridPoint(x: 5, y: 5), GridPoint(x: 5, y: 6), GridPoint(x: 6, y: 6), GridPoint(x: 6, y: 5)]
    tail.dir = .up
    tail.food = GridPoint(x: 0, y: 0)
    tail.turn(.right)
    check(!tail.tick().contains(.died), "chasing the tail is allowed")

    // Maze walls kill; speed rises with pellets.
    var m = SnakeState(mode: .maze, speedLevel: 2, seed: 7)
    check(!m.obstacles.isEmpty && !m.obstacles.contains(m.head) && !m.obstacles.contains(m.food), "maze clear of the start")
    m.food = GridPoint(x: 0, y: 0)
    m.turn(.up)
    var mazeDeath = false
    for _ in 0..<6 { if m.tick().contains(.died) { mazeDeath = true; break } }
    check(mazeDeath, "maze wall kills")
    var sp = SnakeState(mode: .walls, speedLevel: 2, seed: 8)
    let slow = sp.interval
    sp.eaten = 10
    check(sp.interval < slow, "faster after pellets")
    sp.eaten = 10_000
    check(sp.interval >= 0.07, "never faster than 70 ms")
}
