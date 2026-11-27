import Foundation
import Intents
import Network
import SwiftUI
import UIKit

/// State of the iOS share sheet (draft A). Same flow as src/components/share/SharePage.jsx:
/// load the shared items and the chats (GET /api/native/share/targets with the shared Keychain
/// session), precheck permissions and duplicates while picking, then prepare every attachment
/// for the chosen quality and hand the job to ShareTransport (background URLSession). The
/// progress / result screen follows the job's snapshots.
@MainActor
final class ShareSheetModel: ObservableObject {
    enum Load { case loading, ready, error, signedOut }

    @Published var items: [ShareInputItem] = []
    @Published var thumbs: [String: UIImage] = [:]
    @Published var targets: ShareTargets?
    @Published var load: Load = .loading
    @Published var selected: [String] = []
    @Published var tab = "all"
    @Published var query = ""
    @Published var message = ""
    @Published var quality = "high"
    @Published var strip = true
    @Published var silent = false
    @Published var sendAt: Double?
    @Published var menu: String?           // quality | schedule
    @Published var serverDup: [String: (kind: String, at: Double)] = [:]
    @Published var dismissedDup: Set<String> = []
    @Published var expanded: String?
    @Published var toast: String?
    @Published var linkMeta: [String: (site: String?, title: String?)] = [:]
    @Published var job: ShareJob?
    @Published var preparing = false
    @Published var offline = false
    @Published var busy = false
    @Published var now = Date().timeIntervalSince1970 * 1000

    weak var context: NSExtensionContext?
    private var precheckTask: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private let monitor = NWPathMonitor()
    private var ticker: Timer?

    var index: [String: ShareTarget] { targets?.index ?? [:] }
    var allowedMimes: [String] = []
    var sendable: [ShareInputItem] { items.filter { $0.problem(quality: quality, allowedMimes: allowedMimes) == nil } }
    var hasFiles: Bool { sendable.contains { $0.isUpload } }
    var hasMedia: Bool { sendable.contains { $0.kind == "image" || $0.kind == "video" } }
    var totals: ShareTotals { shareTotals(sendable, quality: quality) }

