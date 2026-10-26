import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok { failures += 1; print("FAIL line \(line): \(what)") }
}

// parse
check(DescallToast.parse([:]) == nil, "no title → nothing")
check(DescallToast.parse(["title": "   "]) == nil, "blank title → nothing")
let a = DescallToast.parse(["title": "Mert çevrimiçi", "sub": "Az önce bağlandı", "name": "Mert", "seed": "demo-mert4", "online": true, "action": "Mesaj"])!
check(a.title == "Mert çevrimiçi" && a.sub == "Az önce bağlandı", "copy")
check(a.letter == "M", "letter from name, not the title")
check(a.colorHex == "#177E96", "app palette by seed (teal)")
check(a.online && a.action == "Mesaj", "online + action")
check(a.duration == 3, "default 3 s")
check(a.avatar == .none, "no avatar")
check(!a.id.isEmpty, "generated id")
check(DescallToast.parse(["title": "x", "duration": 200])!.duration == 1.5, "min duration")
check(DescallToast.parse(["title": "x", "duration": 60000])!.duration == 10, "max duration")
check(DescallToast.parse(["title": "x", "action": ""])!.action == nil, "empty action hidden")
check(DescallToast.parse(["title": "x", "color": "#1fa9c9"])!.colorHex == "#1FA9C9", "explicit colour")
check(DescallToast.parse(["title": "x", "color": "red"])!.colorHex.count == 7, "bad colour → palette")
let long = String(repeating: "ş", count: 200)
check(DescallToast.parse(["title": long])!.title.count == DescallToast.maxTitle, "title clipped")
check(DescallToast.parse(["title": "a\nb"])!.title == "a b", "one line")

// avatar sources
check(DescallToast.avatarSource("https://cdn.descall.com/a.png") == .remote(URL(string: "https://cdn.descall.com/a.png")!), "https ok")
check(DescallToast.avatarSource("http://cdn.descall.com/a.png") == .none, "http refused")
check(DescallToast.avatarSource("file:///etc/passwd") == .none, "file refused")
check(DescallToast.avatarSource("javascript:alert(1)") == .none, "js refused")
let png = Data([0x89, 0x50, 0x4E, 0x47]).base64EncodedString()
if case .inline(let d) = DescallToast.avatarSource("data:image/png;base64,\(png)") { check(d.count == 4, "data decoded") } else { check(false, "data png") }
check(DescallToast.avatarSource("data:text/html;base64,\(png)") == .none, "non-image data refused")
let big = Data(count: DescallToast.maxAvatarBytes + 10).base64EncodedString()
check(DescallToast.avatarSource("data:image/png;base64,\(big)") == .none, "too large refused")

// gestures
check(DescallToast.release(translationY: -30, velocityY: 0, expanded: false) == .dismiss, "swipe up")
check(DescallToast.release(translationY: -5, velocityY: -600, expanded: false) == .dismiss, "flick up")
check(DescallToast.release(translationY: 40, velocityY: 0, expanded: false) == .expand, "pull down")
check(DescallToast.release(translationY: 3, velocityY: 700, expanded: false) == .expand, "flick down")
check(DescallToast.release(translationY: 40, velocityY: 0, expanded: true) == .settle, "already expanded")
check(DescallToast.release(translationY: -10, velocityY: -100, expanded: false) == .settle, "small move settles")
check(DescallToast.dragOffset(-50) == -50, "up 1:1")
check(DescallToast.dragOffset(1000) < 44 && DescallToast.dragOffset(20) > 0 && DescallToast.dragOffset(20) < 20, "down rubber band")
check(DescallToast.throwDuration(distance: 120, velocityY: -3000) == 0.12, "fast throw")
check(DescallToast.throwDuration(distance: 120, velocityY: 0) <= 0.32, "slow throw capped")

// spring 1.0 / 0.35
check(abs(DescallToast.springStiffness - 322.27) < 0.1, "stiffness")
check(abs(DescallToast.springDamping - 35.90) < 0.05, "critically damped")

if failures > 0 { print("toast logic selftest FAILED (\(failures))"); exit(1) }
print("toast logic selftest ok")
