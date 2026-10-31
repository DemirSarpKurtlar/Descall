import Foundation

/// `-DescallWatchDemo` (CI screenshots, App Store shots): fixed sample data instead of
/// the iPhone, so the simulator shows every screen without a paired phone or a sign-in.
/// `-DescallWatchDemoScreen chats|chat|reply|friends|status` picks the first screen.
enum WatchDemo {
    static var screen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-DescallWatchDemo"), let i = args.firstIndex(of: "-DescallWatchDemoScreen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static let chatRoute = ChatRoute(conv: "dm:demo-ayse", title: "Ayşe")

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
        if path.hasPrefix("/api/admin/overview") {
            return "{\"live\":{\"connected\":42},\"product\":{\"signupsToday\":7,\"newFeedback\":2},\"safety\":{\"openReports\":3},\"health\":{\"level\":\"watch\"}}"
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
        return Data(WatchDemo.json(for: path).utf8)
    }
}