    init(context: NSExtensionContext?) {
        self.context = context
        ShareText.current = ShareText.resolve(DescallSessionStore.load()?.locale)
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.networkChanged(path.status == .satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "com.descall.share.path"))
        ShareTransport.shared.onChange = { [weak self] j in
            guard let self, self.job?.id == j.id else { return }
            self.job = j
        }
        ShareTransport.shared.onFinish = { [weak self] j in self?.finished(j) }
        ticker = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.now = Date().timeIntervalSince1970 * 1000 }
        }
    }

    deinit {
        monitor.cancel()
        ticker?.invalidate()
    }

    func say(_ text: String) {
        toast = text
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if !Task.isCancelled { self?.toast = nil }
        }
    }

    private func networkChanged(_ ok: Bool) {
        offline = !ok
        if let j = job, j.finishedAt == nil {
            ShareTransport.shared.setOffline(j.id, !ok)
            if ok { ShareTransport.shared.poke(j.id) }
        }
    }

    // MARK: Loading

    func start() {
        Task {
            await loadItems()
            await loadTargets()
        }
        ShareTransport.shared.resumeAll()
    }

    func loadItems() async {
        let inbox = ShareTransport.dir("inbox").appendingPathComponent("p\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString.prefix(6))", isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let ext = (context?.inputItems as? [NSExtensionItem]) ?? []
        var list = await ShareMedia.load(ext, inbox: inbox)
        if list.filter({ $0.isUpload }).count > ShareRules.maxItems {
            var kept = 0
            list = list.filter { it in
                guard it.isUpload else { return true }
                kept += 1
                return kept <= ShareRules.maxItems
            }
            say(ShareText.t("limitItems", ["count": ShareRules.maxItems]))
        }
        items = list
        // Sizes and thumbnails one by one (memory), the strip fills in as they come.
        for (i, it) in list.enumerated() where it.isUpload {
            if let img = await ShareMedia.thumbnail(it) { thumbs[it.id] = img }
            let est = await ShareMedia.estimates(it)
            let dur = ShareMedia.durationMs(it)
            if i < items.count, items[i].id == it.id {
                items[i].estimates = est
                items[i].durationMs = dur
            }
        }
        // Siri share suggestion: the chat the person picked in the share sheet's first row.
        if let intent = context?.intent as? INSendMessageIntent, let conv = intent.conversationIdentifier, ShareRules.isConv(conv) {
            selected = [conv]
        }
        for it in items where it.kind == "link" { fetchLinkMeta(it.url ?? "") }
    }

    func cacheURL() -> URL { ShareTransport.root.appendingPathComponent("targets.json") }

    func loadTargets() async {
        guard let session = DescallSessionStore.load(), session.isUsable else {
            load = .signedOut
            return
        }
        if let data = try? Data(contentsOf: cacheURL()), let cached = try? JSONDecoder().decode(ShareTargets.self, from: data) {
            targets = cached
            load = .ready
        }
        do {
            let (data, resp) = try await request("/api/native/share/targets", method: "GET", body: nil, session: session)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { load = .signedOut; return }
            guard (200..<300).contains(code) else { throw DescallAPIError.server(code) }
            let fresh = try JSONDecoder().decode(ShareTargets.self, from: data)
            if let lim = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["limits"] as? [String: Any] {
                allowedMimes = (lim["mimes"] as? [String]) ?? []
            }
            targets = fresh
            load = .ready
            try? data.write(to: cacheURL(), options: [.atomic])
            donateSuggestions(fresh.recentEntries(max: 6))
            dropUnsendable()
        } catch {
            if targets == nil { load = .error }
        }
    }

    func request(_ path: String, method: String, body: [String: Any]?, session: DescallSession) async throws -> (Data, URLResponse) {
        guard let url = URL(string: DescallAPIBase.validated(session.apiBase) + path) else { throw DescallAPIError.badRequest("bad_path") }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = method
        req.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("ios-share", forHTTPHeaderField: "X-Descall-Client")
        if let l = session.locale { req.setValue(l, forHTTPHeaderField: "Accept-Language") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return try await URLSession(configuration: .ephemeral).data(for: req)
    }

    func fetchLinkMeta(_ url: String) {
        guard !url.isEmpty, linkMeta[url] == nil, let session = DescallSessionStore.load() else { return }
        linkMeta[url] = (nil, nil)
        Task {
            let enc = url.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? url
            guard let res = try? await request("/api/link-preview?url=\(enc)", method: "GET", body: nil, session: session),
                  let obj = try? JSONSerialization.jsonObject(with: res.0) as? [String: Any], let p = obj["preview"] as? [String: Any] else { return }
            linkMeta[url] = (p["siteName"] as? String, p["title"] as? String)
        }
    }

    // MARK: Picking

    func toggle(_ conv: String) {
        if let e = index[conv], !e.verdict(hasFiles: hasFiles).ok { return }
        if let i = selected.firstIndex(of: conv) {
            selected.remove(at: i)
        } else if selected.count >= ShareRules.maxTargets {
            say(ShareText.t("limitTargets", ["count": ShareRules.maxTargets]))
            return
        } else {
            selected.append(conv)
        }
        UISelectionFeedbackGenerator().selectionChanged()
        schedulePrecheck()
    }

    func removeItem(_ id: String) {
        items.removeAll { $0.id == id }
        dropUnsendable()
        schedulePrecheck()
    }

    func dropUnsendable() {
        let bad = selected.filter { c in index[c].map { !$0.verdict(hasFiles: hasFiles).ok } ?? false }
        guard let first = bad.first, let e = index[first] else { return }
        selected.removeAll { bad.contains($0) }
        say(ShareText.t("targetRemoved", ["name": e.name, "reason": ShareText.t("reason.\(e.verdict(hasFiles: hasFiles).reason ?? "no_permission")")]))
    }

    func schedulePrecheck() {
        precheckTask?.cancel()
        guard !selected.isEmpty, let session = DescallSessionStore.load() else { return }
        let convs = selected
        let links = items.filter { $0.kind == "link" }.compactMap { $0.url }
        let files = sendable.filter { $0.isUpload }.map { ["name": $0.name, "size": $0.size] as [String: Any] }
        precheckTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            guard let res = try? await request("/api/native/share/precheck", method: "POST", body: ["convs": convs, "links": links, "files": files], session: session),
                  ((res.1 as? HTTPURLResponse)?.statusCode ?? 0) == 200,
                  let obj = try? JSONSerialization.jsonObject(with: res.0) as? [String: Any], let results = obj["results"] as? [String: [String: Any]] else { return }
            var dup: [String: (kind: String, at: Double)] = [:]
            var lost: [String] = []
            for (conv, r) in results {
                if (r["canSend"] as? Bool) == false { lost.append(conv) }
                if let d = r["duplicate"] as? [String: Any], let at = (d["at"] as? String).flatMap({ ISO8601DateFormatter.descall.date(from: $0) }) {
                    dup[conv] = ((d["kind"] as? String) == "link" ? "link" : "file", at.timeIntervalSince1970 * 1000)
                }
            }
            serverDup = dup
            if let c = lost.first {
                selected.removeAll { lost.contains($0) }
                let reason = (results[c]?["reason"] as? String) ?? "no_permission"
                say(ShareText.t("targetRemoved", ["name": index[c]?.name ?? "", "reason": ShareText.t("reason.\(reason)")]))
            }
        }
    }

    var historyURL: URL { ShareTransport.root.appendingPathComponent("history.json") }

    var history: [ShareHistoryEntry] {
        (try? Data(contentsOf: historyURL)).flatMap { try? JSONDecoder().decode([ShareHistoryEntry].self, from: $0) } ?? []
    }

    var duplicates: [(conv: String, kind: String, at: Double)] {
        shareDuplicates(history: history, items: sendable + items.filter { $0.kind == "link" }, convs: selected, server: serverDup, now: now)
            .filter { !dismissedDup.contains($0.conv) }
    }

    // MARK: Sending

    func send() {
        let picked = selected.compactMap { index[$0] }
        guard !picked.isEmpty else { return }
        let payload = sendable + items.filter { $0.kind == "link" || $0.kind == "text" }
        guard !payload.isEmpty || !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var first = ShareJob(items: payload, targets: picked, text: message, silent: silent, sendAt: sendAt, quality: quality, stripLocation: strip, now: now)
        first.start(at: now)
        job = first
        let initial = first
        menu = nil
        preparing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let uploads = payload.filter { $0.isUpload }
        Task {
            var j = initial
            for (i, it) in uploads.enumerated() {
                if let p = await ShareMedia.prepare(it, jobId: j.id, index: i, quality: j.quality, strip: j.stripLocation) {
                    j.items[i].file = p.path
                    j.items[i].mime = p.mime
                    j.items[i].name = p.name
                    if let size = try? FileManager.default.attributesOfItem(atPath: ShareTransport.url(forRelative: p.path).path)[.size] as? NSNumber {
                        j.items[i].bytes = size.int64Value
                    }
                } else {
                    j.uploadFailed(i, error: "upload_failed")
                }
                job = j
            }
            preparing = false
            ShareTransport.shared.start(j)
        }
    }

    private func finished(_ j: ShareJob) {
        guard job?.id == j.id else { return }
        job = j
        let ok = j.targets.filter { $0.status == "sent" || $0.status == "scheduled" }
        if !ok.isEmpty {
            let h = shareRecordHistory(history, convs: ok.map { $0.conv }, items: sendable + items.filter { $0.kind == "link" }, at: now)
            if let data = try? JSONEncoder().encode(h) { try? data.write(to: historyURL, options: [.atomic]) }
            donateSuggestions(ok.map { $0.entry })
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func undo() {
        guard let j = job else { return }
        busy = true
        ShareTransport.shared.undo(j.id) { [weak self] updated, failed in
            self?.busy = false
            if let updated { self?.job = updated }
            if failed > 0 { self?.say(ShareText.t("undone.failed")) }
        }
    }

    func retry() {
        guard let j = job else { return }
        ShareTransport.shared.retry(j.id)
    }

    func dropFailed() {
        guard let j = job else { return }
        ShareTransport.shared.dropFailed(j.id) { [weak self] updated in if let updated { self?.job = updated } }
    }

    func stop() {
        guard let j = job else { return }
        ShareTransport.shared.cancel(j.id)
    }

    func saveDraft() {
        guard let j = job else { return }
        ShareTransport.shared.saveDraft(j.id)
        say(ShareText.t("offline.draftSaved"))
        close()
    }

    func removeFromQueue() {
        guard let j = job else { return }
        ShareTransport.shared.remove(j.id)
        close()
    }

    func retryNow() {
        guard let j = job else { return }
        ShareTransport.shared.poke(j.id)
    }

    func close() {
        ShareTransport.shared.onChange = nil
        context?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    func cancelSheet() {
        context?.cancelRequest(withError: NSError(domain: "com.descall.share", code: NSUserCancelledError))
    }

    /// "Descall'da aç": the containing app through its descall:// route.
    func open(_ target: ShareTarget?) {
        let link = target?.deepLink ?? job?.targets.first?.entry.deepLink ?? "descall://open"
        guard let url = URL(string: link) else { return close() }
        context?.open(url) { [weak self] ok in
            DispatchQueue.main.async {
                if !ok { self?.openViaResponder(url) }
                self?.close()
            }
        }
    }

    weak var hostController: UIViewController?

    private func openViaResponder(_ url: URL) {
        var r: UIResponder? = hostController
        let sel = NSSelectorFromString("openURL:")
        while let cur = r {
            if cur !== hostController, cur.responds(to: sel) {
                _ = cur.perform(sel, with: url)
                return
            }
            r = cur.next
        }
    }

    // MARK: Siri share suggestions

    /// Donates INSendMessageIntent for chats so iOS lists them in the share sheet's first row.
    func donateSuggestions(_ entries: [ShareTarget]) {
        for e in entries.prefix(6) {
            let handle = INPersonHandle(value: e.conv, type: .unknown)
            let me = INPerson(personHandle: INPersonHandle(value: "me", type: .unknown), nameComponents: nil, displayName: nil, image: nil, contactIdentifier: nil, customIdentifier: "me", isMe: true)
            let intent: INSendMessageIntent
            if e.kind == "dm" {
                let person = INPerson(personHandle: handle, nameComponents: nil, displayName: e.name, image: nil, contactIdentifier: nil, customIdentifier: e.conv)
                intent = INSendMessageIntent(recipients: [person], outgoingMessageType: .outgoingMessageText, content: nil,
                                             speakableGroupName: nil, conversationIdentifier: e.conv, serviceName: "Descall", sender: me, attachments: nil)
            } else {
                let label = e.kind == "channel" ? "#\(e.name)" : e.name
                let members = [INPerson(personHandle: handle, nameComponents: nil, displayName: label, image: nil, contactIdentifier: nil, customIdentifier: e.conv)]
                intent = INSendMessageIntent(recipients: members, outgoingMessageType: .outgoingMessageText, content: nil,
                                             speakableGroupName: INSpeakableString(spokenPhrase: label), conversationIdentifier: e.conv, serviceName: "Descall", sender: me, attachments: nil)
            }
            let interaction = INInteraction(intent: intent, response: nil)
            interaction.direction = .outgoing
            interaction.donate(completion: nil)
        }
    }
}
