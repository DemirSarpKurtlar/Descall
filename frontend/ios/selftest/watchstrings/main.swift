// Watch copy table (App/DescallWatch/WatchStrings.swift) in every UI language.
// swiftc -o /tmp/ws App/WatchShared/DescallWatchProtocol.swift App/DescallWatch/WatchStrings.swift selftest/watchstrings/main.swift && /tmp/ws
import Foundation

/// Same cases as WatchClient.swift (that file needs WatchConnectivity, so it is not compiled here).
enum WatchError: Error, Equatable {
    case unreachable
    case noSession
    case notAllowed
    case network
    case decode
    case http(Int, String?)
}

var failures = 0
func check(_ ok: Bool, _ what: String) {
    if !ok { failures += 1; print("FAIL - \(what)") }
}
func eq(_ a: String, _ b: String, _ what: String) { check(a == b, "\(what): \(a) != \(b)") }

let partial: (String) -> Bool = { $0.hasSuffix(".few") || $0.hasSuffix(".many") }
func holes(_ s: String) -> [String] {
    s.components(separatedBy: "{").dropFirst().map { String($0.prefix(while: { $0 != "}" })) }.sorted()
}
for (key, entry) in L.table {
    check(Set(entry.keys).isSubset(of: Set(DescallWatchLocale.ids)), "\(key): unknown locale id")
    if partial(key) { continue }
    for id in DescallWatchLocale.ids {
        check(!(entry[id] ?? "").isEmpty, "\(key) missing \(id)")
        if let en = entry["en"], let text = entry[id] { check(holes(text) == holes(en), "\(key) \(id) placeholders") }
    }
}
// Russian has the few / many forms wherever there is a one / other pair.
for key in L.table.keys where key.hasSuffix(".one") {
    let base = String(key.dropLast(4))
    check(L.table["\(base).other"] != nil, "\(base).other")
    check(L.table["\(base).few"]?["ru"] != nil && L.table["\(base).many"]?["ru"] != nil, "\(base) ru plural forms")
}

// Turkish and English text is unchanged.
L.adopt(phoneLocale: "tr")
eq(L.chats, "Sohbetler", "tr chats")
eq(L.quick.joined(separator: "|"), "Geliyorum|Biraz sonra|Şimdi müsait değilim|Tamam|Teşekkürler", "tr quick replies")
eq(L.onlineHeader(3), "Çevrimiçi · 3", "tr online header")
eq(L.offlineFooter(2), "2 kişi çevrimdışı", "tr offline footer")
eq(L.status("dnd"), "Rahatsız etme", "tr status")
eq(L.error(.http(403, "ADMIN_PERMISSION_DENIED")), "Bu bölüm için yetkin yok.", "tr error")
eq(L.error(.http(429, nil)), "Çok hızlı. Biraz bekle.", "tr 429")
eq(L.t("maintMessage"), "Kısa bir bakım yapıyoruz. Birazdan geri döneceğiz.", "tr maintenance message")
eq(L.plural("openCount", 1), "1 açık rapor", "tr count")
eq(L.plural("errorStats", 4, ["count": "12"]), "12 kez · 4 kişi", "tr error stats")
check(L.isTurkish, "isTurkish")

L.adopt(phoneLocale: "en")
eq(L.quick.joined(separator: "|"), "On my way|In a bit|Can't talk now|OK|Thanks", "en quick replies")
eq(L.error(.unreachable), "Can't reach your iPhone. Keep it nearby and on.", "en error")
eq(L.plural("openCount", 1), "1 open report", "en singular")
eq(L.plural("openCount", 2), "2 open reports", "en plural")
eq(L.plural("errorStats", 1, ["count": "3"]), "3× · 1 person", "en error stats")

L.adopt(phoneLocale: "ru")
eq(L.plural("hits", 3), "3 блокировки", "ru few")
eq(L.plural("hits", 5), "5 блокировок", "ru many")
eq(L.status("offline"), "Не в сети", "ru status")
L.adopt(phoneLocale: "pt")
eq(L.lang, "pt-BR", "base language match")
eq(L.friends, "Amigos", "pt-BR")
L.adopt(phoneLocale: "zz")
eq(L.lang, "pt-BR", "unknown value keeps the current language")
eq(L.t("no.such.key"), "no.such.key", "missing key")

if failures > 0 { print("\(failures) failure(s)"); exit(1) }
print("watch strings selftest ok")
