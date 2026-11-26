import Foundation

// "Paylaş > Descall" (iOS share extension, draft A): the pure rules of the share sheet,
// one to one with src/lib/share/shareModel.js (sections, verdicts, quality totals, duplicate
// warning, schedule presets, the send job and its summary). Plain Foundation, compiled into
// the extension and the app (the app finishes jobs the extension left in the App Group) and
// tested on the CI runner (frontend/ios/selftest/share/main.swift).

public enum ShareRules {
    public static let maxTargets = 12
    public static let maxItems = 10
    public static let maxText = 2000
    public static let maxFileBytes: Int64 = 100 * 1024 * 1024
    public static let undoSeconds = 10
    public static let duplicateWindowMs: Double = 7 * 24 * 60 * 60 * 1000
    public static let qualities = ["original", "high", "saver"]
    public static let tabs = ["all", "friends", "groups", "servers"]

    /// Long edge (0 = as is) and JPEG quality per preset.
    public static func spec(_ quality: String) -> (maxEdge: Int, jpeg: Double) {
        switch quality {
        case "saver": return (1280, 0.70)
        case "original": return (0, 0.92)
        default: return (2560, 0.82)
        }
    }

    public static func fold(_ s: String?) -> String {
        (s ?? "").lowercased(with: Locale(identifier: "tr_TR"))
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "tr_TR"))
            .replacingOccurrences(of: "ı", with: "i")
    }

    public static func isConv(_ conv: String) -> Bool {
        let parts = conv.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, ["dm", "group", "channel"].contains(parts[0]), (1...64).contains(parts[1].count) else { return false }
        return parts[1].unicodeScalars.allSatisfy { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" }
    }

    public static func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }

    /// "today" | "yesterday" | "days" with n (calendar days, local time).
    public static func relativeDay(_ atMs: Double, now: Double) -> (key: String, n: Int)? {
        guard atMs > 0 else { return nil }
        let cal = Calendar.current
        let a = cal.startOfDay(for: Date(timeIntervalSince1970: atMs / 1000))
        let b = cal.startOfDay(for: Date(timeIntervalSince1970: now / 1000))
        let diff = cal.dateComponents([.day], from: a, to: b).day ?? 0
        if diff <= 0 { return ("today", 0) }
        if diff == 1 { return ("yesterday", 1) }
        return ("days", diff)
    }

    public static func normalizeLink(_ raw: String) -> String? {
        guard var comps = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = comps.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = comps.host?.lowercased() else { return nil }
        let h = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        let skip = ["fbclid", "gclid", "igshid", "si", "mc_eid", "ref_src"]
        let items = (comps.queryItems ?? []).filter { !$0.name.lowercased().hasPrefix("utm_") && !skip.contains($0.name.lowercased()) }
            .sorted { $0.name < $1.name }
        comps.queryItems = nil
        var path = comps.percentEncodedPath
        while path.hasSuffix("/") { path.removeLast() }
        let q = items.isEmpty ? "" : "?" + items.map { "\($0.name)=\($0.value ?? "")" }.joined(separator: "&")
        return h + path + q
    }

    public static func schedulePresets(now: Double) -> [(key: String, at: Double)] {
        let cal = Calendar.current
        let d = Date(timeIntervalSince1970: now / 1000)
        var out: [(String, Double)] = [("inHour", now + 3_600_000)]
        if cal.component(.hour, from: d) < 19, let ev = cal.date(bySettingHour: 20, minute: 0, second: 0, of: d) {
            out.append(("tonight", ev.timeIntervalSince1970 * 1000))
        }
        if let tm = cal.date(byAdding: .day, value: 1, to: d), let t9 = cal.date(bySettingHour: 9, minute: 0, second: 0, of: tm) {
            out.append(("tomorrow", t9.timeIntervalSince1970 * 1000))
        }
        return out
    }

    public static func validSchedule(_ at: Double, now: Double) -> Bool {
        at - now >= 60_000 && at - now <= 366 * 24 * 3_600_000
    }
}

// MARK: - Targets (GET /api/native/share/targets)

public struct ShareLastShared: Codable, Hashable, Sendable {
    public var at: String
    public var mediaCount: Int
}

