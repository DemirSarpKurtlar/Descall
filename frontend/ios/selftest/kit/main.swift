import Foundation

// DescallKit (4.2) selftest: models, API origin rules, error mapping and the API client
// against a stubbed URLProtocol (no network, no Keychain).
// swiftc -o /tmp/kit App/DescallKit/*.swift selftest/kit/main.swift && /tmp/kit

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok {
        failures += 1
        print("FAIL [\(line)] \(what)")
    }
}
func eq<T: Equatable>(_ a: T, _ b: T, _ what: String, line: Int = #line) {
    check(a == b, "\(what): \(a) != \(b)", line: line)
}

// MARK: API origin

eq(DescallAPIBase.validated(nil), DescallAPIBase.production, "nil -> production")
eq(DescallAPIBase.validated("https://des-call.onrender.com/"), "https://des-call.onrender.com", "trailing slash dropped")
eq(DescallAPIBase.validated("https://API.descall.com/x/y"), "https://api.descall.com", "subdomain, path dropped")
eq(DescallAPIBase.validated("http://des-call.onrender.com"), DescallAPIBase.production, "http refused")
eq(DescallAPIBase.validated("https://evil.example.com"), DescallAPIBase.production, "foreign host refused")
eq(DescallAPIBase.validated("https://descall.com.evil.com"), DescallAPIBase.production, "suffix trick refused")
eq(DescallAPIBase.validated("https://user:pw@descall.com"), DescallAPIBase.production, "credentials refused")
eq(DescallAPIBase.validated("https://descall.com:8443"), "https://descall.com:8443", "port kept")

// MARK: Errors

