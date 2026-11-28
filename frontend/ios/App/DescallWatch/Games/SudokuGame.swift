import SwiftUI

// Dokuzlu: tap a cell to select it, turn the Digital Crown to pick a digit, tap the cell
// (or the digit pill) again to write it. Notes mode, auto notes, hints (+30 s), clashes and
// wrong digits in red, three mistakes end the round. Puzzles are generated on the watch
// with a unique solution (off the main thread).

final class SudokuModel: GameModel {
    @Published var state: SudokuState?
    @Published var digit = 1
    @Published var seconds = 0

    override var frameRate: Double { 4 }

    init(launch: GameLaunch) {
        super.init(game: .sudoku, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.sudoku, SudokuState.self, resume: launch.resume) {
            state = save.state
            seconds = Int(save.state.elapsed)
            started = true
            restored = true
        } else {
            generate()
        }
    }

    private func generate() {
        state = nil
        let level = SudokuLevel(rawValue: mode) ?? .medium
        let seed = UInt64.random(in: 1...UInt64.max)
        Task { @MainActor [weak self] in
            let s = await Task.detached(priority: .userInitiated) { SudokuState(level: level, seed: seed) }.value
            guard let self, self.mode == level.rawValue else { return }
            self.state = s
        }
    }

    override func reset() {
        seconds = 0
        generate()
    }

    override func step(_ dt: Double) {
        guard var s = state, !s.over else { return }
        s.elapsed += dt
        state = s
        let whole = Int(s.elapsed)
        if whole != seconds { seconds = whole }
    }

    func select(_ i: Int) {
        guard isRunning, var s = state else { return }
        if s.selected == i, !s.givens[i] {
            write()
            return
        }
        s.selected = i
        state = s
        if s.values[i] != 0 { digit = s.values[i] }
        GameHaptics.play(.select)
    }

    func write() {
        guard isRunning, var s = state else { return }
        started = true
        let e = s.enter(digit)
        state = s
        switch e {
        case .placed, .noted, .erased: GameHaptics.play(.hit)
        case .wrong: GameHaptics.play(.miss)
        case .solved:
            GameHaptics.play(.point)
            finishRound(solved: true)
        default: GameHaptics.play(.wall)
        }
        if s.over, !s.solved { finishRound(solved: false) }
    }

    func toggleNotes() {
        guard var s = state else { return }
        s.notesMode.toggle()
        state = s
        GameHaptics.play(.select)
    }

    func hint() {
        guard var s = state else { return }
        let e = s.hint()
        state = s
        GameHaptics.play(.point)
        if e == .solved { finishRound(solved: true) }
    }

    func fillNotes() {
        guard var s = state else { return }
        s.fillNotes()
        state = s
    }

    func erase() {
        guard isRunning, var s = state else { return }
        _ = s.erase()
        state = s
    }

    private func finishRound(solved: Bool) {
        guard let s = state else { return }
        end(GameFinish(
            title: solved ? GL.t("solved") : GL.t("gameOver"),
            detail: "\(GL.name(.sudoku)) · \(GL.mode(.sudoku, mode))",
            result: solved ? s.resultSeconds : 0,
            won: solved,
            stats: [
                GameStat(label: GL.t("time"), value: GameMath.clock(Int(s.elapsed))),
                GameStat(label: GL.t("hintBtn"), value: "\(s.hints)"),
                GameStat(label: GL.t("mistakes", ["n": "\(s.mistakes)"]), value: ""),
            ],
            headline: solved ? GameMath.clock(s.resultSeconds) : GL.t("mistakes", ["n": "\(s.mistakes)"])
        ))
    }

    override func encode() -> Data? { state.flatMap { GameSave(mode: mode, state: $0).encoded() } }
    override var statusLine: String {
        guard let s = state else { return GL.t("preparing") }
        return GameMath.clock(Int(s.elapsed)) + " · " + GL.t("mistakes", ["n": "\(s.mistakes)"])
    }
    override var dimmedLines: [String] { [statusLine, GL.t("timeStops")] }
    override var extraActions: [GameExtraAction] {
        guard let s = state else { return [] }
        return [
            GameExtraAction(id: "notes", icon: "pencil", title: GL.t("notes"), trailing: s.notesMode ? GL.t("on") : GL.t("haptics.off")) { [weak self] in self?.toggleNotes() },
            GameExtraAction(id: "fill", icon: "square.grid.3x3", title: GL.t("fillNotes")) { [weak self] in self?.fillNotes() },
            GameExtraAction(id: "hint", icon: "lightbulb", title: GL.t("hintBtn"), trailing: "+30 s", iconColor: GT.goldText) { [weak self] in self?.hint() },
        ]
    }
}

