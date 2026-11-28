import SwiftUI

// Hamle (draft A): the Digital Crown first walks the pieces that can move; a tap picks one,
// then the crown walks its legal squares and a second tap plays the move. Tapping a square
// works too. Legal-move hints, last move, check, AI "thinking", three hints, take back,
// resign with confirmation, localized move notation and an evaluation bar.

/// Shared cancel flag for a search running off the main thread.
final class ChessCancel: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
    func set() { lock.lock(); value = true; lock.unlock() }
}

enum ChessNotation {
    /// Piece letters of standard notation in the UI language ("Fc4" in Turkish).
    static func localized(_ san: String) -> String {
        let map: [Character: String]
        switch L.lang {
        case "tr": map = ["K": "Ş", "Q": "V", "R": "K", "B": "F", "N": "A"]
        case "de": map = ["K": "K", "Q": "D", "R": "T", "B": "L", "N": "S"]
        case "es": map = ["K": "R", "Q": "D", "R": "T", "B": "A", "N": "C"]
        case "fr": map = ["K": "R", "Q": "D", "R": "T", "B": "F", "N": "C"]
        case "pt-BR": map = ["K": "R", "Q": "D", "R": "T", "B": "B", "N": "C"]
        case "ru": map = ["K": "Кр", "Q": "Ф", "R": "Л", "B": "С", "N": "К"]
        default: return san
        }
        return san.map { map[$0] ?? String($0) }.joined()
    }

    static func pieceName(_ type: Int) -> String {
        let names: [String: [String]] = [
            "tr": ["", "Piyon", "At", "Fil", "Kale", "Vezir", "Şah"],
            "en": ["", "Pawn", "Knight", "Bishop", "Rook", "Queen", "King"],
            "de": ["", "Bauer", "Springer", "Läufer", "Turm", "Dame", "König"],
            "es": ["", "Peón", "Caballo", "Alfil", "Torre", "Dama", "Rey"],
            "fr": ["", "Pion", "Cavalier", "Fou", "Tour", "Dame", "Roi"],
            "pt-BR": ["", "Peão", "Cavalo", "Bispo", "Torre", "Dama", "Rei"],
            "ru": ["", "Пешка", "Конь", "Слон", "Ладья", "Ферзь", "Король"],
        ]
        let list = names[L.lang] ?? names["en"]!
        return list[max(0, min(6, type))]
    }
}

struct ChessSaveState: Codable {
    var game: ChessGame
    var hintsLeft: Int
    var elapsed: Double
}

final class ChessModel: GameModel {
    @Published var chess: ChessGame
    @Published var selected: Int?
    @Published var cursor = 0
    @Published var thinking = false
    @Published var hintsLeft = 3
    @Published var hintMove: ChessMove?
    @Published var promotionChoices: [ChessMove] = []
    @Published var aiLast: String?
    private(set) var elapsed = 0.0
    private var cancel = ChessCancel()
    private var bestCapture = (value: 0, san: "")

    override var frameRate: Double { 4 }

    init(launch: GameLaunch) {
        let white = UserDefaults.standard.object(forKey: "descall.games.chessWhite") as? Bool ?? true
        chess = ChessGame(playerWhite: white)
        super.init(game: .chess, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.chess, ChessSaveState.self, resume: launch.resume) {
            chess = save.state.game
            hintsLeft = save.state.hintsLeft
            elapsed = save.state.elapsed
            started = true
            restored = true
        }
        afterChange()
    }

    deinit { cancel.set() }

    var strength: ChessStrength { ChessStrength(rawValue: mode) ?? .normal }

    override func reset() {
        cancel.set()
        cancel = ChessCancel()
        let white = UserDefaults.standard.object(forKey: "descall.games.chessWhite") as? Bool ?? true
        chess = ChessGame(playerWhite: white)
        hintsLeft = 3
        elapsed = 0
        bestCapture = (0, "")
        aiLast = nil
        thinking = false
        afterChange()
    }

