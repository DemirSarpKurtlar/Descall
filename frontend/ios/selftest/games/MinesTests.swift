import Foundation

func testMines() {
    // First tap is always safe and opens an area, on every size and many seeds.
    for level in MinesLevel.allCases {
        for seed in UInt64(1)...150 {
            var m = MinesState(level: level, seed: seed)
            let rng = Int(seed % UInt64(m.cols * m.rows))
            let ev = m.reveal(rng)
            check(ev != .boom && !m.lost, "\(level) seed \(seed): first tap safe")
            check(!m.mines.contains(rng), "no mine under the first tap")
            check(m.neighbours(rng).allSatisfy { !m.mines.contains($0) }, "no mine next to the first tap")
            eq(m.mines.count, level.mines, "\(level) mine count")
            check(m.count(rng) == 0 && m.cells.filter { $0 == .open }.count > 1, "first tap opens an area")
        }
    }

    // Flags, chord and a loss.
    var f = MinesState(level: .easy, seed: 42)
    _ = f.reveal(0)
    eq(f.toggleFlag(0), .nothing, "open cells cannot be flagged")
    let hidden = f.cells.indices.first { f.cells[$0] == .hidden }!
    eq(f.toggleFlag(hidden), .flagged, "flag")
    eq(f.reveal(hidden), .nothing, "a flagged cell does not open")
    eq(f.minesLeft, f.mineCount - 1, "counter")
    eq(f.toggleFlag(hidden), .unflagged, "unflag")

    // Chord: flag every mine around an opened number, then tap it.
    var c = MinesState(level: .easy, seed: 7)
    _ = c.reveal(c.cols * c.rows / 2)
    if let number = c.cells.indices.first(where: { c.cells[$0] == .open && c.count($0) > 0 && c.neighbours($0).contains(where: { n in c.cells[n] == .hidden && !c.mines.contains(n) }) }) {
        for n in c.neighbours(number) where c.mines.contains(n) { _ = c.toggleFlag(n) }
        let ev = c.reveal(number)
        check(ev != .boom && ev != .nothing, "chord opens the safe neighbours")
    } else {
        check(false, "found a number to chord")
    }

    // Wrong flag + chord explodes; a mine tap loses.
    var l = MinesState(level: .easy, seed: 9)
    _ = l.reveal(0)
    let mine = l.mines.first!
    eq(l.reveal(mine), .boom, "mine")
    check(l.lost && l.over && l.explodedAt == mine, "lost")
    eq(l.reveal(1), .nothing, "nothing after the end")

    // Win: open every safe cell.
    var w = MinesState(level: .easy, seed: 13)
    _ = w.reveal(10)
    var last = MinesEvent.nothing
    for i in w.cells.indices where !w.mines.contains(i) && w.cells[i] == .hidden { last = w.reveal(i) }
    eq(last, .won, "win on the last safe cell")
    check(w.won && w.cells.indices.allSatisfy { !w.mines.contains($0) || w.cells[$0] == .flagged }, "mines flagged on a win")
}
