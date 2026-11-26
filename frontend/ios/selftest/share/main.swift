import Foundation

// "Paylaş > Descall" share extension selftest: the pure rules (ShareLogic.swift, mirror of
// src/lib/share/shareModel.js) and the strings / ICU formatter (ShareText.swift + the
// generated ShareStrings.swift). No UIKit, no network.
// swiftc -o /tmp/share App/DescallShare/ShareLogic.swift App/DescallShare/ShareText.swift App/DescallShare/ShareStrings.swift selftest/share/main.swift && /tmp/share

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok {
        failures += 1
        print("FAIL [\(line)] \(what)")
    }
}
func eq<T: Equatable>(_ a: T, _ b: T, _ what: String, line: Int = #line) {
    check(a == b, "\(what): \(a) != \(b)", line: line)
}

// MARK: Strings

eq(ShareText.t("send", ["count": 3], locale: "tr"), "3 sohbete gönder", "tr plural")
eq(ShareText.t("send", ["count": 1], locale: "en"), "Send to 1 chat", "en one")
eq(ShareText.t("send", ["count": 3], locale: "en"), "Send to 3 chats", "en other")
eq(ShareText.t("send", ["count": 3], locale: "ru"), "Отправить в 3 чата", "ru few")
eq(ShareText.t("send", ["count": 5], locale: "ru"), "Отправить в 5 чатов", "ru many")
eq(ShareText.t("send", ["count": 21], locale: "ru"), "Отправить в 21 чат", "ru one (21)")
eq(ShareText.t("partial.itemsFailed", ["count": 2, "reason": "Yüklenemedi"], locale: "tr"), "2 öğe gitmedi: Yüklenemedi", "plural with a variable inside")
eq(ShareText.t("dup.link", ["when": "dün", "name": "Ece"], locale: "tr"), "Bu bağlantıyı dün Ece sohbetine göndermiştin", "variables")
eq(ShareText.t("missing.key", locale: "tr"), "missing.key", "unknown key falls back to the key")
eq(ShareText.resolve("pt_BR"), "pt-BR", "pt_BR")
eq(ShareText.resolve("pt"), "pt-BR", "pt")
eq(ShareText.resolve("de-AT"), "de", "region dropped")
for loc in ShareText.locales {
    check(ShareStrings.table[loc]?.count == ShareStrings.table["en"]?.count, "\(loc) has every key")
    check(!(ShareText.t("title", locale: loc)).isEmpty, "\(loc) title")
}
eq(ShareText.bytes(Int64(14.8 * 1024 * 1024), locale: "tr"), "14,8 MB", "tr bytes")
eq(ShareText.bytes(Int64(5.2 * 1024 * 1024), locale: "en"), "5.2 MB", "en bytes")
eq(ShareText.bytes(2400, locale: "tr"), "2 KB", "KB")

// MARK: Rules

eq(ShareRules.fold("Yılmaz"), "yilmaz", "dotless i folded")
eq(ShareRules.fold("ÇAĞRI"), "cagri", "Turkish accents")
check(ShareRules.isConv("dm:abc-123"), "dm conv")
check(!ShareRules.isConv("dm:../x"), "path refused")
check(!ShareRules.isConv("server:x"), "unknown kind refused")
eq(ShareRules.normalizeLink("https://www.a.com/x/?b=1&utm_medium=y&a=2#f"), "a.com/x?a=2&b=1", "link normalized")
eq(ShareRules.normalizeLink("javascript:alert(1)"), nil, "not a web link")
let NOW = Date().timeIntervalSince1970 * 1000
eq(ShareRules.relativeDay(NOW - 86_400_000, now: NOW)?.key, "yesterday", "yesterday")
eq(ShareRules.relativeDay(NOW, now: NOW)?.key, "today", "today")
check(ShareRules.validSchedule(NOW + 3_600_000, now: NOW), "1 h ahead is fine")
check(!ShareRules.validSchedule(NOW + 10_000, now: NOW), "10 s is too soon")
check(ShareRules.schedulePresets(now: NOW).contains { $0.key == "tomorrow" }, "tomorrow preset")

