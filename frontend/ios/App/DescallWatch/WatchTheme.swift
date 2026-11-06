import SwiftUI

/// Design B "Descall camı" (owner pick): the app's deep blue-violet light, glass
/// cards with a hairline and a top sheen, brand-blue glowing buttons.
enum DS {
    static let brand = Color(red: 0x58 / 255, green: 0x7A / 255, blue: 0xF6 / 255)
    static let brandHi = Color(red: 0xA9 / 255, green: 0xBB / 255, blue: 1)
    static let ctaTop = Color(red: 0x6E / 255, green: 0x8C / 255, blue: 1)
    static let ctaBottom = Color(red: 0x4E / 255, green: 0x6F / 255, blue: 0xF2 / 255)
    static let violet = Color(red: 0x8C / 255, green: 0x5C / 255, blue: 0xF6 / 255)
    static let ink2 = Color(red: 225 / 255, green: 230 / 255, blue: 1).opacity(0.66)
    static let online = Color(red: 0x30 / 255, green: 0xD1 / 255, blue: 0x58 / 255)
    static let idle = Color(red: 1, green: 0x9F / 255, blue: 0x0A / 255)
    static let dnd = Color(red: 1, green: 0x45 / 255, blue: 0x3A / 255)
    static let offline = Color(white: 0.45)

    /// Same palette and order as the web/iOS letter avatars (src/lib/avatarFallback.js
    /// AVATAR_PALETTE), so one person gets the same colour on every device.
    static let avatarPalette: [Color] = [
        Color(red: 0x28 / 255, green: 0x68 / 255, blue: 0xFF / 255),
        Color(red: 0x22 / 255, green: 0x83 / 255, blue: 0x59 / 255),
        Color(red: 0xBA / 255, green: 0x59 / 255, blue: 0x0E / 255),
        Color(red: 0xDB / 255, green: 0x2C / 255, blue: 0x5B / 255),
        Color(red: 0x7E / 255, green: 0x59 / 255, blue: 0xEE / 255),
        Color(red: 0x17 / 255, green: 0x7E / 255, blue: 0x96 / 255),
        Color(red: 0x92 / 255, green: 0x6F / 255, blue: 0x16 / 255),
        Color(red: 0xDA / 255, green: 0x36 / 255, blue: 0x2C / 255),
    ]

    static func presenceColor(_ s: String?) -> Color {
        switch s {
        case "online": return online
        case "idle": return idle
        case "dnd": return dnd
        default: return offline
        }
    }

    /// CRC-32 (IEEE) of the UTF-8 bytes, the hash the web avatar uses.
    static func crc32(_ text: String) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in text.utf8 {
            crc ^= UInt32(byte)
            for _ in 0..<8 {
                crc = (crc & 1) != 0 ? (0xEDB8_8320 ^ (crc >> 1)) : (crc >> 1)
            }
        }
        return crc ^ 0xFFFF_FFFF
    }

    /// Colour for a letter avatar: palette[crc32(id) % 8], the web rule. The DM/friend
    /// seed may carry a "dm:" prefix; the user id after it is what the web hashes.
    static func avatarColor(_ seed: String) -> Color {
        let key = seed.hasPrefix("dm:") ? String(seed.dropFirst(3)) : seed
        guard !key.isEmpty else { return avatarPalette[0] }
        return avatarPalette[Int(crc32(key) % UInt32(avatarPalette.count))]
    }

    /// "Ayşe Yılmaz" -> "AY", "cinar.baskin" -> "CB", "Ayşe" -> "A" (web avatarInitials).
    static func initials(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let cleaned = trimmed.hasPrefix("@") ? String(trimmed.drop(while: { $0 == "@" })) : trimmed
        let parts = cleaned
            .split(whereSeparator: { $0 == " " || $0 == "." || $0 == "_" || $0 == "-" })
            .map { part in String(part.drop(while: { ch in !ch.isLetter && !ch.isNumber })) }
            .filter { part in !part.isEmpty }
        guard let first = parts.first?.first else { return "?" }
        let second = parts.count > 1 ? parts[1].first.map(String.init) ?? "" : ""
        let tr = Locale(identifier: "tr_TR")
        return (String(first) + second).uppercased(with: tr)
    }
}

struct DescallBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.06, blue: 0.13), Color(red: 0.07, green: 0.09, blue: 0.21), Color(red: 0.04, green: 0.05, blue: 0.10)],
                startPoint: .top, endPoint: .bottom
            )
            RadialGradient(colors: [DS.brand.opacity(0.55), .clear], center: UnitPoint(x: 0.12, y: 0), startRadius: 0, endRadius: 150)
            RadialGradient(colors: [DS.violet.opacity(0.42), .clear], center: UnitPoint(x: 1, y: 1), startRadius: 0, endRadius: 140)
        }
        .ignoresSafeArea()
    }
}

struct GlassBackground: ViewModifier {
    var radius: CGFloat
    var highlight: Bool

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(LinearGradient(colors: [Color.white.opacity(0.15), Color.white.opacity(0.06)], startPoint: .top, endPoint: .bottom))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(highlight ? DS.brandHi.opacity(0.6) : Color.white.opacity(0.16), lineWidth: highlight ? 1 : 0.5)
            )
    }
}

extension View {
    func glass(_ radius: CGFloat = 16, highlight: Bool = false) -> some View {
        modifier(GlassBackground(radius: radius, highlight: highlight))
    }

    func descallScreen() -> some View {
        containerBackground(for: .navigation) { DescallBackground() }
    }
}

struct CTAButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(
                Capsule().fill(LinearGradient(colors: [DS.ctaTop, DS.ctaBottom], startPoint: .top, endPoint: .bottom))
            )
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.28), lineWidth: 0.5))
            .shadow(color: DS.brand.opacity(0.45), radius: 7, y: 3)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

struct SectionLabel: View {
    var text: String
    var body: some View {
        Text(text.uppercased(with: L.locale))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(DS.ink2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
            .padding(.leading, 6)
    }
}

struct PresenceDot: View {
    var status: String?
    var size: CGFloat = 9
    var body: some View {
        Circle()
            .fill(DS.presenceColor(status))
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(Color.black.opacity(0.85), lineWidth: 2))
    }
}

struct AvatarView: View {
    var url: String?
    var initials: String
    var seed: String
    var size: CGFloat = 30
    var presence: String?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let url, let u = URL(string: url) {
                    AsyncImage(url: u) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            initialsView
                        }
                    }
                } else {
                    initialsView
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            if let presence {
                PresenceDot(status: presence, size: max(8, size * 0.32))
                    .offset(x: 1, y: 1)
            }
        }
    }

    private var initialsView: some View {
        ZStack {
            Circle().fill(DS.avatarColor(seed))
            Text(initials)
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

struct ErrorCard: View {
    var error: WatchError
    var retry: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: error == .unreachable ? "iphone.slash" : "exclamationmark.circle")
                .font(.system(size: 22))
                .foregroundStyle(DS.brandHi)
            Text(L.error(error))
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
            Button(L.retry, action: retry)
                .buttonStyle(CTAButtonStyle())
        }
        .padding(10)
        .glass(18)
    }
}