    override func step(_ dt: Double) {
        if chess.result == .ongoing { elapsed += dt }
    }

    // MARK: Selection

    var legal: [ChessMove] { chess.playerToMove ? chess.position.legalMoves() : [] }

    /// Squares the crown walks: movable pieces, or the selected piece's targets.
    var candidates: [Int] {
        let moves = legal
        if let s = selected {
            var seen = Set<Int>()
            return moves.filter { $0.from == s }.map(\.to).filter { seen.insert($0).inserted }.sorted()
        }
        return Array(Set(moves.map(\.from))).sorted { a, b in
            // Bottom rank first from the player's side, then by file.
            let ra = chess.playerWhite ? a / 8 : 7 - a / 8, rb = chess.playerWhite ? b / 8 : 7 - b / 8
            return ra != rb ? ra < rb : a % 8 < b % 8
        }
    }

    var cursorSquare: Int? {
        let c = candidates
        guard !c.isEmpty else { return nil }
        return c[((cursor % c.count) + c.count) % c.count]
    }

    func turnCrown(_ steps: Int) {
        guard isRunning, chess.playerToMove, steps != 0 else { return }
        cursor += steps
        GameHaptics.play(.select)
    }

    /// Tap on the board (nil = confirm the crown cursor).
    func tap(_ square: Int?) {
        guard isRunning, chess.playerToMove, !thinking else { return }
        let sq = square ?? cursorSquare
        guard let sq else { return }
        let moves = legal
        if let s = selected {
            let to = moves.filter { $0.from == s && $0.to == sq }
            if to.count > 1 {
                promotionChoices = to
                return
            }
            if let m = to.first {
                play(m)
                return
            }
            if sq == s {
                selected = nil
                cursor = 0
                return
            }
        }
        if moves.contains(where: { $0.from == sq }) {
            let before = selected
            selected = sq
            cursor = 0
            if before != sq { GameHaptics.play(.select) }
        }
    }

    func promote(_ m: ChessMove) {
        promotionChoices = []
        play(m)
    }

    private func play(_ m: ChessMove) {
        let target = m.flag == 2 ? m.to - (chess.position.whiteToMove ? 8 : -8) : m.to
        let value = ChessPiece.value[abs(chess.position.board[target])]
        guard chess.play(m) else { return }
        started = true
        if value > bestCapture.value || chess.result != .ongoing, let san = chess.sans.last { bestCapture = (max(value, bestCapture.value), san) }
        selected = nil
        cursor = 0
        hintMove = nil
        GameHaptics.play(.hit)
        afterChange()
    }

    private func afterChange() {
        if chess.result != .ongoing {
            finishGame()
            return
        }
        if !chess.playerToMove { think() }
    }

    private func think() {
        guard !thinking else { return }
        thinking = true
        let position = chess.position
        let strength = self.strength
        let flag = cancel
        Task { @MainActor [weak self] in
            let move = await Task.detached(priority: .userInitiated) { () -> ChessMove? in
                var rng = GameRNG.fresh()
                return ChessEngine(position, cancelled: { flag.isSet }).bestMove(strength, rng: &rng)
            }.value
            guard let self, !flag.isSet else { return }
            self.thinking = false
            guard let move, self.chess.position == position, self.chess.play(move) else { return }
            self.aiLast = self.chess.sans.last.map { ChessNotation.localized($0) }
            GameHaptics.play(self.chess.position.inCheck ? .check : .aiMove)
            self.afterChange()
        }
    }

    func hint() {
        guard hintsLeft > 0, chess.playerToMove, !thinking else { return }
        let position = chess.position
        Task { @MainActor [weak self] in
            let move = await Task.detached(priority: .userInitiated) { () -> ChessMove? in
                var rng = GameRNG.fresh()
                return ChessEngine(position).bestMove(.normal, rng: &rng)
            }.value
            guard let self, let move, self.chess.position == position else { return }
            self.hintsLeft -= 1
            self.hintMove = move
            self.selected = move.from
            let targets = self.candidates
            self.cursor = targets.firstIndex(of: move.to) ?? 0
            GameHaptics.play(.point)
        }
    }

