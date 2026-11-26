import Foundation

/// Sends a share job with a background URLSession (the iOS twin of src/lib/share/shareEngine.js
/// and the Android ShareWorker). Every upload and every POST /api/native/share/send is a
/// background upload task from a file in the App Group container, so:
///  - nothing big sits in memory (the share extension has about 120 MB),
///  - the system finishes the transfer after the sheet closes ("Arka planda devam et") and
///    waits for the network by itself when offline (the queue sends when back online),
///  - when the extension is gone, iOS wakes the app (AppDelegate handleEventsForBackgroundURLSession)
///    and this same code, compiled into the app, sends to the chats once the uploads are done.
/// Each attachment is uploaded once and reused for every chat; each send has a stable clientId
/// (the server answers a repeat with the first result, never a second copy).
/// All state lives in jobs/<id>.json; every change is saved and reported through onChange.
public final class ShareTransport: NSObject, URLSessionDataDelegate {
    public static let shared = ShareTransport()
    public static let sessionId = "com.descall.app.share.transfer"
    public static let appGroup = "group.com.descall.app"
    static let maxAttempts = 4

    /// Main-thread observer (the open share sheet).
    public var onChange: ((ShareJob) -> Void)?
    /// Main-thread hook when a job settles (history, Siri donations).
    public var onFinish: ((ShareJob) -> Void)?
    /// From AppDelegate handleEventsForBackgroundURLSession.
    public var backgroundCompletion: (() -> Void)?