public struct ShareTarget: Codable, Hashable, Identifiable, Sendable {
    public var conv: String
    public var kind: String
    public var id: String
    public var name: String
    public var username: String?
    public var initials: String?
    public var avatarUrl: String?
    public var presence: String?
    public var serverId: String?
    public var serverName: String?
    public var canSend: Bool
    public var canAttach: Bool
    public var reason: String?
    public var slowModeSec: Int
    public var memberCount: Int
    public var onlineCount: Int
    public var lastShared: ShareLastShared?

    enum CodingKeys: String, CodingKey {
        case conv, kind, id, name, username, initials, avatarUrl, presence, serverId, serverName, canSend, canAttach, reason, slowModeSec, memberCount, onlineCount, lastShared
    }

    public init(conv: String, kind: String, id: String, name: String, username: String? = nil, presence: String? = nil, serverId: String? = nil, serverName: String? = nil,
                canSend: Bool = true, canAttach: Bool = true, reason: String? = nil, slowModeSec: Int = 0, memberCount: Int = 0, onlineCount: Int = 0, lastShared: ShareLastShared? = nil) {
        self.conv = conv; self.kind = kind; self.id = id; self.name = name; self.username = username
        self.initials = nil; self.avatarUrl = nil; self.presence = presence; self.serverId = serverId; self.serverName = serverName
        self.canSend = canSend; self.canAttach = canAttach; self.reason = reason; self.slowModeSec = slowModeSec
        self.memberCount = memberCount; self.onlineCount = onlineCount; self.lastShared = lastShared
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conv = try c.decode(String.self, forKey: .conv)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? (conv.split(separator: ":").first.map(String.init) ?? "dm")
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? String(conv.split(separator: ":").last ?? "")
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? "?"
        username = try? c.decodeIfPresent(String.self, forKey: .username)
        initials = try? c.decodeIfPresent(String.self, forKey: .initials)
        avatarUrl = try? c.decodeIfPresent(String.self, forKey: .avatarUrl)
        presence = try? c.decodeIfPresent(String.self, forKey: .presence)
        serverId = try? c.decodeIfPresent(String.self, forKey: .serverId)
        serverName = try? c.decodeIfPresent(String.self, forKey: .serverName)
        canSend = (try? c.decodeIfPresent(Bool.self, forKey: .canSend)) ?? true
        canAttach = (try? c.decodeIfPresent(Bool.self, forKey: .canAttach)) ?? true
        reason = try? c.decodeIfPresent(String.self, forKey: .reason)
        slowModeSec = (try? c.decodeIfPresent(Int.self, forKey: .slowModeSec)) ?? 0
        memberCount = (try? c.decodeIfPresent(Int.self, forKey: .memberCount)) ?? 0
        onlineCount = (try? c.decodeIfPresent(Int.self, forKey: .onlineCount)) ?? 0
        lastShared = try? c.decodeIfPresent(ShareLastShared.self, forKey: .lastShared)
    }

    /// (ok, reason) for this share; files need ATTACH_FILES.
    public func verdict(hasFiles: Bool) -> (ok: Bool, reason: String?) {
        if !canSend { return (false, reason ?? "no_permission") }
        if hasFiles && !canAttach { return (false, "no_attach") }
        return (true, nil)
    }

    public var deepLink: String {
        func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s }
        switch kind {
        case "dm": return username.map { "descall://dm/\(enc($0))" } ?? "descall://friends"
        case "group": return "descall://group/\(enc(id))"
        case "channel": return "descall://server/\(enc(serverId ?? ""))/\(enc(id))"
        default: return "descall://open"
        }
    }
}

public struct ShareServer: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var initials: String?
    public var iconUrl: String?
    public var channels: [ShareTarget]
}

public struct ShareTargets: Codable, Sendable {
    public var recents: [String]
    public var friends: [ShareTarget]
    public var groups: [ShareTarget]
    public var servers: [ShareServer]

    public init(recents: [String] = [], friends: [ShareTarget] = [], groups: [ShareTarget] = [], servers: [ShareServer] = []) {
        self.recents = recents; self.friends = friends; self.groups = groups; self.servers = servers
    }

