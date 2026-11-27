import SwiftUI

// The frame every game runs in (draft A): score capsule on top, a pause button, the
// grouped pause list, wrist-down (always-on) dimming, a 3 s countdown when the wrist comes
// back, autosave every 2 s, the critical admin alert, the 60 s daily challenge bar and the
// result screen. Games subclass GameModel and draw their own content.

enum GamePause: Equatable {
    case none, user, wrist, alert
}

struct GameStat: Hashable {
    var label: String
    var value: String
}

struct GameFinish: Equatable {
    var title: String
    var detail: String
    /// Value for the score book (points, wins or seconds).
    var result: Int
    /// false: shown but not a best (a lost chess game, a missed challenge).
    var counts = true
    var won: Bool?
    var stats: [GameStat] = []
    /// Big number on the result screen ("48.230", "1:42").
    var headline: String
    /// Optional follow-up offer ("Usta'ya karşı oyna"): label and the mode it starts.
    var nextLabel: String? = nil
    var nextMode: String? = nil
    var pill: String? = nil
}

struct GameExtraAction: Identifiable {
    var id: String
    var icon: String
    var title: String
    var trailing: String? = nil
    var iconColor: Color = GT.brandHi
    var destructive = false
    /// Ask first with this question.
    var confirm: String? = nil
    /// Close the pause list after running.
    var resumes = true
    var enabled = true
    var run: () -> Void
}

struct GameLaunch: Identifiable, Equatable {
    var game: GameId
    var mode: String
    var challenge: DailyChallenge?
    var resume: Bool

    var id: String { "\(game.rawValue):\(mode):\(challenge?.day ?? -1):\(resume)" }
}

/// Base of every game's model. Not bound to an actor: SpriteKit scenes step it from their
/// frame callback, SwiftUI from the shell's loop; both run on the main thread.
class GameModel: ObservableObject {
    let game: GameId
    @Published var mode: String
    let challenge: DailyChallenge?
    @Published var pause: GamePause = .none
    @Published var countdown = 0
    @Published var finish: GameFinish?
    /// Whole seconds left of a daily challenge (published once a second).
    @Published var challengeSecondsLeft = Int(DailyChallenge.seconds)
    @Published var restored = false
    private var challengeClock = DailyChallenge.seconds
    private(set) var unsavedSeconds = 0.0
    /// Frames per second the shell drives `advance` with (0: a SpriteKit scene does it).
    var frameRate: Double { 60 }
    /// The round has started (something worth saving).
    var started = false

    init(game: GameId, mode: String, challenge: DailyChallenge?) {
        self.game = game
        self.mode = game.modes.contains(mode) ? mode : game.defaultMode
        self.challenge = challenge
    }

    var isRunning: Bool { pause == .none && countdown == 0 && finish == nil }

    // MARK: For subclasses

    /// A fresh round in the current mode.
    func reset() {}
    func step(_ dt: Double) {}
    /// The saved round (GameSave JSON), nil when there is nothing to save.
    func encode() -> Data? { nil }
    func decode(_ data: Data) -> Bool { false }
    /// "5 – 7 · servis sende" for the pause card, the always-on screen and the countdown.
    var statusLine: String { "" }
    /// Lines on the always-on screen (default: the status line).
    var dimmedLines: [String] { [statusLine] }
    var saveSummary: String { statusLine }
    var challengeProgress: Int { 0 }
    var extraActions: [GameExtraAction] { [] }
    /// Optional evaluation bar (0 ... 1 white's share) and recent moves on the pause card.
    var evalShare: Double? { nil }
    var recentLine: String? { nil }
    /// The mode can change from the pause list (difficulty row).
    var modeChangeable: Bool { game.modes.count > 1 && challenge == nil }

    // MARK: Driven by the shell

    final func advance(_ dt: Double) {
        guard isRunning, dt > 0 else { return }
        let d = min(dt, 0.1)
        unsavedSeconds += d
        step(d)
        guard let c = challenge, finish == nil else { return }
        challengeClock = max(0, challengeClock - d)
        let whole = Int(challengeClock.rounded(.up))
        if whole != challengeSecondsLeft { challengeSecondsLeft = whole }
        if c.isMet(challengeProgress) {
            finishChallenge(met: true)
        } else if challengeClock <= 0 {
            finishChallenge(met: false)
        }
    }

    func takeSeconds() -> Double {
        let s = unsavedSeconds
        unsavedSeconds = 0
        return s
    }