    private let queue = DispatchQueue(label: "com.descall.share.transport")
    private var buffers: [Int: Data] = [:]
    private var lastSave: [String: Double] = [:]

    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.background(withIdentifier: Self.sessionId)
        if Self.groupRoot != nil { c.sharedContainerIdentifier = Self.appGroup }
        c.sessionSendsLaunchEvents = true
        c.isDiscretionary = false
        c.timeoutIntervalForResource = 3 * 24 * 3600
        c.httpCookieStorage = nil
        c.urlCache = nil
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 1
        q.underlyingQueue = queue
        return URLSession(configuration: c, delegate: self, delegateQueue: q)
    }()

    // MARK: Storage (App Group "Share/")

    static var groupRoot: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("Share", isDirectory: true)
    }

    /// The App Group folder, or a private temporary one (unsigned / simulator builds).
    public static var root: URL {
        let url = groupRoot ?? FileManager.default.temporaryDirectory.appendingPathComponent("DescallShare", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    public static func dir(_ name: String) -> URL {
        let url = root.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    public static func url(forRelative path: String) -> URL { root.appendingPathComponent(path) }

    public static func relative(_ url: URL) -> String {
        let base = root.standardizedFileURL.path
        let p = url.standardizedFileURL.path
        return p.hasPrefix(base) ? String(p.dropFirst(base.count + 1)) : p
    }

    static func jobURL(_ id: String) -> URL { dir("jobs").appendingPathComponent("\(safe(id)).json") }

    static func safe(_ s: String) -> String {
        let v = s.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
        return v.isEmpty ? "x" : String(v.prefix(80))
    }

    public func load(_ id: String) -> ShareJob? {
        guard let data = try? Data(contentsOf: Self.jobURL(id)) else { return nil }
        return try? JSONDecoder().decode(ShareJob.self, from: data)
    }

    func save(_ job: ShareJob, notify: Bool = true) {
        if let data = try? JSONEncoder().encode(job) {
            try? data.write(to: Self.jobURL(job.id), options: [.atomic])
        }
        if notify {
            let cb = onChange
            DispatchQueue.main.async { cb?(job) }
        }
    }

    public func allJobs() -> [ShareJob] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: Self.dir("jobs"), includingPropertiesForKeys: nil)) ?? []
        return urls.filter { $0.pathExtension == "json" }.compactMap { u in
            (try? Data(contentsOf: u)).flatMap { try? JSONDecoder().decode(ShareJob.self, from: $0) }
        }
    }

    static func now() -> Double { Date().timeIntervalSince1970 * 1000 }

    // MARK: Public API (any thread)

    public func start(_ job: ShareJob) {
        queue.async {
            var j = job
            j.start(at: Self.now())
            self.save(j)
            self.kick(j.id)
        }
    }

    /// Resume unfinished jobs (app launch / foreground, extension open).
    public func resumeAll() {
        queue.async {
            _ = self.session
            for j in self.allJobs() where j.finishedAt == nil && j.status != "draft" { self.kick(j.id) }
            self.prune()
        }
    }

    /// Wakes a job waiting for the network ("Şimdi tekrar dene").
    public func poke(_ id: String) {
        queue.async { self.kick(id) }
    }

    public func setOffline(_ id: String, _ off: Bool) {
        queue.async {
            guard var j = self.load(id), j.finishedAt == nil, j.offline != off else { return }
            j.setOffline(off)
            self.save(j)
        }
    }

    public func cancel(_ id: String) {
        session.getAllTasks { tasks in
            for t in tasks where (t.taskDescription ?? "").hasPrefix("\(id)|") { t.cancel() }
            self.queue.async {
                guard var j = self.load(id) else { return }
                j.cancel(at: Self.now())
                self.save(j)
                self.finished(j)
            }
        }
    }

    public func retry(_ id: String) {
        queue.async {
            guard var j = self.load(id) else { return }
            j.retry()
            self.save(j)
            self.kick(id)
        }
    }

    public func dropFailed(_ id: String, completion: @escaping (ShareJob?) -> Void) {
        queue.async {
            guard var j = self.load(id) else { return DispatchQueue.main.async { completion(nil) } }
            j.dropFailed(at: Self.now())
            self.save(j)
            DispatchQueue.main.async { completion(j) }
        }
    }

    public func remove(_ id: String) {
        session.getAllTasks { tasks in
            for t in tasks where (t.taskDescription ?? "").hasPrefix("\(id)|") { t.cancel() }
            self.queue.async {
                try? FileManager.default.removeItem(at: Self.jobURL(id))
                try? FileManager.default.removeItem(at: Self.dir("files").appendingPathComponent(Self.safe(id)))
            }
        }
    }

    /// "Taslak olarak kaydet": stops the transfers, keeps everything until the sheet sends it.
    public func saveDraft(_ id: String) {
        session.getAllTasks { tasks in
            for t in tasks where (t.taskDescription ?? "").hasPrefix("\(id)|") { t.cancel() }
            self.queue.async {
                guard var j = self.load(id) else { return }
                j.status = "draft"
                self.save(j)
            }
        }
    }

    /// Geri al: POST /share/undo per chat (ordinary requests: the sheet is open). → failed count
    public func undo(_ id: String, completion: @escaping (ShareJob?, Int) -> Void) {
        queue.async {
            guard var j = self.load(id), let session = DescallSessionStore.load(), session.isUsable else {
                return DispatchQueue.main.async { completion(nil, 0) }
            }
            let group = DispatchGroup()
            var failed = 0
            let lock = NSLock()
            for t in j.targets where !t.messageIds.isEmpty || !t.scheduledIds.isEmpty {
                guard let url = URL(string: DescallAPIBase.validated(session.apiBase) + "/api/native/share/undo") else { continue }
                var req = URLRequest(url: url, timeoutInterval: 15)
                req.httpMethod = "POST"
                req.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.setValue("ios-share", forHTTPHeaderField: "X-Descall-Client")
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["conv": t.conv, "messageIds": t.messageIds, "scheduledIds": t.scheduledIds])
                group.enter()
                URLSession(configuration: .ephemeral).dataTask(with: req) { data, resp, _ in
                    let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                    let obj = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                    lock.lock()
                    if code < 200 || code >= 300 { failed += t.messageIds.count + t.scheduledIds.count }
                    else { failed += (obj?["failed"] as? Int) ?? 0 }
                    lock.unlock()
                    group.leave()
                }.resume()
            }
            group.notify(queue: self.queue) {
                j.markUndone()
                self.save(j)
                DispatchQueue.main.async { completion(j, failed) }
            }
        }
    }

    // MARK: Engine

    struct Desc {
        var job: String
        var kind: String   // u (upload) | s (send)
        var index: Int     // item index | target index
        var ready: [Int]   // send: job item indexes in body order
        var withText: Bool

        var string: String { "\(job)|\(kind)|\(index)|\(ready.map(String.init).joined(separator: "_"))|\(withText ? 1 : 0)" }

        init(job: String, kind: String, index: Int, ready: [Int] = [], withText: Bool = false) {
            self.job = job; self.kind = kind; self.index = index; self.ready = ready; self.withText = withText
        }

        init?(_ s: String?) {
            let p = (s ?? "").split(separator: "|", omittingEmptySubsequences: false).map(String.init)
            guard p.count == 5, let i = Int(p[2]) else { return nil }
            job = p[0]; kind = p[1]; index = i
            ready = p[3].split(separator: "_").compactMap { Int($0) }
            withText = p[4] == "1"
        }
    }

    func baseRequest(_ path: String) -> URLRequest? {
        guard let s = DescallSessionStore.load(), s.isUsable, let url = URL(string: DescallAPIBase.validated(s.apiBase) + path) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = "POST"
        r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("ios-share", forHTTPHeaderField: "X-Descall-Client")
        if let l = s.locale { r.setValue(l, forHTTPHeaderField: "Accept-Language") }
        return r
    }

    /// Multipart body (purpose=message + the file), streamed into a file next to the job.
    func multipartFile(job: ShareJob, item: ShareJobItem, boundary: String) -> URL? {
        guard let rel = item.file else { return nil }
        let src = Self.url(forRelative: rel)
        let out = Self.dir("files").appendingPathComponent(Self.safe(job.id), isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let body = out.appendingPathComponent("body-\(item.index).multipart")
        FileManager.default.createFile(atPath: body.path, contents: nil)
        guard let w = try? FileHandle(forWritingTo: body), let r = try? FileHandle(forReadingFrom: src) else { return nil }
        defer { try? w.close(); try? r.close() }
        let name = item.name.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
        let head = "--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nmessage\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(item.mime)\r\n\r\n"
        w.write(Data(head.utf8))
        while true {
            let chunk = autoreleasepool { r.readData(ofLength: 1 << 20) }
            if chunk.isEmpty { break }
            w.write(chunk)
        }
        w.write(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    func jsonFile(job: ShareJob, name: String, object: [String: Any]) -> URL? {
        let out = Self.dir("files").appendingPathComponent(Self.safe(job.id), isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let url = out.appendingPathComponent(name)
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return (try? data.write(to: url, options: [.atomic])) == nil ? nil : url
    }

    /// Starts whatever this job needs next (on `queue`).
    func kick(_ id: String) {
        session.getAllTasks { tasks in
            self.queue.async { self.kick(id, inflight: Set(tasks.compactMap { $0.taskDescription })) }
        }
    }

    private func kick(_ id: String, inflight: Set<String>) {
        guard var job = load(id), job.finishedAt == nil, job.status != "draft", job.status != "cancelled" else { return }
        let busy = inflight.filter { $0.hasPrefix("\(id)|") }
        if job.status == "queued" { job.start(at: Self.now()) }

        // 1) Uploads.
        var uploading = false
        for it in job.items where it.status == "pending" || it.status == "uploading" {
            uploading = true
            if busy.contains(where: { Desc($0)?.kind == "u" && Desc($0)?.index == it.index }) { continue }
            let boundary = "----descall\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
            guard var req = baseRequest("/api/media/upload") else { return signedOut(&job) }
            guard let body = multipartFile(job: job, item: it, boundary: boundary) else {
                job.uploadFailed(it.index, error: "attachment_unavailable")
                continue
            }
            req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            let task = session.uploadTask(with: req, fromFile: body)
            task.taskDescription = Desc(job: id, kind: "u", index: it.index).string
            job.upload(it.index, sent: 0, total: 0)
            task.resume()
        }
        if uploading || busy.contains(where: { Desc($0)?.kind == "u" }) {
            save(job)
            return
        }

        // 2) Sends.
        var sending = false
        for (ti, t) in job.targets.enumerated() where t.status == "queued" || t.status == "sending" {
            sending = true
            if busy.contains(where: { Desc($0)?.kind == "s" && Desc($0)?.index == ti }) { continue }
            let pending = job.pendingFor(t.conv)
            let ready = pending.filter { i in job.items.first(where: { $0.index == i })?.status == "uploaded" }
            let broken = pending.filter { !ready.contains($0) }
            let withText = t.sentItems.isEmpty && !t.textSent && !job.text.isEmpty
            if ready.isEmpty && !withText {
                let failedResults = broken.map { i in ShareSendResult(index: i, status: "failed", reason: job.items.first(where: { $0.index == i })?.error ?? "upload_failed") }
                job.targetResult(t.conv, results: failedResults, textSent: false, at: Self.now())
                continue
            }
            var body: [String: Any] = [
                "clientId": job.clientId(targetIndex: ti, indexes: ready),
                "conv": t.conv,
                "text": withText ? job.text : "",
                "silent": job.silent,
                "items": ready.compactMap { i -> [String: Any]? in
                    guard let it = job.items.first(where: { $0.index == i }), let url = it.url else { return nil }
                    let fallback = it.kind == "image" ? "image" : it.kind == "video" ? "video" : "file"
                    return ["url": url, "mediaType": it.upload?.mediaType ?? fallback, "mimeType": it.upload?.mimeType ?? it.mime,
                            "size": it.upload?.size ?? it.bytes, "originalName": it.upload?.originalName ?? it.name]
                },
            ]
            if let at = job.sendAt { body["sendAt"] = ISO8601DateFormatter.descall.string(from: Date(timeIntervalSince1970: at / 1000)) }
            guard var req = baseRequest("/api/native/share/send") else { return signedOut(&job) }
            guard let file = jsonFile(job: job, name: "send-\(ti).json", object: body) else {
                job.targetFailed(t.conv, reason: "failed", at: Self.now())
                continue
            }
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let task = session.uploadTask(with: req, fromFile: file)
            task.taskDescription = Desc(job: id, kind: "s", index: ti, ready: ready, withText: withText).string
            job.targetSending(t.conv)
            task.resume()
            _ = broken
        }
        if sending || busy.contains(where: { Desc($0)?.kind == "s" }) {
            save(job)
            return
        }

        // 3) Done.
        job.finish(at: Self.now())
        save(job)
        finished(job)
    }

    private func signedOut(_ job: inout ShareJob) {
        for t in job.targets where !["sent", "scheduled", "failed", "partial"].contains(t.status) { job.targetFailed(t.conv, reason: "signed_out", at: Self.now()) }
        job.finish(at: Self.now())
        save(job)
        finished(job)
    }

    private func finished(_ job: ShareJob) {
        try? FileManager.default.removeItem(at: Self.dir("files").appendingPathComponent(Self.safe(job.id)))
        let cb = onFinish
        DispatchQueue.main.async { cb?(job) }
    }

    func prune() {
        let now = Self.now()
        for j in allJobs() {
            if let f = j.finishedAt, now - f > 24 * 3600 * 1000 { try? FileManager.default.removeItem(at: Self.jobURL(j.id)) }
            if j.status == "draft", now - j.createdAt > 14 * 24 * 3600 * 1000 { try? FileManager.default.removeItem(at: Self.jobURL(j.id)) }
        }
        // Inboxes of shares that never became a job.
        let inbox = Self.dir("inbox")
        let live = Set(allJobs().map { $0.id })
        for u in (try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] {
            let mod = (try? u.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)?.timeIntervalSince1970 ?? 0
            if !live.contains(u.lastPathComponent) && now / 1000 - mod > 6 * 3600 { try? FileManager.default.removeItem(at: u) }
        }
    }

    // MARK: URLSession delegate (on `queue`)

    public func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let d = Desc(task.taskDescription), d.kind == "u", var job = load(d.job) else { return }
        job.upload(d.index, sent: totalBytesSent, total: max(totalBytesExpectedToSend, 0))
        let now = Self.now()
        if now - (lastSave[d.job] ?? 0) > 400 {
            lastSave[d.job] = now
            save(job)
        }
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        buffers[dataTask.taskIdentifier, default: Data()].append(data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let data = buffers.removeValue(forKey: task.taskIdentifier) ?? Data()
        guard let d = Desc(task.taskDescription), var job = load(d.job), job.finishedAt == nil, job.status != "draft" else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let now = Self.now()

        if let error {
            let code = (error as? URLError)?.code
            if code == .cancelled { return }
            // Lost the network: a new background task waits for it and goes on by itself.
            let offline = [URLError.Code.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .timedOut, .cannotConnectToHost].contains(code ?? .unknown)
            if offline { job.setOffline(true) }
            if d.kind == "u" {
                job.item(d.index) { it in it.attempts += 1; it.status = it.attempts > Self.maxAttempts * 3 ? "failed" : "pending"; it.error = "offline" }
            } else if let t = job.targets[shareSafe: d.index] {
                job.target(t.conv) { t in t.attempts += 1; t.status = t.attempts > Self.maxAttempts * 3 ? "failed" : "queued"; t.reason = t.status == "failed" ? "offline" : nil }
            }
            save(job)
            queue.asyncAfter(deadline: .now() + (offline ? 2 : 4)) { self.kick(d.job) }
            return
        }
        if job.offline { job.setOffline(false) }
        if status == 401 { return signedOut(&job) }
        let errCode = (json["error"] as? String) ?? (status == 413 ? "too_large" : status == 415 ? "type" : "failed")

        if d.kind == "u" {
            if (200..<300).contains(status), let url = json["url"] as? String {
                let info = ShareUploadInfo(mediaType: json["mediaType"] as? String, mimeType: json["mimeType"] as? String,
                                           size: (json["size"] as? NSNumber)?.int64Value, originalName: json["originalName"] as? String)
                job.uploaded(d.index, url: url, info: info)
            } else if status == 429 || status >= 500 {
                job.item(d.index) { it in it.attempts += 1; it.status = it.attempts >= Self.maxAttempts ? "failed" : "pending"; it.error = errCode }
            } else {
                job.uploadFailed(d.index, error: errCode)
            }
        } else if let t = job.targets[shareSafe: d.index] {
            if (200..<300).contains(status) {
                let raw = (json["results"] as? [[String: Any]]) ?? []
                var mapped: [ShareSendResult] = raw.map { r in
                    let ix = (r["index"] as? Int) ?? -1
                    return ShareSendResult(index: ix >= 0 && ix < d.ready.count ? d.ready[ix] : -1, status: (r["status"] as? String) ?? "failed",
                                           messageId: r["messageId"] as? String, scheduledId: r["scheduledId"] as? String, reason: r["reason"] as? String)
                }
                for i in job.pendingFor(t.conv) where !d.ready.contains(i) {
                    mapped.append(ShareSendResult(index: i, status: "failed", reason: job.items.first(where: { $0.index == i })?.error ?? "upload_failed"))
                }
                let ok = mapped.contains { $0.status == "sent" || $0.status == "scheduled" }
                job.targetResult(t.conv, results: mapped, textSent: d.withText && ok, at: now)
            } else if status == 429 || status >= 500 {
                job.target(t.conv) { t in t.attempts += 1; t.status = t.attempts >= Self.maxAttempts ? "failed" : "queued"; t.reason = t.status == "failed" ? errCode : nil }
            } else {
                job.targetFailed(t.conv, reason: errCode, at: now)
            }
        }
        save(job)
        kick(d.job)
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            let done = self.backgroundCompletion
            self.backgroundCompletion = nil
            done?()
        }
    }
}

extension Array {
    subscript(shareSafe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
