import SwiftUI
import WidgetKit

// Widgets draft B ("Yuzler"): strings, colours and the face (avatar) every widget draws.

// MARK: - Strings

/// Text in the language the app uses (DescallSession.locale), falling back to the device
/// language. Keys: DescallWidgets/<lang>.lproj/Localizable.strings, written by
/// frontend/scripts/ios-widgets-strings.mjs.
enum WL {
    private static var cached: (lang: String, bundle: Bundle)?

    static var bundle: Bundle {
        let lang = folder(for: DescallSessionStore.load()?.locale)
        if let c = cached, c.lang == lang { return c.bundle }
        var b = Bundle.main
        if let lang = lang.isEmpty ? nil : lang, let path = Bundle.main.path(forResource: lang, ofType: "lproj"), let found = Bundle(path: path) {
            b = found
        }
        cached = (lang, b)
        return b
    }

    static var locale: Locale {
        let id = DescallSessionStore.load()?.locale ?? ""
        return id.isEmpty ? .current : Locale(identifier: id)
    }

    /// "pt-BR" -> "pt-BR", "en-US" -> "en", "tr" -> "tr"; unknown -> "" (device language).
    static func folder(for raw: String?) -> String {
        guard let raw, !raw.isEmpty else { return "" }
        if raw.lowercased().hasPrefix("pt") { return "pt-BR" }
        let base = String(raw.prefix(2)).lowercased()
        return ["en", "tr", "de", "es", "fr", "ru"].contains(base) ? base : ""
    }

    static func t(_ key: String, _ args: CVarArg...) -> String {
        let format = bundle.localizedString(forKey: key, value: Bundle.main.localizedString(forKey: key, value: key, table: nil), table: nil)
        return args.isEmpty ? format : String(format: format, locale: locale, arguments: args)
    }

    /// The line under a face ("Minecraft oynuyor", "Boşta · 12 dk").
    static func activity(_ line: DescallActivityLine?) -> String? {
        guard let line else { return nil }
        var text = line.argument.map { t(line.key, $0) } ?? t(line.key)
        if let m = line.minutes, m > 0 {
            text += " · " + elapsed(minutes: m)
        }
        return text
    }

    static func elapsed(minutes: Int) -> String {
        if minutes < 60 { return t("time.min", minutes) }
        if minutes < 1440 { return t("time.hour", minutes / 60) }
        return t("time.day", minutes / 1440)
    }

    static func ago(_ date: Date?, now: Date = Date()) -> String? {
        guard let p = DescallElapsed.parts(from: date, now: now) else { return nil }
        return p.key == "time.now" ? t("time.now") : t(p.key, p.value)
    }
}

// MARK: - Colours (draft B tokens)

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

enum WB {
    static let brand = Color(hex: 0x587AF5)
    static let speak = Color(hex: 0x23A55A)
    static let red = Color(hex: 0xDA373C)
    static let online = Color(hex: 0x23A55A)
    static let idle = Color(hex: 0xFF9F0A)
    static let off = Color(hex: 0x80848E)

    static func text(_ s: ColorScheme) -> Color { s == .dark ? .white : Color(hex: 0x151827) }
    static func text2(_ s: ColorScheme) -> Color { s == .dark ? Color(hex: 0xC9CDE0) : Color(hex: 0x4F5570) }
    static func text3(_ s: ColorScheme) -> Color { s == .dark ? Color(hex: 0x9EA3BC) : Color(hex: 0x7A809B) }
    static func chip(_ s: ColorScheme) -> Color { s == .dark ? Color.white.opacity(0.10) : Color(hex: 0x14183C, alpha: 0.06) }
    /// The widget's base colour, used as the ring around overlapping faces and dots.
    static func ring(_ s: ColorScheme) -> Color { s == .dark ? Color(hex: 0x34364A) : Color(hex: 0xF1F3FD) }
    static func accent(_ s: ColorScheme) -> Color { s == .dark ? Color(hex: 0x8EA6FF) : brand }
    static func success(_ s: ColorScheme) -> Color { s == .dark ? Color(hex: 0x3DDC84) : Color(hex: 0x1E8E4A) }

    static func presence(_ p: DescallPresence) -> Color {
        switch p {
        case .online: return online
        case .idle: return idle
        case .dnd: return red
        case .offline: return off
        }
    }
}

/// Draft B widget background: a soft accent glow top-left over a slate gradient.
struct WidgetBackground: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            LinearGradient(colors: scheme == .dark ? [Color(hex: 0x3F4256), Color(hex: 0x2B2D3B)] : [Color(hex: 0xF7F8FF), Color(hex: 0xECEFFB)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [WB.brand.opacity(scheme == .dark ? 0.42 : 0.20), .clear], center: .topLeading, startRadius: 0, endRadius: 230)
        }
    }
}

// MARK: - Faces

/// A person as a widget draws it: photo (downscaled, cached) or initial on their colour.
struct WFace: Identifiable {
    let id: String
    let name: String
    let initials: String
    var presence: DescallPresence?
    var image: CGImage?
    var screen = false

    var letter: String { String(initials.prefix(1)) }

    var gradient: [Color] {
        let pair = DescallAvatarPalette.pairs[DescallAvatarPalette.index(for: id)]
        return [Color(hex: pair.0), Color(hex: pair.1)]
    }
}

/// The presence glyph: the shape carries the meaning (works in monochrome on the lock screen).
struct PresenceShape: Shape {
    let presence: DescallPresence

