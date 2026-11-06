import Foundation

/// Admin payloads (existing /api/admin routes, see backend/routes/admin*.js). Every
/// field is optional where the server may leave it out, so a new field never breaks
/// the watch.

/// 3.7.33: the full /api/admin/overview the web admin reads. Every field is optional and
/// decoded leniently so one odd value never blanks the whole dashboard.
struct AdminOverview: Decodable {
    struct StatusCounts: Decodable { var online: Int?; var idle: Int?; var dnd: Int?; var invisible: Int? }
    struct Live: Decodable {
        var connected: Int?
        var visible: Int?
        var invisible: Int?
        var statusCounts: StatusCounts?
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            connected = c.int(.connected); visible = c.int(.visible); invisible = c.int(.invisible)
            statusCounts = try? c.decodeIfPresent(StatusCounts.self, forKey: .statusCounts)
        }
        init(connected: Int? = nil, visible: Int? = nil, invisible: Int? = nil, statusCounts: StatusCounts? = nil) {
            self.connected = connected; self.visible = visible; self.invisible = invisible; self.statusCounts = statusCounts
        }
        enum K: String, CodingKey { case connected, visible, invisible, statusCounts }
    }
    struct Day: Decodable, Hashable { var date: String; var signups: Int }
    struct Product: Decodable {
        var signupsToday: Int?
        var newFeedback: Int?
        var feedbackInProgress: Int?
        var sparkline: [Day]
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            signupsToday = c.int(.signupsToday); newFeedback = c.int(.newFeedback); feedbackInProgress = c.int(.feedbackInProgress)
            sparkline = c.lossy(.sparkline)
        }
        init(signupsToday: Int? = nil, newFeedback: Int? = nil, feedbackInProgress: Int? = nil, sparkline: [Day] = []) {
            self.signupsToday = signupsToday; self.newFeedback = newFeedback; self.feedbackInProgress = feedbackInProgress; self.sparkline = sparkline
        }
        enum K: String, CodingKey { case signupsToday, newFeedback, feedbackInProgress, sparkline }
    }
    struct Safety: Decodable {
        var openReports: Int?
        var uniqueTargets: Int?
        var bans: Int?
        var timeouts: Int?
        var hotCount: Int
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            openReports = c.int(.openReports); uniqueTargets = c.int(.uniqueTargets); bans = c.int(.bans); timeouts = c.int(.timeouts)
            hotCount = (c.lossy(.hotTargets) as [AnyJSON]).count
        }
        init(openReports: Int? = nil, uniqueTargets: Int? = nil, bans: Int? = nil, timeouts: Int? = nil, hotCount: Int = 0) {
            self.openReports = openReports; self.uniqueTargets = uniqueTargets; self.bans = bans; self.timeouts = timeouts; self.hotCount = hotCount
        }
        enum K: String, CodingKey { case openReports, uniqueTargets, bans, timeouts, hotTargets }
    }
    struct Uptime: Decodable { var label: String?; var seconds: Int? }
    struct System: Decodable {
        var uptime: Uptime?
        var maintenance: Bool
        var chatFrozen: Bool
        var rssMb: Int?
        var errorsLastHour: Int?
        var flaggedMessages: Int?
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            uptime = try? c.decodeIfPresent(Uptime.self, forKey: .uptime)
            maintenance = (try? c.decodeIfPresent(Bool.self, forKey: .maintenance)) ?? false
            chatFrozen = (try? c.decodeIfPresent(Bool.self, forKey: .chatFrozen)) ?? false
            rssMb = c.int(.rssMb); errorsLastHour = c.int(.errorsLastHour); flaggedMessages = c.int(.flaggedMessages)
        }
        init(uptime: Uptime? = nil, maintenance: Bool = false, chatFrozen: Bool = false, rssMb: Int? = nil, errorsLastHour: Int? = nil, flaggedMessages: Int? = nil) {
            self.uptime = uptime; self.maintenance = maintenance; self.chatFrozen = chatFrozen; self.rssMb = rssMb; self.errorsLastHour = errorsLastHour; self.flaggedMessages = flaggedMessages
        }
        enum K: String, CodingKey { case uptime, maintenance, chatFrozen, rssMb, errorsLastHour, flaggedMessages }
    }
    struct Health: Decodable { var level: String? }
    struct Person: Decodable, Hashable, Identifiable {
        var id: String
        var username: String?
        var displayName: String?
        var avatarUrl: String?
        var status: String?
        var name: String { displayName?.isEmpty == false ? displayName! : (username ?? "?") }
    }
    struct Audit: Decodable, Hashable, Identifiable {
        var id: String
        var at: String?
        var actor: String?
        var action: String?
        var target: String?
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            at = try? c.decodeIfPresent(String.self, forKey: .at)
            actor = try? c.decodeIfPresent(String.self, forKey: .actor)
            action = try? c.decodeIfPresent(String.self, forKey: .action)
            target = try? c.decodeIfPresent(String.self, forKey: .target)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? c.int(.id).map(String.init) ?? "\(at ?? "")|\(action ?? "")|\(target ?? "")"
        }
        init(id: String, at: String?, actor: String?, action: String?, target: String?) {
            self.id = id; self.at = at; self.actor = actor; self.action = action; self.target = target
        }
        enum K: String, CodingKey { case id, at, actor, action, target }
    }

    var generatedAt: String?
    var live: Live?
    var product: Product?
    var safety: Safety?
    var system: System?
    var health: Health?
    var newlyJoined: [Person]
    var recentAudit: [Audit]

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        generatedAt = try? c.decodeIfPresent(String.self, forKey: .generatedAt)
        live = try? c.decodeIfPresent(Live.self, forKey: .live)
        product = try? c.decodeIfPresent(Product.self, forKey: .product)
        safety = try? c.decodeIfPresent(Safety.self, forKey: .safety)
        system = try? c.decodeIfPresent(System.self, forKey: .system)
        health = try? c.decodeIfPresent(Health.self, forKey: .health)
        newlyJoined = c.lossy(.newlyJoined)
        recentAudit = c.lossy(.recentAudit)
    }

    init(live: Live?, product: Product?, safety: Safety?, system: System?, health: Health?, newlyJoined: [Person] = [], recentAudit: [Audit] = [], generatedAt: String? = nil) {
        self.live = live; self.product = product; self.safety = safety; self.system = system; self.health = health
        self.newlyJoined = newlyJoined; self.recentAudit = recentAudit; self.generatedAt = generatedAt
    }

    enum K: String, CodingKey { case generatedAt, live, product, safety, system, health, newlyJoined, recentAudit }
}

