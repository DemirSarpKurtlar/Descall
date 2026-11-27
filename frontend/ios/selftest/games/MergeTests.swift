import Foundation

func testMerge() {
    // Line rules.
    eq(MergeState.slide([1, 1, 1, 1]).line, [2, 2, 0, 0], "2 2 2 2 -> 4 4")
    eq(MergeState.slide([1, 1, 1, 0]).line, [2, 1, 0, 0], "2 2 2 -> 4 2 (from the slide side)")
    eq(MergeState.slide([2, 2, 3, 0]).line, [3, 3, 0, 0], "4 4 8 -> 8 8, never 16 in one move")
    eq(MergeState.slide([0, 1, 0, 1]).line, [2, 0, 0, 0], "gaps close before fusing")
    eq(MergeState.slide([1, 2, 1, 2]).line, [1, 2, 1, 2], "nothing to fuse")
    eq(MergeState.slide([1, 1, 2, 2]).gained, 4 + 8, "points are the new tiles")

    // Directions on a board (no spawn check: compare the preview).
    let b = MergeState(cells: [
        1, 1, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 1,
        0, 0, 0, 1,
    ])
    eq(b.preview(.left).cells[0], 2, "left fuses row 0")
    eq(b.preview(.right).cells[3], 2, "right fuses row 0 at the far side")
    eq(b.preview(.down).cells[15], 2, "down fuses column 3")
    eq(b.preview(.up).cells[3], 2, "up fuses column 3 at the top")

    // A move that changes nothing does not spawn or use history.
    var still = MergeState(cells: [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1])
    let none = still.move(.left)
    check(!none.moved && none.spawned == nil && still.history.isEmpty, "no move, no spawn")
    check(still.isOver, "a full board without pairs is game over")

    var m = MergeState(seed: 11)
    eq(m.cells.filter { $0 != 0 }.count, 2, "two starting tiles")
    var moved = 0
    for d in [MergeDir.left, .up, .right, .down, .left, .up] {
        let before = m.cells.filter { $0 != 0 }.count
        let r = m.move(d)
        if r.moved {
            moved += 1
            check(r.spawned != nil, "a real move spawns")
            check(m.cells.filter { $0 != 0 }.count <= before + 1, "at most one new tile")
        }
    }
    check(moved > 0, "some moves happened")
    check(m.cells.allSatisfy { $0 >= 0 && $0 <= 2 + 6 }, "tiles stay small early")

    // Undo: three per game.
    var u = MergeState(cells: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], seed: 5)
    let before = u.cells
    _ = u.move(.left)
    eq(u.score, 4, "fused for 4")
    check(u.undo(), "undo")
    eq(u.cells, before, "board back")
    eq(u.score, 0, "score back")
    for _ in 0..<5 {
        _ = u.move(.left); _ = u.move(.right); _ = u.undo()
    }
    eq(u.undosUsed, MergeState.maxUndo, "undos stop at three")
    check(!u.canUndo, "no more undos")

    // Mini board.
    var mini = MergeState(seed: 9, size: 3)
    eq(mini.cells.count, 9, "3 x 3")
    eq(mini.winExponent, 8, "mini wins at 256")
    eq(MergeState.lineIndexes(.down, 0, size: 3), [6, 3, 0], "mini column from the bottom")
    var m3 = MergeState(cells: [1, 1, 0, 0, 0, 0, 7, 7, 0])
    _ = m3.move(.left)
    check(m3.won, "mini reaches 256")
    _ = mini.move(.up)
}
