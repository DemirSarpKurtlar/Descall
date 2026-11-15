import Foundation

// iOS whole-screen broadcast: selftest for App/App/DescallScreenBroadcastLogic.swift.
// swiftc -o /tmp/bl App/App/DescallScreenBroadcastLogic.swift selftest/broadcast/main.swift && /tmp/bl

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

typealias L = DescallScreenBroadcastLogic

// Request validation
switch L.parseRequest(url: " wss://lk.example.com ", token: "jwt", showPicker: nil, maxHeight: nil, fps: nil) {
case let .success(r):
    eq(r.url, "wss://lk.example.com", "url trimmed")
    eq(r.token, "jwt", "token")
    eq(r.showPicker, true, "picker by default")
    eq(r.maxHeight, 1080, "default 1080")
    eq(r.fps, 15, "default 15 fps")
case .failure:
    check(false, "valid request parses")
}
switch L.parseRequest(url: "wss://lk.example.com", token: "t", showPicker: false, maxHeight: 4000, fps: 120) {
case let .success(r):
    eq(r.maxHeight, 1440, "height clamped")
    eq(r.fps, 30, "fps clamped")
    eq(r.showPicker, false, "showPicker false kept")
case .failure:
    check(false, "clamped request parses")
}
func failure(_ url: String?, _ token: String?) -> String? {
    if case let .failure(e) = L.parseRequest(url: url, token: token, showPicker: nil, maxHeight: nil, fps: nil) { return e.rawValue }
    return nil
}
eq(failure(nil, "t"), "missing-url", "missing url")
eq(failure("https://lk.example.com", "t"), "bad-url", "https is not a LiveKit signal url")
eq(failure("wss://", "t"), "bad-url", "no host")
eq(failure("wss://lk.example.com", "  "), "missing-token", "empty token")

// Capture box and bitrate
let box = L.captureBox(maxHeight: 1080)
eq(box.width, 1920, "1080 box width")
eq(box.height, 1080, "1080 box height")
eq(L.captureBox(maxHeight: 720).width, 1280, "720 box")
eq(L.captureBox(maxHeight: 100).height, 540, "box clamped")
eq(L.maxBitrate(maxHeight: 1080, fps: 15), 2_500_000, "1080p15 = LiveKit preset")
eq(L.maxBitrate(maxHeight: 720, fps: 15), 1_500_000, "720p15 = LiveKit preset")
check(L.maxBitrate(maxHeight: 1080, fps: 30) > 2_500_000, "more fps, more bits")

// Broadcast state changes
eq(L.phaseAfterBroadcastChange(current: .idle, isBroadcasting: true, roomConnected: false), .orphan, "Control Center start without a session")
eq(L.phaseAfterBroadcastChange(current: .waiting, isBroadcasting: true, roomConnected: true), .live, "picker start publishes")
eq(L.phaseAfterBroadcastChange(current: .connecting, isBroadcasting: true, roomConnected: false), .connecting, "publish after connect")
eq(L.phaseAfterBroadcastChange(current: .orphan, isBroadcasting: true, roomConnected: true), .live, "orphan with a room")
eq(L.phaseAfterBroadcastChange(current: .live, isBroadcasting: false, roomConnected: true), .ended, "stopped from the status pill")
eq(L.phaseAfterBroadcastChange(current: .stopping, isBroadcasting: false, roomConnected: true), .ended, "stop finished")
eq(L.phaseAfterBroadcastChange(current: .waiting, isBroadcasting: false, roomConnected: true), .waiting, "initial false keeps waiting")
eq(L.phaseAfterBroadcastChange(current: .idle, isBroadcasting: false, roomConnected: false), .idle, "startup value")

// Events
let payload = L.eventPayload(phase: .live, broadcasting: true, reason: nil, at: Date(timeIntervalSince1970: 1.5))
eq(payload["phase"] as? String, "live", "phase")
eq(payload["broadcasting"] as? Bool, true, "broadcasting")
eq(payload["at"] as? Int, 1500, "ms timestamp")
check(payload["reason"] == nil, "no empty reason")
eq(L.eventPayload(phase: .ended, broadcasting: false, reason: "picker-timeout")["reason"] as? String, "picker-timeout", "reason")
eq(L.Phase.orphan.rawValue, "orphan", "raw values are the JS names")

// Picker anchor
let a = L.anchorRect(x: 300, y: 700, width: 44, height: 44, hostWidth: 390, hostHeight: 844)
eq(a.x, 300, "anchor x")
eq(a.y, 700, "anchor y")
let clamped = L.anchorRect(x: 380, y: 900, width: 44, height: 44, hostWidth: 390, hostHeight: 844)
eq(clamped.x, 346, "kept inside width")
eq(clamped.y, 800, "kept inside height")
let fallback = L.anchorRect(x: nil, y: nil, width: nil, height: nil, hostWidth: 1024, hostHeight: 1366)
eq(fallback.x, 490, "fallback centered")
eq(fallback.y, 1278, "fallback near the bottom")
let zero = L.anchorRect(x: 10, y: 10, width: 0, height: 10, hostWidth: 100, hostHeight: 100)
eq(zero.width, 44, "zero size uses the fallback")

if failures > 0 {
    print("broadcast logic selftest: \(failures) failure(s)")
    exit(1)
}
print("broadcast logic selftest: ok")
