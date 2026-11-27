import Foundation

// Isilti: tap to fly. Lumo (a round firefly with one big eye and a glowing tail, the
// game's own character) glides through gaps between crystal spires. Court units 100 x 150,
// y up. The sky turns from day to dusk to night and back every 45 seconds of flight;
// medals at 10 / 25 / 50 / 100 spires. Every day has its own course (seed from the day),
// so the best run of the day flies along as a ghost.

enum RunnerMedal: Int, Codable, CaseIterable {
    case none = 0, bronze, silver, gold, crystal

    static func of(_ score: Int) -> RunnerMedal {
        switch score {
        case 100...: return .crystal
        case 50...: return .gold
        case 25...: return .silver
        case 10...: return .bronze
        default: return .none
        }
    }

    /// Spires needed for this medal.
    var threshold: Int { [0, 10, 25, 50, 100][rawValue] }

    var next: RunnerMedal? { RunnerMedal(rawValue: rawValue + 1) }
}

enum RunnerEvent: Equatable {
    case flap, passed, medal(RunnerMedal), crashed, started
}

struct RunnerSpire: Codable, Equatable {
    var x: Double
    /// Centre of the gap.
    var gapY: Double
    var passed = false
}

struct RunnerState: Codable, Equatable {
    static let width = 100.0
    static let height = 150.0
    static let ground = 12.0
    static let wispX = 30.0
    static let wispRadius = 4.2
    static let gravity = -300.0
    static let flapSpeed = 102.0
    static let spireWidth = 13.0
    static let gap = 44.0
    static let spacing = 54.0
    static let dayLength = 45.0

    var y = 80.0
    var vy = 0.0
    var started = false
    var over = false
    var score = 0
    var spires: [RunnerSpire] = []
    var flightTime = 0.0
    /// Wing beat phase for the drawing (0 ... 1).
    var wing = 0.0
    /// Height every `traceStep` seconds of flight (the ghost of this run).
    var trace: [Double] = []
    var traceClock = 0.0
    var rng: GameRNG

    static let traceStep = 0.1
    static let maxTrace = 6000

    /// Seed of the day's course (same course all day, a new one tomorrow).
    static func courseSeed(day: Int) -> UInt64 { 0x15_11_71 &+ UInt64(max(0, day)) &* 2_654_435_761 }

    /// Ghost height at a flight time from a recorded trace (nil once it ran out).
    static func ghostY(_ trace: [Double], at t: Double) -> Double? {
        guard !trace.isEmpty, t >= 0 else { return nil }
        let p = t / traceStep
        let i = Int(p)
        guard i + 1 < trace.count else { return i < trace.count ? trace[i] : nil }
        return GameMath.lerp(trace[i], trace[i + 1], p - Double(i))
    }

    init(seed: UInt64) {
        rng = GameRNG(seed: seed)
    }

    /// World speed: a little faster every 10 spires, capped.
    var speed: Double { min(70, 44 + Double(score / 10) * 3) }

    /// 0 = full day, 1 = deep night (smooth cosine over `dayLength`).
    static func night(at t: Double) -> Double {
        let phase = (t / dayLength).truncatingRemainder(dividingBy: 1)
        return (1 - cos(phase * 2 * Double.pi)) / 2
    }

    var night: Double { RunnerState.night(at: flightTime) }
    var medal: RunnerMedal { RunnerMedal.of(score) }

    /// Tilt for the drawing: nose up when climbing, down when falling (radians).
    var tilt: Double { GameMath.clamp(vy / 220, -1.1, 0.45) }

    mutating func flap() -> [RunnerEvent] {
        guard !over else { return [] }
        var events: [RunnerEvent] = []
        if !started {
            started = true
            flightTime = 0
            trace = [y]
            traceClock = 0
            spires = [RunnerSpire(x: RunnerState.width + 30, gapY: newGap(previous: 80))]
            events.append(.started)
        }
        vy = RunnerState.flapSpeed
        wing = 0
        events.append(.flap)
        return events
    }

    private mutating func newGap(previous: Double) -> Double {
        let lo = RunnerState.ground + RunnerState.gap / 2 + 8
        let hi = RunnerState.height - RunnerState.gap / 2 - 8
        // Never more than 46 units from the last gap: always reachable.
        let g = previous + rng.range(-46, 46)
        return GameMath.clamp(g, lo, hi)
    }

    mutating func step(_ dt: Double) -> [RunnerEvent] {
        var events: [RunnerEvent] = []
        for h in GameMath.substeps(dt) {
            stepOnce(h, &events)
            if over { break }
        }
        return events
    }

    private mutating func stepOnce(_ dt: Double, _ events: inout [RunnerEvent]) {
        wing = (wing + dt * 3.2).truncatingRemainder(dividingBy: 1)
        guard started, !over else {
            // Hover gently before the first tap.
            if !started { y = 80 + sin(flightTime * 4) * 3; flightTime += dt }
            return
        }
        flightTime += dt
        traceClock += dt
        if traceClock >= RunnerState.traceStep, trace.count < RunnerState.maxTrace {
            traceClock -= RunnerState.traceStep
            trace.append(y)
        }
        vy = max(-180, vy + RunnerState.gravity * dt)
        y = min(RunnerState.height - RunnerState.wispRadius, y + vy * dt)
        if y - RunnerState.wispRadius <= RunnerState.ground {
            y = RunnerState.ground + RunnerState.wispRadius
            crash(&events)
            return
        }
        let dx = speed * dt
        for i in spires.indices { spires[i].x -= dx }
        spires.removeAll { $0.x < -RunnerState.spireWidth }
        if let last = spires.last, last.x < RunnerState.width + 30 - RunnerState.spacing {
            spires.append(RunnerSpire(x: last.x + RunnerState.spacing, gapY: newGap(previous: last.gapY)))
        }
        for i in spires.indices {
            if !spires[i].passed, spires[i].x + RunnerState.spireWidth / 2 < RunnerState.wispX - RunnerState.wispRadius {
                spires[i].passed = true
                let before = medal
                score += 1
                events.append(.passed)
                if medal != before { events.append(.medal(medal)) }
            }
            if hits(spires[i]) {
                crash(&events)
                return
            }
        }
    }

    /// Circle against the two spire rectangles (above and below the gap).
    func hits(_ s: RunnerSpire) -> Bool {
        let r = RunnerState.wispRadius
        let left = s.x - RunnerState.spireWidth / 2, right = s.x + RunnerState.spireWidth / 2
        let gapLo = s.gapY - RunnerState.gap / 2, gapHi = s.gapY + RunnerState.gap / 2
        for rect in [(lo: RunnerState.ground, hi: gapLo), (lo: gapHi, hi: RunnerState.height + 40)] {
            let cx = GameMath.clamp(RunnerState.wispX, left, right)
            let cy = GameMath.clamp(y, rect.lo, rect.hi)
            let dx = RunnerState.wispX - cx, dy = y - cy
            if dx * dx + dy * dy < r * r { return true }
        }
        return false
    }

    private mutating func crash(_ events: inout [RunnerEvent]) {
        over = true
        events.append(.crashed)
    }
}
