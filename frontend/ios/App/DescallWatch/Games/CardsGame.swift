import SwiftUI

// Yirmibir: blackjack against the dealer for points only (never money, never DesCoin).
// The Digital Crown sets the bet between rounds; hit / stand / double / split buttons;
// the dealer's cards turn one by one; a streak bonus from the third win in a row.

final class CardsModel: GameModel {
    @Published var state: CardsState
    /// Dealer cards face up so far (the hole card turns when the dealer plays).
    @Published var dealerShown = 1
    @Published var banner: String?
    @Published var handsWon = 0
    private var revealClock = 0.0

    override var frameRate: Double { 20 }

    init(launch: GameLaunch) {
        state = CardsState(seed: UInt64.random(in: 1...UInt64.max))
        super.init(game: .cards, mode: "", challenge: launch.challenge)
        if let save = gameRestore(.cards, CardsState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
            dealerShown = state.phase == .playing ? 1 : state.dealer.count
        }
    }

    override func reset() {
        state = CardsState(seed: UInt64.random(in: 1...UInt64.max))
        dealerShown = 1
        banner = nil
        handsWon = 0
    }

    var revealing: Bool { (state.phase == .settled || state.phase == .dealer) && dealerShown < state.dealer.count }

    override func step(_ dt: Double) {
        guard revealing else { return }
        revealClock += dt
        if revealClock >= 0.45 {
            revealClock = 0
            dealerShown += 1
            GameHaptics.play(.hit)
            if !revealing { settleBanner() }
        }
    }

    func setBet(_ v: Int) {
        guard state.phase == .betting || state.phase == .settled else { return }
        let before = state.bet
        state.setBet(v)
        if state.bet != before { GameHaptics.play(.select) }
    }

    func deal() {
        guard isRunning, state.phase == .betting || state.phase == .settled else { return }
        started = true
        banner = nil
        let ev = state.deal()
        if ev.contains(.refilled) { banner = GL.t("refilled") }
        dealerShown = 1
        GameHaptics.play(.hit)
        afterAction(ev)
    }

    func act(_ f: (inout CardsState) -> [CardsEvent]) {
        guard isRunning, state.phase == .playing else { return }
        let ev = f(&state)
        if ev.contains(.bust) { GameHaptics.play(.miss) } else { GameHaptics.play(.hit) }
        afterAction(ev)
    }

    private func afterAction(_ ev: [CardsEvent]) {
        guard state.phase == .settled else { return }
        revealClock = 0
        if !revealing { settleBanner() }
    }

    private func settleBanner() {
        let net = state.lastNet
        if net > 0 { handsWon += 1 }
        let first = state.outcomes.first.map { GL.cardsOutcome($0) } ?? ""
        var text = state.outcomes.count > 1 ? state.outcomes.map { GL.cardsOutcome($0) }.joined(separator: " · ") : first
        text += " · " + (net >= 0 ? "+" : "") + GL.number(net)
        if state.lastBonus > 0 { text += " · " + GL.t("streakBonus", ["n": GL.number(state.lastBonus)]) }
        banner = text
        GameHaptics.play(net > 0 ? .point : (net < 0 ? .miss : .select))
    }

    func cashOut() {
        end(GameFinish(
            title: GL.t("gameOver"),
            detail: "\(GL.name(.cards)) · " + GL.t("pointsOnly"),
            result: state.peak,
            stats: [
                GameStat(label: GL.t("roundsLabel"), value: "\(state.rounds)"),
                GameStat(label: GL.t("streakN", ["n": ""]).trimmingCharacters(in: .whitespaces), value: "\(state.bestStreak)"),
            ],
            headline: GL.t("pointsUnit", ["n": GL.number(state.peak)])
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }
    override var statusLine: String { GL.t("pointsUnit", ["n": GL.number(state.stack)]) + (state.streak > 1 ? " · " + GL.t("streakN", ["n": "\(state.streak)"]) : "") }
    override var challengeProgress: Int { handsWon }
    override var extraActions: [GameExtraAction] {
        [GameExtraAction(id: "cashout", icon: "rectangle.portrait.and.arrow.forward", title: GL.t("cashOut"), enabled: state.phase != .playing && state.rounds > 0, run: { [weak self] in self?.cashOut() })]
    }
}

struct CardsGameView: View {
    @StateObject private var model: CardsModel
    @State private var crown = 0.1
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: CardsModel(launch: launch))
    }

