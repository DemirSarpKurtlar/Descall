import SwiftUI

// Apple Watch games: the one place for the look (owner pick: draft A "Konsol", the admin
// list language). Every game screen, the hub and the shell read colours, fonts, radii and
// the hub layout from `GameTheme.current`; another draft is applied by changing this file.

struct GameTheme {
    // Brand (src/styles/design-tokens.css, watch DS).
    var brand = DS.brand
    var brandHi = DS.brandHi
    var ctaTop = DS.ctaTop
    var ctaBottom = DS.ctaBottom
    var violet = DS.violet
    var ink2 = Color(red: 225 / 255, green: 230 / 255, blue: 1).opacity(0.68)
    var ok = DS.online
    var okText = Color(red: 0x6E / 255, green: 0xF2 / 255, blue: 0x9A / 255)
    var warn = DS.idle
    var danger = DS.dnd
    var dangerText = Color(red: 1, green: 0x96 / 255, blue: 0x8C / 255)
    var gold = Color(red: 0xF5 / 255, green: 0xC5 / 255, blue: 0x5A / 255)
    var goldText = Color(red: 1, green: 0xD8 / 255, blue: 0x77 / 255)
    var pillBrand = Color(red: 0x58 / 255, green: 0x7A / 255, blue: 0xF6 / 255).opacity(0.28)
    var pillBrandText = Color(red: 0xC9 / 255, green: 0xD4 / 255, blue: 1)

    // Glass cards ("g" in the draft): sheen over a dense navy, hairline border.
    var glassFill = Color(red: 25 / 255, green: 30 / 255, blue: 61 / 255).opacity(0.88)
    var glassSheen = Color.white.opacity(0.13)
    var glassLine = Color.white.opacity(0.17)
    var cardRadius: CGFloat = 16
    var capsuleRadius: CGFloat = 14
    var buttonHeight: CGFloat = 38
    var rowMinHeight: CGFloat = 44
    var iconSize: CGFloat = 30
    var iconRadiusRatio: CGFloat = 0.28

    // Type.
    func num(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font { .system(size: size, weight: weight, design: .rounded).monospacedDigit() }
    var title = Font.system(size: 14.5, weight: .semibold)
    var body = Font.system(size: 13)
    var caption = Font.system(size: 12)
    var micro = Font.system(size: 11, weight: .semibold)

    // Hub (draft A): dashboard on top, then games grouped by type.
    var hubGroups: [GameHubGroup] = [
        GameHubGroup(key: "group.reflex", games: [.pong, .bricks, .snake, .runner]),
        GameHubGroup(key: "group.puzzle", games: [.merge, .blocks, .mines, .sudoku]),
        GameHubGroup(key: "group.table", games: [.chess, .cards]),
    ]
    var hubShowsWeek = true
    var hubShowsContinue = true
    var hubShowsChallenge = true

    // Always-on (wrist down): the scene dims, text stays readable.
    var aodSceneOpacity = 0.36
    var aodText = Color.white.opacity(0.78)

    // Game surfaces.
    var courtTop = Color(red: 0x16 / 255, green: 0x20 / 255, blue: 0x4A / 255)
    var courtBottom = Color(red: 0x0B / 255, green: 0x10 / 255, blue: 0x30 / 255)
    var courtLine = Color(red: 169 / 255, green: 187 / 255, blue: 1).opacity(0.3)
    var aiPaddle = Color(red: 0xB7 / 255, green: 0x9B / 255, blue: 1)
    var playerPaddle = Color(red: 0x8F / 255, green: 0xA6 / 255, blue: 1)
    var boardLight = Color(red: 0x3B / 255, green: 0x46 / 255, blue: 0x77 / 255)
    var boardDark = Color(red: 0x28 / 255, green: 0x30 / 255, blue: 0x58 / 255)
    var pieceWhite = Color(red: 0xF2 / 255, green: 0xF4 / 255, blue: 1)
    var pieceWhiteLine = Color(red: 0x0E / 255, green: 0x12 / 255, blue: 0x26 / 255)
    var pieceBlack = Color(red: 0x15 / 255, green: 0x19 / 255, blue: 0x31 / 255)
    var pieceBlackLine = Color(red: 0xC4 / 255, green: 0xCE / 255, blue: 1)
    var moveDot = Color(red: 0xA9 / 255, green: 0xBB / 255, blue: 1)
    var captureRing = Color(red: 1, green: 0x6B / 255, blue: 0x5E / 255)
    var nightTop = Color(red: 0x0B / 255, green: 0x0A / 255, blue: 0x2E / 255)
    var nightBottom = Color(red: 0x3A / 255, green: 0x2A / 255, blue: 0x7A / 255)
    var dayTop = Color(red: 0x4A / 255, green: 0x7B / 255, blue: 0xE8 / 255)
    var dayBottom = Color(red: 0xA9 / 255, green: 0xC4 / 255, blue: 1)
    var cellHidden = Color.white.opacity(0.14)
    var cellOpen = Color(red: 25 / 255, green: 30 / 255, blue: 61 / 255)

    /// Tile gradient of a game (icon, accents), from the draft's art.
    func gradient(_ g: GameId) -> (Color, Color) {
        func c(_ hex: UInt32) -> Color { Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255) }
        switch g {
        case .pong: return (c(0xFF8F5E), c(0xE2405F))
        case .bricks: return (c(0xA275FF), c(0x5638D2))
        case .snake: return (c(0x3ADB7F), c(0x0C8668))
        case .merge: return (c(0xFFC74F), c(0xFF8400))
        case .blocks: return (c(0x44D3FF), c(0x2A67F5))
        case .mines: return (c(0x33D9C8), c(0x0E5A6B))
        case .sudoku: return (c(0x7E98FF), c(0x4A6AF0))
        case .chess: return (c(0xAEB8DA), c(0x47507A))
        case .runner: return (c(0x35308A), c(0x0F0C36))
        case .cards: return (c(0xFF6175), c(0xAE1E3D))
        }
    }

