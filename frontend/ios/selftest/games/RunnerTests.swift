import Foundation

func testRunner() {
    // Medals.
    eq(RunnerMedal.of(0), .none, "no medal")
    eq(RunnerMedal.of(9), .none, "nine is not bronze")
    eq(RunnerMedal.of(10), .bronze, "bronze at 10")
    eq(RunnerMedal.of(25), .silver, "silver at 25")
    eq(RunnerMedal.of(50), .gold, "gold at 50")
    eq(RunnerMedal.of(100), .crystal, "crystal at 100")
    eq(RunnerMedal.bronze.next, .silver, "next medal")
    check(RunnerMedal.crystal.next == nil, "top medal")

    // Day and night: 0 ... 1, day at the start, night half way, periodic.
    eq(RunnerState.night(at: 0), 0, "day at start")
    check(abs(RunnerState.night(at: RunnerState.dayLength / 2) - 1) < 1e-9, "night half way")
    check(abs(RunnerState.night(at: 7) - RunnerState.night(at: 7 + RunnerState.dayLength)) < 1e-9, "periodic")
    for t in stride(from: 0.0, to: 200, by: 1.7) {
        let n = RunnerState.night(at: t)
        check(n >= 0 && n <= 1, "night in 0...1")
    }

    // Without flapping Lumo falls to the ground.
    var fall = RunnerState(seed: 1)
    _ = fall.flap()
    var crashed = false
    for _ in 0..<600 { if fall.step(1.0 / 60.0).contains(.crashed) { crashed = true; break } }
    check(crashed && fall.over, "falls and crashes")
    eq(fall.flap().count, 0, "no flying after a crash")

    // A pilot that flaps towards each gap passes spires; each counts once.
    var run = RunnerState(seed: RunnerState.courseSeed(day: 20_000))
    _ = run.flap()
    var passed = 0
    var medals: [RunnerMedal] = []
    for _ in 0..<(60 * 90) {
        let target = run.spires.first { $0.x + RunnerState.spireWidth / 2 >= RunnerState.wispX - RunnerState.wispRadius }?.gapY ?? 80
        if run.y < target - 6 && run.vy < 30 { _ = run.flap() }
        for e in run.step(1.0 / 60.0) {
            if e == .passed { passed += 1 }
            if case .medal(let m) = e { medals.append(m) }
        }
        if run.over { break }
    }
    eq(run.score, passed, "score counts every passed spire once")
    check(run.score >= 10, "a careful pilot passes at least ten spires (\(run.score))")
    check(medals.first == .bronze || run.score < 10, "bronze medal event")
    // Gaps stay inside the sky and close to each other.
    for i in 1..<max(1, run.spires.count) {
        check(abs(run.spires[i].gapY - run.spires[i - 1].gapY) <= 46 + 1e-9, "next gap reachable")
    }
    for s in run.spires {
        check(s.gapY - RunnerState.gap / 2 > RunnerState.ground && s.gapY + RunnerState.gap / 2 < RunnerState.height, "gap inside the sky")
    }

    // Ghost trace: recorded while flying, read back with interpolation.
    check(run.trace.count > 10, "trace recorded")
    check(abs((RunnerState.ghostY([10, 20], at: 0.05) ?? 0) - 15) < 1e-6, "ghost interpolates")
    check(RunnerState.ghostY([10, 20], at: 5) == nil, "ghost ends")
    check(RunnerState.ghostY([], at: 0) == nil, "no ghost")
    eq(RunnerState.courseSeed(day: 5), RunnerState.courseSeed(day: 5), "one course per day")
    check(RunnerState.courseSeed(day: 5) != RunnerState.courseSeed(day: 6), "a new course tomorrow")

    // Hitting a spire crashes.
    var hit = RunnerState(seed: 2)
    _ = hit.flap()
    hit.spires = [RunnerSpire(x: RunnerState.wispX, gapY: hit.y + 40)]
    check(hit.hits(hit.spires[0]), "inside a spire")
    check(hit.step(1.0 / 60.0).contains(.crashed), "crash on a spire")
}