eq(DescallAPIError.from(status: 200, body: nil), nil, "2xx is no error")
eq(DescallAPIError.from(status: 401, body: nil), .unauthorized, "401")
eq(DescallAPIError.from(status: 403, body: Data(#"{"error":"banned"}"#.utf8)), .banned, "banned")
eq(DescallAPIError.from(status: 403, body: Data(#"{"error":"not_friends"}"#.utf8)), .forbidden, "403")
eq(DescallAPIError.from(status: 400, body: Data(#"{"error":"bad_text"}"#.utf8)), .badRequest("bad_text"), "400 code")
eq(DescallAPIError.from(status: 429, body: nil), .rateLimited, "429")
eq(DescallAPIError.from(status: 503, body: nil), .server(503), "503")
eq(DescallAPIError.from(transport: URLError(.timedOut)), .timeout, "timeout")
eq(DescallAPIError.from(transport: URLError(.notConnectedToInternet)), .offline, "offline")
eq(DescallAPIError.from(transport: URLError(.cancelled)), .cancelled, "cancelled")
eq(DescallAPIError.from(transport: CancellationError()), .cancelled, "task cancelled")
check(DescallAPIError.server(502).isRetryable && DescallAPIError.timeout.isRetryable, "5xx / timeout retry")
check(!DescallAPIError.unauthorized.isRetryable && DescallAPIError.unauthorized.needsSignIn, "401 needs sign-in")

// MARK: Message rules

eq(DescallMessageRules.cleaned("  hi  "), "hi", "trimmed")
eq(DescallMessageRules.cleaned("   "), nil, "empty refused")
eq(DescallMessageRules.cleaned(String(repeating: "a", count: 1001)), nil, "too long refused")
check(DescallMessageRules.isValidConv("dm:11111111-1111-4111-8111-111111111111"), "dm conv")
check(DescallMessageRules.isValidConv("channel:abc"), "channel conv")
check(!DescallMessageRules.isValidConv("dm:../x"), "path trick refused")
check(!DescallMessageRules.isValidConv("user:1"), "unknown kind refused")
check(!DescallMessageRules.isValidConv("dm:"), "empty id refused")

// MARK: Models (lenient decoding)

let summaryJSON = """
{"me":{"id":"me","username":"ben","name":"Ben","initials":"B","avatarUrl":null,"status":"dnd"},
 "unread":{"total":5,"dms":3,"groups":2,"channels":0,"top":[{"conv":"dm:a","kind":"dm","title":"Ayşe","count":3}]},
 "friends":{"onlineCount":1,"offlineCount":4,"online":[{"id":"a","username":"ayse","name":"Ayşe Yılmaz","presence":"weird"}]},
 "voice":[{"serverId":"s","serverName":"Oyun","channelId":"v","channelName":"Lobi","type":"voice","occupantCount":1,
   "occupants":[{"id":"a","name":"Ayşe"},{"id":"b","name":"Bora"}]}],
 "generatedAt":"2026-11-24T00:00:00.000Z","extra":true}
"""
do {
    let s = try JSONDecoder().decode(DescallSummary.self, from: Data(summaryJSON.utf8))
    eq(s.me.status, .dnd, "my status")
    eq(s.unread.total, 5, "unread total")
    eq(s.friends.online.first?.presence, .offline, "unknown presence falls back")
    eq(s.friends.online.first?.initials, "AY", "initials computed when missing")
    eq(s.friends.online.first?.conv, "dm:a", "conv computed when missing")
    eq(s.voice.first?.occupantCount, 2, "occupant count never below the list")
} catch {
    check(false, "summary decodes: \(error)")
}
do {
    let u = try JSONDecoder().decode(DescallUnread.self, from: Data(#"{"total":-3}"#.utf8))
    eq(u, DescallUnread(total: 0, dms: 0, groups: 0, channels: 0, top: []), "missing / negative counts")
} catch {
    check(false, "unread decodes: \(error)")
}

// MARK: Deep links

eq(DescallDeepLink.dm(username: "ayşe")?.absoluteString, "descall://dm/ay%C5%9Fe", "dm link encoded")
eq(DescallDeepLink.server("s1", channel: "c1")?.absoluteString, "descall://server/s1/c1", "channel link")
eq(DescallDeepLink.dm(username: "a/b")?.absoluteString, "descall://dm/a%2Fb", "slash encoded")
eq(DescallDeepLink.group("")?.absoluteString, nil, "empty id refused")
let place = try? JSONDecoder().decode(DescallDestination.self, from: Data(##"{"id":"channel:c1","kind":"channel","title":"#genel","serverId":"s1","channelId":"c1"}"##.utf8))
eq(place?.deepLink?.absoluteString, "descall://server/s1/c1", "destination link")
eq(DescallText.initials(of: "@ili_kaya"), "İK", "Turkish upper case")

// MARK: API client against a stub

final class Stub: URLProtocol {
    static var handler: ((URLRequest) -> (Int, String))?
    static var seen: [URLRequest] = []
    static var count = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Stub.seen.append(request)
        let (status, body) = Stub.handler?(request) ?? (500, "{}")
        if status == -1 {
            client?.urlProtocol(self, didFailWithError: URLError(.timedOut))
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

// Async part in a function (no top-level await: top-level state stays non-isolated).
func clientTests() async {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [Stub.self]
    let session = DescallSession(token: "tok", apiBase: "https://evil.example.com", locale: "tr")
    let client = DescallAPIClient(session: session, urlSession: URLSession(configuration: config), retries: 1)

    Stub.handler = { _ in (200, #"{"friends":[{"id":"a","name":"Ayşe","presence":"online"}]}"#) }
    do {
        let friends = try await client.friends(matching: " ay ", ids: ["a"])
        eq(friends.map(\.id), ["a"], "friends decoded")
        let req = Stub.seen.last!
        eq(req.url?.host, "des-call.onrender.com", "foreign apiBase never used")
        eq(req.value(forHTTPHeaderField: "Authorization"), "Bearer tok", "bearer")
        eq(req.value(forHTTPHeaderField: "Accept-Language"), "tr", "locale")
        check(req.url?.query?.contains("q=ay") == true && req.url?.query?.contains("ids=a") == true, "query items")
    } catch {
        check(false, "friends call: \(error)")
    }

    Stub.count = 0
    Stub.handler = { _ in Stub.count += 1; return Stub.count == 1 ? (503, "{}") : (200, #"{"rooms":[]}"#) }
    do {
        let rooms = try await client.voiceRooms(occupiedOnly: true)
        eq(rooms.count, 0, "rooms decoded after one retry")
        eq(Stub.count, 2, "one retry after 503")
    } catch {
        check(false, "retry: \(error)")
    }

    Stub.count = 0
    Stub.handler = { _ in Stub.count += 1; return (503, "{}") }
    do {
        _ = try await client.sendMessage(conv: "dm:a", text: "selam")
        check(false, "503 send must throw")
    } catch let e as DescallAPIError {
        eq(e, .server(503), "send error")
        eq(Stub.count, 1, "a write is never retried")
    } catch {
        check(false, "unexpected \(error)")
    }

    Stub.handler = { _ in (401, "{}") }
    do {
        _ = try await client.summary()
        check(false, "401 must throw")
    } catch let e as DescallAPIError {
        eq(e, .unauthorized, "401 surfaces")
    } catch {
        check(false, "unexpected \(error)")
    }

    do {
        _ = try await client.sendMessage(conv: "dm:a", text: "   ")
        check(false, "empty text must throw")
    } catch let e as DescallAPIError {
        eq(e, .badRequest("bad_text"), "empty text refused before the network")
    } catch {
        check(false, "unexpected \(error)")
    }

    Stub.handler = { req in
        let body = req.httpBodyStream.map { s -> String in
            s.open(); defer { s.close() }
            var buf = [UInt8](repeating: 0, count: 4096)
            let n = s.read(&buf, maxLength: buf.count)
            return String(decoding: buf.prefix(max(0, n)), as: UTF8.self)
        } ?? String(decoding: req.httpBody ?? Data(), as: UTF8.self)
        return body.contains("\"status\":\"dnd\"") ? (200, #"{"ok":true,"status":"dnd"}"#) : (400, #"{"error":"bad_status"}"#)
    }
    do {
        let r = try await client.setStatus(.dnd)
        eq(r.status, .dnd, "status set")
        eq(Stub.seen.last?.httpMethod, "POST", "POST")
    } catch {
        check(false, "status: \(error)")
    }

    Stub.handler = { req in
        let body = req.httpBodyStream.map { s -> String in
            s.open(); defer { s.close() }
            var buf = [UInt8](repeating: 0, count: 4096)
            let n = s.read(&buf, maxLength: buf.count)
            return String(decoding: buf.prefix(max(0, n)), as: UTF8.self)
        } ?? String(decoding: req.httpBody ?? Data(), as: UTF8.self)
        return body.contains("\"to\":\"e1\"") ? (200, #"{"ok":true,"remainingToday":19,"remainingForFriend":4}"#) : (400, "{}")
    }
    do {
        let r = try await client.wave(to: "e1")
        eq(r.remainingForFriend, 4, "wave result")
        eq(Stub.seen.last?.url?.path, "/api/native/wave", "wave path")
    } catch {
        check(false, "wave: \(error)")
    }
    Stub.handler = { _ in (429, #"{"error":"wave_limit","retryAfter":3600}"#) }
    do {
        _ = try await client.wave(to: "e1")
        check(false, "a wave over the limit must throw")
    } catch let e as DescallAPIError {
        eq(e, .rateLimited, "429 -> rateLimited")
    } catch {
        check(false, "unexpected \(error)")
    }
    do {
        _ = try await client.wave(to: "../x")
        check(false, "bad id must throw")
    } catch let e as DescallAPIError {
        eq(e, .badRequest("bad_target"), "bad id refused before the network")
    } catch {
        check(false, "unexpected \(error)")
    }

    Stub.handler = { _ in (-1, "") }
    do {
        _ = try await client.summary()
        check(false, "timeout must throw")
    } catch let e as DescallAPIError {
        eq(e, .timeout, "timeout after the retry")
    } catch {
        check(false, "unexpected \(error)")
    }
}

// MARK: Widgets (draft B): activity line, speech bubbles, voice room since / screen

let widgetJSON = ##"""
{"me":{"id":"m","name":"Demir","status":"online"},
 "unread":{"total":8,"dms":3,"groups":4,"channels":1,"top":[
   {"conv":"dm:e1","kind":"dm","title":"Ece","count":3,"peerId":"e1","username":"ece","preview":"Akşam 9'da sese gelir misin?","at":"2026-11-24T19:58:00.000Z","mention":false},
   {"conv":"group:g1","kind":"group","title":"Kampüs Ekibi","count":4,"by":"Kaan","preview":"Notları attım"},
   {"conv":"channel:c1","kind":"channel","title":"Gece Kuşu #duyurular","count":1,"serverId":"s1","mention":true}]},
 "friends":{"onlineCount":2,"offlineCount":0,"online":[
   {"id":"e1","name":"Ece","presence":"online","activity":{"kind":"game","label":"Minecraft","since":"2026-11-24T19:00:00Z"}},
   {"id":"k1","name":"Kaan","presence":"online","activity":{"kind":"voice","label":"Oyun Gecesi"}},
   {"id":"z1","name":"Zeynep","presence":"idle","activity":null}]},
 "voice":[{"serverId":"s1","serverName":"Gece Kuşu","channelId":"v1","channelName":"Oyun Gecesi","type":"voice","occupantCount":2,
   "since":"2026-11-24T19:10:00.000Z","occupants":[{"id":"k1","name":"Kaan","screen":false},{"id":"a1","name":"Arda","screen":true}]}]}
"""##
do {
    let w = try JSONDecoder().decode(DescallSummary.self, from: Data(widgetJSON.utf8))
    eq(w.friends.online[0].activity?.kind, "game", "activity kind")
    eq(w.friends.online[0].activity?.label, "Minecraft", "activity label")
    check(w.friends.online[0].activity?.sinceDate != nil, "activity since without fractional seconds parses")
    eq(w.friends.online[2].activity, nil, "null activity")
    eq(w.unread.top[0].preview, "Akşam 9'da sese gelir misin?", "bubble text")
    eq(w.unread.top[0].deepLink?.absoluteString, "descall://dm/ece", "dm bubble opens the DM")
    eq(w.unread.top[1].by, "Kaan", "group sender")
    eq(w.unread.top[1].deepLink?.absoluteString, "descall://group/g1", "group bubble link")
    eq(w.unread.top[2].mention, true, "mention flag")
    eq(w.unread.top[2].deepLink?.absoluteString, "descall://server/s1/c1", "channel bubble link")
    eq(w.voice[0].occupants[1].screen, true, "screen share flag")
    eq(w.voice[0].since, "2026-11-24T19:10:00.000Z", "room since")
    check(DescallDates.parse("2026-11-24T19:10:00.000Z") != nil, "fractional ISO date")
} catch {
    check(false, "widget summary decodes: \(error)")
}
// Old payloads (Siri) still decode: every widget field is optional.
let oldRow = try? JSONDecoder().decode(DescallUnreadConversation.self, from: Data(#"{"conv":"dm:x","kind":"dm","title":"X","count":2}"#.utf8))
eq(oldRow?.preview, nil, "no preview on the old shape")
eq(oldRow?.count, 2, "count kept")

let finished = DispatchSemaphore(value: 0)
Task.detached {
    await clientTests()
    finished.signal()
}
finished.wait()

if failures > 0 {
    print("DescallKit selftest: \(failures) failure(s)")
    exit(1)
}
print("DescallKit selftest ok")