    func takeBack() {
        guard !thinking, chess.takeBack() else { return }
        selected = nil
        cursor = 0
        hintMove = nil
        aiLast = nil
        GameHaptics.play(.select)
        // Whoever is to move now moves (the engine thinks again if it is its turn).
        afterChange()
    }

    func resign() {
        cancel.set()
        thinking = false
        chess.resign()
        afterChange()
    }

    private func finishGame() {
        let won = chess.playerWon
        let prev = GameCenter.shared.best(.chess, mode)?.best ?? 0
        let firstUnlock = won && mode == "normal" && !GameCenter.shared.chessMasterUnlocked
        let reason = GL.chessResult(chess.result)
        end(GameFinish(
            title: won ? GL.t("youWon") : (chess.isDraw ? GL.t("draw") : GL.t("youLost")),
            detail: "\(reason) · \(GL.t("moveCount", ["n": "\(max(1, (chess.moves.count + 1) / 2))"])) · \(GL.mode(.chess, mode))",
            result: won ? prev + 1 : prev,
            won: won,
            stats: [
                GameStat(label: GL.t("bestMove"), value: bestCapture.san.isEmpty ? "-" : ChessNotation.localized(bestCapture.san)),
                GameStat(label: GL.t("time"), value: GameMath.clock(Int(elapsed))),
                GameStat(label: GL.t("hintBtn"), value: "\(3 - hintsLeft)"),
            ],
            headline: reason,
            nextLabel: (won && mode == "normal") ? GL.t("playMaster") : nil,
            nextMode: (won && mode == "normal") ? "hard" : nil,
            pill: firstUnlock ? GL.t("unlocked") : nil
        ))
    }

    var moveNumber: Int { chess.moves.count / 2 + 1 }

    override func encode() -> Data? {
        GameSave(mode: mode, state: ChessSaveState(game: chess, hintsLeft: hintsLeft, elapsed: elapsed)).encoded()
    }

    override var statusLine: String {
        GL.t("moveN", ["n": "\(moveNumber)"]) + " · " + (chess.playerToMove ? GL.t("yourTurn") : GL.t("thinking"))
    }

    override var saveSummary: String {
        GL.t("moveCount", ["n": "\(moveNumber)"]) + " · " + (chess.playerToMove ? GL.t("yourTurn") : GL.t("thinking"))
    }

    override var dimmedLines: [String] {
        [GL.t("moveN", ["n": "\(moveNumber)"]), aiLast.map { GL.t("aiMoved", ["move": $0]) } ?? statusLine, GL.t("timeStops")]
    }

    override var evalShare: Double? {
        let e = chess.evaluationForWhite
        return GameMath.clamp(0.5 + atan(e / 4) / Double.pi, 0.03, 0.97)
    }

    override var recentLine: String? {
        guard !chess.sans.isEmpty else { return nil }
        let start = max(0, chess.sans.count - 4)
        var parts: [String] = []
        var i = start - start % 2
        while i < chess.sans.count {
            let w = ChessNotation.localized(chess.sans[i])
            let b = i + 1 < chess.sans.count ? " " + ChessNotation.localized(chess.sans[i + 1]) : ""
            parts.append("\(i / 2 + 1). \(w)\(b)")
            i += 2
        }
        return parts.joined(separator: " · ")
    }

    override var extraActions: [GameExtraAction] {
        [
            GameExtraAction(id: "hint", icon: "lightbulb", title: GL.t("hintBtn"), trailing: GL.t("left", ["n": "\(hintsLeft)"]), iconColor: GT.goldText, enabled: hintsLeft > 0 && chess.playerToMove) { [weak self] in self?.hint() },
            GameExtraAction(id: "undo", icon: "arrow.uturn.backward", title: GL.t("undo"), enabled: !chess.moves.isEmpty) { [weak self] in self?.takeBack() },
            GameExtraAction(id: "resign", icon: "flag", title: GL.t("resign") + "…", destructive: true, confirm: GL.t("resignConfirm")) { [weak self] in self?.resign() },
        ]
    }

