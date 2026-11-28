import Foundation

// WKWebView media capture policy: selftest for App/App/DescallMediaCaptureLogic.swift.
// swiftc -o /tmp/mc App/App/DescallMediaCaptureLogic.swift selftest/mediacapture/main.swift && /tmp/mc

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

typealias L = DescallMediaCaptureLogic
typealias O = DescallMediaCaptureLogic.Origin

// The app origin comes from Capacitor's local URL (ios.scheme "Descall", hostname "localhost").
let app = L.appOrigin(localURL: URL(string: "Descall://localhost"))
eq(app, O(scheme: "descall", host: "localhost", port: 0), "scheme and host are lowercased, default port is 0")
eq(L.appOrigin(localURL: nil), O(scheme: "capacitor", host: "localhost", port: nil), "no config: Capacitor's default origin")
eq(L.appOrigin(localURL: URL(string: "file:///x")), O(scheme: "capacitor", host: "localhost", port: nil), "no host: fallback")

// WKSecurityOrigin reports a lowercase protocol and port 0 for the default port.
let page = O(scheme: "descall", host: "localhost", port: 0)
eq(L.decision(request: page, frame: page, app: app), .grant, "the app's own page: granted, never a second prompt")
eq(L.decision(request: O(scheme: "Descall", host: "LOCALHOST", port: nil), frame: nil, app: app), .grant, "case-insensitive; frame unknown")

// Everything else is denied.
let site = O(scheme: "https", host: "descall.com", port: 0)
eq(L.decision(request: site, frame: site, app: app), .deny, "a remote page in the web view")
eq(L.decision(request: page, frame: O(scheme: "https", host: "www.youtube.com", port: 0), app: app), .deny, "a third-party iframe inside the app")
eq(L.decision(request: O(scheme: "descall", host: "localhost", port: 8080), frame: nil, app: app), .deny, "another port")
eq(L.decision(request: O(scheme: "http", host: "localhost", port: 0), frame: nil, app: app), .deny, "another scheme")
eq(L.decision(request: O(scheme: "", host: "", port: 0), frame: nil, app: app), .deny, "opaque origin")
eq(L.decision(request: page, frame: page, app: O(scheme: "", host: "", port: 0)), .deny, "no app origin: deny")

// Live reload (server.url) adds that server as a second app origin; nothing else.
let dev = L.appOrigins(localURL: URL(string: "Descall://localhost"), serverURL: URL(string: "http://192.168.1.20:5173"))
eq(dev.count, 2, "bundled page + dev server")
eq(L.decision(request: O(scheme: "http", host: "192.168.1.20", port: 5173), frame: nil, allowed: dev), .grant, "dev server page")
eq(L.decision(request: site, frame: nil, allowed: dev), .deny, "still no other origin")
eq(L.appOrigins(localURL: URL(string: "Descall://localhost"), serverURL: URL(string: "Descall://localhost")).count, 1, "no server.url: one origin")
eq(L.appOrigins(localURL: URL(string: "Descall://localhost"), serverURL: nil).count, 1, "no server URL at all")
eq(L.decision(request: page, frame: O(scheme: "http", host: "192.168.1.20", port: 5173), allowed: dev), .deny, "a frame must match the page asking")

if failures > 0 {
    print("mediacapture selftest: \(failures) failure(s)")
    exit(1)
}
print("mediacapture selftest: ok")
