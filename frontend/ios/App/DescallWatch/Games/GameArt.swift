import SwiftUI

// The draft's original art drawn natively: the ten game tiles, Lumo (Isilti's firefly)
// and the chess pieces. Path data is the draft's own (watchgames.html), read by a small
// SVG path reader (M L H V C S Q Z, absolute and relative).

enum SVGPath {
    /// Parses an SVG path string into a SwiftUI Path (unknown commands are skipped).
    static func parse(_ d: String) -> Path {
        var path = Path()
        var tokens: [String] = []
        var num = ""
        func flush() {
            if !num.isEmpty { tokens.append(num); num = "" }
        }
        for ch in d {
            if ch.isLetter {
                flush()
                tokens.append(String(ch))
            } else if ch == "-" {
                if !num.isEmpty, num.last != "e" { flush() }
                num.append(ch)
            } else if ch == "." {
                if num.contains(".") { flush() }
                num.append(ch)
            } else if ch.isNumber {
                num.append(ch)
            } else {
                flush()
            }
        }
        flush()
        var i = 0
        var cmd: Character = "M"
        var cur = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        func next() -> CGFloat? {
            guard i < tokens.count, let v = Double(tokens[i]) else { return nil }
            i += 1
            return CGFloat(v)
        }
        func hasNumber() -> Bool { i < tokens.count && Double(tokens[i]) != nil }
        while i < tokens.count {
            if let c = tokens[i].first, c.isLetter, tokens[i].count == 1 {
                cmd = c
                i += 1
            }
            let rel = cmd.isLowercase
            let base = rel ? cur : .zero
            switch cmd {
            case "M", "m":
                guard let x = next(), let y = next() else { return path }
                cur = CGPoint(x: base.x + x, y: base.y + y)
                start = cur
                path.move(to: cur)
                lastControl = nil
                // Further pairs after a move are lines.
                cmd = rel ? "l" : "L"
            case "L", "l":
                guard let x = next(), let y = next() else { return path }
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addLine(to: cur)
                lastControl = nil
            case "H", "h":
                guard let x = next() else { return path }
                cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y)
                path.addLine(to: cur)
                lastControl = nil
            case "V", "v":
                guard let y = next() else { return path }
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y)
                path.addLine(to: cur)
                lastControl = nil
            case "C", "c":
                guard let x1 = next(), let y1 = next(), let x2 = next(), let y2 = next(), let x = next(), let y = next() else { return path }
                let c1 = CGPoint(x: base.x + x1, y: base.y + y1), c2 = CGPoint(x: base.x + x2, y: base.y + y2)
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addCurve(to: cur, control1: c1, control2: c2)
                lastControl = c2
            case "S", "s":
                guard let x2 = next(), let y2 = next(), let x = next(), let y = next() else { return path }
                let c1 = lastControl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let c2 = CGPoint(x: base.x + x2, y: base.y + y2)
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addCurve(to: cur, control1: c1, control2: c2)
                lastControl = c2
            case "Q", "q":
                guard let x1 = next(), let y1 = next(), let x = next(), let y = next() else { return path }
                let c = CGPoint(x: base.x + x1, y: base.y + y1)
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addQuadCurve(to: cur, control: c)
                lastControl = nil
            case "Z", "z":
                path.closeSubpath()
                cur = start
                lastControl = nil
                // Numbers right after a close continue as lines (never loop on them).
                if hasNumber() { cmd = rel ? "l" : "L" }
            default:
                // Unsupported command: skip its numbers.
                while hasNumber() { i += 1 }
            }
        }
        return path
    }
}

// MARK: - Chess pieces (draft symbols pc-p ... pc-k, 45 x 45)

