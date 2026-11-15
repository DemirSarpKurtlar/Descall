import Foundation

/// Pure parts of the iOS whole-screen broadcast (docs/ios-screen-share.md):
/// request validation, capture size, the session phase machine and the event
/// payloads sent to the web layer. Foundation only, so `swiftc` can run
/// selftest/broadcast/main.swift on CI without the iOS SDK.
enum DescallScreenBroadcastLogic {
    /// Phases reported to JS as `state` events (`phase`), mapped to the dock
    /// state in src/lib/iosScreenBroadcastModel.js.
    enum Phase: String, Equatable {
        /// No companion room, no broadcast.
        case idle = "idle"
        /// Companion room connecting.
        case connecting = "connecting"
        /// Room connected, the system picker is up, waiting for "Start Broadcast".
        case waiting = "waiting"
        /// The broadcast runs and its screen track is published.
        case live = "live"
        /// Stop requested, waiting for the extension to finish.
        case stopping = "stopping"
        /// The session ended (reason says why), back to idle.
        case ended = "ended"
        /// The session failed (reason says why), back to idle.
        case error = "error"
        /// A broadcast started outside the app (Control Center) and no session
        /// exists yet: JS mints a token and calls start(showPicker: false).
        case orphan = "orphan"
    }

    /// The picker cannot report a dismissal: an unanswered session ends after this.
    static let pickerTimeout: TimeInterval = 75
    /// A Control Center broadcast with no credentials from JS is stopped after this.
    static let orphanTimeout: TimeInterval = 20

    /// LiveKit's broadcast guidance: screen content at 15 fps, 1080p max side.
    static let defaultMaxHeight = 1080
    static let defaultFps = 15

    struct Request: Equatable {
        let url: String
        let token: String
        let showPicker: Bool
        let maxHeight: Int
        let fps: Int
    }

    enum RequestError: String, Error {
        case missingUrl = "missing-url"
        case badUrl = "bad-url"
        case missingToken = "missing-token"
    }

    /// Validates the JS `start` options. Only ws(s) LiveKit URLs, a non-empty
    /// token, size and frame rate clamped to what the extension handoff can carry.
    static func parseRequest(url: String?, token: String?, showPicker: Bool?, maxHeight: Int?, fps: Int?) -> Result<Request, RequestError> {
        let trimmedUrl = (url ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedUrl.isEmpty else { return .failure(.missingUrl) }
        guard let parsed = URL(string: trimmedUrl),
              let scheme = parsed.scheme?.lowercased(),
              scheme == "wss" || scheme == "ws",
              let host = parsed.host, !host.isEmpty
        else { return .failure(.badUrl) }
        let trimmedToken = (token ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else { return .failure(.missingToken) }
        return .success(Request(
            url: trimmedUrl,
            token: trimmedToken,
            showPicker: showPicker ?? true,
            maxHeight: clamp(maxHeight ?? defaultMaxHeight, 540, 1440),
            fps: clamp(fps ?? defaultFps, 5, 30)
        ))
    }

    /// Max encode size (16:9 box; the SDK aspect-fits the real screen into it).
    static func captureBox(maxHeight: Int) -> (width: Int, height: Int) {
        let height = clamp(maxHeight, 540, 1440)
        let width = Int((Double(height) * 16.0 / 9.0).rounded())
        return (width - width % 2, height - height % 2)
    }

    /// Screen share bitrate for the box and frame rate (bits per second), close
    /// to LiveKit's screen share presets (1080p15 = 2.5 Mbps, 720p15 = 1.5 Mbps).
    static func maxBitrate(maxHeight: Int, fps: Int) -> Int {
        let height = clamp(maxHeight, 540, 1440)
        let base: Double = height >= 1440 ? 4_000_000 : height >= 1080 ? 2_500_000 : height >= 720 ? 1_500_000 : 900_000
        let scaled = base * (Double(clamp(fps, 5, 30)) / 15.0).squareRoot()
        return Int(scaled.rounded())
    }

    /// Phase after a broadcast state change from ReplayKit / the extension.
    static func phaseAfterBroadcastChange(current: Phase, isBroadcasting: Bool, roomConnected: Bool) -> Phase {
        if isBroadcasting {
            switch current {
            case .idle, .ended, .error:
                return .orphan
            case .connecting:
                return .connecting
            case .waiting, .orphan:
                return roomConnected ? .live : .connecting
            case .live, .stopping:
                return current
            }
        }
        switch current {
        case .live, .stopping:
            return .ended
        default:
            return current
        }
    }

    /// `state` event body for JS.
    static func eventPayload(phase: Phase, broadcasting: Bool, reason: String?, at: Date = Date()) -> [String: Any] {
        var payload: [String: Any] = [
            "phase": phase.rawValue,
            "broadcasting": broadcasting,
            "at": Int((at.timeIntervalSince1970 * 1000).rounded()),
        ]
        if let reason, !reason.isEmpty { payload["reason"] = reason }
        return payload
    }

    /// Picker anchor from the web layer (CSS px == points in the WKWebView),
    /// clamped inside the host view. nil = center bottom of the host.
    static func anchorRect(x: Double?, y: Double?, width: Double?, height: Double?, hostWidth: Double, hostHeight: Double) -> (x: Double, y: Double, width: Double, height: Double) {
        let fallbackSize = 44.0
        guard let x, let y, let width, let height,
              x.isFinite, y.isFinite, width.isFinite, height.isFinite,
              width > 0, height > 0
        else {
            return (max(0, hostWidth / 2 - fallbackSize / 2), max(0, hostHeight - fallbackSize * 2), fallbackSize, fallbackSize)
        }
        let w = min(width, max(1, hostWidth))
        let h = min(height, max(1, hostHeight))
        let cx = min(max(0, x), max(0, hostWidth - w))
        let cy = min(max(0, y), max(0, hostHeight - h))
        return (cx, cy, w, h)
    }

    private static func clamp(_ value: Int, _ low: Int, _ high: Int) -> Int {
        min(max(value, low), high)
    }
}
