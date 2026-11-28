import SpriteKit
import SwiftUI

// Raket (draft A): the table across the portrait screen, the AI's paddle on the left,
// the player's on the right next to the Digital Crown. Score capsule on top, level and
// rally pills, a "Kesme" (spin) tag on curved balls, haptics on every hit and point.

final class PongModel: GameModel {
    var state: PongState
    @Published var playerScore = 0
    @Published var aiScore = 0
    @Published var rally = 0
    @Published var spinning = false
    @Published var smashFlash = 0
    /// Effects for the scene this frame.
    var hitFX = false
    var pointFX = false
    lazy var scene: PongScene = PongScene(pong: self)

    override var frameRate: Double { 0 }

    init(launch: GameLaunch) {
        let level = PongLevel(rawValue: launch.mode) ?? .normal
        state = PongState(level: level, seed: UInt64.random(in: 1...UInt64.max))
        super.init(game: .pong, mode: launch.mode, challenge: launch.challenge)
        if let save = gameRestore(.pong, PongState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
        }
        publish()
    }

    override func reset() {
        state = PongState(level: PongLevel(rawValue: mode) ?? .normal, seed: UInt64.random(in: 1...UInt64.max))
        publish()
    }

    /// A crown turn (share of a full sweep across the court).
    func nudgePaddle(_ sweep: Double) {
        guard isRunning else { return }
        state.nudgePlayer(sweep: sweep)
    }

    func smash() {
        guard isRunning else { return }
        state.smash()
    }

    override func step(_ dt: Double) {
        started = true
        for e in state.step(dt) {
            switch e {
            case .playerHit(let strength):
                hitFX = true
                GameHaptics.play(strength > 0.6 ? .wall : .hit)
            case .smash:
                smashFlash += 1
            case .aiHit:
                hitFX = true
                GameHaptics.play(.hit)
            case .wall:
                break
            case .pointPlayer:
                pointFX = true
                GameHaptics.play(.point)
            case .pointAI:
                pointFX = true
                GameHaptics.play(.miss)
            case .won, .lost:
                finishMatch()
            case .serve:
                break
            }
        }
        publish()
    }

    private func publish() {
        if playerScore != state.playerScore { playerScore = state.playerScore }
        if aiScore != state.aiScore { aiScore = state.aiScore }
        if rally != state.rally { rally = state.rally }
        let s = abs(state.spin) > 14 && state.serveIn <= 0
        if spinning != s { spinning = s }
    }

    private func finishMatch() {
        let won = state.playerWon
        let prev = GameCenter.shared.best(.pong, mode)?.best ?? 0
        end(GameFinish(
            title: won ? GL.t("youWon") : GL.t("youLost"),
            detail: "\(GL.name(.pong)) · \(GL.mode(.pong, mode))",
            result: won ? prev + 1 : prev,
            won: won,
            stats: [
                GameStat(label: GL.t("rally", ["n": ""]).trimmingCharacters(in: .whitespaces), value: "\(state.longestRally)"),
                GameStat(label: GL.t("smash"), value: "\(state.smashes)"),
            ],
            headline: "\(state.playerScore)–\(state.aiScore)"
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }

    override var statusLine: String {
        let serve = state.serveIn > 0 && state.serveToPlayer ? " · " + GL.t("serveYou") : ""
        return "\(state.aiScore) – \(state.playerScore)\(serve)"
    }

    override var saveSummary: String { "\(state.playerScore)–\(state.aiScore)" }
    override var challengeProgress: Int { state.playerScore }
}

struct PongGameView: View {
    @StateObject private var model: PongModel

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: PongModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                SpriteHost(scene: model.scene, paused: !model.isRunning, crownSpan: CrownInput.pongSpan, onCrown: { model.nudgePaddle($0) }) { model.smash() }
                VStack(spacing: 4) {
                    GameScoreCapsule {
                        Text(GL.t("ai")).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                        Text("\(model.aiScore)").font(GT.num(20))
                        Text("–").foregroundStyle(GT.ink2)
                        Text("\(model.playerScore)").font(GT.num(20)).foregroundStyle(GT.pillBrandText)
                    }
                    HStack(spacing: 5) {
                        GamePill(text: GL.mode(.pong, model.mode), tone: .glass)
                        if model.rally > 1 { GamePill(text: GL.t("rally", ["n": "\(model.rally)"]), tone: .glass) }
                        if model.spinning { GamePill(text: GL.t("spin"), tone: .gold) }
                    }
                    Spacer()
                }
                .padding(.top, 6)
                .allowsHitTesting(false)
                CrownHint(top: 46)
                ControlHint(text: GL.hint(.pong))
            }
        }
    }
}

/// Draws PongState: court x (along the paddles) runs down the screen, court y (between
/// the paddles) runs from the right edge (player) to the left (AI).
final class PongScene: GameScene {
    private unowned let pong: PongModel
    private let court = SKSpriteNode()
    private let outline = SKShapeNode()
    private let centre = SKNode()
    private let ai = SKShapeNode()
    private let player = SKShapeNode()
    private let playerGlow = SKShapeNode()
    private let ball = SKShapeNode()
    private let halo = SKSpriteNode()
    private var trail: [SKShapeNode] = []
    private var trailPoints: [CGPoint] = []
    private var rect = CGRect.zero

