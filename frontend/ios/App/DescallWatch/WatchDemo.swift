import Foundation

/// `-DescallWatchDemo` (CI screenshots, App Store shots): fixed sample data instead of
/// the iPhone, so the simulator shows every screen without a paired phone or a sign-in.
/// `-DescallWatchDemoScreen chats|chat|reply|servers|server|friends|status|activity|calls|profile|offline|admin|...`
/// picks the first screen. `offline` shows cached chats with the iPhone out of reach.
enum WatchDemo {
    static var screen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-DescallWatchDemo"), let i = args.firstIndex(of: "-DescallWatchDemoScreen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static let chatRoute = ChatRoute(conv: "dm:demo-ayse", title: "Ayşe")
    static let serverId = "demo-srv-1"
    static var isOffline: Bool { screen == "offline" }

    /// Offline demo: the chats list as if it came from the cache 7 minutes ago.
    static var offlineHome: Loadable<WatchHome> {
        guard let home = try? JSONDecoder().decode(WatchHome.self, from: Data(json(for: "/api/watch/home").utf8)) else { return Loadable() }
        return Loadable(value: home, error: .unreachable, updatedAt: Date().addingTimeInterval(-7 * 60), loading: false, fromCache: true)
    }

    static let demoCase = AdminReportGroup(
        targetId: "demo-troll", targetUsername: "troll42", targetDisplayName: nil, targetAvatarUrl: nil,
        openCount: 3, totalCount: 3, assigneeUsername: nil, latestAt: iso(minutesAgo: 4),
        reports: [
            AdminReport(id: "r1", reporterUsername: "ayse", reason: "harassment", reasonLabel: "Taciz", note: "Sürekli küfür ediyor, sesli kanalda da.", snippet: nil, status: "open", createdAt: iso(minutesAgo: 4)),
            AdminReport(id: "r2", reporterUsername: "mert", reason: "spam", reasonLabel: "Spam", note: nil, snippet: "Link atıp duruyor", status: "open", createdAt: iso(minutesAgo: 30)),
        ]
    )

    static var adminPath: [AdminRoute] {
        switch screen {
        case "reports": return [.reports]
        case "case": return [.reportCase(demoCase)]
        case "feedback": return [.feedback]
        case "maintenance": return [.maintenance]
        default: return []
        }
    }

    static func iso(minutesAgo: Int) -> String {
        let f = ISO8601DateFormatter()
        return f.string(from: Date().addingTimeInterval(TimeInterval(-60 * minutesAgo)))
    }

