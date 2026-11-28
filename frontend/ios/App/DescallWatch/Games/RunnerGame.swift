import SpriteKit
import SwiftUI

// Isilti: tap and Lumo flaps. The sky runs from day to dusk to night; today's best run
// flies along as a faint ghost on the same course; medals at 10 / 25 / 50 / 100.

final class RunnerModel: GameModel {
    var state: RunnerState
    @Published var score = 0
    @Published var waiting = true
    @Published var medal: RunnerMedal = .none
    let ghost: [Double]?
    var flapFX = false
    lazy var scene: RunnerScene = RunnerScene(runner: self)

    override var frameRate: Double { 0 }

    init(launch: GameLaunch) {
        let day = GameDay.number(Date())
        state = RunnerState(seed: RunnerState.courseSeed(day: day))
        ghost = launch.challenge == nil ? GameCenter.shared.todaysGhost() : nil
        super.init(game: .runner, mode: "", challenge: launch.challenge)
        if let save = gameRestore(.runner, RunnerState.self, resume: launch.resume) {
            state = save.state
            started = true
            restored = true
        }
        publish()
    }

    override func reset() {
        state = RunnerState(seed: RunnerState.courseSeed(day: GameDay.number(Date())))
        publish()
    }

    func tap() {
        guard isRunning else { return }
        for e in state.flap() {
            if e == .started { started = true }
        }
        flapFX = true
        GameHaptics.play(.select)
        publish()
    }

    override func step(_ dt: Double) {
        for e in state.step(dt) {
            switch e {
            case .passed: GameHaptics.play(.hit)
            case .medal: GameHaptics.play(.record)
            case .crashed:
                GameHaptics.play(.miss)
                GameCenter.shared.noteRunnerRun(score: state.score, trace: state.trace)
                finishRun()
            default: break
            }
        }
        publish()
    }

    private func publish() {
        if score != state.score { score = state.score }
        if waiting != !state.started { waiting = !state.started }
        if medal != state.medal { medal = state.medal }
    }

    private func finishRun() {
        end(GameFinish(
            title: GL.t("gameOver"),
            detail: "\(GL.name(.runner)) · \(GL.medal(state.medal))",
            result: state.score,
            stats: [
                GameStat(label: GL.t("time").lowercased(with: L.locale), value: GameMath.clock(Int(state.flightTime))),
                GameStat(label: GL.medal(state.medal), value: state.medal == .none ? "-" : "\(state.medal.threshold)+"),
            ],
            headline: "\(state.score)"
        ))
    }

    override func encode() -> Data? { state.started ? GameSave(mode: mode, state: state).encoded() : nil }
    override var statusLine: String { "\(state.score) · \(GL.medal(state.medal))" }
    override var challengeProgress: Int { state.score }
}

struct RunnerGameView: View {
    @StateObject private var model: RunnerModel

    init(launch: GameLaunch) {
        _model = StateObject(wrappedValue: RunnerModel(launch: launch))
    }

    var body: some View {
        GameFrame(model: model) {
            ZStack {
                SpriteHost(scene: model.scene, paused: !model.isRunning, onTap: { model.tap() })
                VStack(spacing: 4) {
                    GameScoreCapsule {
                        Text("\(model.score)").font(GT.num(22))
                        if model.medal != .none {
                            Image(systemName: "medal.fill").font(.system(size: 12)).foregroundStyle(medalColor(model.medal))
                        }
                    }
                    if let next = model.medal.next {
                        GamePill(text: GL.t("nextMedal", ["medal": GL.medal(next), "n": "\(max(0, next.threshold - model.score))"]), tone: .glass)
                    }
                    Spacer()
                    if model.waiting {
                        Text(GL.t("tapToFly")).font(.system(size: 15, weight: .semibold)).padding(.bottom, 30)
                        if model.ghost != nil {
                            Label(GL.t("ghost"), systemImage: "figure.run").font(.system(size: 11)).foregroundStyle(GT.ink2).padding(.bottom, 8)
                        }
                    }
                }
                .padding(.top, 6)
                .allowsHitTesting(false)
            }
        }
        .onAppear { loadLumo() }
    }

    private func loadLumo() {
        let textures = [0.0, 18.0].compactMap { GameTextures.render(LumoView(size: 30, wing: $0), scale: 2) }
        if textures.count == 2 { model.scene.setLumo(textures) }
    }

    private func medalColor(_ m: RunnerMedal) -> Color {
        switch m {
        case .bronze: return Color(red: 0.85, green: 0.55, blue: 0.3)
        case .silver: return Color(white: 0.85)
        case .gold: return GT.gold
        case .crystal: return GT.brandHi
        case .none: return .clear
        }
    }
}

final class RunnerScene: GameScene {
    private unowned let model: RunnerModel
    private let day = SKSpriteNode()
    private let night = SKSpriteNode()
    private let stars = SKNode()
    private let ground = SKShapeNode()
    private let spireLayer = SKNode()
    private let lumo = SKSpriteNode()
    private let ghostNode = SKSpriteNode()
    private var frames: [SKTexture] = []
    private var spireNodes: [SKNode] = []
    private var spireKeys: [Double] = []

    /// Lumo's two wing frames (drawn by SwiftUI on the main actor, see RunnerGameView).
    func setLumo(_ textures: [SKTexture]) {
        frames = textures
        lumo.texture = textures.first
        ghostNode.texture = textures.first
    }
    private var unit: CGFloat = 1
    private var originX: CGFloat = 0

