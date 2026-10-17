// Linux/macOS selftest for ios/App/App/DescallNativeCallLogic.swift.
// Run from frontend/: node scripts/swift-selftest.mjs
import Foundation

var failures = 0
func check(_ cond: Bool, _ msg: String, line: Int = #line) {
    if !cond { failures += 1; print("FAIL line \(line): \(msg)") }
}
typealias L = DescallNativeCallLogic

// Engine.IO / Socket.IO framing
check(L.parse("0{\"sid\":\"x\",\"pingInterval\":12000,\"pingTimeout\":10000}") == .open(pingIntervalMs: 12000), "open packet")
check(L.parse("2") == .ping, "ping")
check(L.parse("1") == .disconnect, "close")
check(L.parse("41") == .disconnect, "sio disconnect")
check(L.parse("40{\"sid\":\"abc\"}") == .connected, "connect ack")
check(L.parse("44{\"message\":\"Authentication required\"}") == .connectError("Authentication required"), "connect error")
if case let .event(name, payload) = L.parse("42[\"call:offer\",{\"callUuid\":\"u1\",\"offer\":{\"type\":\"offer\",\"sdp\":\"v=0\"}}]") {
    check(name == "call:offer", "event name")
    let obj = L.jsonObject(payload) as? [String: Any]
    check((obj?["callUuid"] as? String) == "u1", "event payload")
    check(L.offerSdp(obj?["offer"]) == "v=0", "offer sdp")
} else { check(false, "event parse") }
if case let .event(name, _) = L.parse("4217[\"call:ended\",{\"fromUserId\":\"a\"}]") { check(name == "call:ended", "event with ack id") } else { check(false, "ack event") }
check(L.parse("42not json") == .other, "bad event")
check(L.parse("") == .other, "empty")
let frame = L.eventFrame("call:answer", ["toUserId": "a"]) ?? ""
check(frame.hasPrefix("42[\"call:answer\","), "event frame")
check(L.connectFrame(auth: ["token": "t"]) == "40{\"token\":\"t\"}", "connect frame")
check(L.socketURL(apiBase: "https://des-call.onrender.com")?.absoluteString == "wss://des-call.onrender.com/socket.io/?EIO=4&transport=websocket", "socket url")
check(L.socketURL(apiBase: "http://localhost:3000")?.absoluteString == "ws://localhost:3000/socket.io/?EIO=4&transport=websocket", "local socket url")
check(L.apiBase(statusUrl: "https://des-call-staging.onrender.com/api/calls/voip-status") == "https://des-call-staging.onrender.com", "api base from status url")
check(L.apiBase(statusUrl: "http://evil.example/x") == L.productionApiBase, "http status url rejected")
check(L.apiBase(statusUrl: "") == L.productionApiBase, "empty status url")

// ICE config
let ice = """
{"iceServers":[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.cloudflare.com:3478?transport=udp","turns:turn.cloudflare.com:443?transport=tcp","https://bad"],"username":"u","credential":"c"},{"urls":[]}],"turnConfigured":true}
""".data(using: .utf8)!
let servers = L.iceServers(fromJSON: ice)
check(servers.count == 2, "ice server count \(servers.count)")
check(servers[1].urls == ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], "turn urls filtered")
check(servers[1].username == "u" && servers[1].credential == "c", "credentials kept")
check(L.hasTurn(servers), "has turn")
check(!L.hasTurn(L.defaultIceServers), "default has no turn")
check(L.iceServers(fromJSON: Data("nope".utf8)).isEmpty, "bad json")

// Opus tuning
let sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;stereo=1\r\na=rtpmap:0 PCMU/8000\r\n"
let tuned = L.tuneOpusSdp(sdp)
check(tuned.contains("a=fmtp:111 minptime=10;useinbandfec=1;stereo=0;usedtx=1;sprop-stereo=0;maxaveragebitrate=48000;cbr=0"), "opus fmtp merged: \(tuned)")
check(tuned.contains("\r\n") && !tuned.contains("\n\n"), "line endings kept")
let noFmtp = "v=0\nm=audio 9 RTP 111\na=rtpmap:111 opus/48000/2\na=rtcp-fb:111 transport-cc\n"
let tuned2 = L.tuneOpusSdp(noFmtp)
check(tuned2.contains("a=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=48000;cbr=0"), "fmtp inserted after rtpmap")
check(L.tuneOpusSdp("v=0\nm=audio 9 RTP 0\na=rtpmap:0 PCMU/8000\n") == "v=0\nm=audio 9 RTP 0\na=rtpmap:0 PCMU/8000\n", "no opus untouched")

// Candidates
let c = L.remoteCandidate(["candidate": "candidate:1 1 udp 1 1.2.3.4 5 typ relay", "sdpMid": "0", "sdpMLineIndex": 0])
check(c == L.RemoteCandidate(sdp: "candidate:1 1 udp 1 1.2.3.4 5 typ relay", sdpMid: "0", sdpMLineIndex: 0), "remote candidate")
check(L.remoteCandidate(["candidate": ""]) == nil, "empty candidate (end of candidates) ignored")
let payload = L.candidatePayload(sdp: "candidate:x", sdpMid: nil, sdpMLineIndex: 1)
check(payload["sdpMid"] is NSNull && (payload["sdpMLineIndex"] as? Int) == 1, "candidate payload")
check(L.jsonString(payload) != nil, "candidate payload is JSON")

// Timeline
var tl = L.Timeline(start: 100)
tl.mark("push", at: 100)
tl.mark("answered", at: 101.5)
tl.mark("firstAudio", at: 102.25)
tl.mark("answered", at: 109) // first mark wins
check(tl.ms("answered") == 1500, "answered ms")
check(tl.answerToAudioMs == 750, "answer → audio")
check(tl.summary == "push=0 answered=1500 firstAudio=2250", "summary \(tl.summary)")
check((tl.dictionary["answerToAudioMs"] as? Int) == 750, "dictionary")

// Backoff
check(L.reconnectDelay(attempt: 0) == 0.5 && L.reconnectDelay(attempt: 99) == 8, "backoff")

if failures > 0 { print("NativeCallLogic selftest: \(failures) failure(s)"); exit(1) }
print("NativeCallLogic selftest ok")
