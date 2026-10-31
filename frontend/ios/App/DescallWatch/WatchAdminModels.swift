import Foundation

/// Admin payloads (existing /api/admin routes, see backend/routes/admin*.js). Every
/// field is optional where the server may leave it out, so a new field never breaks
/// the watch.

struct AdminOverview: Decodable {
    struct Live: Decodable { var connected: Int? }
    struct Product: Decodable { var signupsToday: Int?; var newFeedback: Int?; var feedbackInProgress: Int? }
    struct Safety: Decodable { var openReports: Int?; var uniqueTargets: Int? }
    struct Health: Decodable { var level: String? }
    var live: Live?
    var product: Product?
    var safety: Safety?
    var health: Health?
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
