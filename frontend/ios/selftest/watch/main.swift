// swiftc App/WatchShared/DescallWatchProtocol.swift selftest/watch/main.swift
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String) {
    if ok { print("ok - \(what)") } else { failures += 1; print("FAIL - \(what)") }
}

typealias P = DescallWatchProtocol

check(P.isAllowed(method: "GET", path: "/api/watch/home"), "watch home allowed")
check(P.isAllowed(method: "GET", path: "/api/watch/thread?conv=dm:1f2e-aa"), "query with conv allowed")
check(P.isAllowed(method: "POST", path: "/api/admin/step-up"), "admin step-up allowed")
check(P.isAllowed(method: "PATCH", path: "/api/admin/reports/abc"), "admin patch allowed")
check(!P.isAllowed(method: "GET", path: "/auth/me"), "auth routes blocked")
check(!P.isAllowed(method: "POST", path: "/api/me/data-export"), "data export blocked")
check(!P.isAllowed(method: "GET", path: "/api/watch/../me/data-export"), "dot-dot blocked")
check(!P.isAllowed(method: "GET", path: "/api/watch//x"), "double slash blocked")
check(!P.isAllowed(method: "GET", path: "https://evil.example/api/watch/home"), "absolute URL blocked")
check(!P.isAllowed(method: "GET", path: "/api/watch/home#x"), "fragment blocked")
check(!P.isAllowed(method: "GET", path: "/api/watch/home x"), "space blocked")
check(!P.isAllowed(method: "TRACE", path: "/api/watch/home"), "unknown method blocked")
check(!P.isAllowed(method: "GET", path: "/api/watch/" + String(repeating: "a", count: 400)), "long path blocked")

check(P.validate(P.request(id: "1", method: "GET", path: "/api/watch/home")) == nil, "valid request passes")
check(P.validate(P.request(id: "1", method: "GET", path: "/auth/sessions")) == P.Failure.notAllowed, "foreign path = not_allowed")
var old = P.request(id: "1", method: "GET", path: "/api/watch/home"); old[P.Key.version] = 0
check(P.validate(old) == P.Failure.badRequest, "wrong version = bad_request")
let big = String(repeating: "x", count: P.maxBodyBytes + 1)
check(P.validate(P.request(id: "1", method: "POST", path: "/api/watch/send", body: big)) == P.Failure.badRequest, "oversized body rejected")
check(P.validate(P.request(id: "1", method: "POST", path: "/api/admin/x", stepUp: "abc.DEF-123_x")) == nil, "step-up token passes")
check(P.validate(P.request(id: "1", method: "POST", path: "/api/admin/x", stepUp: "a\r\nX-Evil: 1")) == P.Failure.badRequest, "header injection in step-up rejected")

if failures > 0 { print("\(failures) failure(s)"); exit(1) }
print("watch protocol selftest ok")
