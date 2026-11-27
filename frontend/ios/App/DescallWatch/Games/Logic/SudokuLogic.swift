import Foundation

// Ninefold: sudoku. The generator fills a random solved grid, then empties cells in
// symmetric pairs and keeps a removal only while the puzzle still has exactly one
// solution (bitmask solver, most-constrained cell first, stops at two solutions).
// Cells are 0 ... 80 row-major, 0 = empty.

enum SudokuLevel: String, Codable, CaseIterable {
    case easy, medium, hard

    /// Clues the generator aims for (it stops earlier only if no pair can go).
    var targetClues: Int {
        switch self {
        case .easy: return 38
        case .medium: return 31
        case .hard: return 25
        }
    }
}

struct SudokuSearch {
    var cells: [Int]
    var rowMask = [Int](repeating: 0, count: 9)
    var colMask = [Int](repeating: 0, count: 9)
    var boxMask = [Int](repeating: 0, count: 9)
    var found = 0
    var limit: Int
    var solution: [Int]?
    var rng: GameRNG?
    /// Guard against pathological inputs (never hit by generated puzzles).
    var nodes = 0
    static let maxNodes = 2_000_000

    static func box(_ i: Int) -> Int { (i / 27) * 3 + (i % 9) / 3 }

    /// nil when the givens already break a rule.
    init?(_ grid: [Int], limit: Int, rng: GameRNG? = nil) {
        guard grid.count == 81 else { return nil }
        cells = grid
        self.limit = limit
        self.rng = rng
        for i in 0..<81 where grid[i] != 0 {
            let d = grid[i]
            guard (1...9).contains(d) else { return nil }
            let bit = 1 << d
            let r = i / 9, c = i % 9, b = SudokuSearch.box(i)
            if rowMask[r] & bit != 0 || colMask[c] & bit != 0 || boxMask[b] & bit != 0 { return nil }
            rowMask[r] |= bit
            colMask[c] |= bit
            boxMask[b] |= bit
        }
    }

    func candidates(_ i: Int) -> Int {
        let used = rowMask[i / 9] | colMask[i % 9] | boxMask[SudokuSearch.box(i)]
        return ~used & 0b11_1111_1110
    }

    mutating func run() {
        nodes += 1
        if found >= limit || nodes > SudokuSearch.maxNodes { return }
        var best = -1
        var bestMask = 0
        var bestCount = 10
        for i in 0..<81 where cells[i] == 0 {
            let m = candidates(i)
            let n = m.nonzeroBitCount
            if n == 0 { return }
            if n < bestCount {
                best = i
                bestMask = m
                bestCount = n
                if n == 1 { break }
            }
        }
        if best < 0 {
            found += 1
            if solution == nil { solution = cells }
            return
        }
        var digits = (1...9).filter { bestMask & (1 << $0) != 0 }
        if rng != nil { digits.shuffle(using: &rng!) }
        let r = best / 9, c = best % 9, b = SudokuSearch.box(best)
        for d in digits {
            let bit = 1 << d
            cells[best] = d
            rowMask[r] |= bit
            colMask[c] |= bit
            boxMask[b] |= bit
            run()
            cells[best] = 0
            rowMask[r] &= ~bit
            colMask[c] &= ~bit
            boxMask[b] &= ~bit
            if found >= limit { return }
        }
    }
}

enum SudokuGen {
    /// 0, 1 or 2 (= two or more) solutions.
    static func countSolutions(_ grid: [Int], limit: Int = 2) -> Int {
        guard var s = SudokuSearch(grid, limit: limit) else { return 0 }
        s.run()
        return s.found
    }

    static func solve(_ grid: [Int]) -> [Int]? {
        guard var s = SudokuSearch(grid, limit: 1) else { return nil }
        s.run()
        return s.solution
    }

    static func generate(_ level: SudokuLevel, rng: inout GameRNG) -> (puzzle: [Int], solution: [Int]) {
        var fill = SudokuSearch(Array(repeating: 0, count: 81), limit: 1, rng: rng)!
        fill.run()
        rng = fill.rng ?? rng
        let solution = fill.solution ?? Array(repeating: 0, count: 81)
        var puzzle = solution
        var order = Array(0...40)
        order.shuffle(using: &rng)
        var clues = 81
        for i in order {
            if clues <= level.targetClues { break }
            let j = 80 - i
            let saved = (puzzle[i], puzzle[j])
            puzzle[i] = 0
            puzzle[j] = 0
            if countSolutions(puzzle) == 1 {
                clues -= (i == j ? 1 : 2)
            } else {
                puzzle[i] = saved.0
                puzzle[j] = saved.1
            }
        }
        return (puzzle, solution)
    }
}

