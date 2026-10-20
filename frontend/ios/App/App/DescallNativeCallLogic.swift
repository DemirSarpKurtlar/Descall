import Foundation

/// Pure helpers for the native CallKit answer path (DescallNativeCall).
/// Foundation only, no UIKit / WebRTC, so it compiles and is unit-tested on
/// Linux too (scripts/swift-selftest: NativeCallLogicSelftest.swift).
enum DescallNativeCallLogic {

    // MARK: - Socket.IO v4 / Engine.IO v4 framing (websocket transport)

    enum Packet: Equatable {
        /// Engine.IO open: "0{...}" (ping interval in ms).
        case open(pingIntervalMs: Int)
        /// Socket.IO CONNECT ack for the default namespace: "40{...}".
        case connected
        /// Socket.IO CONNECT_ERROR: "44{"message":...}".
        case connectError(String)
        /// Engine.IO ping "2" (we answer "3").
        case ping
        /// Socket.IO EVENT: 42[name, payload] or 42<ackId>[name, payload].
        case event(name: String, payloadJSON: String)
        /// Engine.IO close "1" or Socket.IO DISCONNECT "41".
        case disconnect
        case other
    }

    static func parse(_ text: String) -> Packet {
        guard let first = text.first else { return .other }
        switch first {
        case "0":
            let json = String(text.dropFirst())
            let obj = jsonObject(json) as? [String: Any]
            let ms = (obj?["pingInterval"] as? NSNumber)?.intValue ?? 25_000
            return .open(pingIntervalMs: ms)
        case "1":
            return .disconnect
        case "2":
            return .ping
        case "4":
            let rest = text.dropFirst()
            guard let kind = rest.first else { return .other }
            switch kind {
            case "0": return .connected
            case "1": return .disconnect
            case "4":
                let obj = jsonObject(String(rest.dropFirst())) as? [String: Any]
                return .connectError((obj?["message"] as? String) ?? "connect_error")
            case "2":
                var body = rest.dropFirst()
                // Optional ack id (digits) before the JSON array.
                while let c = body.first, c.isNumber { body = body.dropFirst() }
                guard let array = jsonObject(String(body)) as? [Any],
                      let name = array.first as? String else { return .other }
                let payload: Any = array.count > 1 ? array[1] : [String: Any]()
                return .event(name: name, payloadJSON: jsonString(payload) ?? "{}")
            default:
                return .other
            }
        default:
            return .other
        }
    }

    static func connectFrame(auth: [String: Any]) -> String {
        "40" + (jsonString(auth) ?? "{}")
    }

    static func eventFrame(_ name: String, _ payload: [String: Any]) -> String? {
        guard let body = jsonString([name, payload]) else { return nil }
        return "42" + body
    }

    /// https://host[:port] → wss://host[:port]/socket.io/?EIO=4&transport=websocket
    static func socketURL(apiBase: String) -> URL? {
        guard var comps = URLComponents(string: apiBase), let scheme = comps.scheme?.lowercased() else { return nil }
        comps.scheme = scheme == "http" ? "ws" : "wss"
        comps.path = "/socket.io/"
        comps.queryItems = [URLQueryItem(name: "EIO", value: "4"), URLQueryItem(name: "transport", value: "websocket")]
        return comps.url
    }

    static let productionApiBase = "https://des-call.onrender.com"

    /// API origin from the VoIP push statusUrl (same backend that rang us),
    /// else production. Only https origins are accepted.
    static func apiBase(statusUrl: String) -> String {
        guard let url = URL(string: statusUrl), url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty else {
            return productionApiBase
        }
        if let port = url.port { return "https://\(host):\(port)" }
        return "https://\(host)"
    }

    // MARK: - ICE servers (/api/webrtc/ice-config)

    struct IceServer: Equatable {
        var urls: [String]
        var username: String?
        var credential: String?
    }

