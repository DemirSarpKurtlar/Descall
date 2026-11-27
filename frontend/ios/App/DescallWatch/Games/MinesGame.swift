import SwiftUI

// Sonar: the Digital Crown zooms (drag pans when zoomed in), a tap sounds a cell, holding
// plants a flag, a tap on a finished number opens its neighbours. The first tap is safe.

final class MinesModel: GameModel {
    @Published var state: MinesState
    @Published var seconds = 0

    override var frameRate: Double { 10 }

    init(launch: GameLaunch) {
        state = MinesState(level: MinesLevel(rawValue: launch.mode) ?? .medium, seed: UInt64.random(in: 1...UInt64.max))
        super.init(game: .mines, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.mines, MinesState.self, resume: launch.resume) {
            state = save.state
            started = save.state.placed
            restored = save.state.placed
        }
        seconds = Int(state.elapsed)
    }

    override func reset() {
        state = MinesState(level: MinesLevel(rawValue: mode) ?? .medium, seed: UInt64.random(in: 1...UInt64.max))
        seconds = 0
    }

    override func step(_ dt: Double) {
        guard state.placed, !state.over else { return }
        state.elapsed += dt
        let s = Int(state.elapsed)
        if s != seconds { seconds = s }
    }

    func tap(_ i: Int) {
        guard isRunning else { return }
        let e = state.reveal(i)
        started = state.placed
        switch e {
        case .opened(let n): GameHaptics.play(n > 4 ? .wall : .hit)
        case .boom:
            GameHaptics.play(.miss)
            finishRound(won: false)
        case .won:
            GameHaptics.play(.point)
            finishRound(won: true)
        default: break
        }
    }

    func flag(_ i: Int) {
        guard isRunning else { return }
        switch state.toggleFlag(i) {
        case .flagged, .unflagged: GameHaptics.play(.select)
        default: break
        }
    }

    private func finishRound(won: Bool) {
        end(GameFinish(
            title: won ? GL.t("solved") : GL.t("gameOver"),
            detail: "\(GL.name(.mines)) · \(GL.mode(.mines, mode))",
            result: won ? state.seconds : 0,
            won: won,
            stats: [GameStat(label: GL.t("time"), value: GameMath.clock(state.seconds)), GameStat(label: GL.t("minesLeft", ["n": ""]).trimmingCharacters(in: .whitespaces), value: "\(state.mineCount)")],
            headline: won ? GameMath.clock(state.seconds) : GL.t("gameOver")
        ))
    }

    override func encode() -> Data? { state.placed ? GameSave(mode: mode, state: state).encoded() : nil }
    override var statusLine: String { GL.t("minesLeft", ["n": "\(state.minesLeft)"]) + " · " + GameMath.clock(seconds) }
    override var dimmedLines: [String] { [statusLine, GL.t("timeStops")] }
    override var challengeProgress: Int { state.won ? 1 : 0 }
}