    init(pong: PongModel) {
        self.pong = pong
        super.init(model: pong)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    override func layout() {
        removeAllChildren()
        trail = []
        trailPoints = []
        rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
        court.texture = GameTextures.gradient([GT.courtTop, GT.courtBottom], size: size)
        court.size = size
        court.anchorPoint = .zero
        court.position = .zero
        court.zPosition = 0
        addChild(court)
        let inner = rect.insetBy(dx: 7, dy: 7)
        outline.path = CGPath(roundedRect: inner, cornerWidth: 28, cornerHeight: 28, transform: nil)
        outline.strokeColor = SKColor(GT.courtLine, alpha: 0.3)
        outline.fillColor = .clear
        outline.lineWidth = 1
        outline.zPosition = 1
        addChild(outline)
        centre.removeAllChildren()
        var y: CGFloat = 12
        while y < size.height - 12 {
            let dash = SKShapeNode(rect: CGRect(x: size.width / 2 - 0.7, y: y, width: 1.4, height: 5))
            dash.fillColor = SKColor(GT.courtLine, alpha: 0.3)
            dash.strokeColor = .clear
            centre.addChild(dash)
            y += 10
        }
        let mid = SKShapeNode(rect: CGRect(x: 10, y: size.height / 2 - 0.4, width: size.width - 20, height: 0.8))
        mid.fillColor = SKColor(GT.courtLine, alpha: 0.15)
        mid.strokeColor = .clear
        centre.addChild(mid)
        centre.zPosition = 1
        addChild(centre)
        // Paddles and ball at the logic's own size and place (PongLayout): the paddle face on
        // screen is the face the ball bounces off.
        let ph = CGFloat(table.paddleLength), pt = CGFloat(table.paddleThickness)
        let br = CGFloat(table.ballRadius)
        ai.path = CGPath(roundedRect: CGRect(x: -pt / 2, y: -ph / 2, width: pt, height: ph), cornerWidth: pt / 2, cornerHeight: pt / 2, transform: nil)
        ai.fillColor = SKColor(GT.aiPaddle)
        ai.strokeColor = .clear
        ai.zPosition = 3
        addChild(ai)
        playerGlow.path = CGPath(roundedRect: CGRect(x: -pt / 2 - 2, y: -ph / 2 - 2, width: pt + 4, height: ph + 4), cornerWidth: pt / 2 + 2, cornerHeight: pt / 2 + 2, transform: nil)
        playerGlow.fillColor = SKColor(GT.playerPaddle, alpha: 0.22)
        playerGlow.strokeColor = .clear
        playerGlow.zPosition = 2
        addChild(playerGlow)
        player.path = CGPath(roundedRect: CGRect(x: -pt / 2, y: -ph / 2, width: pt, height: ph), cornerWidth: pt / 2, cornerHeight: pt / 2, transform: nil)
        player.fillColor = SKColor(GT.playerPaddle)
        player.strokeColor = .clear
        player.zPosition = 3
        addChild(player)
        ball.path = CGPath(ellipseIn: CGRect(x: -br, y: -br, width: br * 2, height: br * 2), transform: nil)
        for i in 0..<6 {
            let t = SKShapeNode(circleOfRadius: br * (0.78 - CGFloat(i) * 0.1))
            t.fillColor = SKColor(.white, alpha: 0.32 - CGFloat(i) * 0.05)
            t.strokeColor = .clear
            t.zPosition = 4
            addChild(t)
            trail.append(t)
        }
        halo.texture = GameTextures.glow(.white, diameter: 36)
        halo.size = CGSize(width: br * 4, height: br * 4)
        halo.alpha = 0.5
        halo.zPosition = 5
        addChild(halo)
        ball.fillColor = .white
        ball.strokeColor = .clear
        ball.zPosition = 6
        addChild(ball)
    }

    private var table: PongLayout { PongLayout(width: Double(size.width), height: Double(size.height)) }

    private func cg(_ p: (x: Double, y: Double)) -> CGPoint { CGPoint(x: CGFloat(p.x), y: CGFloat(p.y)) }

    override func render() {
        let s = pong.state
        let t = table
        player.position = cg(t.player(x: s.playerX))
        playerGlow.position = player.position
        ai.position = cg(t.ai(x: s.aiX))
        let b = cg(t.point(x: s.ballX, y: s.ballY))
        ball.position = b
        halo.position = b
        let visible = s.serveIn <= 0 || Int(s.serveIn * 6) % 2 == 0
        ball.isHidden = !visible
        halo.isHidden = !visible
        trailPoints.insert(b, at: 0)
        if trailPoints.count > trail.count * 2 { trailPoints.removeLast() }
        for (i, node) in trail.enumerated() {
            let idx = (i + 1) * 2 - 1
            node.isHidden = s.serveIn > 0 || idx >= trailPoints.count
            if idx < trailPoints.count { node.position = trailPoints[idx] }
        }
        if pong.hitFX {
            pong.hitFX = false
            ball.run(.sequence([.scale(to: 1.35, duration: 0.05), .scale(to: 1, duration: 0.12)]))
        }
        if pong.pointFX {
            pong.pointFX = false
            court.run(.sequence([.colorize(with: SKColor(GT.brand), colorBlendFactor: 0.35, duration: 0.06), .colorize(withColorBlendFactor: 0, duration: 0.3)]))
            trailPoints.removeAll()
        }
    }
}
