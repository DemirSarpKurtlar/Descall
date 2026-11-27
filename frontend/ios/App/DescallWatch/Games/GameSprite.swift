import SpriteKit
import SwiftUI
import UIKit

// SpriteKit plumbing for the action games (Raket, Prizma, Isilti): a scene that steps its
// GameModel every frame at 60 fps, gradient textures, and a SwiftUI host with the
// Digital Crown bound to a 0 ... 1 value.

class GameScene: SKScene {
    weak var gameModel: GameModel?
    private var lastTime: TimeInterval?

    init(model: GameModel) {
        gameModel = model
        super.init(size: CGSize(width: 198, height: 242))
        scaleMode = .resizeFill
        backgroundColor = .black
        anchorPoint = .zero
    }

    required init?(coder aDecoder: NSCoder) { nil }

    override func didMove(to view: SKView) {
        super.didMove(to: view)
        layout()
        render()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        layout()
        render()
    }

    override func update(_ currentTime: TimeInterval) {
        defer { lastTime = currentTime }
        guard let last = lastTime else { return }
        var dt = currentTime - last
        // Back from a pause or a hitch: one normal frame, never a jump.
        if dt > 0.25 || dt <= 0 { dt = 1.0 / 60.0 }
        gameModel?.advance(dt)
        render()
    }

    /// Build nodes for the current size.
    func layout() {}
    /// Move nodes to the model's state.
    func render() {}
}

enum GameTextures {
    /// A gradient texture (top to bottom, or left to right) made with Core Graphics.
    static func gradient(_ colors: [Color], size: CGSize, vertical: Bool = true) -> SKTexture {
        let w = max(1, Int(size.width)), h = max(1, Int(size.height))
        let space = CGColorSpaceCreateDeviceRGB()
        let cg = colors.map { UIColor($0).cgColor } as CFArray
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let grad = CGGradient(colorsSpace: space, colors: cg, locations: nil) else { return SKTexture() }
        let start = CGPoint(x: 0, y: vertical ? CGFloat(h) : 0)
        let end = CGPoint(x: vertical ? 0 : CGFloat(w), y: 0)
        ctx.drawLinearGradient(grad, start: start, end: end, options: [])
        guard let image = ctx.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    /// A soft round glow (the ball's halo, Lumo's light).
    static func glow(_ color: Color, diameter: CGFloat) -> SKTexture {
        let d = max(2, Int(diameter))
        let space = CGColorSpaceCreateDeviceRGB()
        let c = UIColor(color)
        let cg = [c.withAlphaComponent(0.9).cgColor, c.withAlphaComponent(0).cgColor] as CFArray
        guard let ctx = CGContext(data: nil, width: d, height: d, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let grad = CGGradient(colorsSpace: space, colors: cg, locations: [0, 1]) else { return SKTexture() }
        let mid = CGPoint(x: CGFloat(d) / 2, y: CGFloat(d) / 2)
        ctx.drawRadialGradient(grad, startCenter: mid, startRadius: 0, endCenter: mid, endRadius: CGFloat(d) / 2, options: [])
        guard let image = ctx.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    /// A SwiftUI drawing as a texture (Lumo).
    @MainActor
    static func render<V: View>(_ view: V, scale: CGFloat = 2) -> SKTexture? {
        let r = ImageRenderer(content: view)
        r.scale = scale
        guard let image = r.cgImage else { return nil }
        return SKTexture(cgImage: image)
    }
}

extension SKColor {
    convenience init(_ c: Color, alpha: CGFloat) {
        self.init(cgColor: UIColor(c).withAlphaComponent(alpha).cgColor)
    }
}

/// SpriteView with the Digital Crown bound to `crown` (0 ... 1) and a tap action.
struct SpriteHost: View {
    let scene: SKScene
    var paused: Bool
    @Binding var crown: Double
    var crownEnabled = true
    var onTap: () -> Void

    @FocusState private var focused: Bool

    var body: some View {
        SpriteView(scene: scene, isPaused: paused, preferredFramesPerSecond: 60, options: [.ignoresSiblingOrder, .shouldCullNonVisibleNodes])
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { onTap() }
            .focusable(crownEnabled)
            .focused($focused)
            .digitalCrownRotation($crown, from: 0, through: 1, by: nil, sensitivity: .high, isContinuous: false, isHapticFeedbackEnabled: false)
            .onAppear { focused = true }
            .onChange(of: paused) { _, p in if !p { focused = true } }
    }
}

/// The crown hint arc at the right edge, level with the Digital Crown (draft "crownh").
struct CrownHint: View {
    var top: CGFloat = 46

    var body: some View {
        VStack {
            Canvas { ctx, size in
                var arc = Path()
                arc.addArc(center: CGPoint(x: -18, y: size.height / 2), radius: 26, startAngle: .degrees(-42), endAngle: .degrees(42), clockwise: false)
                ctx.stroke(arc, with: .color(GT.brandHi.opacity(0.85)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            }
            .frame(width: 10, height: 38)
            .padding(.top, top)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.trailing, 1)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The control hint at the bottom; fades after the first seconds of a round.
struct ControlHint: View {
    var text: String
    @State private var shown = true

    var body: some View {
        VStack {
            Spacer()
            Label(text, systemImage: "digitalcrown.arrow.clockwise")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(red: 225 / 255, green: 230 / 255, blue: 1).opacity(0.75))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.bottom, 8)
                .padding(.horizontal, 12)
        }
        .opacity(shown ? 1 : 0)
        .animation(.easeOut(duration: 0.6), value: shown)
        .allowsHitTesting(false)
        .task {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            shown = false
        }
    }
}