    static func json(for path: String) -> String {
        if path.hasPrefix("/api/watch/home") {
            return """
            {"me":{"id":"demo-me","name":"Demirr","initials":"DE","avatarUrl":null,"status":"online"},
             "conversations":[
              {"conv":"dm:demo-ayse","kind":"dm","title":"Ayşe","initials":"AY","avatarUrl":null,"presence":"online","preview":"Akşam sesli kanala gelir misin?","at":"\(iso(minutesAgo: 2))"},
              {"conv":"group:demo-ekip","kind":"group","title":"Ekip","initials":"EK","avatarUrl":null,"presence":null,"preview":"Can: maç 21:00 de","at":"\(iso(minutesAgo: 9))"},
              {"conv":"dm:demo-mert","kind":"dm","title":"Mert","initials":"ME","avatarUrl":null,"presence":"idle","preview":"Tamam, yarın konuşuruz","at":"\(iso(minutesAgo: 40))"},
              {"conv":"dm:demo-sn","kind":"dm","title":"sn1pez53","initials":"SN","avatarUrl":null,"presence":"dnd","preview":"Fotoğraf","at":"\(iso(minutesAgo: 300))"}
             ],"adminSections":["overview","reports","feedback","errors","maintenance"]}
            """
        }
        if path.hasPrefix("/api/watch/thread") {
            return """
            {"conv":"dm:demo-ayse","title":"Ayşe","subtitle":"","messages":[
              {"id":"1","mine":false,"author":"Ayşe","text":"Selam, naber?","kind":"text","at":"\(iso(minutesAgo: 6))"},
              {"id":"2","mine":true,"author":"Demirr","text":"İyi, sen?","kind":"text","at":"\(iso(minutesAgo: 5))"},
              {"id":"3","mine":false,"author":"Ayşe","text":"Akşam sesli kanala gelir misin?","kind":"text","at":"\(iso(minutesAgo: 2))"}
            ]}
            """
        }
        if path.hasPrefix("/api/watch/friends") {
            return """
            {"online":[
              {"id":"demo-ayse","conv":"dm:demo-ayse","name":"Ayşe","initials":"AY","avatarUrl":null,"presence":"online","customStatus":"Ders çalışıyorum"},
              {"id":"demo-mert","conv":"dm:demo-mert","name":"Mert","initials":"ME","avatarUrl":null,"presence":"idle","customStatus":null},
              {"id":"demo-sn","conv":"dm:demo-sn","name":"sn1pez53","initials":"SN","avatarUrl":null,"presence":"dnd","customStatus":null}
            ],"onlineCount":3,"offlineCount":12}
            """
        }
        if path.hasPrefix("/api/watch/servers") {
            return """
            {"servers":[
              {"id":"demo-srv-1","name":"Descall Topluluk","initials":"DT","iconUrl":null,"memberCount":128,"muted":false,"timedOut":false,"channels":[
                {"conv":"channel:demo-genel","name":"genel","category":"Sohbet"},
                {"conv":"channel:demo-duyuru","name":"duyurular","category":"Sohbet"},
                {"conv":"channel:demo-yardim","name":"yardım","category":"Destek"}]},
              {"id":"demo-srv-2","name":"Ekip","initials":"EK","iconUrl":null,"memberCount":9,"muted":true,"timedOut":false,"channels":[
                {"conv":"channel:demo-ekip","name":"genel","category":null}]}
            ]}
            """
        }
        if path.hasPrefix("/api/watch/calls") {
            return """
            {"calls":[
              {"id":"c1","kind":"dm","title":"Ayşe","initials":"AY","avatarUrl":null,"conv":"dm:demo-ayse","direction":"incoming","video":false,"missed":true,"durationSec":0,"at":"\(iso(minutesAgo: 15))"},
              {"id":"c2","kind":"group","title":"Ekip","initials":"EK","avatarUrl":null,"conv":"group:demo-ekip","direction":"group","video":false,"missed":false,"durationSec":2710,"at":"\(iso(minutesAgo: 120))"},
              {"id":"c3","kind":"dm","title":"Mert","initials":"ME","avatarUrl":null,"conv":"dm:demo-mert","direction":"outgoing","video":true,"missed":false,"durationSec":325,"at":"\(iso(minutesAgo: 1500))"}
            ]}
            """
        }
        if path.hasPrefix("/api/watch/activity") {
            return """
            {"items":[
              {"id":"call:c1","type":"missedCall","title":"Ayşe","initials":"AY","avatarUrl":null,"conv":"dm:demo-ayse","at":"\(iso(minutesAgo: 15))"},
              {"id":"req:1","type":"friendRequest","title":"Zeynep","initials":"ZE","avatarUrl":null,"conv":null,"at":"\(iso(minutesAgo: 45))"},
              {"id":"req:2","type":"friendRequest","title":"kaan.dev","initials":"KA","avatarUrl":null,"conv":null,"at":"\(iso(minutesAgo: 200))"}
            ],"requestCount":2,"missedCount":1}
            """
        }
        if path.hasPrefix("/api/admin/overview") {
            return """
            {"generatedAt":"\(iso(minutesAgo: 0))","health":{"level":"watch"},
             "live":{"connected":42,"visible":37,"invisible":5,"statusCounts":{"online":28,"idle":6,"dnd":3,"invisible":5}},
             "product":{"signupsToday":7,"newFeedback":2,"feedbackInProgress":1,"sparkline":[{"date":"d1","signups":4},{"date":"d2","signups":9},{"date":"d3","signups":6},{"date":"d4","signups":12},{"date":"d5","signups":5},{"date":"d6","signups":8},{"date":"d7","signups":7}]},
             "safety":{"openReports":3,"uniqueTargets":2,"hotTargets":[],"bans":4,"timeouts":1},
             "system":{"uptime":{"label":"6d 4h","seconds":533000},"maintenance":false,"chatFrozen":false,"rssMb":212,"errorsLastHour":3,"flaggedMessages":1},
             "newlyJoined":[{"id":"n1","username":"zeynep","displayName":"Zeynep","avatarUrl":null}],
             "recentAudit":[{"id":"a1","at":"\(iso(minutesAgo: 8))","actor":"demirr","action":"timeout","target":"troll42"},{"id":"a2","at":"\(iso(minutesAgo: 95))","actor":"mod_can","action":"report_resolved","target":"bedava_coin"}]}
            """
        }
        if path.hasPrefix("/api/admin/reports") {
            return """
            {"openCount":4,"groups":[
              {"targetId":"demo-troll","targetUsername":"troll42","openCount":3,"latestAt":"\(iso(minutesAgo: 4))","reports":[{"id":"r1","reasonLabel":"Taciz","status":"open"}]},
              {"targetId":"demo-spam","targetUsername":"bedava_coin","openCount":1,"latestAt":"\(iso(minutesAgo: 50))","reports":[{"id":"r9","reasonLabel":"Spam","status":"open"}]}
            ]}
            """
        }
        if path.hasPrefix("/api/admin/feedback") {
            return path.contains("in_progress") ? "{\"feedbacks\":[]}" : """
            {"feedbacks":[
              {"id":"f1","user":{"username":"ayse"},"status":"new","subject":"Ses kanalında yankı var","message":"Ses kanalında yankı var, kulaklıkla da oluyor.","created_at":"\(iso(minutesAgo: 12))","replies":[]},
              {"id":"f2","user":{"username":"mert"},"status":"new","subject":"Saat uygulaması süper","message":"Saat uygulaması süper olmuş.","created_at":"\(iso(minutesAgo: 90))","replies":[]}
            ]}
            """
        }
        if path.hasPrefix("/api/admin/maintenance/windows") {
            return "{\"current\":{\"id\":\"w1\",\"title\":\"Acil bakım\",\"status\":\"active\",\"startsAt\":\"\(iso(minutesAgo: 10))\",\"endsAt\":\"\(iso(minutesAgo: -20))\"},\"summary\":{\"systemStatus\":\"maintenance\"}}"
        }
        if path.hasPrefix("/api/admin/step-up") {
            return "{\"ok\":true,\"token\":\"demo\",\"expiresInSec\":900}"
        }
        return "{\"ok\":true}"
    }
}

final class WatchDemoTransport: WatchTransport {
    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data {
        try await Task.sleep(nanoseconds: 150_000_000)
        if WatchDemo.isOffline { throw WatchError.unreachable }
        return Data(WatchDemo.json(for: path).utf8)
    }
}