struct MinesGameView: View {
    @StateObject private var model: MinesModel
    @State private var zoom = 1.0
    @State private var pan = CGSize.zero
    @State private var panBase = CGSize.zero
    @State private var pressing = false
    @State private var panning = false
    @State private var longFired = false
    @State private var pressTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: MinesModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.03, green: 0.14, blue: 0.17), Color(red: 0.02, green: 0.05, blue: 0.09)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                GeometryReader { geo in
                    let layout = Layout(size: geo.size, cols: model.state.cols, rows: model.state.rows, zoom: zoom, pan: pan)
                    Canvas { ctx, _ in draw(ctx, layout) }
                        .contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { v in changed(v, layout) }.onEnded { v in ended(v, layout) })
                }
                .padding(.top, 28)
                VStack {
                    GameScoreCapsule {
                        Image(systemName: "flag.fill").font(.system(size: 10)).foregroundStyle(GT.dangerText)
                        Text("\(model.state.minesLeft)").font(GT.num(17))
                        Text(GameMath.clock(model.seconds)).font(GT.num(15, .semibold)).foregroundStyle(GT.ink2)
                    }
                    Spacer()
                }
                .padding(.top, 2)
                .allowsHitTesting(false)
                CrownHint(top: 46)
                ControlHint(text: GL.hint(.mines))
            }
            .focusable()
            .focused($focused)
            .digitalCrownRotation($zoom, from: 1, through: 2.6, by: nil, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
            .onAppear { focused = true }
        }
        .onChange(of: zoom) { _, z in
            if z <= 1.01 { pan = .zero; panBase = .zero }
        }
    }

    struct Layout {
        var size: CGSize
        var cols: Int
        var rows: Int
        var zoom: Double
        var pan: CGSize

        var cell: CGFloat { min(size.width / CGFloat(cols), size.height / CGFloat(rows)) * CGFloat(zoom) }
        var origin: CGPoint {
            CGPoint(x: (size.width - cell * CGFloat(cols)) / 2 + pan.width, y: (size.height - cell * CGFloat(rows)) / 2 + pan.height)
        }

        func index(at p: CGPoint) -> Int? {
            let x = Int(floor((p.x - origin.x) / cell)), y = Int(floor((p.y - origin.y) / cell))
            guard x >= 0, y >= 0, x < cols, y < rows else { return nil }
            return y * cols + x
        }

        /// Keeps a zoomed board on screen.
        func clamped(_ p: CGSize) -> CGSize {
            let w = cell * CGFloat(cols), h = cell * CGFloat(rows)
            let mx = max(0, (w - size.width) / 2 + 8), my = max(0, (h - size.height) / 2 + 8)
            return CGSize(width: min(mx, max(-mx, p.width)), height: min(my, max(-my, p.height)))
        }
    }

    private func changed(_ v: DragGesture.Value, _ l: Layout) {
        if !pressing {
            pressing = true
            panning = false
            longFired = false
            let start = v.startLocation
            pressTask?.cancel()
            pressTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 450_000_000)
                guard !Task.isCancelled, pressing, !panning, let i = l.index(at: start) else { return }
                longFired = true
                model.flag(i)
            }
        }
        let moved = hypot(v.translation.width, v.translation.height)
        if moved > 8, zoom > 1.01 {
            panning = true
            pressTask?.cancel()
            pan = l.clamped(CGSize(width: panBase.width + v.translation.width, height: panBase.height + v.translation.height))
        } else if moved > 8 {
            panning = true
            pressTask?.cancel()
        }
    }

    private func ended(_ v: DragGesture.Value, _ l: Layout) {
        pressTask?.cancel()
        if !panning, !longFired, let i = l.index(at: v.location) { model.tap(i) }
        panBase = pan
        pressing = false
        panning = false
    }

    private func draw(_ ctx: GraphicsContext, _ l: Layout) {
        let s = model.state
        let cell = l.cell, o = l.origin
        let numberColors: [Color] = [.clear, GT.brandHi, GT.okText, GT.goldText, GT.dangerText, Color(red: 1, green: 0.55, blue: 0.8), Color(red: 0.45, green: 0.95, blue: 0.95), .white, .white]
        for i in 0..<(s.cols * s.rows) {
            let x = i % s.cols, y = i / s.cols
            let r = CGRect(x: o.x + CGFloat(x) * cell + 0.7, y: o.y + CGFloat(y) * cell + 0.7, width: cell - 1.4, height: cell - 1.4)
            guard r.maxX > -cell, r.minX < l.size.width + cell, r.maxY > -cell, r.minY < l.size.height + cell else { continue }
            let path = Path(roundedRect: r, cornerRadius: cell * 0.22)
            switch s.cells[i] {
            case .hidden:
                ctx.fill(path, with: .color(GT.cellHidden))
            case .flagged:
                ctx.fill(path, with: .color(GT.cellHidden))
                var f = Path()
                f.move(to: CGPoint(x: r.minX + r.width * 0.36, y: r.maxY - r.height * 0.2))
                f.addLine(to: CGPoint(x: r.minX + r.width * 0.36, y: r.minY + r.height * 0.2))
                f.addLine(to: CGPoint(x: r.maxX - r.width * 0.22, y: r.minY + r.height * 0.36))
                f.addLine(to: CGPoint(x: r.minX + r.width * 0.36, y: r.minY + r.height * 0.52))
                ctx.fill(f, with: .color(GT.dangerText))
            case .open:
                if s.mines.contains(i) {
                    ctx.fill(path, with: .color(i == s.explodedAt ? GT.danger : GT.cellOpen))
                    ctx.fill(Path(ellipseIn: r.insetBy(dx: r.width * 0.28, dy: r.height * 0.28)), with: .color(.white))
                } else {
                    ctx.fill(path, with: .color(GT.cellOpen))
                    let n = s.count(i)
                    if n > 0 {
                        ctx.draw(Text("\(n)").font(.system(size: cell * 0.62, weight: .bold, design: .rounded)).foregroundColor(numberColors[n]), at: CGPoint(x: r.midX, y: r.midY))
                    }
                }
            }
        }
    }
}
