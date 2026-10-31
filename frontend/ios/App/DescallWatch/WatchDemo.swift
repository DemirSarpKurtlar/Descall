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
        return "{\"ok\":true}"
    }
}

final class WatchDemoTransport: WatchTransport {
    func send(method: String, path: String, body: Data?, stepUp: String?) async throws -> Data {
        try await Task.sleep(nanoseconds: 150_000_000)
        return Data(WatchDemo.json(for: path).utf8)
    }
}