    func accent(_ g: GameId) -> Color { gradient(g).0 }

    /// Colours of the seven falling-block pieces and Katla tiles.
    var blockColors: [Color] = [
        Color(red: 0x44 / 255, green: 0xD3 / 255, blue: 1),
        Color(red: 1, green: 0xC7 / 255, blue: 0x4F / 255),
        Color(red: 0xA2 / 255, green: 0x75 / 255, blue: 1),
        Color(red: 0x3A / 255, green: 0xDB / 255, blue: 0x7F / 255),
        Color(red: 1, green: 0x61 / 255, blue: 0x75 / 255),
        Color(red: 0x58 / 255, green: 0x7A / 255, blue: 0xF6 / 255),
        Color(red: 1, green: 0x8F / 255, blue: 0x5E / 255),
    ]

    func tileColor(_ exponent: Int) -> Color {
        let ramp: [Color] = [
            Color.white.opacity(0.08),
            Color(red: 0.36, green: 0.42, blue: 0.70), Color(red: 0.40, green: 0.47, blue: 0.86),
            Color(red: 1, green: 0.78, blue: 0.31), Color(red: 1, green: 0.62, blue: 0.24),
            Color(red: 1, green: 0.52, blue: 0.0), Color(red: 0.89, green: 0.25, blue: 0.37),
            Color(red: 0.64, green: 0.46, blue: 1), Color(red: 0.34, green: 0.22, blue: 0.82),
            Color(red: 0.27, green: 0.83, blue: 1), Color(red: 0.16, green: 0.40, blue: 0.96),
            Color(red: 0.96, green: 0.77, blue: 0.35),
        ]
        return ramp[min(exponent, ramp.count - 1)]
    }

    static let konsol = GameTheme()
    /// The applied draft.
    static var current: GameTheme { konsol }
}

struct GameHubGroup: Identifiable {
    /// GL key of the group title.
    var key: String
    var games: [GameId]
    var id: String { key }
}

/// Shorthand used by every game file.
let GT = GameTheme.current

// MARK: - Building blocks of draft A

/// Glass card ("g", "g hl", "g gold", "g red").
enum GameCardTone { case plain, highlight, gold, red }

struct GameGlass: ViewModifier {
    var radius: CGFloat
    var tone: GameCardTone

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let line: Color
        let width: CGFloat
        switch tone {
        case .plain: line = GT.glassLine; width = 0.5
        case .highlight: line = GT.brandHi.opacity(0.65); width = 1
        case .gold: line = GT.gold.opacity(0.6); width = 1
        case .red: line = GT.danger.opacity(0.7); width = 1
        }
        return content
            .background(
                ZStack {
                    shape.fill(GT.glassFill)
                    shape.fill(LinearGradient(stops: [.init(color: GT.glassSheen, location: 0), .init(color: Color.white.opacity(0.02), location: 0.5)], startPoint: .top, endPoint: .bottom))
                }
            )
            .overlay(shape.strokeBorder(line, lineWidth: width))
    }
}

extension View {
    func gameGlass(_ tone: GameCardTone = .plain, radius: CGFloat = GT.cardRadius) -> some View {
        modifier(GameGlass(radius: radius, tone: tone))
    }
}

