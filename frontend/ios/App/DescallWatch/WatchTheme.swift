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
    /// Dense navy under the frosted cards (heavy glass, never see-through).
    static let glassTint = Color(red: 0.10, green: 0.12, blue: 0.24)

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

/// 3.7.33 heavy frosted glass (owner rule: no see-through menus or sheets). A thick
/// material plus a dense navy tint, a top sheen and a hairline: the background light
/// only glows through, text behind a card never shows.
struct GlassBackground: ViewModifier {
    var radius: CGFloat
    var highlight: Bool

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(
                ZStack {
                    shape.fill(.thickMaterial)
                    shape.fill(DS.glassTint.opacity(0.82))
                    shape.fill(LinearGradient(colors: [Color.white.opacity(0.13), Color.white.opacity(0.02)], startPoint: .top, endPoint: .center))
                }
            )
            .overlay(
                shape.strokeBorder(highlight ? DS.brandHi.opacity(0.65) : Color.white.opacity(0.17), lineWidth: highlight ? 1 : 0.5)
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

    /// Sheets get the same opaque Descall background (never the see-through system sheet).
    func descallSheet() -> some View {
        containerBackground(for: .navigation) { DescallBackground() }
            .background(DescallBackground())
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
    @State private var busy = false

    var body: some View {
        VStack(spacing: 8) {
            Group {
                if error == .noSession {
                    Image("DescallMark").resizable().renderingMode(.template).scaledToFit().frame(width: 30, height: 30)
                } else {
                    Image(systemName: error.isOffline ? "iphone.slash" : "exclamationmark.circle").font(.system(size: 22))
                }
            }
            .foregroundStyle(DS.brandHi)
            Text(L.error(error))
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                busy = true
                retry()
                Task { try? await Task.sleep(nanoseconds: 900_000_000); busy = false }
            } label: {
                if busy { ProgressView() } else { Label(L.retry, systemImage: "arrow.clockwise") }
            }
            .buttonStyle(CTAButtonStyle())
            .disabled(busy)
        }
        .padding(10)
        .glass(18)
    }
}

/// "iPhone'una ulaşılamıyor · 3 dk önceki veriler" over cached data (3.7.33 offline state).
struct OfflineBanner: View {
    var error: WatchError?
    var updatedAt: Date?

    var body: some View {
        if let error, error.isOffline || error.isServerSide {
            HStack(spacing: 6) {
                Image(systemName: error.isOffline ? "iphone.slash" : "exclamationmark.triangle.fill").font(.system(size: 11, weight: .semibold))
                VStack(alignment: .leading, spacing: 0) {
                    Text(error.isOffline ? L.offlineTitle : L.refreshFailed).font(.system(size: 11.5, weight: .semibold)).lineLimit(1)
                    if let updatedAt {
                        Text(L.showingFrom(updatedAt)).font(.system(size: 10.5)).foregroundStyle(DS.ink2).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(DS.idle)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .glass(12)
            .accessibilityElement(children: .combine)
        }
    }
}

/// "Güncellendi · 2 dk önce" under a screen's content.
struct UpdatedLine: View {
    var updatedAt: Date?
    var loading: Bool

    var body: some View {
        Text(loading ? L.refreshing : (updatedAt.map { L.updated($0) } ?? ""))
            .font(.system(size: 10.5))
            .foregroundStyle(DS.ink2)
            .monospacedDigit()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
    }
}

/// Toolbar refresh: a spinner while loading.
/// Refresh row at the top of every screen (stats, lists). Fixed size so the row never
/// changes layout while loading; only opacity changes.
struct RefreshRowButton: View {
    var loading: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .semibold))
                Text(L.refresh).font(.system(size: 12.5, weight: .semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 30)
            .opacity(loading ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .foregroundStyle(DS.brandHi)
        .disabled(loading)
        .accessibilityLabel(L.refresh)
        .accessibilityIdentifier("watch-refresh")
    }
}

/// Empty list state with the Descall mark.
struct EmptyState: View {
    var text: String
    var icon: String? = nil

    var body: some View {
        VStack(spacing: 6) {
            if let icon {
                Image(systemName: icon).font(.system(size: 20)).foregroundStyle(DS.brandHi)
            } else {
                Image("DescallMark").resizable().renderingMode(.template).scaledToFit().frame(width: 24, height: 24).foregroundStyle(DS.brandHi.opacity(0.8))
            }
            Text(text).font(.system(size: 12.5)).foregroundStyle(DS.ink2).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }
}

/// Row skeleton while a list loads the first time.
struct LoadingRows: View {
    var count = 3
    var body: some View {
        VStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { _ in
                HStack(spacing: 8) {
                    Circle().fill(Color.white.opacity(0.12)).frame(width: 28, height: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.14)).frame(width: 80, height: 9)
                        RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.08)).frame(width: 110, height: 8)
                    }
                    Spacer(minLength: 0)
                }
                .padding(9)
                .glass(16)
            }
        }
        .accessibilityLabel(L.loading)
    }
}

extension WatchError {
    /// A 5xx or a reply the watch could not read.
    var isServerSide: Bool {
        if case .http(let code, _) = self { return code >= 500 }
        return self == .decode
    }
}
