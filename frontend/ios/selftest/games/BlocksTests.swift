import Foundation

func testBlocks() {
    // Rotation: four quarter turns come back, the T piece matches its known states.
    for kind in BlockKind.allCases {
        eq(kind.cells(rotation: 4), kind.cells(rotation: 0), "\(kind) four turns")
        eq(kind.cells(rotation: 0).count, 4, "\(kind) has four cells")
        eq(Set(kind.cells(rotation: 1)).count, 4, "\(kind) rotated cells are distinct")
    }
    let p = { (xs: [(Int, Int)]) in xs.map { GridPoint(x: $0.0, y: $0.1) }.sorted { ($0.y, $0.x) < ($1.y, $1.x) } }
    eq(BlockKind.t.cells(rotation: 1), p([(1, 0), (1, 1), (2, 1), (1, 2)]), "T right")
    eq(BlockKind.t.cells(rotation: 2), p([(0, 1), (1, 1), (2, 1), (1, 2)]), "T flipped")
    eq(BlockKind.i.cells(rotation: 1), p([(2, 0), (2, 1), (2, 2), (2, 3)]), "I right is a column")
    eq(BlockKind.o.cells(rotation: 1), BlockKind.o.cells(rotation: 0), "O does not change")
    eq(BlocksState.kicks(.t, from: 0, to: 1).count, 5, "five kick tests")
    eq(BlocksState.kicks(.i, from: 0, to: 1)[1], GridPoint(x: -2, y: 0), "I kick table")

    // Seven-bag: every piece once per seven.
    let s0 = BlocksState(seed: 3)
    var seen: [BlockKind] = [s0.piece.kind]
    seen += s0.queue.prefix(6)
    eq(Set(seen).count, 7, "first bag holds all seven")

    // Rotation against the wall uses a kick instead of failing.
    var w = BlocksState(seed: 1)
    w.piece = ActivePiece(kind: .i, rotation: 1, x: -2, y: 5)
    check(w.fits(w.piece), "vertical I at the left wall")
    check(w.rotate(clockwise: true), "I rotates off the wall with a kick")
    check(w.piece.cells.allSatisfy { $0.x >= 0 && $0.x < BlocksState.cols }, "kicked piece inside")

    // Ghost and hard drop.
    var g = BlocksState(seed: 2)
    let ghost = g.ghost
    check(ghost.cells.contains { $0.y == BlocksState.rows - 1 }, "ghost on the floor")
    let events = g.hardDrop()
    check(events.contains(.locked), "hard drop locks")
    if case .hardDrop(let n)? = events.first { check(n > 0, "rows dropped") } else { check(false, "hard drop event first") }
    check(g.board.contains { $0 != 0 }, "cells on the board")

    // Line clears: one, and four at once, with the stack falling down.
    var c = BlocksState(seed: 5)
    let bottom = BlocksState.rows - 1
    for y in (bottom - 3)...bottom { c.fill(row: y, except: [9]) }
    c.board[(bottom - 4) * BlocksState.cols + 0] = 3
    c.piece = ActivePiece(kind: .i, rotation: 1, x: 7, y: bottom - 3)
    check(c.fits(c.piece), "I fits the well")
    let ev = c.hardDrop()
    var clearedRows: [Int] = []
    for e in ev { if case .cleared(let rows) = e { clearedRows = rows } }
    eq(clearedRows.count, 4, "four lines at once")
    eq(c.lines, 4, "lines counted")
    eq(c.score, 800, "four lines pay 800 at level 1")
    eq(c.cell(0, bottom), 3, "the cell above fell down four rows")
    eq(c.fullRows().count, 0, "no full rows left")

    var one = BlocksState(seed: 6)
    one.fill(row: bottom, except: [4, 5, 6, 7])
    one.piece = ActivePiece(kind: .i, rotation: 0, x: 4, y: bottom - 1)
    _ = one.hardDrop()
    eq(one.lines, 1, "single line")
    check(one.board[(bottom * BlocksState.cols)..<((bottom + 1) * BlocksState.cols)].allSatisfy { $0 == 0 }, "bottom row empty after the clear")

    // Hold once per piece.
    var h = BlocksState(seed: 7)
    let first = h.piece.kind
    check(h.holdPiece(), "hold")
    eq(h.hold, first, "held the current piece")
    check(!h.holdPiece(), "only once until the next lock")
    _ = h.hardDrop()
    check(h.holdPiece(), "hold is back after a lock")
    eq(h.piece.kind, first, "swapped back")

    // Gravity, lock delay and levels.
    var t = BlocksState(seed: 8)
    let y0 = t.piece.y
    _ = t.update(1.05)
    check(t.piece.y > y0, "gravity pulls the piece down")
    var lv = BlocksState(seed: 9)
    lv.lines = 9
    lv.fill(row: bottom, except: [4, 5, 6, 7])
    lv.piece = ActivePiece(kind: .i, rotation: 0, x: 4, y: bottom - 1)
    let lvEvents = lv.hardDrop()
    check(lvEvents.contains(.levelUp(2)), "level up every 10 lines")
    check(lv.gravity < BlocksState(seed: 1).gravity, "faster at level 2")
    var lock = BlocksState(seed: 10)
    lock.piece = lock.ghost
    var locked = false
    for _ in 0..<40 { if lock.update(1.0 / 60.0).contains(.locked) { locked = true; break } }
    check(locked, "lock delay ends with a lock")

    // Topping out ends the game; sprint ends on time.
    var top = BlocksState(seed: 11)
    for y in 2..<BlocksState.rows { top.fill(row: y, except: [y % BlocksState.cols]) }
    var over = false
    for _ in 0..<20 { if top.hardDrop().contains(.gameOver) { over = true; break } }
    check(over && top.over, "stack at the top ends the game")
    var sprint = BlocksState(seed: 12, sprint: true)
    var timeUp = false
    for _ in 0..<130 { if sprint.update(1).contains(.timeUp) { timeUp = true; break } }
    check(timeUp && sprint.over, "sprint ends after two minutes")
}