enum ChessPieceArt {
    private static func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
    }

    private static let base = Path(roundedRect: CGRect(x: 11, y: 34.5, width: 23, height: 5.5), cornerRadius: 2.2)

    static let shapes: [Int: Path] = {
        var out: [Int: Path] = [:]
        var p = Path()
        p.addPath(circle(22.5, 14.5, 5.6))
        p.addPath(SVGPath.parse("M16 36l2.6-14h7.8L29 36z"))
        p.addPath(Path(roundedRect: CGRect(x: 11.5, y: 34.5, width: 22, height: 5.5), cornerRadius: 2.2))
        out[ChessPiece.pawn] = p
        p = SVGPath.parse("M13 9h4.2v4H20V9h5v4h2.8V9H32v9l-3 3v11l3 3H13l3-3V21l-3-3z")
        p.addPath(base)
        out[ChessPiece.rook] = p
        p = SVGPath.parse("M14.5 35c0-7 5.5-10 6.5-14.5l-6.3 2.2-2.4-4.3 8.6-9.6 2-3.3 2.4 3.3c6.8 2.5 8.4 13 6.6 26.2z")
        p.addPath(base)
        out[ChessPiece.knight] = p
        p = circle(22.5, 7, 2.7)
        p.addPath(SVGPath.parse("M22.5 9.5c5.5 4.6 7.4 10.5 4.6 15.5l2 9.5H15.9l2-9.5c-2.8-5 -.9-10.9 4.6-15.5z"))
        p.addPath(base)
        out[ChessPiece.bishop] = p
        p = SVGPath.parse("M10.5 15l4.6 16h14.8l4.6-16-6 7.2-3-10.4-3 10.2-3-10.2-3 10.4z")
        for (x, y) in [(10.5, 13.4), (17.5, 10.4), (22.5, 9.4), (27.5, 10.4), (34.5, 13.4)] { p.addPath(circle(CGFloat(x), CGFloat(y), 2.4)) }
        p.addPath(base)
        out[ChessPiece.queen] = p
        p = SVGPath.parse("M21 3.5h3v4.2h4v3h-4V15h-3v-4.3h-4v-3h4z")
        p.addPath(SVGPath.parse("M14 34c-2.4-9.5 2.5-17 8.5-17s10.9 7.5 8.5 17z"))
        p.addPath(base)
        out[ChessPiece.king] = p
        return out
    }()

    /// Draws a piece (board value, white > 0) filling `rect`.
    static func draw(_ ctx: GraphicsContext, piece: Int, in rect: CGRect) {
        guard let shape = shapes[abs(piece)] else { return }
        let s = min(rect.width, rect.height) / 45
        let t = CGAffineTransform(translationX: rect.minX + (rect.width - 45 * s) / 2, y: rect.minY + (rect.height - 45 * s) / 2).scaledBy(x: s, y: s)
        let p = shape.applying(t)
        let white = piece > 0
        ctx.stroke(p, with: .color(white ? GT.pieceWhiteLine : GT.pieceBlackLine), style: StrokeStyle(lineWidth: max(1, 2.2 * s * 0.9), lineJoin: .round))
        ctx.fill(p, with: .color(white ? GT.pieceWhite : GT.pieceBlack))
    }
}

// MARK: - Lumo (Isilti's firefly)