    private var betting: Bool { model.state.phase == .betting || (model.state.phase == .settled && !model.revealing) }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.30, green: 0.05, blue: 0.12), Color(red: 0.07, green: 0.03, blue: 0.08)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 5) {
                        GameScoreCapsule {
                            Text(GL.number(model.state.stack)).font(GT.num(17))
                            Text(GL.t("pointsUnit", ["n": ""]).trimmingCharacters(in: .whitespaces)).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                            if model.state.streak > 1 { GamePill(text: GL.t("streakN", ["n": "\(model.state.streak)"]), tone: .gold) }
                        }
                        handRow(title: GL.t("dealer"), cards: model.state.dealer, shown: model.state.phase == .playing ? 1 : model.dealerShown, total: dealerTotal)
                        ForEach(Array(model.state.hands.enumerated()), id: \.offset) { i, h in
                            handRow(title: model.state.hands.count > 1 ? "\(L.you) \(i + 1)" : L.you, cards: h.cards, shown: h.cards.count, total: "\(h.total)", active: model.state.phase == .playing && i == model.state.active)
                        }
                        if let b = model.banner, !model.revealing {
                            Text(b).font(.system(size: 13, weight: .bold)).multilineTextAlignment(.center).foregroundStyle(model.state.lastNet >= 0 ? GT.goldText : GT.dangerText)
                        }
                        controls
                    }
                    .padding(.horizontal, 5)
                    .padding(.top, 2)
                }
            }
            .focusable()
            .focused($focused)
            .digitalCrownRotation($crown, from: 0, through: 1, by: 1 / Double(CardsState.betSteps), sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            .onAppear {
                focused = true
                crown = CardsState.crown(bet: model.state.bet)
            }
        }
        .onChange(of: crown) { _, v in
            guard betting else { return }
            model.setBet(CardsState.bet(crown: v))
            // The stack can cap the bet: keep the crown on the bet it shows (no dead turn).
            let shown = CardsState.crown(bet: model.state.bet)
            if abs(shown - v) > 0.5 / Double(CardsState.betSteps) { crown = shown }
        }
    }

    private var dealerTotal: String {
        let s = model.state
        guard !s.dealer.isEmpty else { return "" }
        let shown = s.phase == .playing ? 1 : model.dealerShown
        return "\(CardHand.value(Array(s.dealer.prefix(shown))).total)"
    }

    @ViewBuilder private var controls: some View {
        if betting {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(GL.t("bet")).font(.system(size: 11)).foregroundStyle(GT.ink2)
                    Text(GL.number(model.state.bet)).font(GT.num(18))
                }
                Button { model.deal() } label: { Text(GL.t("deal")) }
                    .buttonStyle(GameCTAStyle())
            }
            Text(GL.t("pointsOnly")).font(.system(size: 10.5)).foregroundStyle(GT.ink2).multilineTextAlignment(.center)
        } else if model.state.phase == .playing {
            HStack(spacing: 6) {
                Button { model.act { $0.hit() } } label: { Text(GL.t("hit")) }.buttonStyle(GameCTAStyle())
                Button { model.act { $0.stand() } } label: { Text(GL.t("stand")) }.buttonStyle(GameSecondaryStyle())
            }
            if model.state.canDouble || model.state.canSplit {
                HStack(spacing: 6) {
                    if model.state.canDouble {
                        Button { model.act { $0.double() } } label: { Text(GL.t("double")).font(.system(size: 13, weight: .semibold)) }.buttonStyle(GameSecondaryStyle())
                    }
                    if model.state.canSplit {
                        Button { model.act { $0.split() } } label: { Text(GL.t("split")).font(.system(size: 13, weight: .semibold)) }.buttonStyle(GameSecondaryStyle())
                    }
                }
            }
        } else {
            ProgressView().frame(height: 30)
        }
    }

    private func handRow(title: String, cards: [PlayingCard], shown: Int, total: String, active: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(title.uppercased(with: L.locale)).font(GT.micro).foregroundStyle(active ? GT.brandHi : GT.ink2)
                Spacer(minLength: 0)
                if !cards.isEmpty { Text(total).font(GT.num(14)) }
            }
            HStack(spacing: -12) {
                ForEach(Array(cards.enumerated()), id: \.offset) { i, c in
                    CardFace(card: c, faceUp: i < shown)
                        .rotationEffect(.degrees(Double(i - cards.count / 2) * 3))
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .frame(height: 46, alignment: .leading)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: cards.count)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .gameGlass(active ? .highlight : .plain)
    }
}

/// One playing card, drawn with shapes (no suit glyphs, so never an emoji).
struct CardFace: View {
    var card: PlayingCard
    var faceUp: Bool

    var body: some View {
        let red = card.suit == 1 || card.suit == 2
        let ink = red ? Color(red: 0.80, green: 0.12, blue: 0.24) : Color(red: 0.10, green: 0.11, blue: 0.20)
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(faceUp ? Color.white : GT.ctaBottom)
            if faceUp {
                VStack(spacing: 1) {
                    Text(rank).font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundStyle(ink)
                    SuitShape(suit: card.suit).fill(ink).frame(width: 11, height: 11)
                }
            } else {
                RoundedRectangle(cornerRadius: 3).strokeBorder(Color.white.opacity(0.4), lineWidth: 1).padding(4)
                GameIcon(game: .cards, size: 16).opacity(0.7)
            }
        }
        .frame(width: 32, height: 44)
        .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
        .accessibilityLabel(faceUp ? rank : "")
    }

    private var rank: String {
        switch card.rank {
        case 1: return "A"
        case 11: return "J"
        case 12: return "Q"
        case 13: return "K"
        default: return "\(card.rank)"
        }
    }
}