// MARK: Targets

let json = """
{"recents":["dm:ece","group:og","channel:foto"],
 "friends":[{"conv":"dm:ece","kind":"dm","id":"ece","name":"Ece Yılmaz","username":"ece","presence":"online","canSend":true,"canAttach":true},
            {"conv":"dm:kaan","kind":"dm","id":"kaan","name":"Kaan Demir","presence":"idle"}],
 "groups":[{"conv":"group:og","kind":"group","id":"og","name":"Oyun Gecesi","memberCount":6,"onlineCount":3}],
 "servers":[{"id":"pk","name":"Pixel Kulübü","channels":[
   {"conv":"channel:genel","kind":"channel","id":"genel","name":"genel","serverId":"pk","serverName":"Pixel Kulübü","canSend":true,"canAttach":true,"slowModeSec":0},
   {"conv":"channel:foto","kind":"channel","id":"foto","name":"fotoğraflar","serverId":"pk","serverName":"Pixel Kulübü","lastShared":{"at":"2026-11-23T10:00:00.000Z","mediaCount":2}},
   {"conv":"channel:duyuru","kind":"channel","id":"duyuru","name":"duyurular","serverId":"pk","canSend":false,"canAttach":false,"reason":"announcement"},
   {"conv":"channel:oylama","kind":"channel","id":"oylama","name":"oylama","serverId":"pk","canSend":true,"canAttach":false,"reason":"no_attach","slowModeSec":30}]}],
 "limits":{"maxItems":10}}
"""
let T = try! JSONDecoder().decode(ShareTargets.self, from: Data(json.utf8))
eq(T.friends.count, 2, "friends decoded")
eq(T.friends[1].canSend, true, "missing canSend defaults to true")
eq(T.recentEntries().map { $0.conv }, ["dm:ece", "group:og", "channel:foto"], "recents")
let all = T.sections(tab: "all", query: "", selected: [])
eq(all.map { $0.id }, ["friends", "groups", "channels"], "all tab sections")
eq(all[2].rows.map { $0.id }, ["foto"], "used channels only")
eq(T.sections(tab: "servers", query: "", selected: []).first?.rows.count, 4, "server tree keeps locked channels")
eq(T.sections(tab: "all", query: "yilmaz", selected: []).first?.rows.map { $0.id }, ["ece"], "search folds")
let idx = T.index
check(idx["channel:oylama"]!.verdict(hasFiles: true).ok == false, "no attach with files")
check(idx["channel:oylama"]!.verdict(hasFiles: false).ok, "text still ok")
eq(idx["channel:duyuru"]!.verdict(hasFiles: false).reason, "announcement", "announcement reason")
eq(idx["dm:ece"]!.deepLink, "descall://dm/ece", "dm link")
eq(idx["channel:foto"]!.deepLink, "descall://server/pk/foto", "channel link")

// MARK: Items, totals, duplicates

