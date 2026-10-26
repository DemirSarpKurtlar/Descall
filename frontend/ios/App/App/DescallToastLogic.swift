import Foundation

/// 3.0.0 (A4, native glass #07): pure rules for the in-app notification capsule
/// (argument checks, gesture outcome, spring constants). Foundation only, so the
/// Linux selftest (ios/selftest/toast) can run it; the UIKit view is in
/// DescallToastCapsule.swift.
enum DescallToast {
    static let defaultDuration: TimeInterval = 3.0
    static let maxTitle = 80
    static let maxSub = 120
    static let maxAction = 16
    static let maxAvatarBytes = 400 * 1024

    /// Spring "1.0 / 0.35" from the #07 spec: damping ratio 1.0, response 0.35 s.
    /// For mass 1: stiffness = (2π / response)², damping = 2 · ratio · √stiffness.
    static let springResponse: Double = 0.35
    static let springDampingRatio: Double = 1.0
    static var springStiffness: Double { pow(2 * Double.pi / springResponse, 2) }
    static var springDamping: Double { 2 * springDampingRatio * springStiffness.squareRoot() }

    enum Avatar: Equatable {
        case none
        case remote(URL)
        case inline(Data)
    }

    struct Args: Equatable {
        var id: String
        var title: String
        var sub: String
        var avatar: Avatar
        var letter: String
        var colorHex: String
        var online: Bool
        var action: String?
        var duration: TimeInterval
    }

    static func clip(_ s: String, _ n: Int) -> String {
        let one = s.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard one.count > n else { return one }
        return String(one.prefix(n - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }

    /// https URLs or a base64 data:image (png / jpeg / webp / gif) up to 400 KB.
    static func avatarSource(_ raw: String?) -> Avatar {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return .none }
        if raw.lowercased().hasPrefix("https://"), let url = URL(string: raw), url.host != nil { return .remote(url) }
        let lower = raw.lowercased()
        let prefixes = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,", "data:image/webp;base64,", "data:image/gif;base64,"]
        guard let prefix = prefixes.first(where: { lower.hasPrefix($0) }) else { return .none }
        let b64 = String(raw.dropFirst(prefix.count))
        guard b64.count <= (maxAvatarBytes * 4) / 3 + 4, let data = Data(base64Encoded: b64), !data.isEmpty, data.count <= maxAvatarBytes else { return .none }
        return .inline(data)
    }

    static func validHex(_ raw: String?) -> String? {
        guard let raw, raw.count == 7, raw.hasPrefix("#") else { return nil }
        let digits = raw.dropFirst()
        return digits.allSatisfy({ $0.isHexDigit }) ? raw.uppercased() : nil
    }

    static func hex(_ c: (r: Double, g: Double, b: Double)) -> String {
        String(format: "#%02X%02X%02X", Int((c.r * 255).rounded()), Int((c.g * 255).rounded()), Int((c.b * 255).rounded()))
    }

    /// nil when there is nothing to show (no title).
    static func parse(_ o: [String: Any]) -> Args? {
        let title = clip(o["title"] as? String ?? "", maxTitle)
        guard !title.isEmpty else { return nil }
        let name = (o["name"] as? String).map { clip($0, maxTitle) } ?? title
        let seed = (o["seed"] as? String) ?? name
        let action = (o["action"] as? String).map { clip($0, maxAction) }
        let ms = (o["duration"] as? Double) ?? (o["duration"] as? Int).map(Double.init) ?? defaultDuration * 1000
        let rawId = (o["id"] as? String) ?? ""
        let id = rawId.isEmpty ? UUID().uuidString : String(rawId.prefix(64))
        return Args(
            id: id,
            title: title,
            sub: clip(o["sub"] as? String ?? "", maxSub),
            avatar: avatarSource(o["avatar"] as? String),
            letter: DescallNotifyAvatar.initial(name),
            colorHex: validHex(o["color"] as? String) ?? hex(DescallNotifyAvatar.palette[DescallNotifyAvatar.colorIndex(seed)]),
            online: (o["online"] as? Bool) ?? false,
            action: (action?.isEmpty ?? true) ? nil : action,
            duration: min(10, max(1.5, ms / 1000))
        )
    }

    // MARK: Gestures

    enum Release: Equatable { case dismiss, expand, settle }

    /// Finger lifted. Up past 24 pt or flicked up → thrown away; pulled down past
    /// 28 pt or flicked down → expands; otherwise springs back.
    static func release(translationY: Double, velocityY: Double, expanded: Bool) -> Release {
        if translationY < -24 || velocityY < -450 { return .dismiss }
        if !expanded, translationY > 28 || velocityY > 500 { return .expand }
        return .settle
    }

    /// Up follows the finger 1:1; down is rubber-banded (asymptote 44 pt).
    static func dragOffset(_ translationY: Double) -> Double {
        guard translationY > 0 else { return translationY }
        let c = 44.0
        return c * (1 - 1 / (translationY * 0.55 / c + 1))
    }

    /// Time to throw the capsule off the top with the finger's momentum.
    static func throwDuration(distance: Double, velocityY: Double) -> Double {
        let speed = max(abs(velocityY), 900)
        return min(0.32, max(0.12, abs(distance) / speed))
    }
}