/// Small rounded label ("pill br / ok / gd / rd / gl").
enum GamePillTone { case brand, ok, gold, red, glass }

struct GamePill: View {
    var text: String
    var icon: String? = nil
    var tone: GamePillTone = .brand

    private var colors: (bg: Color, fg: Color) {
        switch tone {
        case .brand: return (GT.pillBrand, GT.pillBrandText)
        case .ok: return (GT.ok.opacity(0.2), GT.okText)
        case .gold: return (GT.gold.opacity(0.2), GT.goldText)
        case .red: return (GT.danger.opacity(0.24), GT.dangerText)
        case .glass: return (Color.white.opacity(0.14), .white)
        }
    }

    var body: some View {
        HStack(spacing: 3) {
            if let icon { Image(systemName: icon).font(.system(size: 9, weight: .bold)) }
            Text(text).font(.system(size: 11, weight: .bold)).lineLimit(1)
        }
        .foregroundStyle(colors.fg)
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(Capsule().fill(colors.bg))
    }
}

/// Section label ("sl").
struct GameSectionLabel: View {
    var text: String
    var body: some View {
        Text(text.uppercased(with: L.locale))
            .font(GT.micro)
            .foregroundStyle(GT.ink2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
            .padding(.leading, 6)
    }
}

/// Primary button ("cta"): the existing Descall CTA at the draft's 38 pt height.
struct GameCTAStyle: ButtonStyle {
    var tone: GameCardTone = .plain

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: GT.buttonHeight)
            .background(Capsule().fill(LinearGradient(colors: tone == .red ? [GT.danger, GT.danger.opacity(0.75)] : [GT.ctaTop, GT.ctaBottom], startPoint: .top, endPoint: .bottom)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.28), lineWidth: 0.5))
            .shadow(color: GT.brand.opacity(0.4), radius: 6, y: 3)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// Secondary button ("b2").
struct GameSecondaryStyle: ButtonStyle {
    var destructive = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(destructive ? Color(red: 1, green: 0.54, blue: 0.5) : .white)
            .frame(maxWidth: .infinity, minHeight: GT.buttonHeight)
            .background(Capsule().fill(destructive ? GT.danger.opacity(0.22) : Color.white.opacity(0.12)))
            .overlay(Capsule().strokeBorder(destructive ? GT.danger.opacity(0.5) : Color.white.opacity(0.16), lineWidth: 0.5))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

/// One row of a grouped action list (pause menu, settings): icon, title, trailing pill.
struct GameActionRow: View {
    var icon: String
    var title: String
    var trailing: String? = nil
    var iconColor: Color = GT.brandHi
    var destructive = false
    var divider = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(destructive ? GT.dangerText : iconColor).frame(width: 20)
                    Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(destructive ? GT.dangerText : .white).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 0)
                    if let trailing { GamePill(text: trailing, tone: .glass) }
                }
                .padding(.horizontal, 10)
                .frame(minHeight: 40)
                if divider { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 7-day bars ("bars" in the draft): the last bar in the brand gradient.
struct GameBars: View {
    var values: [Double]
    var height: CGFloat = 18
    var highlight: Int? = nil
    var gold = false

    var body: some View {
        let top = max(values.max() ?? 1, 1)
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(values.indices, id: \.self) { i in
                let isHi = i == (highlight ?? values.count - 1)
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(isHi
                          ? AnyShapeStyle(LinearGradient(colors: gold ? [Color(red: 1, green: 0.9, blue: 0.6), Color(red: 0.88, green: 0.65, blue: 0.23)] : [GT.ctaTop, GT.ctaBottom], startPoint: .top, endPoint: .bottom))
                          : AnyShapeStyle(GT.brandHi.opacity(0.42)))
                    .frame(height: max(3, CGFloat(values[i] / top) * height))
            }
        }
        .frame(height: height, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

/// The score capsule at the top of a running game.
struct GameScoreCapsule<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 8) { content() }
            .padding(.horizontal, 11)
            .padding(.vertical, 3)
            .gameGlass(radius: GT.capsuleRadius)
    }
}

/// Number formatting for scores ("48.230" in Turkish, "48,230" in English).
enum GameFormat {
    static func number(_ n: Int) -> String { GL.number(n) }

    /// A best result in the game's own unit.
    static func result(_ game: GameId, _ value: Int) -> String {
        switch game.kind {
        case .seconds: return value > 0 ? GameMath.clock(value) : "-"
        case .wins: return GL.plural("winsShort", value)
        case .points: return number(value)
        }
    }
}
