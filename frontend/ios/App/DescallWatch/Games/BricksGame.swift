import SpriteKit
import SwiftUI

// Prizma: the Digital Crown slides the paddle, a tap launches the ball. Bricks shade by
// their hits, steel stays grey, prism bricks glow and always drop a power-up.

final class BricksModel: GameModel {
    var state: BrickState
    @Published var score = 0
    @Published var lives = 3
    @Published var level = 0
    @Published var lastPower: BrickPower?
    var rebuild = true
    var fxBroken: [CGPoint] = []
    lazy var scene: BricksScene = BricksScene(bricks: self)
    private var startedAt = Date()

    override var frameRate: Double { 0 }

    init(launch: GameLaunch) {
        state = BrickState(seed: UInt64.random(in: 1...UInt64.max))
        super.init(game: .bricks, mode: "", challenge: launch.challenge)
        if let save = gameRestore(.bricks, BrickState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
        }
        publish()
    }

    override func reset() {
        state = BrickState(seed: UInt64.random(in: 1...UInt64.max))
        rebuild = true
        startedAt = Date()
        publish()
    }

    func setPaddle(_ f: Double) { state.setPaddle(fraction: f) }

    func tap() {
        guard isRunning else { return }
        if state.launch() { GameHaptics.play(.select) }
    }

    override func step(_ dt: Double) {
        started = true
        let before = state.bricks.count
        for e in state.step(dt) {
            switch e {
            case .hit, .steel: GameHaptics.play(.hit)
            case .broken: GameHaptics.play(.hit)
            case .paddle: GameHaptics.play(.hit)
            case .wall: break
            case .power(let p):
                lastPower = p
                GameHaptics.play(.point)
            case .lifeLost: GameHaptics.play(.miss)
            case .levelCleared:
                rebuild = true
                GameHaptics.play(.record)
            case .gameOver:
                GameHaptics.play(.miss)
                finishRound()
            case .launch: break
            }
        }
        if state.bricks.count != before { rebuild = true }
        publish()
    }

    private func publish() {
        if score != state.score { score = state.score }
        if lives != state.lives { lives = state.lives }
        if level != state.level { level = state.level }
    }

    private func finishRound() {
        let secs = Int(Date().timeIntervalSince(startedAt))
        end(GameFinish(
            title: GL.t("gameOver"),
            detail: "\(GL.name(.bricks)) · " + GL.t("levelN", ["n": "\(state.level + 1)"]),
            result: state.score,
            stats: [
                GameStat(label: GL.t("levels"), value: "\(state.level + 1)"),
                GameStat(label: GL.t("time").lowercased(with: L.locale), value: GameMath.clock(secs)),
                GameStat(label: GL.t("powers"), value: "\(state.powersCaught)"),
            ],
            headline: GL.number(state.score)
        ))
    }

    override func encode() -> Data? { GameSave(mode: mode, state: state).encoded() }
    override var statusLine: String { GL.number(state.score) + " · " + GL.t("levelN", ["n": "\(state.level + 1)"]) }
    override var challengeProgress: Int { state.bricksBroken }
}

struct BricksGameView: View {
    @StateObject private var model: BricksModel
    @State private var crown = 0.5

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: BricksModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                SpriteHost(scene: model.scene, paused: !model.isRunning, crown: $crown) { model.tap() }
                VStack(spacing: 4) {
                    GameScoreCapsule {
                        Text(GL.number(model.score)).font(GT.num(18))
                        HStack(spacing: 2) {
                            ForEach(0..<min(model.lives, 5), id: \.self) { _ in
                                Circle().fill(GT.accent(.bricks)).frame(width: 5, height: 5)
                            }
                        }
                        Text(GL.t("levelN", ["n": "\(model.level + 1)"])).font(.system(size: 11, weight: .bold)).foregroundStyle(GT.ink2)
                    }
                    if let p = model.lastPower {
                        GamePill(text: GL.power(p), icon: "sparkles", tone: .gold)
                            .transition(.opacity)
                            .id(p.rawValue + "\(model.score)")
                    }
                    Spacer()
                }
                .padding(.top, 6)
                .allowsHitTesting(false)
                CrownHint(top: 46)
                ControlHint(text: GL.hint(.bricks))
            }
        }
        .onChange(of: crown) { _, v in model.setPaddle(v) }
        .task(id: model.lastPower) {
            guard model.lastPower != nil else { return }
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            withAnimation { model.lastPower = nil }
        }
    }
}

final class BricksScene: GameScene {
    private unowned let model: BricksModel
    private let bg = SKSpriteNode()
    private let brickLayer = SKNode()
    private let paddle = SKShapeNode()
    private let shield = SKShapeNode()
    private var balls: [SKShapeNode] = []
    private var drops: [SKShapeNode] = []
    private var unit: CGFloat = 1
    private var origin = CGPoint.zero

