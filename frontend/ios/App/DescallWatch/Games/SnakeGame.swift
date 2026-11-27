import SwiftUI

// Yilankavi: swipes turn, the coil glides between grid cells at 60 fps (Canvas inside
// TimelineView, interpolated between moves). Walls, wrap or maze; three speeds.

final class SnakeModel: GameModel {
    @Published var state: SnakeState
    /// Body before the last move (for gliding between cells).
    var previous: [GridPoint]
    private var clock = 0.0
    var progress: Double { min(1, clock / max(0.01, state.interval)) }
    var lastMove = Date()

    init(launch: GameLaunch) {
        let speed = UserDefaults.standard.object(forKey: "descall.games.snakeSpeed") as? Int ?? 2
        let s = SnakeState(mode: SnakeMode(rawValue: launch.mode) ?? .walls, speedLevel: speed, seed: UInt64.random(in: 1...UInt64.max))
        state = s
        previous = s.body
        super.init(game: .snake, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.snake, SnakeState.self, resume: launch.resume) {
            state = save.state
            previous = save.state.body
            started = true
            restored = true
        }
    }

    override func reset() {
        let speed = UserDefaults.standard.object(forKey: "descall.games.snakeSpeed") as? Int ?? 2
        state = SnakeState(mode: SnakeMode(rawValue: mode) ?? .walls, speedLevel: speed, seed: UInt64.random(in: 1...UInt64.max))
        previous = state.body
        clock = 0
    }

    func swipe(_ d: SnakeDir) {
        guard isRunning else { return }
        if state.turn(d) { GameHaptics.play(.select) }
    }

    override func step(_ dt: Double) {
        started = true
        clock += dt
        guard clock >= state.interval else { return }
        clock -= state.interval
        if clock > state.interval { clock = 0 }
        previous = state.body
        let events = state.tick(elapsed: state.interval)
        for e in events {
            switch e {
            case .ate: GameHaptics.play(.hit)
            case .ateGolden: GameHaptics.play(.point)
            case .speedUp: GameHaptics.play(.wall)
            case .died:
                GameHaptics.play(.miss)
                finishRound()
            case .turned: break
            }
        }
        if state.over, !events.contains(.died) { finishRound() }
    }

    private func finishRound() {
        end(GameFinish(
            title: GL.t("gameOver"),
            detail: "\(GL.name(.snake)) · \(GL.mode(.snake, mode)) · \(GL.t("speed.\(state.speedLevel)"))",
            result: state.score,
            stats: [GameStat(label: GL.t("speed").lowercased(with: L.locale), value: GL.t("speed.\(state.speedLevel)")), GameStat(label: GL.t("score").lowercased(with: L.locale), value: "\(state.eaten)")],
            headline: GL.number(state.score)
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }
    override var statusLine: String { GL.number(state.score) + " · " + GL.mode(.snake, mode) }
    override var challengeProgress: Int { state.eaten }
}

struct SnakeGameView: View {
    @StateObject private var model: SnakeModel

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: SnakeModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.03, green: 0.12, blue: 0.10), Color(red: 0.02, green: 0.05, blue: 0.08)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                VStack(spacing: 4) {
                    GameScoreCapsule {
                        Text(GL.number(model.state.score)).font(GT.num(18))
                        Text(GL.mode(.snake, model.mode)).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                    }
                    board
                }
                .padding(.top, 4)
                ControlHint(text: GL.hint(.snake))
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 10).onEnded { v in
                let dx = v.translation.width, dy = v.translation.height
                if abs(dx) > abs(dy) { model.swipe(dx > 0 ? .right : .left) } else { model.swipe(dy > 0 ? .down : .up) }
            })
        }
    }

    private var board: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: !model.isRunning)) { _ in
            Canvas { ctx, size in
                draw(ctx, size)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .padding(.horizontal, 6)
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let s = model.state
        let cell = min(size.width, size.height) / CGFloat(SnakeState.cols)
        let frame = CGRect(x: 0, y: 0, width: cell * CGFloat(SnakeState.cols), height: cell * CGFloat(SnakeState.rows))
        ctx.fill(Path(roundedRect: frame, cornerRadius: 10), with: .color(Color.white.opacity(0.05)))
        ctx.stroke(Path(roundedRect: frame, cornerRadius: 10), with: .color(s.wrap ? GT.accent(.snake).opacity(0.25) : Color.white.opacity(0.35)), style: StrokeStyle(lineWidth: s.wrap ? 1 : 1.6, dash: s.wrap ? [3, 3] : []))
        func rect(_ p: GridPoint, inset: CGFloat = 1) -> CGRect {
            CGRect(x: CGFloat(p.x) * cell + inset, y: CGFloat(p.y) * cell + inset, width: cell - 2 * inset, height: cell - 2 * inset)
        }
        for o in s.obstacles {
            ctx.fill(Path(roundedRect: rect(o, inset: 0.6), cornerRadius: 2), with: .color(Color.white.opacity(0.28)))
        }
        // Pellets.
        let f = rect(s.food, inset: cell * 0.18)
        var diamond = Path()
        diamond.move(to: CGPoint(x: f.midX, y: f.minY))
        diamond.addLine(to: CGPoint(x: f.maxX, y: f.midY))
        diamond.addLine(to: CGPoint(x: f.midX, y: f.maxY))
        diamond.addLine(to: CGPoint(x: f.minX, y: f.midY))
        diamond.closeSubpath()
        ctx.fill(diamond, with: .color(Color(red: 1, green: 0.886, blue: 0.478)))
        if let g = s.golden {
            let r = rect(g, inset: cell * 0.12)
            ctx.fill(Path(ellipseIn: r.insetBy(dx: -cell * 0.25, dy: -cell * 0.25)), with: .color(GT.gold.opacity(0.25)))
            ctx.fill(Path(ellipseIn: r), with: .color(GT.gold))
        }
        // Body: each segment glides from its previous cell (no glide across a wrap).
        let t = model.isRunning ? CGFloat(model.progress) : 1
        let prev = model.previous
        let (top, bottom) = GT.gradient(.snake)
        for (i, p) in s.body.enumerated().reversed() {
            var r = rect(p, inset: i == 0 ? 0.4 : 1.2)
            if i < prev.count {
                let q = prev[i]
                if abs(q.x - p.x) <= 1 && abs(q.y - p.y) <= 1 {
                    r = r.offsetBy(dx: CGFloat(q.x - p.x) * cell * (1 - t), dy: CGFloat(q.y - p.y) * cell * (1 - t))
                }
            }
            let shade = Double(i) / Double(max(1, s.body.count))
            ctx.fill(Path(roundedRect: r, cornerRadius: cell * 0.35), with: .color(i == 0 ? Color.white : (shade < 0.5 ? top : bottom).opacity(1 - shade * 0.35)))
            if i == 0 {
                let eye = CGPoint(x: r.midX + CGFloat(s.dir.dx) * cell * 0.18, y: r.midY + CGFloat(s.dir.dy) * cell * 0.18)
                ctx.fill(Path(ellipseIn: CGRect(x: eye.x - cell * 0.12, y: eye.y - cell * 0.12, width: cell * 0.24, height: cell * 0.24)), with: .color(bottom))
            }
        }
    }
}
