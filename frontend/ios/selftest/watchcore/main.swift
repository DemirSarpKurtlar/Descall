import Foundation

// 3.7.33: watch stability core (App/DescallWatch/WatchCore.swift). Run:
//   swiftc -o /tmp/wc App/DescallWatch/WatchCore.swift selftest/watchcore/main.swift && /tmp/wc
var failures = 0
func check(_ ok: Bool, _ name: String) {
    if !ok { failures += 1; print("FAIL: \(name)") }
}

// Retry policy: reads only, transport failures and gateway errors only, at most 3 attempts.
typealias R = WatchRetry
check(R.isRetryable(.unreachable, method: "GET"), "unreachable read retried")
check(R.isRetryable(.timeout, method: "get"), "timeout read retried")
check(R.isRetryable(.http(503), method: "GET"), "503 read retried")
check(!R.isRetryable(.http(500), method: "GET"), "500 not retried")
check(!R.isRetryable(.http(429), method: "GET"), "429 not retried")
check(!R.isRetryable(.noSession, method: "GET"), "signed out not retried")
check(!R.isRetryable(.unreachable, method: "POST"), "writes never retried")
check(!R.isRetryable(.timeout, method: "PATCH"), "writes never retried (timeout)")
check(R.delay(beforeAttempt: 0) == 0 && R.delay(beforeAttempt: 1) == 0.6 && R.delay(beforeAttempt: 2) == 1.8, "backoff")
check(R.delay(beforeAttempt: 3) == nil, "three attempts max")
check(R.requestTimeout > 15, "watch timeout longer than the bridge HTTP timeout")

// Exactly-once resume, also from many threads at the same time.
var hits = 0
let hitLock = NSLock()
let once = WatchOnce<Int> { _ in hitLock.lock(); hits += 1; hitLock.unlock() }
DispatchQueue.concurrentPerform(iterations: 200) { i in once.fire(i) }
check(hits == 1, "fires once under contention")
check(!once.fire(1), "later fire loses")

// Freshness buckets.
let t0 = Date(timeIntervalSince1970: 1_000_000)
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(59)) == .live, "live")
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(61)) == .minutes(1), "1 min")
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(3599)) == .minutes(59), "59 min")
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(7200)) == .hours(2), "2 h")
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(86400 * 3)) == .days(3), "3 d")
check(WatchFreshness.of(t0, now: t0.addingTimeInterval(-30)) == .live, "clock skew is live")

// Lossy lists: one bad row does not blank the screen.
struct Row: Decodable { var id: String; var n: Int }
struct Box: Decodable {
    var rows: [Row]
    var missing: [Row]
    enum CodingKeys: String, CodingKey { case rows, missing }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        rows = c.lossy(.rows)
        missing = c.lossy(.missing)
    }
}
let json = #"{"rows":[{"id":"a","n":1},{"id":"b","n":"x"},{"n":3},{"id":"d","n":4},null,7]}"#
if let box = try? JSONDecoder().decode(Box.self, from: Data(json.utf8)) {
    check(box.rows.map(\.id) == ["a", "d"], "bad rows skipped")
    check(box.missing.isEmpty, "missing list is empty")
} else {
    check(false, "lossy box decodes")
}
if let box = try? JSONDecoder().decode(Box.self, from: Data(#"{"rows":null}"#.utf8)) {
    check(box.rows.isEmpty, "null list is empty")
} else {
    check(false, "null list decodes")
}

// Offline cache: only the watch's own screens, never admin, cleared on sign-out.
let suite = "descall.selftest.\(UUID().uuidString)"
let d = UserDefaults(suiteName: suite)!
let body = Data(#"{"ok":true}"#.utf8)
WatchCache.save(body, path: "/api/watch/home", to: d, now: t0)
WatchCache.save(body, path: "/api/admin/overview", to: d, now: t0)
WatchCache.save(Data(count: 70 * 1024), path: "/api/watch/friends", to: d, now: t0)
check(WatchCache.load("/api/watch/home", from: d) == WatchCacheEntry(data: body, savedAt: t0), "home cached")
check(WatchCache.load("/api/admin/overview", from: d) == nil, "admin never cached")
check(WatchCache.load("/api/watch/friends", from: d) == nil, "oversized reply not cached")
check(!WatchCache.isCacheable("/api/watch/thread?conv=dm:x"), "threads not cached")
WatchCache.clear(d)
check(WatchCache.load("/api/watch/home", from: d) == nil, "cleared")
d.removePersistentDomain(forName: suite)

check(WatchDuration.clock(125) == "2:05" && WatchDuration.clock(3725) == "1:02:05" && WatchDuration.clock(-4) == "0:00", "call length")

if failures > 0 { print("\(failures) failure(s)"); exit(1) }
print("watch core selftest ok")
