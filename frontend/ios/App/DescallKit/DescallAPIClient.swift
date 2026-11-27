import Foundation

/// Tiny Descall API client for native surfaces (App Intents, widgets, Live Activity,
/// share extension). Bearer session from DescallSessionStore, short timeouts, one retry
/// for a cold server, lenient JSON. Errors are DescallAPIError so every caller can
/// explain them the same way. Cancellation follows the calling Task.
public final class DescallAPIClient: @unchecked Sendable {
    public let session: DescallSession
    private let urlSession: URLSession
    private let clientName: String
    private let retries: Int

    /// - Parameters:
    ///   - clientName: X-Descall-Client header ("ios-intents", "ios-widget", "ios-share"...).
    ///   - retries: extra attempts after a timeout / network / 5xx failure (GET only).
    public init(session: DescallSession, urlSession: URLSession = DescallAPIClient.makeURLSession(),
                clientName: String = "ios-intents", retries: Int = 1) {
        self.session = session
        self.urlSession = urlSession
        self.clientName = clientName
        self.retries = max(0, retries)
    }

    /// Client for the signed-in user of this device, or `.signedOut`.
    public static func current(clientName: String = "ios-intents") throws -> DescallAPIClient {
        guard let session = DescallSessionStore.load(), session.isUsable else { throw DescallAPIError.signedOut }
        return DescallAPIClient(session: session, clientName: clientName)
    }

    public static func makeURLSession(requestTimeout: TimeInterval = 10, resourceTimeout: TimeInterval = 15) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = requestTimeout
        config.timeoutIntervalForResource = resourceTimeout
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }

    // MARK: Endpoints

    public func summary() async throws -> DescallSummary {
        try await get("/api/native/summary")
    }

    /// Every accepted friend with presence; `query` filters by name, `ids` keeps only those.
    public func friends(matching query: String? = nil, ids: [String] = []) async throws -> [DescallFriend] {
        var items: [URLQueryItem] = []
        if let q = query?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            items.append(URLQueryItem(name: "q", value: String(q.prefix(64))))
        }
        if !ids.isEmpty { items.append(URLQueryItem(name: "ids", value: ids.prefix(50).joined(separator: ","))) }
        let list: DescallFriendList = try await get("/api/native/friends", query: items)
        return list.friends
    }

    public func voiceRooms(matching query: String? = nil, occupiedOnly: Bool = false) async throws -> [DescallVoiceRoom] {
        var items: [URLQueryItem] = []
        if let q = query?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            items.append(URLQueryItem(name: "q", value: String(q.prefix(64))))
        }
        if occupiedOnly { items.append(URLQueryItem(name: "occupied", value: "1")) }
        let list: DescallVoiceRoomList = try await get("/api/native/voice", query: items)
        return list.rooms
    }

    public func destinations(matching query: String? = nil) async throws -> [DescallDestination] {
        var items: [URLQueryItem] = []
        if let q = query?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            items.append(URLQueryItem(name: "q", value: String(q.prefix(64))))
        }
        let list: DescallDestinationList = try await get("/api/native/destinations", query: items)
        return list.destinations
    }

    /// Send a text message (same checks, rate limit and fan-out as the phone app).
    @discardableResult
    public func sendMessage(conv: String, text: String) async throws -> DescallSendResult {
        guard DescallMessageRules.isValidConv(conv) else { throw DescallAPIError.badRequest("bad_conv") }
        guard let body = DescallMessageRules.cleaned(text) else { throw DescallAPIError.badRequest("bad_text") }
        return try await post("/api/watch/send", json: ["conv": conv, "text": body])
    }

    /// "El salla": the friend gets a push and a socket event (5 per friend and 20 per day,
    /// 60 s apart: .rateLimited past that). Never retried automatically.
    @discardableResult
    public func wave(to friendId: String, source: String = "widget") async throws -> DescallWaveResult {
        guard (1...64).contains(friendId.count),
              friendId.unicodeScalars.allSatisfy({ ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" }) else {
            throw DescallAPIError.badRequest("bad_target")
        }
        return try await post("/api/native/wave", json: ["to": friendId, "source": source])
    }

    /// Summary with the widget extras (activity line, message bubbles).
    public func widgetSummary() async throws -> DescallSummary {
        try await get("/api/native/summary", query: [URLQueryItem(name: "activity", value: "1"), URLQueryItem(name: "previews", value: "1")])
    }

    /// Friends with the activity line; `ids` keeps only those (favourites).
    public func widgetFriends(ids: [String] = []) async throws -> [DescallFriend] {
        var items = [URLQueryItem(name: "activity", value: "1")]
        if !ids.isEmpty { items.append(URLQueryItem(name: "ids", value: ids.prefix(50).joined(separator: ","))) }
        let list: DescallFriendList = try await get("/api/native/friends", query: items)
        return list.friends
    }

    @discardableResult
    public func setStatus(_ status: DescallStatusChoice) async throws -> DescallStatusResult {
        try await post("/api/watch/status", json: ["status": status.rawValue])
    }

    // MARK: Transport

    func request(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard var comps = URLComponents(string: DescallAPIBase.validated(session.apiBase) + path) else {
            throw DescallAPIError.badRequest("bad_path")
        }
        if !query.isEmpty { comps.queryItems = query }
        guard let url = comps.url else { throw DescallAPIError.badRequest("bad_path") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(clientName, forHTTPHeaderField: "X-Descall-Client")
        if let locale = session.locale, !locale.isEmpty { req.setValue(locale, forHTTPHeaderField: "Accept-Language") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        return req
    }

    public func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let req = try request(path, query: query)
        var attempt = 0
        while true {
            do {
                return try await perform(req)
            } catch let error as DescallAPIError {
                guard error.isRetryable, attempt < retries else { throw error }
                attempt += 1
                try? await Task.sleep(nanoseconds: 600_000_000)
                if Task.isCancelled { throw DescallAPIError.cancelled }
            }
        }
    }

    /// Writes are never retried automatically (a timed-out send may have gone through).
    public func post<T: Decodable>(_ path: String, json: [String: String]) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: json, options: [])
        return try await perform(request(path, method: "POST", body: body))
    }

    func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        if Task.isCancelled { throw DescallAPIError.cancelled }
        let result: (Data, URLResponse)
        do {
            result = try await urlSession.data(for: req)
        } catch {
            throw DescallAPIError.from(transport: error)
        }
        let (data, response) = result
        guard let http = response as? HTTPURLResponse else { throw DescallAPIError.network }
        if let failure = DescallAPIError.from(status: http.statusCode, body: data) { throw failure }
        do {
            return try DescallJSON.decoder.decode(T.self, from: data)
        } catch {
            throw DescallAPIError.decoding
        }
    }
}