let MB: Int64 = 1024 * 1024
let items = [
    ShareInputItem(id: "a", kind: "image", mime: "image/heic", name: "IMG_1.HEIC", size: 4 * MB, estimates: ["original": 4 * MB, "high": 1 * MB, "saver": MB / 2]),
    ShareInputItem(id: "v", kind: "video", mime: "video/quicktime", name: "c.mov", size: 6 * MB, estimates: ["original": 6 * MB, "high": 2 * MB, "saver": MB]),
    ShareInputItem(id: "l", kind: "link", url: "https://www.rotarehberi.com.tr/balon?utm_source=x"),
    ShareInputItem(id: "f", kind: "file", mime: "application/pdf", name: "Proje.pdf", size: 2 * MB),
]
let tot = shareTotals(items, quality: "high")
eq(tot.original, 12 * MB, "original total")
eq(tot.chosen, 5 * MB, "high total")
eq(tot.savedPercent, 58, "saved percent")
eq(items[3].problem(quality: "high", allowedMimes: ["image/jpeg"]), "type", "file type check")
eq(items[0].problem(quality: "high", allowedMimes: ["image/jpeg"]), nil, "HEIC converts")
eq(shareComposeText("  Bak ", items), "Bak\nhttps://www.rotarehberi.com.tr/balon?utm_source=x", "text with link")
eq(items[2].fingerprint, "link:rotarehberi.com.tr/balon", "link fingerprint")
let hist = shareRecordHistory([], convs: ["dm:ece"], items: [items[2]], at: NOW - 86_400_000)
let dups = shareDuplicates(history: hist, items: [items[2]], convs: ["dm:ece", "group:og"], server: [:], now: NOW)
eq(dups.map { $0.conv }, ["dm:ece"], "duplicate from history")
let srv = shareDuplicates(history: [], items: [items[3]], convs: ["group:og"], server: ["group:og": (kind: "file", at: NOW - 1000)], now: NOW)
eq(srv.first?.kind, "file", "duplicate from server")

// MARK: Job

var job = ShareJob(id: "sh-test", items: items, targets: [idx["dm:ece"]!, idx["group:og"]!, idx["channel:foto"]!], text: "Bak", silent: true, sendAt: nil, quality: "high", stripLocation: true, now: NOW)
eq(job.items.count, 3, "link is not an upload")
eq(job.text, "Bak\nhttps://www.rotarehberi.com.tr/balon?utm_source=x", "job text")
job.start(at: NOW)
job.upload(0, sent: MB / 2, total: MB)
var s = job.summary(now: NOW + 1000)
eq(s.phase, "sending", "sending")
check(s.percent > 0 && s.percent < 50, "percent \(s.percent)")
for i in 0..<3 { job.uploaded(i, url: "u\(i)", info: ShareUploadInfo(mediaType: "image", mimeType: nil, size: nil, originalName: nil)) }
eq(job.targetProgress("dm:ece"), 80, "uploads are 80 %")
job.targetResult("dm:ece", results: (0..<3).map { ShareSendResult(index: $0, status: "sent", messageId: "m\($0)") }, textSent: true, at: NOW)
job.targetResult("group:og", results: (0..<3).map { ShareSendResult(index: $0, status: "sent") }, textSent: true, at: NOW)
job.targetResult("channel:foto", results: [ShareSendResult(index: 0, status: "sent"), ShareSendResult(index: 1, status: "failed", reason: "upload_failed"), ShareSendResult(index: 2, status: "sent")], textSent: true, at: NOW)
eq(job.itemBadge(1), "fail", "failed badge")
eq(job.itemBadge(0), "ok", "ok badge")
job.finish(at: NOW + 4000)
s = job.summary(now: NOW + 4000)
eq(s.phase, "partial", "partial")
eq(s.done, 2, "two chats done")
eq(job.undoUntil, nil, "no undo on partial")
eq(job.pendingFor("channel:foto"), [1], "only the missing item")
eq(job.clientId(targetIndex: 2, indexes: [1]), "sh-test-2-1", "stable client id")
var retried = job
retried.retry()
eq(retried.targets.map { $0.status }, ["sent", "sent", "queued"], "retry keeps what went through")
var dropped = job
dropped.dropFailed(at: NOW + 5000)
eq(dropped.summary(now: NOW + 5000).phase, "sent", "drop failed")
eq(dropped.summary(now: NOW + 7000).undoLeft, 8, "undo countdown")
var off = retried
off.setOffline(true)
eq(off.summary(now: NOW).phase, "waiting", "offline waits")
var undone = dropped
undone.markUndone()
eq(undone.summary(now: NOW).phase, "undone", "undone")
let encoded = try! JSONEncoder().encode(job)
let decoded = try! JSONDecoder().decode(ShareJob.self, from: encoded)
eq(decoded, job, "job survives the App Group round trip")

if failures > 0 {
    print("share selftest: \(failures) failure(s)")
    exit(1)
}
print("share selftest: ok")
