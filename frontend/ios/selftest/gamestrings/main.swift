// Watch games copy (App/DescallWatch/Games/GameStrings.swift) through the watch's own
// language mechanism (L.lang). Every key in all locales is checked by
// frontend/scripts/watchGames.selftest.mjs; here the Swift side runs for real:
// swiftc -o /tmp/gs App/WatchShared/DescallWatchProtocol.swift App/DescallWatch/WatchCore.swift App/DescallWatch/WatchStrings.swift App/DescallWatch/Games/GameStrings.swift App/DescallWatch/Games/Logic/*.swift selftest/gamestrings/main.swift && /tmp/gs
import Foundation

/// Same cases as WatchClient.swift (needs WatchConnectivity, not compiled here).
enum WatchError: Error, Equatable {
    case unreachable, timeout, noSession, notAllowed, network, decode
    case http(Int, String?)
}

var failures = 0
func eq(_ a: String, _ b: String, _ what: String) {
    if a != b { failures += 1; print("FAIL - \(what): \(a) != \(b)") }
}

L.adopt(phoneLocale: "tr")
eq(GL.t("mola"), "Mola", "tr group")
eq(GL.name(.snake), "Yılankavi", "game name")
eq(GL.mode(.pong, "hard"), "Usta", "pong level")
eq(GL.mode(.sudoku, "hard"), "Zor", "sudoku level")
eq(GL.mode(.merge, "mini"), "3 × 3", "mini board")
eq(GL.t("dayStreak", ["n": "5"]), "5 gün seri", "streak")
eq(GL.timeLeft(6 * 3600 + 12 * 60), "6 sa 12 dk kaldı", "time left")
eq(GL.timeLeft(30), "1 dk kaldı", "under a minute")
eq(GL.hoursMinutes(8040), "2:14", "week hours")
eq(GL.number(48230), "48.230", "tr number")
eq(GL.goal(DailyChallenge(day: 1, game: .merge, mode: "classic", goal: .tile, target: 512)), "Katla · 60 sn'de 512", "challenge goal")
eq(GL.plural("winsShort", 14), "14 G", "tr wins")
eq(GL.medal(.gold), "Altın", "medal")
eq(GL.power(.shield), "Kalkan", "power-up")
eq(GL.chessResult(.whiteMates), "Mat", "mate")
eq(GL.cardsOutcome(.natural), "Yirmibir!", "natural")
eq(GL.t("autoPaused", ["game": GL.name(.pong)]), "Raket otomatik duraklatıldı", "auto pause")

L.adopt(phoneLocale: "en")
eq(GL.t("againstClock"), "Beat the clock", "en")
eq(GL.number(48230), "48,230", "en number")
eq(GL.plural("winsShort", 1), "1 win", "en one")
eq(GL.plural("winsShort", 3), "3 wins", "en other")
L.adopt(phoneLocale: "ru")
eq(GL.plural("winsShort", 3), "3 победы", "ru few")
eq(GL.plural("winsShort", 7), "7 побед", "ru many")
L.adopt(phoneLocale: "de")
eq(GL.mode(.blocks, "sprint"), "2 Min.", "de sprint")
eq(GL.t("no.such.key"), "no.such.key", "missing key")

if failures > 0 { print("\(failures) failure(s)"); exit(1) }
print("watch games strings selftest ok")
