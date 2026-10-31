import Foundation
import SwiftUI

@MainActor
final class WatchStore: ObservableObject {
    @Published var home: WatchHome?
    @Published var homeError: WatchError?
    @Published var friends: WatchFriends?
    @Published var friendsError: WatchError?

    let transport: WatchTransport

    init(transport: WatchTransport) {
        self.transport = transport
    }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, as type: T.Type, stepUp: String? = nil) async throws -> T {
        let data = try await transport.send(method: "GET", path: path, body: nil, stepUp: stepUp)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw WatchError.decode
        }
    }

    @discardableResult
    func send(_ method: String, _ path: String, _ body: [String: Any] = [:], stepUp: String? = nil) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await transport.send(method: method, path: path, body: data, stepUp: stepUp)
    }

    static func query(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: ":-_."))) ?? value
    }

    // MARK: Screens

    func loadHome() async {
        do {
            home = try await get("/api/watch/home", as: WatchHome.self)
            homeError = nil
        } catch let e as WatchError {
            homeError = e
        } catch {
            homeError = .network
        }
    }

    func loadFriends() async {
        do {
            friends = try await get("/api/watch/friends", as: WatchFriends.self)
            friendsError = nil
        } catch let e as WatchError {
            friendsError = e
        } catch {
            friendsError = .network
        }
    }

    func thread(_ conv: String) async throws -> WatchThread {
        try await get("/api/watch/thread?conv=\(Self.query(conv))", as: WatchThread.self)
    }

    func sendMessage(conv: String, text: String) async throws {
        try await send("POST", "/api/watch/send", ["conv": conv, "text": text])
        Task { await loadHome() }
    }

    func markRead(_ conv: String) async {
        _ = try? await send("POST", "/api/watch/read", ["conv": conv])
    }

    func setStatus(_ status: String) async throws {
        try await send("POST", "/api/watch/status", ["status": status])
        home?.me.status = status
    }
}