/// Accepts any JSON value (used to count hot targets without modelling them).
struct AnyJSON: Decodable { init(from decoder: Decoder) throws {} }

extension KeyedDecodingContainer {
    /// Int that tolerates a Double or numeric string.
    func int(_ key: Key) -> Int? {
        if let v = try? decodeIfPresent(Int.self, forKey: key) { return v }
        if let v = try? decodeIfPresent(Double.self, forKey: key), v.isFinite { return Int(v) }
        if let s = try? decodeIfPresent(String.self, forKey: key) { return Int(s) }
        return nil
    }
}

struct AdminReportsResponse: Decodable {
    var groups: [AdminReportGroup]?
    var openCount: Int?
}

struct AdminReportGroup: Decodable, Identifiable, Hashable {
    var targetId: String
    var targetUsername: String?
    var targetDisplayName: String?
    var targetAvatarUrl: String?
    var openCount: Int?
    var totalCount: Int?
    var assigneeUsername: String?
    var latestAt: String?
    var reports: [AdminReport]?
    var id: String { targetId }
    var name: String { targetDisplayName?.isEmpty == false ? targetDisplayName! : (targetUsername ?? "?") }
}

struct AdminReport: Decodable, Identifiable, Hashable {
    var id: String
    var reporterUsername: String?
    var reason: String?
    var reasonLabel: String?
    var note: String?
    var snippet: String?
    var status: String?
    var createdAt: String?
}

struct AdminFeedbackResponse: Decodable {
    var feedbacks: [AdminFeedback]?
}

struct AdminFeedback: Decodable, Identifiable, Hashable {
    struct User: Decodable, Hashable { var username: String?; var displayName: String? }
    struct Reply: Decodable, Hashable {
        var id: String?
        var type: String?
        var `internal`: Bool?
        var isAdmin: Bool?
        var text: String?
        var adminUsername: String?
        var created_at: String?
    }
    var id: String
    var user: User?
    var category: String?
    var kind: String?
    var status: String?
    var subject: String?
    var message: String?
    var created_at: String?
    var replies: [Reply]?
    var who: String { user?.displayName?.isEmpty == false ? user!.displayName! : (user?.username ?? "?") }
}

struct AdminErrorGroupsResponse: Decodable {
    struct Stats: Decodable { var open: Int? }
    var groups: [AdminErrorGroup]?
    var stats: Stats?
}

struct AdminErrorGroup: Decodable, Identifiable, Hashable {
    var fingerprint: String
    var title: String?
    var count: Int?
    var users: Int?
    var lastSeen: String?
    var status: String?
    var regressed: Bool?
    var isNew: Bool?
    var id: String { fingerprint }
}

struct AdminMaintenanceResponse: Decodable {
    struct Summary: Decodable { var systemStatus: String? }
    var current: AdminMaintenanceWindow?
    var summary: Summary?
}

struct AdminMaintenanceWindow: Decodable, Hashable {
    var id: String
    var title: String?
    var message: String?
    var status: String?
    var startsAt: String?
    var endsAt: String?
}

struct AdminAccessBansResponse: Decodable {
    var bans: [AdminAccessBan]?
}

struct AdminAccessBan: Decodable, Identifiable, Hashable {
    var id: String
    var kind: String?
    var label: String?
    var reason: String?
    var sourceUsername: String?
    var createdAt: String?
    var expiresAt: String?
    var hits: Int?
}

struct AdminPeopleResponse: Decodable {
    var users: [AdminPerson]?
}

struct AdminPerson: Decodable, Identifiable, Hashable {
    var id: String
    var username: String?
    var displayName: String?
    var isOnline: Bool?
    var isAdmin: Bool?
    var name: String { displayName?.isEmpty == false ? displayName! : (username ?? "?") }
}

struct AdminStepUpResponse: Decodable {
    var token: String?
    var expiresInSec: Int?
}

/// Routes inside the admin tab.
enum AdminRoute: Hashable {
    case reports
    case reportCase(AdminReportGroup)
    case feedback
    case feedbackItem(AdminFeedback)
    case errors
    case maintenance
    case accessBans
    case people
    case person(AdminPerson)
}

/// Sections the watch can show, in menu order (ids = backend GRANTABLE_SECTIONS).
enum AdminSection: String, CaseIterable {
    case reports, feedback, errors, maintenance, accessBans, people

    var route: AdminRoute {
        switch self {
        case .reports: return .reports
        case .feedback: return .feedback
        case .errors: return .errors
        case .maintenance: return .maintenance
        case .accessBans: return .accessBans
        case .people: return .people
        }
    }

    var icon: String {
        switch self {
        case .reports: return "flag.fill"
        case .feedback: return "bubble.left.and.text.bubble.right.fill"
        case .errors: return "ladybug.fill"
        case .maintenance: return "wrench.and.screwdriver.fill"
        case .accessBans: return "hand.raised.fill"
        case .people: return "person.crop.circle"
        }
    }
}