    override var modeChangeable: Bool { chess.moves.isEmpty }
}

struct ChessGameView: View {
    @StateObject private var model: ChessModel
    @State private var crown = 0.0
    @FocusState private var focused: Bool

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: ChessModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                DescallBackground()
                GeometryReader { geo in
                    let side = min(geo.size.width - 26, geo.size.height - 74)
                    VStack(spacing: 4) {
                        header
                        board(side: side)
                            .frame(width: side, height: side)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.white.opacity(0.2), lineWidth: 0.5))
                        footer
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
                CrownHint(top: 60)
                if !model.promotionChoices.isEmpty { promotionPicker }
            }
            .focusable()
            .focused($focused)
            .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            .onAppear { focused = true }
        }
        .onChange(of: crown) { old, new in
            let steps = Int((new - old).rounded())
            if steps != 0 { model.turnCrown(steps) }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(GL.t("moveN", ["n": "\(model.moveNumber)"])).font(.system(size: 13, weight: .semibold)).foregroundStyle(GT.brandHi)
            Spacer(minLength: 2)
            Text(GL.t("ai")).font(.system(size: 9, weight: .heavy))
                .frame(width: 18, height: 18)
                .background(Circle().fill(GT.violet))
            Text(GL.mode(.chess, model.mode)).font(.system(size: 12, weight: .semibold)).lineLimit(1)
            if model.thinking {
                ProgressView().scaleEffect(0.5).frame(width: 14, height: 14)
            } else if let share = model.evalShare {
                let pawns = (share - 0.5) * 2
                let mine = model.chess.playerWhite ? pawns : -pawns
                GamePill(text: mine >= 0 ? "+\(Int((mine * 9).rounded()))" : "\(Int((mine * 9).rounded()))", tone: mine >= 0 ? .ok : .red)
            }
        }
        .padding(.leading, 40)
        .padding(.trailing, 14)
    }

    private var footer: some View {
        Button { model.tap(nil) } label: {
            HStack(spacing: 4) {
                Image(systemName: "digitalcrown.arrow.clockwise").foregroundStyle(GT.brandHi)
                Text(footerText).lineLimit(1).minimumScaleFactor(0.7)
            }
            .font(.system(size: 12, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 26)
        }
        .buttonStyle(.plain)
    }

    private var footerText: String {
        let c = model.chess
        if c.result != .ongoing { return GL.chessResult(c.result) }
        if model.thinking { return GL.t("thinking") }
        if let ai = model.aiLast, model.selected == nil, c.position.inCheck { return "\(GL.t("check")) · \(ai)" }
        guard let sel = model.selected else {
            if let cur = model.cursorSquare {
                return "\(ChessNotation.pieceName(abs(c.position.board[cur]))) \(ChessPosition.squareName(cur)) · \(GL.t("pickPiece"))"
            }
            return GL.t("yourTurn")
        }
        let name = ChessNotation.pieceName(abs(c.position.board[sel]))
        let to = model.cursorSquare.map { ChessPosition.squareName($0) } ?? ""
        return "\(name) \(ChessPosition.squareName(sel)) → \(to) · \(GL.t("squares", ["n": "\(model.candidates.count)"]))"
    }

    private func board(side: CGFloat) -> some View {
        Canvas { ctx, _ in draw(ctx, side: side) }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { v in
                let q = side / 8
                let fx = Int(v.location.x / q), fy = Int(v.location.y / q)
                guard fx >= 0, fx < 8, fy >= 0, fy < 8 else { return }
                model.tap(square(col: fx, row: fy))
            })
    }

    /// Screen cell to board square (the player's side at the bottom).
    private func square(col: Int, row: Int) -> Int {
        model.chess.playerWhite ? (7 - row) * 8 + col : row * 8 + (7 - col)
    }

    private func cell(_ sq: Int) -> (col: Int, row: Int) {
        model.chess.playerWhite ? (sq % 8, 7 - sq / 8) : (7 - sq % 8, sq / 8)
    }

    private func draw(_ ctx: GraphicsContext, side: CGFloat) {
        let q = side / 8
        let pos = model.chess.position
        func rect(_ sq: Int) -> CGRect {
            let c = cell(sq)
            return CGRect(x: CGFloat(c.col) * q, y: CGFloat(c.row) * q, width: q, height: q)
        }
        for sq in 0..<64 {
            let light = (sq % 8 + sq / 8) % 2 == 1
            ctx.fill(Path(rect(sq).insetBy(dx: -0.2, dy: -0.2)), with: .color(light ? GT.boardLight : GT.boardDark))
        }
        if let last = model.chess.lastMove {
            for sq in [last.from, last.to] { ctx.fill(Path(rect(sq)), with: .color(GT.gold.opacity(0.28))) }
        }
        if pos.inCheck {
            let k = pos.kings[pos.whiteToMove ? 0 : 1]
            ctx.fill(Path(ellipseIn: rect(k).insetBy(dx: 1, dy: 1)), with: .color(GT.danger.opacity(0.55)))
        }
        if let s = model.selected {
            ctx.fill(Path(roundedRect: rect(s).insetBy(dx: 1, dy: 1), cornerRadius: q * 0.18), with: .color(GT.brand.opacity(0.45)))
            ctx.stroke(Path(roundedRect: rect(s).insetBy(dx: 1, dy: 1), cornerRadius: q * 0.18), with: .color(GT.brandHi), lineWidth: 1.6)
        }
        for sq in 0..<64 where pos.board[sq] != 0 {
            ChessPieceArt.draw(ctx, piece: pos.board[sq], in: rect(sq).insetBy(dx: q * 0.06, dy: q * 0.04))
        }
        if let s = model.selected {
            for t in Set(model.legal.filter { $0.from == s }.map(\.to)) {
                let r = rect(t)
                if pos.board[t] != 0 {
                    ctx.stroke(Path(ellipseIn: r.insetBy(dx: q * 0.06, dy: q * 0.06)), with: .color(GT.captureRing), lineWidth: 2)
                } else {
                    ctx.fill(Path(ellipseIn: CGRect(x: r.midX - q * 0.17, y: r.midY - q * 0.17, width: q * 0.34, height: q * 0.34)), with: .color(GT.moveDot.opacity(0.95)))
                }
            }
        }
        if let h = model.hintMove {
            let a = rect(h.from), b = rect(h.to)
            var line = Path()
            line.move(to: CGPoint(x: a.midX, y: a.midY))
            line.addLine(to: CGPoint(x: b.midX, y: b.midY))
            ctx.stroke(line, with: .color(GT.goldText.opacity(0.8)), style: StrokeStyle(lineWidth: q * 0.2, lineCap: .round))
        }
        if let c = model.cursorSquare, model.chess.playerToMove {
            ctx.stroke(Path(roundedRect: rect(c).insetBy(dx: 1, dy: 1), cornerRadius: q * 0.18), with: .color(.white), lineWidth: 2)
        }
    }

    private var promotionPicker: some View {
        VStack(spacing: 6) {
            Text(GL.t("promote")).font(GT.title)
            HStack(spacing: 6) {
                ForEach(model.promotionChoices, id: \.self) { m in
                    Button { model.promote(m) } label: {
                        Canvas { ctx, size in
                            ChessPieceArt.draw(ctx, piece: model.chess.playerWhite ? m.promo : -m.promo, in: CGRect(origin: .zero, size: size))
                        }
                        .frame(width: 34, height: 34)
                        .background(RoundedRectangle(cornerRadius: 8).fill(GT.boardLight))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ChessNotation.pieceName(m.promo))
                }
            }
        }
        .padding(10)
        .gameGlass(.highlight)
    }
}