    init(runner: RunnerModel) {
        model = runner
        super.init(model: runner)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    override func layout() {
        removeAllChildren()
        spireNodes = []
        spireKeys = []
        unit = size.height / CGFloat(RunnerState.height)
        originX = (size.width - CGFloat(RunnerState.width) * unit) / 2
        day.texture = GameTextures.gradient([GT.dayTop, GT.dayBottom], size: size)
        night.texture = GameTextures.gradient([GT.nightTop, GT.nightBottom], size: size)
        for n in [day, night] {
            n.size = size
            n.anchorPoint = .zero
            n.zPosition = 0
            addChild(n)
        }
        night.zPosition = 0.5
        stars.removeAllChildren()
        var rng = GameRNG(seed: 77)
        for _ in 0..<26 {
            let s = SKShapeNode(circleOfRadius: CGFloat(rng.range(0.5, 1.1)))
            s.fillColor = SKColor(.white, alpha: CGFloat(rng.range(0.4, 0.9)))
            s.strokeColor = .clear
            s.position = CGPoint(x: CGFloat(rng.range(0, Double(size.width))), y: CGFloat(rng.range(Double(size.height) * 0.35, Double(size.height))))
            stars.addChild(s)
        }
        stars.zPosition = 0.8
        addChild(stars)
        spireLayer.zPosition = 2
        addChild(spireLayer)
        ground.path = CGPath(rect: CGRect(x: 0, y: 0, width: size.width, height: CGFloat(RunnerState.ground) * unit), transform: nil)
        ground.fillColor = SKColor(Color(red: 0.10, green: 0.10, blue: 0.30), alpha: 1)
        ground.strokeColor = SKColor(GT.brandHi, alpha: 0.4)
        ground.lineWidth = 1
        ground.zPosition = 3
        addChild(ground)
        let d = CGFloat(RunnerState.wispRadius) * 4.4 * unit
        lumo.texture = frames.first
        lumo.size = CGSize(width: d, height: d)
        lumo.zPosition = 5
        addChild(lumo)
        ghostNode.texture = frames.first
        ghostNode.size = lumo.size
        ghostNode.alpha = 0.28
        ghostNode.zPosition = 4
        addChild(ghostNode)
    }

    private func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: originX + CGFloat(x) * unit, y: CGFloat(y) * unit) }

    private func spire(_ s: RunnerSpire) -> SKNode {
        let node = SKNode()
        let w = CGFloat(RunnerState.spireWidth) * unit
        let lowTop = CGFloat(s.gapY - RunnerState.gap / 2) * unit
        let highBottom = CGFloat(s.gapY + RunnerState.gap / 2) * unit
        let crystal = SKColor(Color(red: 0.55, green: 0.62, blue: 1), alpha: 0.95)
        // Lower spire with a pointed tip, upper one hanging down.
        let low = CGMutablePath()
        low.move(to: CGPoint(x: -w / 2, y: 0))
        low.addLine(to: CGPoint(x: -w / 2, y: lowTop - w * 0.45))
        low.addLine(to: CGPoint(x: 0, y: lowTop))
        low.addLine(to: CGPoint(x: w / 2, y: lowTop - w * 0.45))
        low.addLine(to: CGPoint(x: w / 2, y: 0))
        low.closeSubpath()
        let high = CGMutablePath()
        high.move(to: CGPoint(x: -w / 2, y: size.height + 4))
        high.addLine(to: CGPoint(x: -w / 2, y: highBottom + w * 0.45))
        high.addLine(to: CGPoint(x: 0, y: highBottom))
        high.addLine(to: CGPoint(x: w / 2, y: highBottom + w * 0.45))
        high.addLine(to: CGPoint(x: w / 2, y: size.height + 4))
        high.closeSubpath()
        for path in [low, high] {
            let n = SKShapeNode(path: path)
            n.fillColor = crystal
            n.strokeColor = SKColor(.white, alpha: 0.55)
            n.lineWidth = 0.8
            node.addChild(n)
        }
        return node
    }

    override func render() {
        let s = model.state
        night.alpha = CGFloat(s.night)
        stars.alpha = CGFloat(max(0, s.night - 0.3) / 0.7)
        // Spire nodes are rebuilt only when the set of spires changes, then just moved.
        let keys = s.spires.map { $0.gapY }
        if keys != spireKeys {
            spireLayer.removeAllChildren()
            spireNodes = s.spires.map { spire($0) }
            spireNodes.forEach { spireLayer.addChild($0) }
            spireKeys = keys
        }
        for (i, sp) in s.spires.enumerated() where i < spireNodes.count {
            spireNodes[i].position = CGPoint(x: p(sp.x, 0).x, y: 0)
        }
        lumo.position = p(RunnerState.wispX, s.y)
        lumo.zRotation = CGFloat(s.tilt)
        if frames.count == 2 { lumo.texture = s.wing < 0.5 ? frames[0] : frames[1] }
        if let g = model.ghost, s.started, let gy = RunnerState.ghostY(g, at: s.flightTime) {
            ghostNode.isHidden = false
            ghostNode.position = p(RunnerState.wispX - 6, gy)
        } else {
            ghostNode.isHidden = true
        }
        if model.flapFX {
            model.flapFX = false
            lumo.run(.sequence([.scale(to: 1.12, duration: 0.05), .scale(to: 1, duration: 0.1)]))
        }
    }
}