    func end(_ f: GameFinish) {
        guard finish == nil else { return }
        if challenge != nil, let c = challenge {
            // A round that ends on its own inside the minute still counts its progress.
            finishChallenge(met: c.isMet(challengeProgress))
            return
        }
        finish = f
    }

    private func finishChallenge(met: Bool) {
        guard let c = challenge, finish == nil else { return }
        finish = GameFinish(
            title: met ? GL.t("challengeMet") : GL.t("challengeMissed"),
            detail: GL.goal(c),
            result: challengeProgress,
            counts: false,
            won: met,
            headline: "\(GL.number(challengeProgress)) / \(GL.number(c.target))"
        )
    }

    func restart() {
        finish = nil
        pause = .none
        countdown = 0
        restored = false
        challengeClock = DailyChallenge.seconds
        challengeSecondsLeft = Int(DailyChallenge.seconds)
        started = false
        reset()
    }

    func userPause() {
        guard finish == nil, pause == .none else { return }
        countdown = 0
        pause = .user
    }

    func setMode(_ m: String) {
        guard game.modes.contains(m), m != mode else { return }
        mode = m
        restart()
    }
}

// MARK: - Frame

struct GameFrame<Content: View>: View {
    @ObservedObject var model: GameModel
    var content: () -> Content

    init(model: GameModel, @ViewBuilder content: @escaping () -> Content) {
        self.model = model
        self.content = content
    }

