import SwiftUI

// Blokaj: the Digital Crown rotates, swipes move (left / right), soft drop (down) and hold
// (up), a tap drops the piece. Ghost piece, hold box, three next pieces, line-clear
// flashes, a level every 10 lines; marathon or the two-minute sprint.

final class BlocksModel: GameModel {
    @Published var state: BlocksState
    var flashRows: [Int] = []
    var flashAt = Date.distantPast
    @Published var lastClear = 0

    init(launch: GameLaunch) {
        state = BlocksState(seed: UInt64.random(in: 1...UInt64.max), sprint: launch.mode == "sprint")
        super.init(game: .blocks, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.blocks, BlocksState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
        }
    }

    override func reset() {
        state = BlocksState(seed: UInt64.random(in: 1...UInt64.max), sprint: mode == "sprint")
        flashRows = []
    }

    override func step(_ dt: Double) {
        started = true
        handle(state.update(dt))
    }

    func move(_ dx: Int) {
        guard isRunning else { return }
        var moved = false
        for _ in 0..<abs(dx) {
            if state.move(dx > 0 ? 1 : -1) { moved = true } else { break }
        }
        GameHaptics.play(moved ? .select : .wall)
    }

    func rotate(_ clockwise: Bool) {
        guard isRunning else { return }
        GameHaptics.play(state.rotate(clockwise: clockwise) ? .select : .wall)
    }

    func soft(_ rows: Int) {
        guard isRunning else { return }
        for _ in 0..<max(1, rows) {
            let e = state.softDrop()
            handle(e)
            if e.contains(.locked) || state.over { break }
        }
    }

    func drop() {
        guard isRunning else { return }
        handle(state.hardDrop())
    }

    func hold() {
        guard isRunning else { return }
        GameHaptics.play(state.holdPiece() ? .select : .wall)
    }

    private func handle(_ events: [BlocksEvent]) {
        for e in events {
            switch e {
            case .locked: GameHaptics.play(.hit)
            case .cleared(let rows):
                flashRows = rows
                flashAt = Date()
                lastClear = rows.count
                GameHaptics.play(rows.count >= 4 ? .record : .point)
            case .levelUp: GameHaptics.play(.point)
            case .gameOver, .timeUp:
                GameHaptics.play(.miss)
                finishRound(timeUp: e == .timeUp)
            default: break
            }
        }
    }