    enum CodingKeys: String, CodingKey { case recents, friends, groups, servers }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        recents = (try? c.decodeIfPresent([String].self, forKey: .recents)) ?? []
        friends = (try? c.decodeIfPresent([ShareTarget].self, forKey: .friends)) ?? []
        groups = (try? c.decodeIfPresent([ShareTarget].self, forKey: .groups)) ?? []
        servers = (try? c.decodeIfPresent([ShareServer].self, forKey: .servers)) ?? []
    }

    public var index: [String: ShareTarget] {
        var out: [String: ShareTarget] = [:]
        for f in friends { out[f.conv] = f }
        for g in groups { out[g.conv] = g }
        for s in servers { for ch in s.channels { out[ch.conv] = ch } }
        return out
    }

    public func recentEntries(max: Int = 8) -> [ShareTarget] {
        let idx = index
        return recents.compactMap { idx[$0] }.filter { $0.canSend }.prefix(max).map { $0 }
    }

    public struct Section: Identifiable {
        public var id: String
        public var server: ShareServer?
        public var rows: [ShareTarget]
    }

    static func matches(_ t: ShareTarget, _ q: String) -> Bool {
        let n = ShareRules.fold(q).trimmingCharacters(in: .whitespaces)
        if n.isEmpty { return true }
        return [t.name, t.username ?? "", t.serverName ?? ""].contains { ShareRules.fold($0).contains(n) }
    }

    /// Same as shareModel.buildSections (iOS variant).
    public func sections(tab: String, query: String, selected: [String]) -> [Section] {
        let q = query.trimmingCharacters(in: .whitespaces)
        let fr = friends.filter { Self.matches($0, q) }
        let gr = groups.filter { Self.matches($0, q) }
        let sv: [ShareServer] = servers.compactMap { s in
            var copy = s
            copy.channels = s.channels.filter { Self.matches($0, q) || (!q.isEmpty && ShareRules.fold(s.name).contains(ShareRules.fold(q))) }
            return copy.channels.isEmpty ? nil : copy
        }
        switch tab {
        case "friends": return fr.isEmpty ? [] : [Section(id: "friends", rows: fr)]
        case "groups": return gr.isEmpty ? [] : [Section(id: "groups", rows: gr)]
        case "servers": return sv.map { Section(id: "server:\($0.id)", server: $0, rows: $0.channels) }
        default: break
        }
        var out: [Section] = []
        if !fr.isEmpty { out.append(Section(id: "friends", rows: fr)) }
        if !gr.isEmpty { out.append(Section(id: "groups", rows: gr)) }
        var picks: [ShareTarget] = []
        if !q.isEmpty {
            picks = sv.flatMap { $0.channels }
        } else {
            let recent = Set(recents)
            for s in sv { for c in s.channels where c.canSend && (recent.contains(c.conv) || selected.contains(c.conv) || c.lastShared != nil) { picks.append(c) } }
            picks = Array(picks.prefix(8))
        }
        if !picks.isEmpty { out.append(Section(id: "channels", rows: picks)) }
        return out
    }
}

extension ISO8601DateFormatter {
    static let descall: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

// MARK: - Shared items

public struct ShareInputItem: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var kind: String          // image | video | file | link | text
    public var mime: String
    public var name: String
    public var size: Int64
    public var path: String?         // relative to the App Group share folder
    public var url: String?
    public var title: String?
    public var text: String?
    public var durationMs: Int
    public var estimates: [String: Int64]
    public var unsupported: Bool

    public init(id: String, kind: String, mime: String = "", name: String = "", size: Int64 = 0, path: String? = nil, url: String? = nil, title: String? = nil,
                text: String? = nil, durationMs: Int = 0, estimates: [String: Int64] = [:], unsupported: Bool = false) {
        self.id = id; self.kind = kind; self.mime = mime; self.name = name; self.size = size; self.path = path; self.url = url
        self.title = title; self.text = text; self.durationMs = durationMs; self.estimates = estimates; self.unsupported = unsupported
    }

    public var isUpload: Bool { kind == "image" || kind == "video" || kind == "file" }

