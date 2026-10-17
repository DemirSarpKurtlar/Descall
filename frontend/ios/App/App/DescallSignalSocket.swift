import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Minimal Socket.IO v4 client (websocket transport only) for the native
/// CallKit answer path. The web app's socket lives in the WKWebView, which a
/// locked / killed iPhone doesn't run; this one runs in the app process the
/// moment a VoIP push arrives. Same backend, same auth ({ token, platform }),
/// same events as src/socket.js. Reconnects with a short backoff.
///
/// All callbacks are delivered on the main queue.
final class DescallSignalSocket: NSObject {
    typealias EventHandler = (_ name: String, _ payload: [String: Any]) -> Void

    private let url: URL
    private let auth: [String: Any]
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var outbox: [String] = []
    private var attempt = 0
    private var closedByUs = false
    private var reconnectWork: DispatchWorkItem?
    private var watchdog: DispatchWorkItem?
    private var pingIntervalMs = 25_000
    private(set) var connected = false

    var onEvent: EventHandler?
    var onConnect: (() -> Void)?
    var onDisconnect: ((_ reason: String) -> Void)?
    var onAuthError: ((_ message: String) -> Void)?

    init(url: URL, auth: [String: Any]) {
        self.url = url
        self.auth = auth
        super.init()
    }

    func connect() {
        DispatchQueue.main.async { self.open() }
    }

    func close() {
        DispatchQueue.main.async {
            self.closedByUs = true
            self.reconnectWork?.cancel()
            self.watchdog?.cancel()
            self.connected = false
            self.task?.cancel(with: .normalClosure, reason: nil)
            self.task = nil
            self.session?.invalidateAndCancel()
            self.session = nil
            self.outbox.removeAll()
        }
    }

    /// Queued until the namespace CONNECT is acknowledged.
    func emit(_ name: String, _ payload: [String: Any]) {
        guard let frame = DescallNativeCallLogic.eventFrame(name, payload) else { return }
        DispatchQueue.main.async {
            if self.connected { self.send(frame) } else {
                self.outbox.append(frame)
                if self.outbox.count > 256 { self.outbox.removeFirst(self.outbox.count - 256) }
            }
        }
    }

    // MARK: - Internals (main queue)

    private func open() {
        guard !closedByUs, task == nil else { return }
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        let session = URLSession(configuration: config)
        self.session = session
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("DescallNative/iOS", forHTTPHeaderField: "User-Agent")
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        receive(task)
        armWatchdog(seconds: 12)
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self, self.task === task else { return }
                switch result {
                case .failure(let error):
                    self.dropped("receive: \(error.localizedDescription)")
                case .success(let message):
                    if case let .string(text) = message { self.handle(text) }
                    self.receive(task)
                }
            }
        }
    }

    private func handle(_ text: String) {
        switch DescallNativeCallLogic.parse(text) {
        case .open(let ms):
            pingIntervalMs = ms
            send(DescallNativeCallLogic.connectFrame(auth: auth))
            armWatchdog(seconds: 10)
        case .connected:
            connected = true
            attempt = 0
            armWatchdog(seconds: Double(pingIntervalMs) / 1000 + 8)
            let pending = outbox
            outbox.removeAll()
            pending.forEach { send($0) }
            onConnect?()
        case .connectError(let message):
            // Bad / revoked token: don't hammer the server.
            onAuthError?(message)
            closedByUs = true
            teardown()
            onDisconnect?("auth")
        case .ping:
            send("3")
            armWatchdog(seconds: Double(pingIntervalMs) / 1000 + 8)
        case .event(let name, let json):
            let payload = (DescallNativeCallLogic.jsonObject(json) as? [String: Any]) ?? [:]
            onEvent?(name, payload)
        case .disconnect:
            dropped("server closed")
        case .other:
            break
        }
    }

    private func send(_ text: String) {
        task?.send(.string(text)) { [weak self] error in
            guard let error = error else { return }
            DispatchQueue.main.async { self?.dropped("send: \(error.localizedDescription)") }
        }
    }

    /// No open / connect ack / ping in time: the link is dead (NAT rebinding,
    /// Wi-Fi ↔ cellular), reconnect now instead of waiting for TCP to notice.
    private func armWatchdog(seconds: Double) {
        watchdog?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.dropped("watchdog") }
        watchdog = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    private func teardown() {
        watchdog?.cancel()
        connected = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
    }

    private func dropped(_ reason: String) {
        guard task != nil else { return }
        let wasConnected = connected
        teardown()
        if wasConnected { onDisconnect?(reason) }
        guard !closedByUs else { return }
        let delay = DescallNativeCallLogic.reconnectDelay(attempt: attempt)
        attempt += 1
        reconnectWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.open() }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Network path changed (e.g. Wi-Fi → cellular): reconnect immediately.
    func reconnectNow() {
        DispatchQueue.main.async {
            guard !self.closedByUs else { return }
            self.attempt = 0
            if self.task != nil { self.dropped("network change") } else { self.open() }
        }
    }
}