    static let defaultIceServers = [
        IceServer(urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"], username: nil, credential: nil),
    ]

    static func iceServers(fromJSON data: Data) -> [IceServer] {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = obj["iceServers"] as? [Any] else { return [] }
        var out: [IceServer] = []
        for entry in list {
            guard let dict = entry as? [String: Any] else { continue }
            var urls: [String] = []
            if let one = dict["urls"] as? String { urls = [one] }
            if let many = dict["urls"] as? [Any] { urls = many.compactMap { $0 as? String } }
            urls = urls.filter { u in
                let l = u.lowercased()
                return l.hasPrefix("stun:") || l.hasPrefix("turn:") || l.hasPrefix("turns:")
            }
            if urls.isEmpty { continue }
            out.append(IceServer(urls: urls, username: dict["username"] as? String, credential: dict["credential"] as? String))
        }
        return out
    }

    /// How long a fetched ICE list may be reused: half the server's ttlSeconds, capped at `fallback`,
    /// never below 60 s. Without a ttl (old server / error) the fallback applies.
    static func iceCacheValidity(fromJSON data: Data?, fallback: TimeInterval) -> TimeInterval {
        guard let data = data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ttl = (obj["ttlSeconds"] as? NSNumber)?.doubleValue, ttl > 0 else { return fallback }
        return max(60, min(fallback, ttl / 2))
    }

    static func iceCacheUsable(cachedAt: Date, validFor: TimeInterval, now: Date) -> Bool {
        now.timeIntervalSince(cachedAt) < validFor
    }

    static func hasTurn(_ servers: [IceServer]) -> Bool {
        servers.contains { $0.urls.contains { $0.lowercased().hasPrefix("turn") } }
    }

    // MARK: - Opus (same voice profile as src/lib/voiceProfile.js opusFmtp)

    /// Mono fullband voice: in-band FEC on, DTX on, 48 kb/s average cap, VBR, 20 ms ptime (10 ms min), 48 kHz playback/capture.
    static let voiceOpusParams: [(String, String)] = [
        ("minptime", "10"),
        ("ptime", "20"),
        ("maxplaybackrate", "48000"),
        ("sprop-maxcapturerate", "48000"),
        ("useinbandfec", "1"),
        ("usedtx", "1"),
        ("stereo", "0"),
        ("sprop-stereo", "0"),
        ("maxaveragebitrate", "48000"),
        ("cbr", "0"),
    ]

    static func tuneOpusSdp(_ sdp: String) -> String {
        let nl = sdp.contains("\r\n") ? "\r\n" : "\n"
        let lines = sdp.components(separatedBy: nl)
        var opusPts = Set<String>()
        for line in lines {
            if let pt = payloadType(line, prefix: "a=rtpmap:"), line.lowercased().contains("opus/48000") { opusPts.insert(pt) }
        }
        if opusPts.isEmpty { return sdp }
        var out: [String] = []
        var hasFmtp = Set<String>()
        for (index, line) in lines.enumerated() {
            if let pt = payloadType(line, prefix: "a=fmtp:"), opusPts.contains(pt) {
                let existing = line.split(separator: " ", maxSplits: 1).dropFirst().first.map(String.init) ?? ""
                out.append("a=fmtp:\(pt) \(mergeFmtp(existing))")
                hasFmtp.insert(pt)
                continue
            }
            out.append(line)
            if let pt = payloadType(line, prefix: "a=rtpmap:"), opusPts.contains(pt), !hasFmtp.contains(pt) {
                let later = lines[(index + 1)...].contains { $0.hasPrefix("a=fmtp:\(pt) ") }
                if !later {
                    out.append("a=fmtp:\(pt) \(mergeFmtp(""))")
                    hasFmtp.insert(pt)
                }
            }
        }
        return out.joined(separator: nl)
    }

    private static func payloadType(_ line: String, prefix: String) -> String? {
        guard line.hasPrefix(prefix) else { return nil }
        let rest = line.dropFirst(prefix.count)
        let digits = rest.prefix { $0.isNumber }
        return digits.isEmpty ? nil : String(digits)
    }

    static func mergeFmtp(_ existing: String) -> String {
        var keys: [String] = []
        var map: [String: String] = [:]
        for part in existing.split(separator: ";") {
            let kv = part.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            guard kv.count == 2, !kv[0].isEmpty else { continue }
            if map[kv[0]] == nil { keys.append(kv[0]) }
            map[kv[0]] = kv[1]
        }
        for (k, v) in voiceOpusParams {
            if map[k] == nil { keys.append(k) }
            map[k] = v
        }
        return keys.map { "\($0)=\(map[$0] ?? "")" }.joined(separator: ";")
    }

    // MARK: - Setup timeline (time-to-audio)

    /// Milestones since the VoIP push, in ms. Non-personal; logged and kept
    /// for diagnostics (UserDefaults "descall.nativeCallMetrics").
    struct Timeline {
        private(set) var start: TimeInterval
        private(set) var marks: [String: Int] = [:]
        private(set) var order: [String] = []

        init(start: TimeInterval) { self.start = start }

        mutating func mark(_ name: String, at now: TimeInterval) {
            guard marks[name] == nil else { return }
            marks[name] = max(0, Int(((now - start) * 1000).rounded()))
            order.append(name)
        }

        func ms(_ name: String) -> Int? { marks[name] }

        /// Answer → first remote audio packet: the wait the user hears.
        var answerToAudioMs: Int? {
            guard let a = marks["answered"], let b = marks["firstAudio"] else { return nil }
            return max(0, b - a)
        }

        var summary: String {
            order.map { "\($0)=\(marks[$0] ?? 0)" }.joined(separator: " ")
        }

        var dictionary: [String: Any] {
            var d: [String: Any] = [:]
            for (k, v) in marks { d[k] = v }
            if let x = answerToAudioMs { d["answerToAudioMs"] = x }
            return d
        }
    }

    // MARK: - Signaling payloads

    static func candidatePayload(sdp: String, sdpMid: String?, sdpMLineIndex: Int32) -> [String: Any] {
        var c: [String: Any] = ["candidate": sdp, "sdpMLineIndex": Int(sdpMLineIndex)]
        c["sdpMid"] = sdpMid ?? NSNull()
        return c
    }

    struct RemoteCandidate: Equatable {
        var sdp: String
        var sdpMid: String?
        var sdpMLineIndex: Int32
    }

    static func remoteCandidate(_ value: Any?) -> RemoteCandidate? {
        guard let dict = value as? [String: Any], let sdp = dict["candidate"] as? String, !sdp.isEmpty else { return nil }
        let mid = dict["sdpMid"] as? String
        let index = (dict["sdpMLineIndex"] as? NSNumber)?.int32Value ?? 0
        return RemoteCandidate(sdp: sdp, sdpMid: mid, sdpMLineIndex: index)
    }

    /// {type, sdp} offer from call:offer.
    static func offerSdp(_ value: Any?) -> String? {
        guard let dict = value as? [String: Any], let sdp = dict["sdp"] as? String, !sdp.isEmpty else { return nil }
        let type = (dict["type"] as? String)?.lowercased() ?? "offer"
        return type == "offer" ? sdp : nil
    }

    // MARK: - JSON

    static func jsonObject(_ text: String) -> Any? {
        guard let data = text.data(using: .utf8), !data.isEmpty else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }

    static func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Reconnect backoff

    static func reconnectDelay(attempt: Int) -> TimeInterval {
        let steps: [TimeInterval] = [0.5, 1, 2, 4, 8]
        return steps[min(max(0, attempt), steps.count - 1)]
    }
}