    @EnvironmentObject private var store: WatchStore
    @ObservedObject private var center = GameCenter.shared
    @StateObject private var watcher = GameAlertWatcher()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isLuminanceReduced) private var dimmed
    @State private var outcome: GameOutcome?
    @State private var countdownRun = 0
    @State private var confirming: GameExtraAction?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content()
                .opacity(dimmed ? GT.aodSceneOpacity : 1)
                .saturation(dimmed ? 0.45 : 1)
                .allowsHitTesting(model.isRunning && !dimmed)
            if model.finish == nil && !dimmed {
                topBar
            }
            if dimmed, model.finish == nil {
                dimmedOverlay
            } else if let f = model.finish {
                GameResultView(model: model, finish: f, outcome: outcome, onAgain: { again(f) }, onLeave: leave)
            } else if model.pause == .alert, let a = watcher.alert {
                alertCard(a)
            } else if model.countdown > 0 {
                countdownView
            } else if model.pause != .none {
                pauseList
            }
        }
        .task(id: model.isRunning && !dimmed && model.frameRate > 0) {
            guard model.isRunning, !dimmed, model.frameRate > 0 else { return }
            var last = Date()
            let nanos = UInt64(1_000_000_000 / model.frameRate)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: nanos)
                let now = Date()
                model.advance(now.timeIntervalSince(last))
                last = now
            }
        }
        // Autosave every 2 s and the play-time log.
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                flush()
            }
        }
        .task(id: countdownRun) { await runCountdown() }
        .task { await watcher.run(store) }
        .onChange(of: watcher.alert) { _, a in
            if a != nil, model.finish == nil {
                model.countdown = 0
                model.pause = .alert
                GameHaptics.play(.miss)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { sleepNow() } else { wakeUp() }
        }
        .onChange(of: dimmed) { _, isDim in
            if isDim { sleepNow() } else { wakeUp() }
        }
        .onChange(of: model.finish) { _, f in
            guard let f else { return }
            record(f)
        }
        .onAppear {
            if model.restored { beginCountdown() }
        }
        .onDisappear { flush() }
        .confirmationDialog(confirming?.confirm ?? "", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }), titleVisibility: .visible) {
            if let c = confirming {
                Button(c.title, role: c.destructive ? .destructive : nil) {
                    c.run()
                    if c.resumes, model.finish == nil { model.pause = .none }
                    confirming = nil
                }
                Button(L.cancel, role: .cancel) { confirming = nil }
            }
        }
    }

    // MARK: Top bar (pause button, challenge clock)

    private var topBar: some View {
        VStack {
            HStack(spacing: 6) {
                Button {
                    model.userPause()
                    GameHaptics.play(.select)
                } label: {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 11, weight: .bold))
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(Color.white.opacity(0.15)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(GL.t("paused"))
                if model.challenge != nil {
                    GamePill(text: "\(model.challengeSecondsLeft) s", icon: "clock", tone: .gold)
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 10)
            .padding(.top, 4)
            Spacer()
        }
        .opacity(model.pause == .none && model.countdown == 0 ? 1 : 0)
    }

    // MARK: Pause list

    private var pauseList: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text(GL.t("paused")).font(.system(size: 15, weight: .semibold)).foregroundStyle(GT.brandHi).frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 8)
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(modeTitle).font(GT.title).lineLimit(1)
                        Text(model.statusLine).font(GT.caption).foregroundStyle(GT.ink2).lineLimit(2)
                        if let share = model.evalShare {
                            GeometryReader { g in
                                HStack(spacing: 0) {
                                    Rectangle().fill(GT.pieceWhite).frame(width: g.size.width * CGFloat(share))
                                    Rectangle().fill(Color(red: 0.16, green: 0.19, blue: 0.31))
                                }
                            }
                            .frame(height: 8)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .padding(.vertical, 3)
                        }
                        if let line = model.recentLine {
                            Text(line).font(GT.caption).monospacedDigit().foregroundStyle(GT.ink2).lineLimit(1).minimumScaleFactor(0.7)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .gameGlass()
                Button {
                    model.pause = .none
                } label: {
                    Label(GL.t("resume"), systemImage: "play.fill")
                }
                .buttonStyle(GameCTAStyle())
                VStack(spacing: 0) {
                    ForEach(model.extraActions) { a in
                        GameActionRow(icon: a.icon, title: a.title, trailing: a.trailing, iconColor: a.iconColor, destructive: a.destructive) {
                            guard a.enabled else { return }
                            if a.confirm != nil {
                                confirming = a
                            } else {
                                a.run()
                                if a.resumes, model.finish == nil { model.pause = .none }
                            }
                        }
                        .opacity(a.enabled ? 1 : 0.4)
                    }
                    GameActionRow(icon: "arrow.counterclockwise", title: GL.t("restart")) {
                        center.clearSave(model.game)
                        model.restart()
                    }
                    if model.modeChangeable {
                        GameActionRow(icon: "gauge.with.dots.needle.33percent", title: GL.t("difficulty"), trailing: GL.mode(model.game, model.mode)) {
                            model.setMode(nextMode())
                            center.clearSave(model.game)
                        }
                    }
                    GameActionRow(icon: "waveform", title: GL.t("haptics"), trailing: GL.t("haptics.\(center.haptics.rawValue)")) {
                        let all = GameHapticLevel.allCases
                        center.haptics = all[((all.firstIndex(of: center.haptics) ?? 0) + 1) % all.count]
                        GameHaptics.play(.select)
                    }
                    GameActionRow(icon: "rectangle.portrait.and.arrow.right", title: GL.t("quit"), divider: false) { leave() }
                }
                .gameGlass()
                Text(GL.t("quitSaved")).font(.system(size: 11)).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 5)
            .padding(.top, 2)
        }
        .background(Color.black.opacity(0.62).ignoresSafeArea())
        .background(.ultraThinMaterial)
    }

    private var modeTitle: String {
        let m = GL.mode(model.game, model.mode)
        return m.isEmpty ? GL.name(model.game) : "\(GL.name(model.game)) · \(m)"
    }

    private func nextMode() -> String {
        let modes = model.game.modes
        var i = ((modes.firstIndex(of: model.mode) ?? 0) + 1) % modes.count
        // Hamle's master level opens after one win at medium.
        if model.game == .chess, modes[i] == "hard", !center.chessMasterUnlocked { i = (i + 1) % modes.count }
        return modes[i]
    }

    // MARK: Wrist down / always on

    private var dimmedOverlay: some View {
        VStack(spacing: 4) {
            Image(systemName: "pause.fill")
                .font(.system(size: 16))
                .frame(width: 44, height: 44)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.5), lineWidth: 1.5))
            Text(GL.t("paused")).font(.system(size: 16, weight: .semibold))
            ForEach(Array(model.dimmedLines.enumerated()), id: \.offset) { i, line in
                Text(line)
                    .font(i == 0 ? GT.num(20) : .system(size: 12))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.white.opacity(i == 0 ? 0.7 : 0.6))
            }
            Text(GL.t("raiseWrist")).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.6)).multilineTextAlignment(.center)
        }
        .foregroundStyle(GT.aodText)
        .padding(.horizontal, 10)
    }

    private func sleepNow() {
        guard model.finish == nil else { return }
        if model.pause == .none || model.countdown > 0 {
            model.countdown = 0
            model.pause = .wrist
        }
        flush()
    }

    private func wakeUp() {
        guard scenePhase == .active, !dimmed, model.finish == nil, model.pause == .wrist else { return }
        beginCountdown()
    }

    private func beginCountdown() {
        guard model.finish == nil else { return }
        model.pause = .none
        model.countdown = 3
        countdownRun += 1
    }

    private func runCountdown() async {
        guard model.countdown > 0 else { return }
        while model.countdown > 0, !Task.isCancelled {
            GameHaptics.play(.tick)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if Task.isCancelled || model.pause != .none { return }
            model.countdown -= 1
        }
        if model.countdown == 0 { model.restored = false }
    }

    private var countdownView: some View {
        VStack(spacing: 3) {
            Text(GL.t("fromWhereLeft").uppercased(with: L.locale)).font(GT.micro).foregroundStyle(GT.brandHi)
            ZStack {
                Circle().stroke(Color.white.opacity(0.14), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: CGFloat(model.countdown) / 3)
                    .stroke(GT.ctaTop, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.9), value: model.countdown)
                Text("\(model.countdown)").font(GT.num(38))
            }
            .frame(width: 78, height: 78)
            .padding(.vertical, 4)
            Text(model.statusLine).font(.system(size: 14, weight: .semibold)).lineLimit(2).multilineTextAlignment(.center)
            Text(GL.t("savedAsleep")).font(GT.caption).foregroundStyle(GT.ink2)
            Text(GL.t("wait")).font(.system(size: 13, weight: .semibold)).foregroundStyle(GT.brandHi).padding(.top, 2)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.62).ignoresSafeArea())
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .combine)
    }

    // MARK: Critical admin alert

    private func alertCard(_ a: GameAlert) -> some View {
        ScrollView {
            VStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 2) {
                    Label(GL.t("critical"), systemImage: "exclamationmark.triangle.fill").font(GT.micro).foregroundStyle(GT.dangerText)
                    Text(GL.t("alert.\(a.kind.rawValue)")).font(.system(size: 15, weight: .bold)).padding(.top, 1)
                    if a.kind == .reports {
                        Text(GL.t("alertReportsBody", ["n": "\(a.reports ?? 0)"])).font(GT.caption).foregroundStyle(GT.ink2)
                    } else if let e = a.errors {
                        Text(GL.t("alertErrorsBody", ["n": "\(e)"])).font(GT.caption).foregroundStyle(GT.ink2)
                    }
                    Text(GL.t("autoPaused", ["game": GL.name(model.game)])).font(GT.caption).foregroundStyle(GT.ink2).padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 11)
                .padding(.vertical, 9)
                .gameGlass(.red)
                Button {
                    let section = GameAlertRule.section(a.kind)
                    let allowed = section.map { store.home?.adminSections?.contains($0) ?? false } ?? false
                    flush()
                    watcher.dismiss()
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { GameRouter.openAdmin(section: allowed ? section : nil) }
                } label: {
                    Label(a.kind == .reports ? GL.t("goReports") : GL.t("goErrors"), systemImage: "exclamationmark.triangle.fill")
                }
                .buttonStyle(GameCTAStyle())
                Button {
                    watcher.dismiss()
                    beginCountdown()
                } label: {
                    Label(GL.t("backToGame"), systemImage: "play.fill")
                }
                .buttonStyle(GameSecondaryStyle())
            }
            .padding(.horizontal, 5)
        }
        .background(Color.black.opacity(0.62).ignoresSafeArea())
        .background(.ultraThinMaterial)
    }

    // MARK: Bookkeeping

    private func flush() {
        center.addPlayTime(model.takeSeconds())
        guard model.finish == nil, model.challenge == nil, model.started, let data = model.encode() else { return }
        center.save(model.game, data: data, mode: model.mode, summary: model.saveSummary)
    }

    private func record(_ f: GameFinish) {
        center.addPlayTime(model.takeSeconds())
        if model.challenge == nil { center.clearSave(model.game) }
        var o = GameOutcome()
        if let c = model.challenge {
            o.challengeFirst = center.recordChallenge(c, progress: f.result)
            o.challengeStreak = center.challenges.streak(today: center.today)
            center.finishRound(model.game, mode: model.mode, result: f.result, counts: false)
        } else {
            let r = center.finishRound(model.game, mode: model.mode, result: f.result, counts: f.counts)
            o.isRecord = r.isRecord && f.counts
            o.previous = r.previous
        }
        o.recent = center.recent[GameBest.key(model.game.rawValue, model.mode)] ?? []
        outcome = o
        GameHaptics.play(o.isRecord || o.challengeFirst ? .record : (f.won == false ? .miss : .point))
        Task { await center.sync(store) }
    }

    private func again(_ f: GameFinish) {
        outcome = nil
        if let m = f.nextMode, m != model.mode {
            model.setMode(m)
        } else {
            model.restart()
        }
    }

    private func leave() {
        flush()
        dismiss()
    }
}