enum LumoArt {
    /// Draws Lumo centred at `c`, one unit = `s` points; `wing` flaps the wings (degrees).
    static func draw(_ ctx: GraphicsContext, at c: CGPoint, scale s: CGFloat, wing: Double = 0, tilt: Double = 0, glow: Bool = true) {
        var g = ctx
        g.translateBy(x: c.x, y: c.y)
        g.rotate(by: .radians(-tilt))
        g.scaleBy(x: s, y: s)
        if glow {
            g.fill(Path(ellipseIn: CGRect(x: 2 - 12, y: 5 - 12, width: 24, height: 24)), with: .radialGradient(
                Gradient(stops: [.init(color: Color(red: 1, green: 0.96, blue: 0.66).opacity(0.95), location: 0), .init(color: Color(red: 1, green: 0.82, blue: 0.29).opacity(0.45), location: 0.45), .init(color: Color(red: 1, green: 0.82, blue: 0.29).opacity(0), location: 1)]),
                center: CGPoint(x: 2, y: 5), startRadius: 0, endRadius: 12))
        }
        func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ deg: Double, _ color: Color) {
            var e = g
            e.translateBy(x: cx, y: cy)
            e.rotate(by: .degrees(deg))
            e.fill(Path(ellipseIn: CGRect(x: -rx, y: -ry, width: 2 * rx, height: 2 * ry)), with: .color(color))
        }
        ellipse(-3, -8, 5.5, 3.4, -28 + wing, Color.white.opacity(0.72))
        ellipse(3.5, -8.5, 4.6, 3, 24 - wing, Color.white.opacity(0.5))
        ellipse(3.6, 4.2, 5.4, 4.6, 0, Color(red: 1, green: 0.95, blue: 0.63))
        let body = Path(ellipseIn: CGRect(x: -1.5 - 7, y: -1 - 7, width: 14, height: 14))
        g.fill(body, with: .color(Color(red: 0x7C / 255, green: 0x8C / 255, blue: 1)))
        g.fill(body, with: .radialGradient(Gradient(colors: [Color(red: 0.56, green: 0.65, blue: 1).opacity(0.45), Color(red: 0.35, green: 0.48, blue: 0.96).opacity(0)]), center: CGPoint(x: -1.5, y: -1), startRadius: 0, endRadius: 7))
        g.fill(Path(ellipseIn: CGRect(x: -3.2 - 2.8, y: -2 - 2.8, width: 5.6, height: 5.6)), with: .color(.white))
        g.fill(Path(ellipseIn: CGRect(x: -3.6 - 1.5, y: -1.7 - 1.5, width: 3, height: 3)), with: .color(Color(red: 0x14 / 255, green: 0x18 / 255, blue: 0x40 / 255)))
        g.fill(Path(ellipseIn: CGRect(x: -3 - 0.55, y: -2.6 - 0.55, width: 1.1, height: 1.1)), with: .color(.white))
        g.stroke(SVGPath.parse("M-4 -7.5q-2.5-4 -5-4.3M0 -7.6q1-4.4 3.6-5.3"), with: .color(Color(red: 0.79, green: 0.83, blue: 1)), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
    }
}

/// Lumo as a view (hub tile, result screen, SpriteKit texture through ImageRenderer).
struct LumoView: View {
    var size: CGFloat = 40
    var wing: Double = 0