    init(bricks: BricksModel) {
        model = bricks
        super.init(model: bricks)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    override func layout() {
        removeAllChildren()
        balls = []
        drops = []
        // Court 100 x 150 fitted to the screen, below the score capsule.
        let top: CGFloat = 34
        unit = min(size.width / CGFloat(BrickState.width), (size.height - top) / CGFloat(BrickState.height))
        origin = CGPoint(x: (size.width - CGFloat(BrickState.width) * unit) / 2, y: 0)
        bg.texture = GameTextures.gradient([Color(red: 0.12, green: 0.09, blue: 0.30), Color(red: 0.04, green: 0.05, blue: 0.13)], size: size)
        bg.size = size
        bg.anchorPoint = .zero
        bg.zPosition = 0
        addChild(bg)
        brickLayer.zPosition = 2
        addChild(brickLayer)
        shield.path = CGPath(rect: CGRect(x: origin.x, y: 1, width: CGFloat(BrickState.width) * unit, height: 2), transform: nil)
        shield.fillColor = SKColor(GT.brandHi, alpha: 0.85)
        shield.strokeColor = .clear
        shield.zPosition = 3
        shield.glowWidth = 2
        addChild(shield)
        paddle.fillColor = .white
        paddle.strokeColor = .clear
        paddle.zPosition = 4
        addChild(paddle)
        model.rebuild = true
    }

    private func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: origin.x + CGFloat(x) * unit, y: origin.y + CGFloat(y) * unit) }

    private func color(_ b: Brick) -> SKColor {
        if b.isSteel { return SKColor(Color(white: 0.55), alpha: 1) }
        if b.drops { return SKColor(GT.goldText, alpha: 1) }
        let ramp: [Color] = [Color(red: 0.5, green: 0.91, blue: 1), Color(red: 0.64, green: 0.46, blue: 1), Color(red: 1, green: 0.38, blue: 0.46)]
        return SKColor(ramp[max(0, min(2, b.maxHP - 1))], alpha: 0.55 + 0.45 * CGFloat(b.hp) / CGFloat(max(1, b.maxHP)))
    }

    override func render() {
        let s = model.state
        if model.rebuild {
            model.rebuild = false
            brickLayer.removeAllChildren()
            for b in s.bricks {
                let r = s.rect(of: b)
                let node = SKShapeNode(rect: CGRect(x: p(r.x, r.y).x, y: p(r.x, r.y).y, width: CGFloat(r.w) * unit, height: CGFloat(r.h) * unit), cornerRadius: 1.4 * unit)
                node.fillColor = color(b)
                node.strokeColor = b.drops ? SKColor(.white, alpha: 0.8) : .clear
                node.lineWidth = 0.6
                brickLayer.addChild(node)
            }
        }
        let w = CGFloat(s.paddleWidth) * unit, h = CGFloat(BrickState.paddleHeight) * unit
        paddle.path = CGPath(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerWidth: h / 2, cornerHeight: h / 2, transform: nil)
        paddle.position = p(s.paddleX, BrickState.paddleY)
        paddle.fillColor = s.stickyLeft > 0 ? SKColor(GT.okText, alpha: 1) : .white
        shield.isHidden = !s.shield
        while balls.count < max(1, s.balls.count) {
            let n = SKShapeNode(circleOfRadius: CGFloat(BrickState.ballRadius) * unit)
            n.fillColor = .white
            n.strokeColor = .clear
            n.zPosition = 5
            n.glowWidth = 1.5
            addChild(n)
            balls.append(n)
        }
        for (i, n) in balls.enumerated() {
            if s.stuck && s.balls.isEmpty && i == 0 {
                n.isHidden = false
                n.position = p(s.paddleX, BrickState.paddleY + BrickState.paddleHeight / 2 + BrickState.ballRadius)
            } else if i < s.balls.count {
                n.isHidden = false
                n.position = p(s.balls[i].x, s.balls[i].y)
                n.fillColor = s.pierceLeft > 0 ? SKColor(GT.goldText, alpha: 1) : .white
            } else {
                n.isHidden = true
            }
        }
        while drops.count < s.drops.count {
            let n = SKShapeNode(rect: CGRect(x: -4 * unit, y: -1.6 * unit, width: 8 * unit, height: 3.2 * unit), cornerRadius: 1.6 * unit)
            n.strokeColor = .white
            n.lineWidth = 0.6
            n.zPosition = 4
            addChild(n)
            drops.append(n)
        }
        for (i, n) in drops.enumerated() {
            guard i < s.drops.count else { n.isHidden = true; continue }
            n.isHidden = false
            n.position = p(s.drops[i].x, s.drops[i].y)
            n.fillColor = SKColor(GT.blockColors[BrickPower.allCases.firstIndex(of: s.drops[i].power) ?? 0], alpha: 1)
        }
    }
}
