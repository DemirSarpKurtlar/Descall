import SwiftUI

// Katla: swipe in four directions; equal tiles fuse. Turning the Digital Crown back undoes
// a move (three per game). Classic 4 x 4 or mini 3 x 3; a fused tile pops, a new one grows.

final class MergeModel: GameModel {
    @Published var state: MergeState
    @Published var popped: Set<Int> = []
    @Published var spawned: Int?
    @Published var moveCount = 0
    private var reached2048Shown = false

    override var frameRate: Double { 10 }

    init(launch: GameLaunch) {
        state = MergeState(seed: UInt64.random(in: 1...UInt64.max), size: launch.mode == "mini" ? 3 : 4)
        super.init(game: .merge, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.merge, MergeState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
        }
    }

    override func reset() {
        state = MergeState(seed: UInt64.random(in: 1...UInt64.max), size: mode == "mini" ? 3 : 4)
        popped = []
        spawned = nil
        reached2048Shown = false
    }

    func swipe(_ d: MergeDir) {
        guard isRunning else { return }
        let wasWon = state.won
        let r = state.move(d)
        guard r.moved else {
            GameHaptics.play(.wall)
            return
        }
        started = true
        moveCount += 1
        popped = Set(r.merged)
        spawned = r.spawned
        GameHaptics.play(r.gained > 0 ? .hit : .select)
        if !wasWon, state.won, !reached2048Shown {
            reached2048Shown = true
            GameHaptics.play(.record)
        }
        if state.isOver { finishRound() }
    }

    func undo() {
        guard isRunning, state.undo() else { return }
        popped = []
        spawned = nil
        GameHaptics.play(.select)
    }

    private func finishRound() {
        end(GameFinish(
            title: GL.t("gameOver"),
            detail: "\(GL.name(.merge)) · " + GL.t("biggest", ["v": GL.number(state.maxTile)]),
            result: state.score,
            stats: [GameStat(label: GL.t("biggest", ["v": ""]).trimmingCharacters(in: .whitespaces), value: GL.number(state.maxTile)), GameStat(label: GL.t("roundsLabel"), value: "\(state.moves)")],
            headline: GL.number(state.score)
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }
    override var statusLine: String { GL.number(state.score) + " · " + GL.t("biggest", ["v": GL.number(state.maxTile)]) }
    override var challengeProgress: Int { state.maxTile }
    override var extraActions: [GameExtraAction] {
        [GameExtraAction(id: "undo", icon: "arrow.uturn.backward", title: GL.t("undo"), trailing: GL.t("left", ["n": "\(state.undosLeft)"]), enabled: state.canUndo) { [weak self] in self?.undo() }]
    }
}

struct MergeGameView: View {
    @StateObject private var model: MergeModel
    @State private var crown = 0.0
    @State private var crownBase = 0.0
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: MergeModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.16, green: 0.10, blue: 0.04), Color(red: 0.05, green: 0.05, blue: 0.10)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                VStack(spacing: 5) {
                    GameScoreCapsule {
                        Text(GL.number(model.state.score)).font(GT.num(18))
                        if let b = GameCenter.shared.best(.merge, model.mode), b.best > 0 {
                            Text(GL.t("best") + " " + GL.number(max(b.best, model.state.score))).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                        }
                    }
                    grid
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.uturn.backward").font(.system(size: 10, weight: .bold))
                        Text(GL.t("left", ["n": "\(model.state.undosLeft)"])).font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(GT.ink2)
                }
                .padding(.top, 4)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 12).onEnded { v in
                let dx = v.translation.width, dy = v.translation.height
                withAnimation(.spring(response: 0.22, dampingFraction: 0.75)) {
                    if abs(dx) > abs(dy) { model.swipe(dx > 0 ? .right : .left) } else { model.swipe(dy > 0 ? .down : .up) }
                }
            })
            .focusable()
            .focused($focused)
            .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            .onAppear { focused = true }
        }
        .onChange(of: crown) { old, new in
            // A detent back undoes one move.
            if new < old - 0.5 { withAnimation { model.undo() } }
        }
    }

    private var grid: some View {
        let n = model.state.size
        return GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let gap: CGFloat = 4
            let tile = (side - gap * CGFloat(n + 1)) / CGFloat(n)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.07)).frame(width: side, height: side)
                ForEach(0..<(n * n), id: \.self) { i in
                    let e = model.state.cells[i]
                    let x = gap + CGFloat(i % n) * (tile + gap), y = gap + CGFloat(i / n) * (tile + gap)
                    TileView(exponent: e, size: tile, pop: model.popped.contains(i) ? model.moveCount : -1, fresh: model.spawned == i ? model.moveCount : -1)
                        .offset(x: x, y: y)
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
        .padding(.horizontal, 8)
    }
}

private struct TileView: View {
    var exponent: Int
    var size: CGFloat
    /// Move number when this cell fused / grew a new tile this move, else -1.
    var pop: Int
    var fresh: Int
    @State private var scale: CGFloat = 1

    var body: some View {
        let v = MergeState.value(exponent)
        let digits = "\(v)".count
        RoundedRectangle(cornerRadius: size * 0.2, style: .continuous)
            .fill(GT.tileColor(exponent))
            .overlay {
                if exponent > 0 {
                    Text("\(v)")
                        .font(.system(size: size * (digits <= 2 ? 0.42 : (digits == 3 ? 0.34 : 0.27)), weight: .heavy, design: .rounded))
                        .foregroundStyle(exponent <= 2 ? Color.white.opacity(0.92) : .white)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            }
            .frame(width: size, height: size)
            .scaleEffect(scale)
            .onChange(of: pop) { _, p in if p >= 0 { bump(1.14) } }
            .onChange(of: fresh) { _, f in if f >= 0 { grow() } }
            .accessibilityLabel(exponent > 0 ? "\(v)" : "")
    }

    private func bump(_ to: CGFloat) {
        scale = to
        withAnimation(.spring(response: 0.25, dampingFraction: 0.55)) { scale = 1 }
    }

    private func grow() {
        scale = 0.3
        withAnimation(.spring(response: 0.28, dampingFraction: 0.7)) { scale = 1 }
    }
}