    public func bytes(_ quality: String) -> Int64 {
        guard isUpload else { return 0 }
        let orig = max(0, estimates["original"] ?? size)
        if kind == "file" { return orig }
        if let v = estimates[quality], v > 0 { return orig > 0 ? min(v, orig) : v }
        return orig
    }

    public func problem(quality: String, allowedMimes: [String]) -> String? {
        guard isUpload else { return nil }
        if bytes(quality) > ShareRules.maxFileBytes { return "too_large" }
        if unsupported { return "type" }
        if kind == "file", !allowedMimes.isEmpty, !allowedMimes.contains(mime.lowercased()) { return "type" }
        return nil
    }

    public var fingerprint: String? {
        if kind == "link" { return url.flatMap(ShareRules.normalizeLink).map { "link:\($0)" } }
        if kind == "text" { return nil }
        let s = estimates["original"] ?? size
        return s > 0 ? "\(kind):\(s):\(ShareRules.fold(name))" : nil
    }
}

public struct ShareTotals: Equatable {
    public var original: Int64
    public var chosen: Int64
    public var savedPercent: Int
}

public func shareTotals(_ items: [ShareInputItem], quality: String) -> ShareTotals {
    var o: Int64 = 0, c: Int64 = 0
    for it in items where it.isUpload {
        o += it.bytes("original")
        c += it.bytes(quality)
    }
    let saved = o > 0 ? max(0, Int((1 - Double(c) / Double(o)) * 100 + 0.5)) : 0
    return ShareTotals(original: o, chosen: c, savedPercent: saved)
}

