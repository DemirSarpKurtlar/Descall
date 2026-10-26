import Foundation

// 3.0.0 (A4): selftest for App/NotifyShared/DescallNotifyLogic.swift.
// swiftc -o /tmp/nl App/NotifyShared/DescallNotifyLogic.swift selftest/notify/main.swift && /tmp/nl

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

// Payload parsing
let groupInfo: [AnyHashable: Any] = [
    "aps": ["alert": ["title": "Mert", "subtitle": "👥 Hafta Sonu Ekibi", "body": "Bu akşam"]],
    "type": "group", "rich": "1", "conv": "group:g-1", "senderId": "u-mert", "senderName": "Mert",
    "senderAvatar": "https://cdn.example.com/a.png", "messageId": "m-9", "comm": "1", "groupName": "Hafta Sonu Ekibi",
]
let group = DescallNotifyPayload(userInfo: groupInfo)
check(group != nil, "group payload parses")
eq(group?.kind, .group, "kind")
eq(group?.conversationId, "g-1", "id")
eq(group?.senderAvatar?.absoluteString, "https://cdn.example.com/a.png", "avatar")
eq(group?.messageId, "m-9", "messageId")
eq(group?.communication, true, "comm")
eq(group?.conversationTitle, "Hafta Sonu Ekibi", "title")

check(DescallNotifyPayload(userInfo: ["type": "call", "rich": "1", "conv": "dm:u"]) == nil, "calls are never rich")
check(DescallNotifyPayload(userInfo: ["type": "dm", "conv": "dm:u"]) == nil, "rich flag required")
check(DescallNotifyPayload(userInfo: ["type": "dm", "rich": "1", "conv": "dm:../x"]) == nil, "bad id refused")
check(DescallNotifyPayload(userInfo: ["type": "dm", "rich": "1", "conv": "server:1"]) == nil, "bad kind refused")
let insecure = DescallNotifyPayload(userInfo: ["type": "dm", "rich": "1", "conv": "dm:u-1", "senderAvatar": "http://x/a.png", "mediaThumb": "https://x/p.jpg", "mediaKind": "file"])
check(insecure?.senderAvatar == nil, "http avatar dropped")
check(insecure?.mediaThumb == nil, "file kind has no thumbnail")
eq(insecure?.communication, false, "comm off without flag")
let photo = DescallNotifyPayload(userInfo: ["type": "dm", "rich": "1", "conv": "dm:u-1", "mediaThumb": "https://x/p.jpg", "mediaKind": "image", "senderName": "Elif"])
eq(photo?.mediaKind, "image", "image kind")
eq(photo?.conversationTitle, "Elif", "dm title is the sender")
let channel = DescallNotifyPayload(userInfo: ["type": "server-message", "rich": "1", "conv": "channel:c1", "channelName": "genel", "serverName": "Oyun Gecesi", "senderName": "Zeynep"])
eq(channel?.conversationTitle, "#genel", "channel title")

// Header line
let tr = DescallNotifyStrings(lang: .tr)
let en = DescallNotifyStrings(lang: .en)
eq(DescallNotifyThread.headerLine(payload: group!, memberCount: 4, strings: tr), "👥 Hafta Sonu Ekibi · 4 üye", "group header")
eq(DescallNotifyThread.headerLine(payload: group!, memberCount: nil, strings: tr), "👥 Hafta Sonu Ekibi", "group header w/o count")
eq(DescallNotifyThread.headerLine(payload: channel!, memberCount: nil, strings: tr), "# genel · Oyun Gecesi", "channel header")
eq(DescallNotifyThread.headerLine(payload: photo!, memberCount: nil, strings: tr), nil, "dm header")
eq(en.members(1), "1 member", "en singular")

// Reply placeholder (Turkish dative)
eq(tr.replyPlaceholder(to: "Hafta Sonu Ekibi"), "Hafta Sonu Ekibi'ne yanıt yaz...", "compound")
eq(tr.replyPlaceholder(to: "Mert"), "Mert'e yanıt yaz...", "consonant front")
eq(tr.replyPlaceholder(to: "Ayşe"), "Ayşe'ye yanıt yaz...", "vowel front")
eq(tr.replyPlaceholder(to: "Burak"), "Burak'a yanıt yaz...", "consonant back")
eq(tr.replyPlaceholder(to: "Oyun Gecesi"), "Oyun Gecesi'ne yanıt yaz...", "compound 2")
eq(tr.replyPlaceholder(to: "#genel"), "#genel'e yanıt yaz...", "channel")
eq(tr.replyPlaceholder(to: "Ali"), "Ali'ye yanıt yaz...", "single close vowel")
eq(tr.replyPlaceholder(to: "Ekip 42"), "Ekip 42 · yanıt yaz...", "digit end")
eq(tr.replyPlaceholder(to: ""), "Yanıt yaz...", "empty")
eq(en.replyPlaceholder(to: "Mert"), "Reply to Mert...", "en")

// Strings
eq(tr.relative(seconds: 5), "şimdi", "now")
eq(tr.relative(seconds: 125), "2 dk", "minutes")
eq(en.relative(seconds: 7200), "2h", "hours")
eq(tr.summaryFormat, "+%u mesaj daha", "summary")
eq(DescallNotifyLang.current(["tr-TR"]), .tr, "tr")
eq(DescallNotifyLang.current(["en-US", "tr-TR"]), .en, "en")
eq(DescallNotifyLang.current([]), .tr, "default tr")

