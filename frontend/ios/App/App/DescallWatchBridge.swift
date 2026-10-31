import Foundation
import UIKit
import WatchConnectivity

/// 3.7.17: the iPhone side of the Apple Watch app.
///
/// The watch app is "iPhone-bound" (owner pick): it never stores a token. It sends
/// `DescallWatchProtocol` requests over WatchConnectivity; this bridge checks the
/// path against the allow-list (/api/watch/*, /api/admin/*), adds the signed-in
/// session from the Keychain (the same item the web app uses through
/// DescallKeychainPlugin) and replies with the HTTP status and body. A message from
/// the watch wakes this app in the background, so it works with the app closed.
/// No token, body or path is ever logged.
final class DescallWatchBridge: NSObject, WCSessionDelegate {
    static let shared = DescallWatchBridge()

    private let keychainService = "com.descall.session"
    private let keychainAccount = "descall_token"
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        config.httpCookieStorage = nil
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    func start() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        // A watch switch: activate again for the newly paired watch.
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        handle(message, reply: replyHandler)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        // Requests always carry a reply handler; anything else is ignored.
    }

    // MARK: Forwarding

    private func handle(_ message: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        typealias P = DescallWatchProtocol
        if let failure = P.validate(message) {
            reply([P.Key.status: 0, P.Key.error: failure])
            return
        }
        guard let token = KeychainStore.read(service: keychainService, account: keychainAccount), !token.isEmpty else {
            reply([P.Key.status: 401, P.Key.error: P.Failure.noSession])
            return
        }
        let method = message[P.Key.method] as? String ?? "GET"
        let path = message[P.Key.path] as? String ?? ""
        guard let url = URL(string: DescallNativeCallLogic.productionApiBase + path) else {
            reply([P.Key.status: 0, P.Key.error: P.Failure.badRequest])
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("watch", forHTTPHeaderField: "X-Descall-Client")
        if let body = message[P.Key.body] as? String {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(body.utf8)
        }
        if let stepUp = message[P.Key.stepUp] as? String {
            request.setValue(stepUp, forHTTPHeaderField: "X-Admin-Step-Up")
        }

        // Keep the process alive while the request runs when the watch woke us in the background.
        var task: UIBackgroundTaskIdentifier = .invalid
        let finish = {
            if task != .invalid {
                UIApplication.shared.endBackgroundTask(task)
                task = .invalid
            }
        }
        DispatchQueue.main.async {
            task = UIApplication.shared.beginBackgroundTask(withName: "descall.watch") { finish() }
        }
        session.dataTask(with: request) { data, response, error in
            defer { DispatchQueue.main.async { finish() } }
            guard error == nil, let http = response as? HTTPURLResponse else {
                reply([P.Key.status: 0, P.Key.error: P.Failure.network])
                return
            }
            var out: [String: Any] = [P.Key.status: http.statusCode]
            if let data, !data.isEmpty {
                guard let encoded = P.encodeReply(data) else {
                    reply([P.Key.status: 0, P.Key.error: P.Failure.tooLarge])
                    return
                }
                out[encoded.key] = encoded.value
            }
            reply(out)
        }.resume()
    }
}
