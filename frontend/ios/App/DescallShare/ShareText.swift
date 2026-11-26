import Foundation

/// Strings of the share extension: the web catalog (ShareStrings.swift, generated from
/// src/i18n/locales/shareSheet.<locale>.js) in the language the app uses (DescallSession.locale)
/// or the phone's, with the ICU subset the catalog uses: {name} and
/// {count, plural, one {...} few {...} many {...} other {...}} with # for the number.
/// Pure Foundation: tested on the CI runner (selftest/share/main.swift).
public enum ShareText {
    public static let locales = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]

    /// "pt-BR" from "pt_BR" / "pt-BR" / "pt"; English when the language is not shipped.
    public static func resolve(_ raw: String?) -> String {
        let candidates = [raw] + Locale.preferredLanguages.map { Optional($0) }
        for c in candidates {
            guard let c, !c.isEmpty else { continue }
            let norm = c.replacingOccurrences(of: "_", with: "-")
            if locales.contains(norm) { return norm }
            let lang = norm.split(separator: "-").first.map(String.init)?.lowercased() ?? ""
            if lang == "pt" { return "pt-BR" }
            if locales.contains(lang) { return lang }
        }
        return "en"
    }

    public static var current: String = resolve(nil)

    public static func t(_ key: String, _ vars: [String: Any] = [:], locale: String? = nil) -> String {
        let loc = locale ?? current
        let raw = ShareStrings.table[loc]?[key] ?? ShareStrings.table["en"]?[key] ?? key
        return format(raw, vars, locale: loc)
    }

    /// CLDR plural category for the languages the app ships.
    public static func category(_ n: Int, locale: String) -> String {
        let lang = locale.split(separator: "-").first.map(String.init) ?? locale
        switch lang {
        case "ru":
            let m10 = n % 10, m100 = n % 100
            if m10 == 1 && m100 != 11 { return "one" }
            if (2...4).contains(m10) && !(12...14).contains(m100) { return "few" }
            return "many"
        case "fr", "pt":
            return n == 0 || n == 1 ? "one" : "other"
        default:
            return n == 1 ? "one" : "other"
        }
    }

    public static func format(_ pattern: String, _ vars: [String: Any], locale: String) -> String {
        var s = pattern
        // {count, plural, one {...} other {...}} (one level, as in the catalog).
        if s.hasPrefix("{"), let comma = s.firstIndex(of: ","), s[s.index(after: comma)...].trimmingCharacters(in: .whitespaces).hasPrefix("plural,") {
            let name = String(s[s.index(after: s.startIndex)..<comma]).trimmingCharacters(in: .whitespaces)
            let n = intValue(vars[name])
            let forms = pluralForms(s)
            let cat = category(n, locale: locale)
            let chosen = forms[cat] ?? forms["other"] ?? ""
            s = chosen.replacingOccurrences(of: "#", with: String(n))
        }
        for (k, v) in vars {
            s = s.replacingOccurrences(of: "{\(k)}", with: "\(v)")
        }
        return s
    }

    static func intValue(_ v: Any?) -> Int {
        if let i = v as? Int { return i }
        if let d = v as? Double { return Int(d) }
        if let s = v as? String, let i = Int(s) { return i }
        return 0
    }

    /// "one {# öğe} other {# öğe}" → ["one": "# öğe", "other": "# öğe"]; inner {name} kept.
    static func pluralForms(_ s: String) -> [String: String] {
        var out: [String: String] = [:]
        let chars = Array(s)
        guard let start = s.range(of: "plural,")?.upperBound else { return out }
        var i = s.distance(from: s.startIndex, to: start)
        while i < chars.count {
            while i < chars.count, chars[i] == " " || chars[i] == "\n" { i += 1 }
            var key = ""
            while i < chars.count, chars[i].isLetter { key.append(chars[i]); i += 1 }
            while i < chars.count, chars[i] == " " { i += 1 }
            guard i < chars.count, chars[i] == "{", !key.isEmpty else { break }
            var depth = 0
            var body = ""
            while i < chars.count {
                let c = chars[i]
                if c == "{" { depth += 1; if depth == 1 { i += 1; continue } }
                if c == "}" { depth -= 1; if depth == 0 { i += 1; break } }
                body.append(c)
                i += 1
            }
            out[key] = body
        }
        return out
    }

    // MARK: Numbers and dates

    public static func intlLocale(_ loc: String = current) -> Locale {
        switch loc {
        case "tr": return Locale(identifier: "tr_TR")
        case "de": return Locale(identifier: "de_DE")
        case "es": return Locale(identifier: "es_ES")
        case "fr": return Locale(identifier: "fr_FR")
        case "pt-BR": return Locale(identifier: "pt_BR")
        case "ru": return Locale(identifier: "ru_RU")
        default: return Locale(identifier: "en_GB")
        }
    }

    /// "14,8 MB" (tr) / "14.8 MB" (en): same rule as shareModel.formatBytes.
    public static func bytes(_ n: Int64, locale: String = current) -> String {
        let v = Double(max(0, n))
        let f = NumberFormatter()
        f.locale = intlLocale(locale)
        f.numberStyle = .decimal
        func fmt(_ x: Double, _ d: Int) -> String {
            f.minimumFractionDigits = d
            f.maximumFractionDigits = d
            return f.string(from: NSNumber(value: x)) ?? String(format: "%.\(d)f", x)
        }
        let mb = 1024.0 * 1024.0
        if v >= mb * 1024 { return "\(fmt(v / (mb * 1024), 1)) GB" }
        if v >= mb { return "\(fmt(v / mb, v >= 100 * mb ? 0 : 1)) MB" }
        if v >= 1024 { return "\(fmt(v / 1024, 0)) KB" }
        return "\(fmt(v, 0)) B"
    }

    public static func time(_ ms: Double, locale: String = current) -> String {
        let f = DateFormatter()
        f.locale = intlLocale(locale)
        f.dateFormat = "HH:mm"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    public static func dayTime(_ ms: Double, now: Double, locale: String = current) -> String {
        let d = Date(timeIntervalSince1970: ms / 1000)
        if Calendar.current.isDate(d, inSameDayAs: Date(timeIntervalSince1970: now / 1000)) { return time(ms, locale: locale) }
        let f = DateFormatter()
        f.locale = intlLocale(locale)
        f.setLocalizedDateFormatFromTemplate("EEE d MMM")
        return "\(f.string(from: d)) \(time(ms, locale: locale))"
    }
}