// Mute
let now = Date(timeIntervalSince1970: 1_000_000)
check(DescallNotifyMute.isMuted("dm:u", until: 1_000_100, now: now), "muted")
check(!DescallNotifyMute.isMuted("dm:u", until: 999_999, now: now), "expired")
check(!DescallNotifyMute.isMuted("dm:u", until: nil, now: now), "never muted")
eq(DescallNotifyMute.expiry(now: now), 1_003_600, "1 hour")
eq(DescallNotifyMute.expiredKeys(["notify.mute.a": 5, "notify.mute.b": 2_000_000, "other": 1], now: now), ["notify.mute.a"], "prune")

// Avatars
eq(DescallNotifyAvatar.initial("mert"), "M", "initial")
eq(DescallNotifyAvatar.initial("   işık"), "İ", "turkish dotted i")
eq(DescallNotifyAvatar.initial("🎮"), "?", "no letter")
eq(DescallNotifyAvatar.initial("Ayşe Yılmaz"), "AY", "two initials")
eq(DescallNotifyAvatar.initial("cinar.baskin"), "CB", "dot separated")
eq(DescallNotifyAvatar.initial("@zeynep"), "Z", "handle")
// Same as zlib.crc32 / src/lib/avatarFallback.js crc32.
eq(DescallNotifyAvatar.crc32("123456789"), 0xCBF4_3926, "crc32 check value")
eq(DescallNotifyAvatar.colorIndex("123456789"), Int(0xCBF4_3926 % 8), "palette index = crc32 % 8")
eq(DescallNotifyAvatar.palette.count, 8, "8 colours")
check(abs(DescallNotifyAvatar.palette[5].r - Double(0x17) / 255) < 0.0001, "teal = #177E96")
eq(DescallNotifyAvatar.colorIndex("u-mert"), DescallNotifyAvatar.colorIndex("u-mert"), "stable colour")
check((0..<DescallNotifyAvatar.palette.count).contains(DescallNotifyAvatar.colorIndex("x")), "colour in range")
eq(DescallNotifyAvatar.cacheName(for: URL(string: "https://a/b.png")!).count, 20, "cache name")
check(DescallNotifyAvatar.cacheName(for: URL(string: "https://a/b.png")!) != DescallNotifyAvatar.cacheName(for: URL(string: "https://a/c.png")!), "distinct cache names")

// Media
let u = URL(string: "https://x/y")!
eq(DescallNotifyMedia.fileExtension(mime: "image/jpeg", url: u, kind: "image"), "jpg", "jpeg")
eq(DescallNotifyMedia.fileExtension(mime: "image/webp", url: u, kind: "image"), nil, "webp unsupported")
eq(DescallNotifyMedia.fileExtension(mime: nil, url: URL(string: "https://x/y.PNG")!, kind: "image"), "png", "by extension")
eq(DescallNotifyMedia.fileExtension(mime: "video/mp4", url: u, kind: "video"), "mp4", "video")
check(DescallNotifyMedia.acceptable(byteCount: 10 * 1024 * 1024), "10 MB ok")
check(!DescallNotifyMedia.acceptable(byteCount: 10 * 1024 * 1024 + 1), "over 10 MB")
check(!DescallNotifyMedia.acceptable(byteCount: 0), "empty")

// Thread JSON
let thread = DescallNotifyThread(json: [
    "ok": true, "title": "Hafta Sonu Ekibi", "memberCount": 4,
    "messages": [
        ["id": "0", "fromName": "X", "text": "old", "mine": false],
        ["id": "1", "fromName": "Ayşe", "text": "Kim geliyor bu akşam?", "mine": false],
        ["id": "2", "fromName": "Sen", "text": "Ben varım", "mine": true],
        ["id": "3", "fromName": "Mert", "text": "Bu akşam 21:00", "mine": false],
    ],
])
let media = DescallNotifyThread(json: ["messages": [["id": "v", "text": "", "kind": "voice"], ["id": "p", "text": "Gün batımı", "kind": "image"]]])
eq(media?.messages.map { $0.display(tr) }, ["🎤 Sesli mesaj", "📷 Fotoğraf · Gün batımı"], "media labels")
eq(thread?.messages.map(\.id), ["1", "2", "3"], "last three")
eq(thread?.memberCount, 4, "member count")
check(DescallNotifyThread(json: ["ok": false, "error": "x"]) == nil, "error body")

// API base allowlist
check(DescallNotify.isAllowedApiBase("https://des-call.onrender.com"), "render")
check(DescallNotify.isAllowedApiBase("https://api.descall.com/"), "descall subdomain")
check(!DescallNotify.isAllowedApiBase("http://des-call.onrender.com"), "http refused")
check(!DescallNotify.isAllowedApiBase("https://evil.com"), "other host")
check(!DescallNotify.isAllowedApiBase("https://descall.com.evil.com"), "suffix trick")
check(!DescallNotify.isAllowedApiBase("https://des-call.onrender.com/x"), "path refused")
eq(DescallNotify.quickReactions, ["❤️", "😂", "👍", "😮", "😢"], "reactions")

if failures > 0 {
    print("notify logic selftest: \(failures) failure(s)")
    exit(1)
}
print("notify logic selftest ok")