enum SudokuEvent: Equatable {
    case placed, wrong, noted, erased, solved, hint, nothing
}

struct SudokuState: Codable, Equatable {
    static let maxMistakes = 3

    var level: SudokuLevel
    var givens: [Bool]
    var values: [Int]
    var solution: [Int]
    /// Pencil marks: bit d set = note d.
    var notes: [Int]
    var selected = 40
    var notesMode = false
    var mistakes = 0
    var hints = 0
    var elapsed = 0.0
    var solved = false

    init(level: SudokuLevel, puzzle: [Int], solution: [Int]) {
        self.level = level
        givens = puzzle.map { $0 != 0 }
        values = puzzle
        self.solution = solution
        notes = Array(repeating: 0, count: 81)
        selected = puzzle.firstIndex(of: 0) ?? 40
    }

    init(level: SudokuLevel, seed: UInt64) {
        var rng = GameRNG(seed: seed)
        let g = SudokuGen.generate(level, rng: &rng)
        self.init(level: level, puzzle: g.puzzle, solution: g.solution)
    }

    var over: Bool { solved || mistakes >= SudokuState.maxMistakes }

    static func peers(_ i: Int) -> [Int] {
        let r = i / 9, c = i % 9, b = SudokuSearch.box(i)
        return (0..<81).filter { $0 != i && ($0 / 9 == r || $0 % 9 == c || SudokuSearch.box($0) == b) }
    }

    /// The digit clashes with another digit in its row, column or box.
    func conflicts(_ i: Int) -> Bool {
        let d = values[i]
        guard d != 0 else { return false }
        return SudokuState.peers(i).contains { values[$0] == d }
    }

    /// How many of a digit are on the board (the picker greys out finished digits).
    func placedCount(_ d: Int) -> Int { values.filter { $0 == d }.count }

    /// Crown digit at the selected cell: a note in notes mode, else the digit itself.
    /// A wrong digit counts a mistake and stays visible in red until it is changed.
    mutating func enter(_ d: Int) -> SudokuEvent {
        let i = selected
        guard !over, !givens[i], (0...9).contains(d) else { return .nothing }
        if d == 0 { return erase() }
        if notesMode {
            guard values[i] == 0 else { return .nothing }
            notes[i] ^= 1 << d
            return .noted
        }
        if values[i] == d { return .nothing }
        values[i] = d
        notes[i] = 0
        if d != solution[i] {
            mistakes += 1
            return .wrong
        }
        // Clear this digit from the notes it now rules out.
        for p in SudokuState.peers(i) { notes[p] &= ~(1 << d) }
        if values == solution {
            solved = true
            return .solved
        }
        return .placed
    }

    mutating func erase() -> SudokuEvent {
        let i = selected
        guard !over, !givens[i], values[i] != 0 || notes[i] != 0 else { return .nothing }
        values[i] = 0
        notes[i] = 0
        return .erased
    }

    /// Fills the selected cell (or the first wrong / empty one) from the solution.
    mutating func hint() -> SudokuEvent {
        guard !over else { return .nothing }
        let target = (!givens[selected] && values[selected] != solution[selected]) ? selected
            : (values.indices.first { !givens[$0] && values[$0] != solution[$0] } ?? -1)
        guard target >= 0 else { return .nothing }
        selected = target
        values[target] = solution[target]
        notes[target] = 0
        for p in SudokuState.peers(target) { notes[p] &= ~(1 << solution[target]) }
        hints += 1
        if values == solution {
            solved = true
            return .solved
        }
        return .hint
    }

    /// Every empty cell gets the notes its row, column and box still allow.
    mutating func fillNotes() {
        for i in 0..<81 where values[i] == 0 {
            var mask = 0
            for d in 1...9 where !SudokuState.peers(i).contains(where: { values[$0] == d }) { mask |= 1 << d }
            notes[i] = mask
        }
    }

    /// Seconds plus 30 per hint (lower is better).
    var resultSeconds: Int { max(1, Int(elapsed.rounded(.up)) + hints * 30) }
}
