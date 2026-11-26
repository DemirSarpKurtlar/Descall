import Foundation

func testSudoku() {
    // A known puzzle with one solution, and the same with clues removed (many solutions).
    let known = Array("530070000600195000098000060800060003400803001700020006060000280000419005000080079").map { Int(String($0))! }
    eq(SudokuGen.countSolutions(known), 1, "classic puzzle is unique")
    let solved = SudokuGen.solve(known)!
    check(!solved.contains(0), "solver fills everything")
    eq(Array(solved.prefix(9)), [5, 3, 4, 6, 7, 8, 9, 1, 2], "first row of the solution")
    var loose = known
    for i in [0, 1, 4, 9, 12, 13] { loose[i] = 0 }
    eq(SudokuGen.countSolutions(Array(repeating: 0, count: 81)), 2, "empty grid has many solutions (stops at two)")
    check(SudokuGen.countSolutions(loose) >= 1, "loosened puzzle still solvable")
    var broken = known
    broken[2] = 5
    eq(SudokuGen.countSolutions(broken), 0, "clashing givens have no solution")
    check(SudokuSearch([1], limit: 1) == nil, "wrong size refused")

    // Generator: unique solution, solution consistent, clue counts by level.
    for level in SudokuLevel.allCases {
        for seed in UInt64(1)...4 {
            var rng = GameRNG(seed: seed * 101)
            let g = SudokuGen.generate(level, rng: &rng)
            let clues = g.puzzle.filter { $0 != 0 }.count
            eq(SudokuGen.countSolutions(g.puzzle), 1, "\(level) seed \(seed) unique")
            eq(SudokuGen.solve(g.puzzle) ?? [], g.solution, "\(level) solution matches")
            check(clues >= level.targetClues - 1 && clues <= level.targetClues + 8, "\(level) clues \(clues)")
            for i in 0..<81 where g.puzzle[i] != 0 { check(g.puzzle[i] == g.solution[i], "givens are from the solution") }
            for i in 0..<81 { check((g.puzzle[i] == 0) == (g.puzzle[80 - i] == 0), "symmetric") }
            var rows = Set<Int>()
            for r in 0..<9 { rows.insert(Set(g.solution[(r * 9)..<(r * 9 + 9)]).count) }
            eq(rows, [9], "solution rows hold 1 ... 9")
        }
    }
    check(SudokuLevel.easy.targetClues > SudokuLevel.medium.targetClues && SudokuLevel.medium.targetClues > SudokuLevel.hard.targetClues, "harder means fewer clues")

    // Play: notes, mistakes, conflicts, hints, solve.
    var s = SudokuState(level: .easy, puzzle: known, solution: solved)
    let empty = known.firstIndex(of: 0)!
    s.selected = empty
    s.notesMode = true
    eq(s.enter(4), .noted, "note")
    eq(s.notes[empty], 1 << 4, "note bit")
    s.notesMode = false
    let wrong = solved[empty] == 1 ? 2 : 1
    eq(s.enter(wrong), .wrong, "wrong digit")
    eq(s.mistakes, 1, "mistake counted")
    eq(s.enter(solved[empty]), .placed, "right digit")
    check(!s.conflicts(empty), "no conflict for the right digit")
    s.selected = known.firstIndex(of: 5)!
    eq(s.enter(7), .nothing, "givens cannot change")
    // A peer note of the placed digit is cleared.
    let peer = SudokuState.peers(empty).first { known[$0] == 0 }!
    s.selected = peer
    s.notesMode = true
    _ = s.enter(solved[empty] == 9 ? 8 : 9)
    s.notesMode = false
    var hints = 0
    while !s.solved && hints < 81 { _ = s.hint(); hints += 1 }
    check(s.solved && s.values == solved, "hints finish the board")
    eq(s.resultSeconds, max(1, Int(s.elapsed.rounded(.up))) + s.hints * 30, "hint penalty")
    var lose = SudokuState(level: .hard, puzzle: known, solution: solved)
    lose.selected = empty
    for d in 1...9 where d != solved[empty] { _ = lose.enter(d) }
    check(lose.over && !lose.solved, "three mistakes end the round")
    var notes = SudokuState(level: .easy, puzzle: known, solution: solved)
    notes.fillNotes()
    check(notes.notes[empty] & (1 << solved[empty]) != 0, "auto notes include the answer")
    check(notes.notes[empty] & (1 << 5) == 0, "auto notes skip a digit in the row")
}