    private func finishRound(timeUp: Bool) {
        end(GameFinish(
            title: timeUp ? GL.t("challengeMissed") : GL.t("gameOver"),
            detail: "\(GL.name(.blocks)) · \(GL.mode(.blocks, mode))",
            result: state.score,
            stats: [
                GameStat(label: GL.t("levelN", ["n": ""]).trimmingCharacters(in: .whitespaces), value: "\(state.level)"),
                GameStat(label: GL.t("lines", ["n": ""]).trimmingCharacters(in: .whitespaces), value: "\(state.lines)"),
                GameStat(label: GL.t("time").lowercased(with: L.locale), value: GameMath.clock(Int(state.elapsed))),
            ],
            headline: GL.number(state.score)
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }
    override var statusLine: String { GL.number(state.score) + " · " + GL.t("levelN", ["n": "\(state.level)"]) }
    override var challengeProgress: Int { state.lines }
    override var extraActions: [GameExtraAction] {
        [GameExtraAction(id: "hold", icon: "tray.and.arrow.down", title: GL.t("hold"), enabled: !state.holdUsed) { [weak self] in self?.hold() }]
    }
}

struct BlocksGameView: View {
    @StateObject private var model: BlocksModel
    @State private var crown = 0.0
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: BlocksModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.04, green: 0.08, blue: 0.20), Color(red: 0.02, green: 0.03, blue: 0.09)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                GeometryReader { geo in
                    let cell = min((geo.size.width - 46) / CGFloat(BlocksState.cols), (geo.size.height - 30) / CGFloat(BlocksState.rows - BlocksState.hiddenRows))
                    HStack(alignment: .top, spacing: 5) {
                        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: !model.isRunning)) { tl in
                            Canvas { ctx, size in draw(ctx, cell: cell, now: tl.date) }
                        }
                        .frame(width: cell * CGFloat(BlocksState.cols), height: cell * CGFloat(BlocksState.rows - BlocksState.hiddenRows))
                        side(cell: cell)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 26)
                }
                VStack {
                    GameScoreCapsule {
                        Text(GL.number(model.state.score)).font(GT.num(16))
                        if let left = model.state.timeLeft {
                            Text(GameMath.clock(Int(left.rounded(.up)))).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.goldText)
                        } else {
                            Text(GL.t("levelN", ["n": "\(model.state.level)"])).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                        }
                    }
                    Spacer()
                }
                .padding(.top, 2)
                .allowsHitTesting(false)
                ControlHint(text: GL.hint(.blocks))
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 10).onEnded { v in
                let dx = v.translation.width, dy = v.translation.height
                if abs(dx) > abs(dy) {
                    model.move(dx > 0 ? max(1, Int(dx / 18)) : -max(1, Int(-dx / 18)))
                } else if dy > 0 {
                    model.soft(max(1, Int(dy / 14)))
                } else {
                    model.hold()
                }
            })
            .onTapGesture { model.drop() }
            .focusable()
            .focused($focused)
            .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 1, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: false)
            .onAppear { focused = true }
        }
        .onChange(of: crown) { old, new in
            if new > old + 0.5 { model.rotate(true) } else if new < old - 0.5 { model.rotate(false) }
        }
    }

    private func color(_ kind: Int) -> Color { GT.blockColors[max(0, min(6, kind - 1))] }

    private func draw(_ ctx: GraphicsContext, cell: CGFloat, now: Date) {
        let s = model.state
        let hidden = BlocksState.hiddenRows
        let w = cell * CGFloat(BlocksState.cols), h = cell * CGFloat(BlocksState.rows - hidden)
        ctx.fill(Path(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: 6), with: .color(Color.white.opacity(0.06)))
        ctx.stroke(Path(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: 6), with: .color(Color.white.opacity(0.16)), lineWidth: 0.5)
        func r(_ x: Int, _ y: Int) -> CGRect { CGRect(x: CGFloat(x) * cell + 0.6, y: CGFloat(y - hidden) * cell + 0.6, width: cell - 1.2, height: cell - 1.2) }
        for y in hidden..<BlocksState.rows {
            for x in 0..<BlocksState.cols {
                let k = s.cell(x, y)
                guard k > 0 else { continue }
                ctx.fill(Path(roundedRect: r(x, y), cornerRadius: cell * 0.2), with: .color(color(k)))
            }
        }
        if !s.over {
            for c in s.ghost.cells where c.y >= hidden {
                ctx.stroke(Path(roundedRect: r(c.x, c.y).insetBy(dx: 0.6, dy: 0.6), cornerRadius: cell * 0.2), with: .color(Color.white.opacity(0.45)), style: StrokeStyle(lineWidth: 1, dash: [1.6, 1.2]))
            }
            for c in s.piece.cells where c.y >= hidden {
                ctx.fill(Path(roundedRect: r(c.x, c.y), cornerRadius: cell * 0.2), with: .color(color(s.piece.kind.rawValue)))
                ctx.fill(Path(roundedRect: r(c.x, c.y).insetBy(dx: cell * 0.25, dy: cell * 0.25), cornerRadius: cell * 0.1), with: .color(Color.white.opacity(0.25)))
            }
        }
        // Line clear flash (fades in 0.35 s).
        let age = now.timeIntervalSince(model.flashAt)
        if age < 0.35 {
            for y in model.flashRows where y >= hidden {
                ctx.fill(Path(roundedRect: CGRect(x: 0, y: CGFloat(y - hidden) * cell, width: w, height: cell), cornerRadius: 2), with: .color(Color.white.opacity(0.85 * (1 - age / 0.35))))
            }
        }
    }

    private func side(cell: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(GL.t("hold").uppercased(with: L.locale)).font(.system(size: 9, weight: .bold)).foregroundStyle(GT.ink2)
            mini(model.state.hold, cell: 6)
                .opacity(model.state.holdUsed ? 0.4 : 1)
            Text(GL.t("next").uppercased(with: L.locale)).font(.system(size: 9, weight: .bold)).foregroundStyle(GT.ink2).padding(.top, 2)
            ForEach(Array(model.state.next.enumerated()), id: \.offset) { i, k in
                mini(k, cell: i == 0 ? 6 : 5)
            }
            Spacer(minLength: 0)
            Text("\(model.state.lines)").font(GT.num(15))
            Text(GL.t("lines", ["n": ""]).trimmingCharacters(in: .whitespaces)).font(.system(size: 9)).foregroundStyle(GT.ink2)
        }
        .frame(width: 38)
    }

    private func mini(_ kind: BlockKind?, cell: CGFloat) -> some View {
        Canvas { ctx, size in
            guard let kind else { return }
            let cells = kind.cells(rotation: 0)
            let minX = cells.map(\.x).min() ?? 0, maxX = cells.map(\.x).max() ?? 0
            let minY = cells.map(\.y).min() ?? 0, maxY = cells.map(\.y).max() ?? 0
            let ox = (size.width - CGFloat(maxX - minX + 1) * cell) / 2, oy = (size.height - CGFloat(maxY - minY + 1) * cell) / 2
            for c in cells {
                let rect = CGRect(x: ox + CGFloat(c.x - minX) * cell, y: oy + CGFloat(c.y - minY) * cell, width: cell - 0.8, height: cell - 0.8)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 1.4), with: .color(color(kind.rawValue)))
            }
        }
        .frame(width: 34, height: cell * 2.6)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
    }
}
