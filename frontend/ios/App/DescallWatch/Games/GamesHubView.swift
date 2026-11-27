import SwiftUI

// Draft A hub: weekly summary with 7-day bars and the day streak, the "Devam et" card, the
// daily "Saate karsi" challenge, then the games grouped by type. A row opens the game's
// page (modes, bests, start / continue). Owner only, watch only (WatchGamesGate).

/// The admin home's "Mola" group row.
struct GamesEntryRow: View {
    @ObservedObject private var center = GameCenter.shared

    var body: some View {
        NavigationLink(value: AdminRoute.games) {
            HStack(spacing: 10) {
                Image(systemName: "gamecontroller.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(LinearGradient(colors: [GT.ctaTop, GT.ctaBottom], startPoint: .top, endPoint: .bottom)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(GL.t("games")).font(GT.title)
                    Text(subtitle).font(GT.caption).foregroundStyle(GT.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(DS.ink2)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .gameGlass(.highlight)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("watch-games-entry")
        Label(GL.t("onlyYou"), systemImage: "lock.fill")
            .font(.system(size: 11))
            .foregroundStyle(GT.ink2)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
    }

    private var subtitle: String {
        let count = GL.t("gamesCount", ["n": "\(GameId.allCases.count)"])
        guard let s = center.latestSave else { return count }
        return count + " · " + GL.t("waiting", ["game": GL.name(s.game)])
    }
}

struct GamesHubView: View {
    @EnvironmentObject var store: WatchStore
    @ObservedObject private var center = GameCenter.shared
    @State private var launch: GameLaunch?
    @State private var now = Date()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 5) {
                if GT.hubShowsWeek { weekCard }
                if GT.hubShowsContinue, let s = center.latestSave { continueCard(s) }
                if GT.hubShowsChallenge {
                    GameSectionLabel(text: GL.t("challenge"))
                    challengeCard
                }
                ForEach(GT.hubGroups) { group in
                    GameSectionLabel(text: GL.t(group.key))
                    ForEach(group.games) { g in
                        NavigationLink(value: AdminRoute.game(g)) { GameRow(game: g) }
                            .buttonStyle(.plain)
                    }
                }
                syncFooter
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(GL.t("games"))
        .descallScreen()
        .fullScreenCover(item: $launch) { l in
            GameHost(launch: l).environmentObject(store)
        }
        .task {
            await center.sync(store)
            if let id = WatchDemo.screen, id.hasPrefix("game-") {
                let name = String(id.dropFirst(5))
                let g = GameId(rawValue: name) ?? .pong
                try? await Task.sleep(nanoseconds: 400_000_000)
                launch = GameLaunch(game: g, mode: g == .pong ? "hard" : g.defaultMode, challenge: nil, resume: false)
            }
        }
        .whileActive(every: 60) { now = Date() }
    }

    // MARK: Week

    private var weekCard: some View {
        let today = center.today
        let week = center.log.week(today: today)
        let streak = center.log.streak(today: today)
        return VStack(spacing: 5) {
            HStack {
                Text(GL.t("thisWeek").uppercased(with: L.locale)).font(GT.micro).foregroundStyle(GT.ink2)
                Spacer(minLength: 0)
                if streak > 1 { GamePill(text: GL.t("dayStreak", ["n": "\(streak)"]), icon: "bolt.fill", tone: .ok) }
            }
            HStack {
                weekNumber(GL.hoursMinutes(week.reduce(0) { $0 + $1.seconds }), GL.t("hoursLabel"))
                Spacer(minLength: 0)
                weekNumber(GL.number(week.reduce(0) { $0 + $1.rounds }), GL.t("roundsLabel"))
                Spacer(minLength: 0)
                weekNumber(GL.number(week.reduce(0) { $0 + $1.records }), GL.t("recordsLabel"), gold: true)
            }
            GameBars(values: week.map { Double($0.seconds) }, height: 18)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .gameGlass()
        .accessibilityElement(children: .combine)
    }

    private func weekNumber(_ v: String, _ label: String, gold: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(v).font(GT.num(21)).foregroundStyle(gold ? GT.goldText : .white)
            Text(label).font(.system(size: 11)).foregroundStyle(GT.ink2)
        }
    }

    // MARK: Continue

    private func continueCard(_ s: GameSaveMeta) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                GameIcon(game: s.game, size: 32)
                VStack(alignment: .leading, spacing: 0) {
                    Text(GL.t("continue").uppercased(with: L.locale)).font(GT.micro).foregroundStyle(GT.brandHi)
                    Text("\(GL.name(s.game)) · \(s.summary)").font(GT.title).lineLimit(1).minimumScaleFactor(0.8)
                    Text([GL.mode(s.game, s.mode), L.ago(s.savedAt, now: now)].filter { !$0.isEmpty }.joined(separator: " · ")).font(GT.caption).foregroundStyle(GT.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            Button {
                launch = GameLaunch(game: s.game, mode: s.mode, challenge: nil, resume: true)
            } label: {
                Label(GL.t("resume"), systemImage: "play.fill")
            }
            .buttonStyle(GameCTAStyle())
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .gameGlass(.highlight)
    }

    // MARK: Daily challenge

    private var challengeCard: some View {
        let c = center.todayChallenge
        let done = center.challenges.completed.contains(c.day)
        let left = GameDay.secondsToMidnight(now)
        let streak = center.challenges.streak(today: c.day)
        return Button {
            launch = GameLaunch(game: c.game, mode: c.mode, challenge: c, resume: false)
        } label: {
            HStack(spacing: 9) {
                ZStack {
                    Circle().stroke(Color.white.opacity(0.14), lineWidth: 3.5)
                    Circle()
                        .trim(from: 0, to: done ? 1 : CGFloat(Double(left) / 86400))
                        .stroke(done ? GT.ok : GT.gold, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: done ? "checkmark" : "clock").font(.system(size: 13, weight: .semibold)).foregroundStyle(done ? GT.okText : GT.goldText)
                }
                .frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 0) {
                    Text(GL.t("againstClock")).font(.system(size: 14.5, weight: .bold))
                    Text(GL.goal(c)).font(GT.caption).foregroundStyle(GT.ink2).lineLimit(2)
                    Text(done ? GL.t("challengeDone") : GL.timeLeft(left))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(done ? GT.okText : GT.goldText)
                    if streak > 1 { Text(GL.t("challengeStreak", ["n": "\(streak)"])).font(.system(size: 11)).foregroundStyle(GT.ink2) }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .gameGlass(.gold)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("watch-games-challenge")
    }

    // MARK: Sync

    private var syncFooter: some View {
        VStack(spacing: 4) {
            switch center.syncState {
            case .ok:
                Label(GL.t("synced"), systemImage: "checkmark").foregroundStyle(GT.okText)
            case .syncing:
                ProgressView()
            case .unavailable:
                Text(GL.t("storageOff")).foregroundStyle(GT.ink2)
            case .offline, .idle:
                Text(GL.t("savedOnWatch")).foregroundStyle(GT.ink2)
            }
            if center.syncState != .syncing {
                Button(GL.t("syncNow")) { Task { await center.sync(store) } }
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(GT.brandHi)
                    .buttonStyle(.plain)
            }
        }
        .font(.system(size: 11, weight: .semibold))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
    }
}

/// One game in the hub list ("row" in the draft): tile, name, mode / when, best.
struct GameRow: View {
    var game: GameId
    @ObservedObject private var center = GameCenter.shared

    var body: some View {
        HStack(spacing: 8) {
            GameIcon(game: game, size: GT.iconSize)
            VStack(alignment: .leading, spacing: 1) {
                Text(GL.name(game)).font(GT.title).lineLimit(1)
                Text(subtitle).font(GT.caption).foregroundStyle(subtitleIsRecord ? GT.goldText : GT.ink2).lineLimit(1)
            }
            Spacer(minLength: 2)
            if let save = center.saves[game.rawValue], game == .chess {
                GamePill(text: save.summary.components(separatedBy: " · ").first ?? "", tone: .brand)
            } else if let h = center.headline(game) {
                Text(h.value).font(.system(size: 13, weight: .bold)).monospacedDigit().lineLimit(1)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 10)
        .padding(.vertical, 7)
        .frame(minHeight: GT.rowMinHeight)
        .gameGlass()
        .accessibilityElement(children: .combine)
    }

    private var subtitleIsRecord: Bool {
        guard let last = center.lastPlayed[game.rawValue] else { return false }
        return center.log.days[center.today]?.records ?? 0 > 0 && Date().timeIntervalSince(last) < 3600
    }

    private var subtitle: String {
        if center.saves[game.rawValue] != nil, game == .chess { return GL.t("yourTurn") }
        if subtitleIsRecord { return GL.t("newRecord").capitalized(with: L.locale) }
        let mode = center.headline(game)?.mode ?? ""
        if let last = center.lastPlayed[game.rawValue] {
            return [mode, L.ago(last)].filter { !$0.isEmpty }.joined(separator: " · ")
        }
        return center.headline(game) == nil ? GL.genre(game) : mode
    }
}

// MARK: - Game page (modes, bests, start)

struct GameDetailView: View {
    var game: GameId
    @EnvironmentObject var store: WatchStore
    @ObservedObject private var center = GameCenter.shared
    @State private var mode: String
    @State private var launch: GameLaunch?
    @AppStorage("descall.games.snakeSpeed") private var snakeSpeed = 2
    @AppStorage("descall.games.chessWhite") private var chessWhite = true

    init(game: GameId) {
        self.game = game
        _mode = State(initialValue: GameCenter.shared.saves[game.rawValue]?.mode ?? game.defaultMode)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 5) {
                HStack(spacing: 9) {
                    GameIcon(game: game, size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(GL.name(game)).font(.system(size: 16, weight: .bold))
                        Text(GL.genre(game)).font(GT.caption).foregroundStyle(GT.ink2).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
                if let save = center.saves[game.rawValue] {
                    Button {
                        launch = GameLaunch(game: game, mode: save.mode, challenge: nil, resume: true)
                    } label: {
                        Label(GL.t("continue"), systemImage: "play.fill")
                    }
                    .buttonStyle(GameCTAStyle())
                    Text("\(GL.t("savedGame")) · \(save.summary)").font(.system(size: 11)).foregroundStyle(GT.ink2).lineLimit(2).multilineTextAlignment(.center)
                    Button(GL.t("newGame")) { start() }.buttonStyle(GameSecondaryStyle())
                } else {
                    Button { start() } label: { Label(GL.t("start"), systemImage: "play.fill") }
                        .buttonStyle(GameCTAStyle())
                }
                if game.modes.count > 1 {
                    GameSectionLabel(text: game == .pong || game == .chess || game == .mines || game == .sudoku ? GL.t("difficulty") : GL.t("mode"))
                    VStack(spacing: 0) {
                        ForEach(Array(game.modes.enumerated()), id: \.offset) { i, m in
                            let locked = game == .chess && m == "hard" && !center.chessMasterUnlocked
                            Button {
                                guard !locked else { return }
                                mode = m
                                GameHaptics.play(.select)
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: mode == m ? "checkmark.circle.fill" : (locked ? "lock.fill" : "circle"))
                                        .foregroundStyle(mode == m ? GT.brandHi : GT.ink2)
                                        .font(.system(size: 14))
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(GL.mode(game, m)).font(.system(size: 14, weight: .semibold))
                                        if locked { Text(GL.t("lockedHint")).font(.system(size: 11)).foregroundStyle(GT.ink2) }
                                    }
                                    Spacer(minLength: 0)
                                    if let b = center.best(game, m), b.plays > 0 {
                                        Text(GameFormat.result(game, b.best)).font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                                    }
                                }
                                .padding(.horizontal, 10)
                                .frame(minHeight: 40)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .opacity(locked ? 0.55 : 1)
                            if i < game.modes.count - 1 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }
                        }
                    }
                    .gameGlass()
                }
                if game == .snake {
                    GameSectionLabel(text: GL.t("speed"))
                    optionRow(values: [1, 2, 3], selected: snakeSpeed, label: { GL.t("speed.\($0)") }) { snakeSpeed = $0 }
                }
                if game == .chess {
                    GameSectionLabel(text: GL.t("colour"))
                    optionRow(values: [1, 0], selected: chessWhite ? 1 : 0, label: { $0 == 1 ? GL.t("white") : GL.t("black") }) { chessWhite = $0 == 1 }
                }
                GameSectionLabel(text: GL.t("stats"))
                VStack(spacing: 0) {
                    let rows = game.modes.map { ($0, center.best(game, $0)) }
                    ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                        HStack {
                            Text(r.0.isEmpty ? GL.t("best") : GL.mode(game, r.0)).font(.system(size: 13))
                            Spacer(minLength: 4)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(r.1.map { $0.plays > 0 ? GameFormat.result(game, $0.best) : "-" } ?? "-").font(.system(size: 13, weight: .bold)).monospacedDigit()
                                Text(GL.t("plays", ["n": "\(r.1?.plays ?? 0)"])).font(.system(size: 10.5)).foregroundStyle(GT.ink2)
                            }
                        }
                        .padding(.horizontal, 10)
                        .frame(minHeight: 36)
                        if i < rows.count - 1 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }
                    }
                }
                .gameGlass()
                Label(GL.hint(game), systemImage: "info.circle")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(GT.ink2)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
                if game == .cards {
                    Text(GL.t("pointsOnly")).font(.system(size: 11)).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 3)
        }
        .navigationTitle(GL.name(game))
        .descallScreen()
        .fullScreenCover(item: $launch) { l in
            GameHost(launch: l).environmentObject(store)
        }
    }

    private func start() {
        center.clearSave(game)
        launch = GameLaunch(game: game, mode: mode, challenge: nil, resume: false)
    }

    private func optionRow(values: [Int], selected: Int, label: @escaping (Int) -> String, pick: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 4) {
            ForEach(values, id: \.self) { v in
                Button {
                    pick(v)
                    GameHaptics.play(.select)
                } label: {
                    Text(label(v))
                        .font(.system(size: 12.5, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(Capsule().fill(v == selected ? GT.brand.opacity(0.45) : Color.white.opacity(0.1)))
                        .overlay(Capsule().strokeBorder(v == selected ? GT.brandHi.opacity(0.7) : Color.clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Picks the game's screen for a launch.
struct GameHost: View {
    var launch: GameLaunch

    var body: some View {
        switch launch.game {
        case .pong: PongGameView(launch: launch)
        case .bricks: BricksGameView(launch: launch)
        case .snake: SnakeGameView(launch: launch)
        case .merge: MergeGameView(launch: launch)
        case .blocks: BlocksGameView(launch: launch)
        case .mines: MinesGameView(launch: launch)
        case .sudoku: SudokuGameView(launch: launch)
        case .chess: ChessGameView(launch: launch)
        case .runner: RunnerGameView(launch: launch)
        case .cards: CardsGameView(launch: launch)
        }
    }
}

/// Restores a saved round of a model's state type, or nil (start fresh).
func gameRestore<T: Codable>(_ g: GameId, _ type: T.Type, resume: Bool) -> GameSave<T>? {
    guard resume else { return nil }
    return GameSave<T>.decode(GameCenter.shared.loadSave(g))
}