struct SudokuGameView: View {
    @StateObject private var model: SudokuModel
    @State private var crown = 1.0
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: SudokuModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.06, green: 0.08, blue: 0.22), Color(red: 0.03, green: 0.04, blue: 0.11)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                if let s = model.state {
                    VStack(spacing: 4) {
                        GameScoreCapsule {
                            Text(GameMath.clock(model.seconds)).font(GT.num(16))
                            Text(GL.t("mistakes", ["n": "\(s.mistakes)"])).font(.system(size: 11, weight: .bold)).foregroundStyle(s.mistakes > 0 ? GT.dangerText : GT.ink2)
                        }
                        GeometryReader { geo in
                            let side = min(geo.size.width, geo.size.height)
                            Canvas { ctx, _ in draw(ctx, s, side: side) }
                                .frame(width: side, height: side)
                                .contentShape(Rectangle())
                                .gesture(SpatialTapGesture().onEnded { v in
                                    let c = side / 9
                                    let x = Int(v.location.x / c), y = Int(v.location.y / c)
                                    if x >= 0, x < 9, y >= 0, y < 9 { model.select(y * 9 + x) }
                                })
                                .frame(maxWidth: .infinity)
                        }
                        picker(s)
                    }
                    .padding(.top, 2)
                    .padding(.horizontal, 6)
                } else {
                    VStack(spacing: 6) {
                        ProgressView()
                        Text(GL.t("preparing")).font(GT.caption).foregroundStyle(GT.ink2)
                    }
                }
            }
            .focusable()
            .focused($focused)
            .digitalCrownRotation($crown, from: 0, through: 9, by: 1, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
            .onAppear { focused = true }
        }
        .onChange(of: crown) { _, v in
            let d = Int(v.rounded())
            if d != model.digit { model.digit = max(0, min(9, d)) }
        }
        // Selecting a filled cell picks its digit: move the crown there too, so the next
        // turn steps from that digit instead of jumping back to the old crown position.
        .onChange(of: model.digit) { _, d in
            if Int(crown.rounded()) != d { crown = Double(d) }
        }
    }

    private func picker(_ s: SudokuState) -> some View {
        HStack(spacing: 5) {
            Button { model.toggleNotes() } label: {
                Image(systemName: s.notesMode ? "pencil.circle.fill" : "pencil.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(s.notesMode ? GT.goldText : GT.ink2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(GL.t("notes"))
            Button { model.write() } label: {
                HStack(spacing: 4) {
                    Text(model.digit == 0 ? GL.t("erase") : "\(model.digit)")
                        .font(GT.num(model.digit == 0 ? 13 : 19))
                    if model.digit > 0 {
                        Text("\(s.placedCount(model.digit))/9").font(.system(size: 10, weight: .semibold)).foregroundStyle(GT.ink2)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 30)
                .background(Capsule().fill(LinearGradient(colors: [GT.ctaTop, GT.ctaBottom], startPoint: .top, endPoint: .bottom)))
            }
            .buttonStyle(.plain)
            Button { model.hint() } label: {
                Image(systemName: "lightbulb").font(.system(size: 17)).foregroundStyle(GT.goldText)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(GL.t("hintBtn"))
        }
    }

    private func draw(_ ctx: GraphicsContext, _ s: SudokuState, side: CGFloat) {
        let c = side / 9
        let sel = s.selected
        let selDigit = s.values[sel]
        ctx.fill(Path(roundedRect: CGRect(x: 0, y: 0, width: side, height: side), cornerRadius: 6), with: .color(Color.white.opacity(0.06)))
        for i in 0..<81 {
            let x = i % 9, y = i / 9
            let r = CGRect(x: CGFloat(x) * c, y: CGFloat(y) * c, width: c, height: c)
            let peer = x == sel % 9 || y == sel / 9 || SudokuSearch.box(i) == SudokuSearch.box(sel)
            if i == sel {
                ctx.fill(Path(roundedRect: r.insetBy(dx: 0.8, dy: 0.8), cornerRadius: 3), with: .color(GT.brand.opacity(0.55)))
            } else if peer {
                ctx.fill(Path(r), with: .color(Color.white.opacity(0.05)))
            } else if selDigit != 0, s.values[i] == selDigit {
                ctx.fill(Path(roundedRect: r.insetBy(dx: 0.8, dy: 0.8), cornerRadius: 3), with: .color(GT.brand.opacity(0.25)))
            }
            let v = s.values[i]
            if v != 0 {
                let wrong = !s.givens[i] && (v != s.solution[i] || s.conflicts(i))
                let color: Color = s.givens[i] ? .white : (wrong ? GT.dangerText : GT.brandHi)
                ctx.draw(Text("\(v)").font(.system(size: c * 0.66, weight: s.givens[i] ? .bold : .semibold, design: .rounded)).foregroundColor(color), at: CGPoint(x: r.midX, y: r.midY))
            } else if s.notes[i] != 0 {
                for d in 1...9 where s.notes[i] & (1 << d) != 0 {
                    let nx = r.minX + c * (CGFloat((d - 1) % 3) + 0.5) / 3, ny = r.minY + c * (CGFloat((d - 1) / 3) + 0.5) / 3
                    ctx.draw(Text("\(d)").font(.system(size: c * 0.28, weight: .semibold)).foregroundColor(GT.ink2), at: CGPoint(x: nx, y: ny))
                }
            } else if i == sel, model.digit > 0 {
                ctx.draw(Text("\(model.digit)").font(.system(size: c * 0.62, weight: .semibold, design: .rounded)).foregroundColor(Color.white.opacity(0.35)), at: CGPoint(x: r.midX, y: r.midY))
            }
        }
        var thin = Path(), thick = Path()
        for k in 1..<9 {
            let p = CGFloat(k) * c
            var line = Path()
            line.move(to: CGPoint(x: p, y: 0)); line.addLine(to: CGPoint(x: p, y: side))
            line.move(to: CGPoint(x: 0, y: p)); line.addLine(to: CGPoint(x: side, y: p))
            if k % 3 == 0 { thick.addPath(line) } else { thin.addPath(line) }
        }
        ctx.stroke(thin, with: .color(Color.white.opacity(0.14)), lineWidth: 0.5)
        ctx.stroke(thick, with: .color(Color.white.opacity(0.5)), lineWidth: 1.2)
        ctx.stroke(Path(roundedRect: CGRect(x: 0, y: 0, width: side, height: side), cornerRadius: 6), with: .color(Color.white.opacity(0.55)), lineWidth: 1.2)
    }
}