struct GameOutcome: Equatable {
    var isRecord = false
    var previous: Int?
    var recent: [Int] = []
    var challengeFirst = false
    var challengeStreak = 0
}

// MARK: - Result screen (draft A "Yeni rekor" / "Satranç sonucu")

struct GameResultView: View {
    @ObservedObject var model: GameModel
    var finish: GameFinish
    var outcome: GameOutcome?
    var onAgain: () -> Void
    var onLeave: () -> Void
    @ObservedObject private var center = GameCenter.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                VStack(spacing: 1) {
                    if outcome?.isRecord == true {
                        GamePill(text: GL.t("newRecord"), icon: "trophy.fill", tone: .gold)
                    } else if outcome?.challengeFirst == true {
                        GamePill(text: GL.t("challengeStreak", ["n": "\(outcome?.challengeStreak ?? 1)"]), icon: "bolt.fill", tone: .gold)
                    }
                    Text(finish.title).font(.system(size: 20, weight: .bold)).multilineTextAlignment(.center).padding(.top, 2)
                    Text(finish.headline).font(GT.num(32)).lineLimit(1).minimumScaleFactor(0.6)
                    if let line = deltaLine { Text(line).font(GT.caption).foregroundStyle(GT.ink2) }
                    Text(finish.detail).font(GT.caption).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
                }
                if let recent = outcome?.recent, recent.count >= 2, finish.counts, model.game.kind != .wins {
                    VStack(spacing: 5) {
                        GameBars(values: recent.map { Double(model.game.direction == .low ? max(1, 1000 - min($0, 999)) : $0) }, height: 20, gold: outcome?.isRecord == true)
                        if !finish.stats.isEmpty { statsLine }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .gameGlass()
                } else if !finish.stats.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(finish.stats.enumerated()), id: \.offset) { i, s in
                            HStack {
                                Text(s.label).font(.system(size: 13))
                                Spacer(minLength: 4)
                                Text(s.value).font(.system(size: 13, weight: .bold)).monospacedDigit()
                            }
                            .padding(.horizontal, 10)
                            .frame(minHeight: 31)
                            if i < finish.stats.count - 1 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }
                        }
                    }
                    .gameGlass()
                }
                if let pill = finish.pill { GamePill(text: pill, icon: "lock.open.fill", tone: .brand) }
                Button(action: onAgain) {
                    Label(finish.nextLabel ?? GL.t("playAgain"), systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(GameCTAStyle())
                Button(action: onLeave) { Text(GL.t("backToGames")) }
                    .buttonStyle(GameSecondaryStyle())
                syncLine
            }
            .padding(.horizontal, 5)
        }
        .background(DescallBackground())
    }

    private var deltaLine: String? {
        guard finish.counts, let prev = outcome?.previous, outcome?.isRecord == true else { return nil }
        let diff = abs(finish.result - prev)
        let v = GameFormat.result(model.game, prev)
        let d = model.game.kind == .seconds ? "-\(GameMath.clock(diff))" : "+\(GameFormat.number(diff))"
        return "\(d) · " + GL.t("previous", ["v": v])
    }

    private var statsLine: some View {
        HStack {
            ForEach(Array(finish.stats.prefix(3).enumerated()), id: \.offset) { i, s in
                if i > 0 { Spacer(minLength: 2) }
                HStack(spacing: 3) {
                    Text(s.value).font(.system(size: 13, weight: .bold)).monospacedDigit()
                    Text(s.label).font(.system(size: 11)).foregroundStyle(GT.ink2)
                }
            }
        }
    }

    @ViewBuilder private var syncLine: some View {
        switch center.syncState {
        case .ok:
            Label(GL.t("synced"), systemImage: "checkmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(GT.okText)
        case .syncing:
            ProgressView().frame(height: 14)
        case .unavailable:
            Text(GL.t("storageOff")).font(.system(size: 11)).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
        default:
            Text(GL.t("savedOnWatch")).font(.system(size: 11)).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
        }
    }
}