    func path(in rect: CGRect) -> Path {
        let d = min(rect.width, rect.height)
        let r = CGRect(x: rect.midX - d / 2, y: rect.midY - d / 2, width: d, height: d)
        let circle = Path(ellipseIn: r)
        switch presence {
        case .online:
            return circle
        case .idle:
            let cut = Path(ellipseIn: CGRect(x: r.minX - d * 0.12, y: r.minY - d * 0.12, width: d * 0.74, height: d * 0.74))
            return circle.subtracting(cut)
        case .dnd:
            let bar = Path(CGRect(x: r.minX + d * 0.22, y: r.midY - d * 0.095, width: d * 0.56, height: d * 0.19))
            return circle.subtracting(bar)
        case .offline:
            let hole = Path(ellipseIn: r.insetBy(dx: d * 0.27, dy: d * 0.27))
            return circle.subtracting(hole)
        }
    }
}

struct PresenceDot: View {
    let presence: DescallPresence
    let size: CGFloat
    let ring: Color
    var mono = false

    var body: some View {
        ZStack {
            if !mono { Circle().fill(ring) }
            PresenceShape(presence: presence)
                .fill(mono ? Color.primary : WB.presence(presence))
                .frame(width: size * 0.7, height: size * 0.7)
        }
        .frame(width: size, height: size)
    }
}

struct FaceView: View {
    let face: WFace
    let size: CGFloat
    var dot = false
    var speaking = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            if let img = face.image {
                Image(decorative: img, scale: 1).resizable().scaledToFill()
            } else {
                LinearGradient(colors: face.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                Text(face.letter)
                    .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.18), radius: 1, y: 1)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if speaking {
                Circle().stroke(WB.speak, lineWidth: max(2, size * 0.05)).padding(-max(2, size * 0.05) / 2)
            }
        }
        .shadow(color: speaking ? WB.speak.opacity(0.55) : .clear, radius: speaking ? 6 : 0)
        .overlay(alignment: .bottomTrailing) {
            if dot, let p = face.presence {
                PresenceDot(presence: p, size: size * 0.38, ring: WB.ring(scheme)).offset(x: 1, y: 1)
            }
        }
        .accessibilityLabel(face.name)
    }
}

/// Up to four faces in an overlapping 2x2 pod (a voice channel "cluster").
struct FaceCluster: View {
    let faces: [WFace]
    let size: CGFloat
    var speakingId: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let offsets: [CGPoint] = [.zero, CGPoint(x: size * 0.72, y: 0), CGPoint(x: 0, y: size * 0.72), CGPoint(x: size * 0.72, y: size * 0.72)]
        ZStack(alignment: .topLeading) {
            ForEach(Array(faces.prefix(4).enumerated()), id: \.element.id) { i, face in
                FaceView(face: face, size: size, speaking: face.id == speakingId)
                    .overlay(Circle().stroke(WB.ring(scheme), lineWidth: 2))
                    .offset(x: offsets[i].x, y: offsets[i].y)
            }
        }
        .frame(width: size * 1.72, height: size * 1.72, alignment: .topLeading)
    }
}

/// A row of overlapping faces ("stack" in the draft).
struct FaceStack: View {
    let faces: [WFace]
    let size: CGFloat
    var speakingId: String?
    var ring: Color?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: -size * 0.28) {
            ForEach(faces) { face in
                FaceView(face: face, size: size, speaking: face.id == speakingId)
                    .overlay(Circle().stroke(ring ?? WB.ring(scheme), lineWidth: 2))
            }
        }
    }
}

/// The red count on a face.
struct CountBadge: View {
    let count: Int
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.system(size: 10.5, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Capsule().fill(WB.red))
            .overlay(Capsule().stroke(WB.ring(scheme), lineWidth: 2))
    }
}

/// Widget header: Descall mark, title, optional trailing text.
struct WidgetHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 6) {
            DescallMark().frame(width: 15, height: 15).foregroundStyle(WB.accent(scheme))
            Text(title).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
            Spacer(minLength: 4)
            trailing()
        }
        .foregroundStyle(WB.text(scheme))
        .frame(height: 18)
    }
}

/// The Descall symbol (a speech bubble with a voice wave), drawn so it needs no asset catalog.
struct DescallMark: View {
    var body: some View {
        Image(systemName: "bubble.left.and.text.bubble.right.fill")
            .resizable()
            .scaledToFit()
            .accessibilityHidden(true)
    }
}

/// Speaking bars (static: widgets do not animate; the green tells the story).
struct SpeakBars: View {
    var count = 4
    var height: CGFloat = 14
    var color: Color = WB.speak

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<count, id: \.self) { i in
                Capsule().fill(color).frame(width: 3, height: height * [0.55, 1, 0.7, 0.9, 0.45][i % 5])
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// "Giriş yap" / offline / empty states, in the widget's own style.
struct WidgetMessage: View {
    let symbol: String
    let title: String
    var detail: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 20, weight: .semibold)).foregroundStyle(WB.accent(scheme))
            Text(title).font(.system(size: 13, weight: .bold)).multilineTextAlignment(.center).foregroundStyle(WB.text(scheme))
            if let detail {
                Text(detail).font(.system(size: 11)).multilineTextAlignment(.center).foregroundStyle(WB.text2(scheme)).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// "12:04 güncellendi" when the widget shows the last data it had (offline, server busy).
struct StaleNote: View {
    let since: Date?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if let since {
            HStack(spacing: 3) {
                Image(systemName: "wifi.slash").font(.system(size: 8, weight: .bold))
                Text(WL.t("state.staleAt", since.formatted(date: .omitted, time: .shortened)))
            }
            .font(.system(size: 9.5, weight: .semibold))
            .foregroundStyle(WB.text3(scheme))
        }
    }
}
