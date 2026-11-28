import Foundation

/// Who may use the microphone and camera inside the app's WKWebView (4.2.1).
///
/// WebKit asks the UI delegate (webView(_:requestMediaCapturePermissionFor:
/// initiatedByFrame:type:decisionHandler:)) before every getUserMedia. Without
/// an answer it shows its own "… wants to use your microphone" sheet on every
/// page load, on top of the one-time iOS permission. Capacitor's delegate
/// answers `.grant` for every origin and every frame, so an embedded
/// third-party frame got the microphone silently as well.
///
/// Rule: grant for the app's own origin (the bundled page, `descall://localhost`
/// from capacitor.config.ts `ios.scheme` / `server.hostname`) when the request
/// comes from a frame of that same origin; deny everything else. Never
/// `.prompt`: the iOS system permission (NSMicrophoneUsageDescription) is the
/// one question the user answers, once.
///
/// Foundation only, so it runs in `swiftc` selftests
/// (selftest/mediacapture/main.swift).
enum DescallMediaCaptureLogic {
    enum Decision: Equatable {
        case grant
        case deny
    }

    struct Origin: Equatable {
        let scheme: String
        let host: String
        /// 0 = the scheme's default port (WKSecurityOrigin reports 0 then).
        let port: Int

        init(scheme: String?, host: String?, port: Int?) {
            self.scheme = (scheme ?? "").lowercased()
            self.host = (host ?? "").lowercased()
            self.port = max(0, port ?? 0)
        }

        var isValid: Bool { !scheme.isEmpty && !host.isEmpty }
    }

    /// Capacitor's defaults when the bridge configuration cannot be read.
    static let fallbackScheme = "capacitor"
    static let fallbackHost = "localhost"

    /// The app origin from Capacitor's local URL (`bridge.config.localURL`).
    static func appOrigin(localURL: URL?) -> Origin {
        let origin = Origin(scheme: localURL?.scheme, host: localURL?.host, port: localURL?.port)
        return origin.isValid ? origin : Origin(scheme: fallbackScheme, host: fallbackHost, port: nil)
    }

    /// The origins that are "the app": the bundled page and, when capacitor.config
    /// sets `server.url` (live reload in development), that server. Same origin
    /// once when there is no server URL.
    static func appOrigins(localURL: URL?, serverURL: URL?) -> [Origin] {
        var out = [appOrigin(localURL: localURL)]
        let server = Origin(scheme: serverURL?.scheme, host: serverURL?.host, port: serverURL?.port)
        if server.isValid, !out.contains(server) { out.append(server) }
        return out
    }

    /// `request`: the origin WebKit asks for; `frame`: the origin of the frame
    /// that called getUserMedia (nil when WebKit did not say).
    static func decision(request: Origin, frame: Origin?, app: Origin) -> Decision {
        decision(request: request, frame: frame, allowed: [app])
    }

    static func decision(request: Origin, frame: Origin?, allowed: [Origin]) -> Decision {
        let apps = allowed.filter { $0.isValid }
        guard request.isValid, apps.contains(request) else { return .deny }
        if let frame = frame, frame != request { return .deny }
        return .grant
    }
}
