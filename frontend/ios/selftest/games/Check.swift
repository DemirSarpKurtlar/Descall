import Foundation

// Shared helpers for the games selftest (main.swift runs every suite).
var failures = 0
var checks = 0

func check(_ ok: Bool, _ what: @autoclosure () -> String) {
    checks += 1
    if !ok {
        failures += 1
        print("FAIL - \(what())")
    }
}

func eq<T: Equatable>(_ a: T, _ b: T, _ what: String) {
    check(a == b, "\(what): \(a) != \(b)")
}