    var body: some View {
        Canvas { ctx, sz in
            LumoArt.draw(ctx, at: CGPoint(x: sz.width / 2, y: sz.height / 2), scale: sz.width / 30, wing: wing)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Game tiles (40 x 40 art units)

struct GameIcon: View {
    var game: GameId
    var size: CGFloat = GT.iconSize

    var body: some View {
        let (a, b) = GT.gradient(game)
        Canvas { ctx, sz in
            let s = sz.width / 40
            var g = ctx
            g.scaleBy(x: s, y: s)
            GameIcon.draw(game, &g)
        }
        .frame(width: size, height: size)
        .background(LinearGradient(colors: [a, b], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: size * GT.iconRadiusRatio, style: .continuous))
        .accessibilityHidden(true)
    }

    private static func rr(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r)
    }

    private static func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
    }

    private static let yellow = Color(red: 1, green: 0.886, blue: 0.478)

    static func draw(_ g: GameId, _ ctx: inout GraphicsContext) {
        let white = Color.white
        switch g {
        case .pong:
            ctx.stroke(SVGPath.parse("M23.5 23.5L30.3 30.3"), with: .color(white), style: StrokeStyle(lineWidth: 4.6, lineCap: .round))
            ctx.fill(circle(17, 17, 9.2), with: .color(white))
            ctx.stroke(circle(17, 17, 6), with: .color(Color(red: 0.89, green: 0.25, blue: 0.37).opacity(0.28)), lineWidth: 1.4)
            ctx.fill(circle(30.5, 10, 3.3), with: .color(yellow))
            ctx.stroke(SVGPath.parse("M21 5.5c3.5-2 7-1.6 9.6.6"), with: .color(white.opacity(0.6)), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
        case .bricks:
            let fills: [Color?] = [white.opacity(0.95), Color(red: 1, green: 0.83, blue: 0.42), white.opacity(0.8), Color(red: 0.5, green: 0.91, blue: 1), nil, white.opacity(0.95)]
            for (i, f) in fills.enumerated() {
                let r = rr(5 + CGFloat(i % 3) * 10.5, 7 + CGFloat(i / 3) * 6.5, 9, 5, 1.4)
                if let f { ctx.fill(r, with: .color(f)) } else { ctx.stroke(r, with: .color(white.opacity(0.6)), lineWidth: 1) }
            }
            ctx.fill(circle(22, 25.5, 2.6), with: .color(white))
            ctx.fill(rr(13, 31, 15, 3.4, 1.7), with: .color(white))
        case .snake:
            ctx.stroke(SVGPath.parse("M8 29c0-9 10-9 10-3.5S28 31 28 21.5 21.5 11 29.5 10.5"), with: .color(white), style: StrokeStyle(lineWidth: 5, lineCap: .round))
            ctx.fill(circle(30, 10.4, 3.9), with: .color(white))
            ctx.fill(circle(31.2, 9.6, 1.1), with: .color(Color(red: 0.05, green: 0.53, blue: 0.41)))
            ctx.fill(SVGPath.parse("M12 7l3 3.2-3 3.2-3-3.2z"), with: .color(yellow))
        case .merge:
            ctx.fill(rr(6.5, 6.5, 12.5, 12.5, 3), with: .color(white.opacity(0.9)))
            ctx.fill(rr(21, 6.5, 12.5, 12.5, 3), with: .color(white.opacity(0.72)))
            ctx.fill(rr(6.5, 21, 12.5, 12.5, 3), with: .color(white.opacity(0.72)))
            ctx.fill(rr(21, 21, 12.5, 12.5, 3), with: .color(white))
            let ink = Color(red: 1, green: 0.52, blue: 0)
            ctx.draw(Text("2").font(.system(size: 8.5, weight: .heavy)).foregroundColor(ink), at: CGPoint(x: 12.75, y: 12.75))
            ctx.draw(Text("4").font(.system(size: 8.5, weight: .heavy)).foregroundColor(ink), at: CGPoint(x: 27.25, y: 27.25))
        case .blocks:
            for (x, y) in [(11.0, 5.0), (17.5, 5.0), (24.0, 5.0), (17.5, 11.5)] { ctx.fill(rr(CGFloat(x), CGFloat(y), 6, 6, 1.3), with: .color(white)) }
            for (x, y) in [(11.0, 21.5), (17.5, 21.5), (24.0, 21.5), (17.5, 28.0)] {
                ctx.stroke(rr(CGFloat(x), CGFloat(y), 6, 6, 1.3), with: .color(white.opacity(0.5)), style: StrokeStyle(lineWidth: 1, dash: [1.6, 1.2]))
            }
        case .mines:
            for (r, o) in [(5.5, 0.9), (10.5, 0.55), (15.5, 0.28)] { ctx.stroke(circle(19, 21, CGFloat(r)), with: .color(white.opacity(o)), lineWidth: 1.4) }
            ctx.fill(SVGPath.parse("M19 21L31 9Q35 13 35 18z"), with: .color(white.opacity(0.22)))
            ctx.fill(circle(19, 21, 2.2), with: .color(white))
            ctx.fill(circle(28, 12.5, 1.8), with: .color(yellow))
        case .sudoku:
            ctx.fill(rr(6.5, 6.5, 27, 27, 5), with: .color(white.opacity(0.14)))
            ctx.stroke(rr(6.5, 6.5, 27, 27, 5), with: .color(white.opacity(0.7)), lineWidth: 1.3)
            ctx.stroke(SVGPath.parse("M15.5 6.5v27M24.5 6.5v27M6.5 15.5h27M6.5 24.5h27"), with: .color(white.opacity(0.45)), lineWidth: 1)
            ctx.fill(rr(15.5, 15.5, 9, 9, 0), with: .color(white.opacity(0.3)))
            for (t, x, y) in [("5", 11.0, 11.0), ("9", 20.0, 20.0), ("3", 29.0, 29.0), ("1", 29.0, 11.0)] {
                ctx.draw(Text(t).font(.system(size: 7, weight: .heavy)).foregroundColor(white), at: CGPoint(x: x, y: y))
            }
        case .chess:
            ChessPieceArt.draw(ctx, piece: ChessPiece.knight, in: CGRect(x: 3, y: 2, width: 34, height: 34))
            ctx.stroke(SVGPath.parse("M8 35.5h24"), with: .color(white.opacity(0.4)), lineWidth: 1.2)
        case .runner:
            for (x, y, r, o) in [(9.0, 9.0, 0.9, 0.7), (32.0, 7.0, 0.7, 0.6), (33.0, 30.0, 0.8, 0.5)] { ctx.fill(circle(CGFloat(x), CGFloat(y), CGFloat(r)), with: .color(white.opacity(o))) }
            LumoArt.draw(ctx, at: CGPoint(x: 20.5, y: 21), scale: 1)
        case .cards:
            var a = ctx
            a.translateBy(x: 14.7, y: 19.5)
            a.rotate(by: .degrees(-13))
            a.fill(rr(-7.25, -10.5, 14.5, 21, 2.4), with: .color(white.opacity(0.8)))
            var b = ctx
            b.translateBy(x: 24.2, y: 20.5)
            b.rotate(by: .degrees(9))
            b.fill(rr(-7.25, -10.5, 14.5, 21, 2.4), with: .color(white))
            b.draw(Text("21").font(.system(size: 9, weight: .heavy)).foregroundColor(Color(red: 0.68, green: 0.12, blue: 0.24)), at: CGPoint(x: 0.2, y: 1))
        }
    }
}

/// A suit drawn as a shape (no font glyphs, so never an emoji): 0 spade, 1 heart, 2 diamond, 3 club.
struct SuitShape: Shape {
    var suit: Int

    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height, x = r.minX, y = r.minY
        var p = Path()
        switch suit {
        case 1:
            p.move(to: CGPoint(x: x + w / 2, y: y + h * 0.95))
            p.addCurve(to: CGPoint(x: x, y: y + h * 0.32), control1: CGPoint(x: x + w * 0.2, y: y + h * 0.72), control2: CGPoint(x: x, y: y + h * 0.55))
            p.addArc(center: CGPoint(x: x + w * 0.26, y: y + h * 0.3), radius: w * 0.26, startAngle: .degrees(180), endAngle: .degrees(-20), clockwise: false)
            p.addArc(center: CGPoint(x: x + w * 0.74, y: y + h * 0.3), radius: w * 0.26, startAngle: .degrees(200), endAngle: .degrees(0), clockwise: false)
            p.addCurve(to: CGPoint(x: x + w / 2, y: y + h * 0.95), control1: CGPoint(x: x + w, y: y + h * 0.55), control2: CGPoint(x: x + w * 0.8, y: y + h * 0.72))
        case 2:
            p.move(to: CGPoint(x: x + w / 2, y: y))
            p.addLine(to: CGPoint(x: x + w * 0.92, y: y + h / 2))
            p.addLine(to: CGPoint(x: x + w / 2, y: y + h))
            p.addLine(to: CGPoint(x: x + w * 0.08, y: y + h / 2))
            p.closeSubpath()
        case 3:
            let rr = w * 0.24
            p.addEllipse(in: CGRect(x: x + w / 2 - rr, y: y, width: 2 * rr, height: 2 * rr))
            p.addEllipse(in: CGRect(x: x + w * 0.02, y: y + h * 0.36, width: 2 * rr, height: 2 * rr))
            p.addEllipse(in: CGRect(x: x + w * 0.98 - 2 * rr, y: y + h * 0.36, width: 2 * rr, height: 2 * rr))
            p.addRect(CGRect(x: x + w * 0.44, y: y + h * 0.45, width: w * 0.12, height: h * 0.45))
            p.addRect(CGRect(x: x + w * 0.3, y: y + h * 0.88, width: w * 0.4, height: h * 0.12))
        default:
            p.move(to: CGPoint(x: x + w / 2, y: y))
            p.addCurve(to: CGPoint(x: x + w / 2, y: y + h * 0.78), control1: CGPoint(x: x - w * 0.15, y: y + h * 0.5), control2: CGPoint(x: x + w * 0.15, y: y + h * 0.95))
            p.addCurve(to: CGPoint(x: x + w / 2, y: y), control1: CGPoint(x: x + w * 0.85, y: y + h * 0.95), control2: CGPoint(x: x + w * 1.15, y: y + h * 0.5))
            p.addRect(CGRect(x: x + w * 0.44, y: y + h * 0.6, width: w * 0.12, height: h * 0.3))
            p.addRect(CGRect(x: x + w * 0.3, y: y + h * 0.88, width: w * 0.4, height: h * 0.12))
        }
        return p
    }
}