/// Typed message plus shared links / text (deduplicated), at most 2000 characters.
public func shareComposeText(_ message: String, _ items: [ShareInputItem]) -> String {
    var parts: [String] = []
    let typed = message.trimmingCharacters(in: .whitespacesAndNewlines)
    if !typed.isEmpty { parts.append(typed) }
    for it in items {
        let v = ((it.kind == "link" ? it.url : it.kind == "text" ? it.text : nil) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !v.isEmpty && !parts.contains(where: { $0.contains(v) }) { parts.append(v) }
    }
    return String(parts.joined(separator: "\n").prefix(ShareRules.maxText))
}

// MARK: - Duplicate warning history (App Group, newest first)

public struct ShareHistoryEntry: Codable, Equatable, Sendable {
    public var conv: String
    public var fp: String
    public var at: Double
}

public func shareRecordHistory(_ history: [ShareHistoryEntry], convs: [String], items: [ShareInputItem], at: Double) -> [ShareHistoryEntry] {
    var add: [ShareHistoryEntry] = []
    for c in convs { for it in items { if let fp = it.fingerprint { add.append(ShareHistoryEntry(conv: c, fp: fp, at: at)) } } }
    return Array((add + history).filter { at - $0.at <= ShareRules.duplicateWindowMs }.prefix(200))
}

/// First duplicate per conversation: device history and the server precheck. (conv, kind, at)
public func shareDuplicates(history: [ShareHistoryEntry], items: [ShareInputItem], convs: [String], server: [String: (kind: String, at: Double)], now: Double) -> [(conv: String, kind: String, at: Double)] {
    var fps: [String: String] = [:]
    for it in items { if let fp = it.fingerprint { fps[fp] = it.kind == "link" ? "link" : "file" } }
    var best: [String: (kind: String, at: Double)] = [:]
    for h in history where convs.contains(h.conv) && now - h.at <= ShareRules.duplicateWindowMs {
        guard let k = fps[h.fp] else { continue }
        if (best[h.conv]?.at ?? 0) < h.at { best[h.conv] = (k, h.at) }
    }
    for c in convs { if let d = server[c], (best[c]?.at ?? 0) < d.at { best[c] = d } }
    return convs.compactMap { c in best[c].map { (c, $0.kind, $0.at) } }
}

// MARK: - The send job (shareModel.createJob / reduceJob / summarizeJob)

public struct ShareUploadInfo: Codable, Hashable, Sendable {
    public var mediaType: String?
    public var mimeType: String?
    public var size: Int64?
    public var originalName: String?
}

public struct ShareJobItem: Codable, Hashable, Sendable {
    public var index: Int
    public var id: String
    public var kind: String
    public var name: String
    public var mime: String
    public var bytes: Int64
    public var sentBytes: Int64
    public var status: String      // pending | uploading | uploaded | failed | dropped
    public var url: String?
    public var error: String?
    public var file: String?       // prepared upload, relative to the share folder
    public var attempts: Int
    public var upload: ShareUploadInfo?
}

public struct ShareJobTarget: Codable, Hashable, Sendable {
    public var conv: String
    public var kind: String
    public var name: String
    public var username: String?
    public var serverId: String?
    public var status: String      // queued | sending | sent | scheduled | partial | failed
    public var textSent: Bool
    public var sentItems: [Int]
    public var failedItems: [Int]
    public var messageIds: [String]
    public var scheduledIds: [String]
    public var reason: String?
    public var at: Double?
    public var attempts: Int

    public var entry: ShareTarget {
        ShareTarget(conv: conv, kind: kind, id: String(conv.split(separator: ":").last ?? ""), name: name, username: username, serverId: serverId)
    }
}

/// One entry of a POST /share/send answer, with the job's item index (-1 = text-only message).
public struct ShareSendResult: Hashable, Sendable {
    public var index: Int
    public var status: String
    public var messageId: String?
    public var scheduledId: String?
    public var reason: String?

    public init(index: Int, status: String, messageId: String? = nil, scheduledId: String? = nil, reason: String? = nil) {
        self.index = index; self.status = status; self.messageId = messageId; self.scheduledId = scheduledId; self.reason = reason
    }
}

public struct ShareJob: Codable, Hashable, Sendable {
    public var id: String
    public var createdAt: Double
    public var startedAt: Double?
    public var finishedAt: Double?
    public var text: String
    public var silent: Bool
    public var sendAt: Double?
    public var quality: String
    public var stripLocation: Bool
    public var status: String
    public var offline: Bool
    public var items: [ShareJobItem]
    public var targets: [ShareJobTarget]
    public var undoUntil: Double?
    public var undone: Bool

    public static func newId() -> String {
        "sh-\(String(Int(Date().timeIntervalSince1970 * 1000), radix: 36))-\(UUID().uuidString.prefix(8).lowercased())"
    }

    public init(id: String = ShareJob.newId(), items: [ShareInputItem], targets: [ShareTarget], text: String, silent: Bool, sendAt: Double?, quality: String, stripLocation: Bool, now: Double) {
        self.id = id
        createdAt = now
        self.text = shareComposeText(text, items)
        self.silent = silent
        self.sendAt = sendAt
        self.quality = quality
        self.stripLocation = stripLocation
        status = "queued"
        offline = false
        undone = false
        self.items = items.filter { $0.isUpload }.enumerated().map { i, it in
            ShareJobItem(index: i, id: it.id, kind: it.kind, name: it.name, mime: it.mime, bytes: it.bytes(quality), sentBytes: 0, status: "pending", url: nil, error: nil, file: nil, attempts: 0, upload: nil)
        }
        self.targets = targets.map {
            ShareJobTarget(conv: $0.conv, kind: $0.kind, name: $0.name, username: $0.username, serverId: $0.serverId, status: "queued", textSent: false,
                           sentItems: [], failedItems: [], messageIds: [], scheduledIds: [], reason: nil, at: nil, attempts: 0)
        }
    }

    mutating func target(_ conv: String, _ change: (inout ShareJobTarget) -> Void) {
        if let i = targets.firstIndex(where: { $0.conv == conv }) { change(&targets[i]) }
    }

    mutating func item(_ index: Int, _ change: (inout ShareJobItem) -> Void) {
        if let i = items.firstIndex(where: { $0.index == index }) { change(&items[i]) }
    }

    public mutating func start(at: Double) {
        status = "running"
        offline = false
        if startedAt == nil { startedAt = at }
    }

    public mutating func setOffline(_ off: Bool) {
        offline = off
        if off && status != "cancelled" { status = "waiting" }
        if !off && status == "waiting" { status = "running" }
    }

    public mutating func upload(_ index: Int, sent: Int64, total: Int64) {
        item(index) { it in
            guard it.status != "uploaded" else { return }
            it.status = "uploading"
            if total > 0 { it.bytes = total }
            it.sentBytes = max(0, total > 0 ? min(total, sent) : sent)
        }
    }

    public mutating func uploaded(_ index: Int, url: String, info: ShareUploadInfo) {
        item(index) { it in
            it.status = "uploaded"
            it.url = url
            if let s = info.size, s > 0 { it.bytes = s }
            it.sentBytes = it.bytes
            it.error = nil
            it.upload = info
        }
    }

    public mutating func uploadFailed(_ index: Int, error: String) {
        item(index) { it in
            it.status = "failed"
            it.error = error
        }
    }

    public mutating func targetSending(_ conv: String) {
        target(conv) { t in if t.status != "sent" && t.status != "scheduled" { t.status = "sending" } }
    }

    /// results with job item indexes (-1 = the text-only message).
    public mutating func targetResult(_ conv: String, results: [ShareSendResult], textSent: Bool, at: Double) {
        let scheduledJob = sendAt != nil
        target(conv) { t in
            if textSent { t.textSent = true }
            var anyOk = false, anyFail = false, anySched = false
            for r in results {
                if r.status == "sent" || r.status == "scheduled" {
                    anyOk = true
                    if r.status == "scheduled" { anySched = true }
                    if r.index >= 0 && !t.sentItems.contains(r.index) { t.sentItems.append(r.index) }
                    t.failedItems.removeAll { $0 == r.index }
                    if let m = r.messageId { t.messageIds.append(m) }
                    if let s = r.scheduledId { t.scheduledIds.append(s) }
                } else {
                    anyFail = true
                    if r.index >= 0 && !t.failedItems.contains(r.index) { t.failedItems.append(r.index) }
                    t.reason = r.reason ?? "failed"
                }
            }
            t.status = anyFail ? (anyOk ? "partial" : "failed") : (anySched && scheduledJob ? "scheduled" : "sent")
            t.at = at
        }
    }

    public mutating func targetFailed(_ conv: String, reason: String, at: Double) {
        target(conv) { t in
            t.status = t.sentItems.isEmpty ? "failed" : "partial"
            t.reason = reason
            t.at = at
        }
    }

    public mutating func finish(at: Double) {
        finishedAt = at
        let s = summary(now: at)
        status = s.phase
        if (s.phase == "sent" || s.phase == "scheduled") && !undone { undoUntil = at + Double(ShareRules.undoSeconds) * 1000 }
    }

    public mutating func cancel(at: Double) {
        for t in targets where !["sent", "scheduled", "failed", "partial"].contains(t.status) { targetFailed(t.conv, reason: "cancelled", at: at) }
        finish(at: at)
    }

    public mutating func markUndone() {
        undone = true
        status = "undone"
        undoUntil = nil
    }

    public mutating func retry() {
        status = "running"
        finishedAt = nil
        undoUntil = nil
        for i in items.indices where items[i].status == "failed" {
            items[i].status = "pending"; items[i].sentBytes = 0; items[i].error = nil; items[i].attempts = 0
        }
        for i in targets.indices where targets[i].status != "sent" && targets[i].status != "scheduled" {
            targets[i].status = "queued"; targets[i].reason = nil; targets[i].attempts = 0
        }
    }

    public mutating func dropFailed(at: Double) {
        for i in items.indices where items[i].status == "failed" { items[i].status = "dropped" }
        for i in targets.indices where targets[i].status == "partial" && !targets[i].sentItems.isEmpty {
            targets[i].failedItems = []
            targets[i].status = "sent"
        }
        finish(at: at)
    }

    public func pendingFor(_ conv: String) -> [Int] {
        guard let t = targets.first(where: { $0.conv == conv }) else { return [] }
        return items.filter { $0.status != "dropped" && !t.sentItems.contains($0.index) }.map { $0.index }
    }

    public func clientId(targetIndex: Int, indexes: [Int]) -> String {
        let set = indexes.isEmpty ? "t" : indexes.map(String.init).joined(separator: "_")
        let raw = "\(id)-\(targetIndex)-\(set)"
        return String(raw.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }.prefix(80))
    }

    public struct Summary: Equatable {
        public var phase: String
        public var percent: Int
        public var totalBytes: Int64
        public var sentBytes: Int64
        public var speed: Double
        public var eta: Int?
        public var uploaded: Int
        public var itemCount: Int
        public var itemsOk: Int
        public var targetCount: Int
        public var done: Int
        public var failedTargets: Int
        public var partialTargets: Int
        public var seconds: Int?
        public var undoLeft: Int
    }

    public func summary(now: Double) -> Summary {
        let live = items.filter { $0.status != "dropped" }
        let total = live.reduce(Int64(0)) { $0 + $1.bytes }
        let sent = live.reduce(Int64(0)) { $0 + min($1.bytes, $1.sentBytes) }
        let up = live.filter { $0.status == "uploaded" }.count
        let done = targets.filter { $0.status == "sent" || $0.status == "scheduled" }.count
        let failed = targets.filter { $0.status == "failed" }.count
        let partial = targets.filter { $0.status == "partial" }.count
        let settled = targets.allSatisfy { ["sent", "scheduled", "failed", "partial"].contains($0.status) }
        let upFrac = total > 0 ? Double(sent) / Double(total) : (live.isEmpty ? 1 : Double(up) / Double(live.count))
        let sendFrac = targets.isEmpty ? 1 : Double(done + failed + partial) / Double(targets.count)
        var p = Int(((live.isEmpty ? sendFrac : upFrac * 0.8 + sendFrac * 0.2) * 100).rounded())
        if !settled { p = min(p, 99) }
        let elapsed = startedAt.map { max(1, now - $0) } ?? 0
        let speed = elapsed > 0 && sent > 0 ? Double(sent) / elapsed * 1000 : 0
        let eta = speed > 0 ? max(1, Int((Double(total - sent) / speed).rounded())) : nil
        let phase: String
        if status == "cancelled" { phase = "cancelled" }
        else if undone { phase = "undone" }
        else if !settled { phase = offline || status == "waiting" ? "waiting" : "sending" }
        else if failed == targets.count { phase = "failed" }
        else if failed > 0 || partial > 0 { phase = "partial" }
        else if targets.allSatisfy({ $0.status == "scheduled" }) { phase = "scheduled" }
        else { phase = "sent" }
        let itemsOk = live.filter { it in !targets.isEmpty && targets.allSatisfy { $0.sentItems.contains(it.index) } }.count
        let secs: Int? = (startedAt != nil && finishedAt != nil) ? max(1, Int(((finishedAt! - startedAt!) / 1000).rounded())) : nil
        let undoLeft = undoUntil.map { max(0, Int(ceil(($0 - now) / 1000))) } ?? 0
        return Summary(phase: phase, percent: max(0, min(100, p)), totalBytes: total, sentBytes: sent, speed: speed, eta: eta, uploaded: up,
                       itemCount: live.count, itemsOk: itemsOk, targetCount: targets.count, done: done, failedTargets: failed, partialTargets: partial, seconds: secs, undoLeft: undoLeft)
    }

    public func targetProgress(_ conv: String) -> Int {
        guard let t = targets.first(where: { $0.conv == conv }) else { return 0 }
        if t.status == "sent" || t.status == "scheduled" { return 100 }
        let live = items.filter { $0.status != "dropped" }
        if live.isEmpty { return t.status == "sending" ? 50 : 0 }
        var acc = 0.0
        for it in live {
            if t.sentItems.contains(it.index) { acc += 1 }
            else if it.status == "uploaded" { acc += 0.8 }
            else if it.bytes > 0 { acc += 0.8 * min(1, Double(it.sentBytes) / Double(it.bytes)) }
        }
        return Int((acc / Double(live.count) * 100).rounded())
    }

    /// ok | wait | fail for the item tiles.
    public func itemBadge(_ index: Int) -> String {
        guard let it = items.first(where: { $0.index == index }) else { return "wait" }
        if it.status == "failed" || targets.contains(where: { $0.failedItems.contains(index) }) { return "fail" }
        if !targets.isEmpty && targets.allSatisfy({ $0.sentItems.contains(index) }) { return "ok" }
        return "wait"
    }
}
