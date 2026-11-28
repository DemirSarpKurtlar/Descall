import Foundation

// Passkeys: selftest for App/App/DescallPasskeyLogic.swift.
// swiftc -o /tmp/pk App/App/DescallPasskeyLogic.swift selftest/passkey/main.swift && /tmp/pk

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

typealias L = DescallPasskeyLogic

// base64url
let bytes = Data([0, 1, 2, 250, 251, 252, 253, 254, 255])
eq(L.base64urlEncode(bytes), "AAEC-vv8_f7_", "encode")
eq(L.base64urlDecode("AAEC-vv8_f7_"), bytes, "decode")
eq(L.base64urlDecode("AQ"), Data([1]), "decode without padding")
check(L.base64urlDecode("A") == nil, "one char is not base64")
check(L.base64urlDecode("AA+/") == nil, "standard alphabet is refused")

let challenge = String(repeating: "A", count: 43)

// Creation options
let creation = """
{"rp":{"id":"descall.com","name":"Descall"},"user":{"id":"ERERERERERERERERERERERERERE","name":"alice","displayName":"Alice"},"challenge":"\(challenge)","excludeCredentials":[{"id":"AQID","type":"public-key"}],"timeout":300000}
"""
switch L.parseCreationOptions(creation) {
case let .success(o):
    eq(o.rpId, "descall.com", "rp id")
    eq(o.userName, "alice", "user name")
    eq(o.challenge.count, 32, "challenge bytes")
    eq(o.excludeCredentialIds, [Data([1, 2, 3])], "exclude list")
case .failure:
    check(false, "valid creation options parse")
}
eq(L.parseCreationOptions(creation.replacingOccurrences(of: "\"descall.com\"", with: "\"evil.example\"")), .failure(.wrongRelyingParty), "other rp refused")
eq(L.parseCreationOptions("{not json"), .failure(.invalidJSON), "bad json")
eq(L.parseCreationOptions(creation.replacingOccurrences(of: challenge, with: "AAAA")), .failure(.missingChallenge), "short challenge")

// Request options
let request = "{\"rpId\":\"descall.com\",\"challenge\":\"\(challenge)\",\"userVerification\":\"required\"}"
switch L.parseRequestOptions(request) {
case let .success(o):
    eq(o.allowCredentialIds.count, 0, "discoverable")
case .failure:
    check(false, "valid request options parse")
}
eq(L.parseRequestOptions("{\"rpId\":\"descall.com.evil\",\"challenge\":\"\(challenge)\"}"), .failure(.wrongRelyingParty), "suffix trick refused")
// Re-auth (/reauth/options): the account's passkeys come as allowCredentials.
let reauthRequest = "{\"rpId\":\"descall.com\",\"challenge\":\"\(challenge)\",\"allowCredentials\":[{\"id\":\"q83vEjRWeJA\",\"type\":\"public-key\"},{\"id\":\"not base64!\",\"type\":\"public-key\"}]}"
switch L.parseRequestOptions(reauthRequest) {
case let .success(o):
    eq(o.allowCredentialIds, [Data([0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90])], "allow list, broken ids skipped")
case .failure:
    check(false, "re-auth request options parse")
}
eq(L.parseRequestOptions("{\"rpId\":\"descall.com\"}"), .failure(.missingChallenge), "no challenge")
eq(L.parseCreationOptions(creation.replacingOccurrences(of: "\"name\":\"alice\",", with: "")), .failure(.missingUser), "user without a name")

// Response JSON
func object(_ s: String) -> [String: Any] {
    return (try? JSONSerialization.jsonObject(with: s.data(using: .utf8)!)) as? [String: Any] ?? [:]
}
let reg = object(L.registrationJSON(credentialID: Data([1, 2, 3]), clientDataJSON: Data("{}".utf8), attestationObject: Data([7]), attachment: "platform"))
eq(reg["id"] as? String, "AQID", "credential id")
eq(reg["rawId"] as? String, "AQID", "rawId equals id")
eq(reg["type"] as? String, "public-key", "type")
eq(reg["authenticatorAttachment"] as? String, "platform", "attachment")
let regResponse = reg["response"] as? [String: Any] ?? [:]
eq(regResponse["clientDataJSON"] as? String, "e30", "client data")
eq(regResponse["attestationObject"] as? String, "Bw", "attestation")
eq(regResponse["transports"] as? [String], ["internal", "hybrid"], "transports")

let assertion = object(L.assertionJSON(credentialID: Data([1]), clientDataJSON: Data("{}".utf8), authenticatorData: Data([2]), signature: Data([3]), userHandle: Data([9]), attachment: nil))
let a = assertion["response"] as? [String: Any] ?? [:]
eq(a["authenticatorData"] as? String, "Ag", "auth data")
eq(a["signature"] as? String, "Aw", "signature")
eq(a["userHandle"] as? String, "CQ", "user handle")
check(assertion["authenticatorAttachment"] == nil, "no attachment when unknown")
let noHandle = object(L.assertionJSON(credentialID: Data([1]), clientDataJSON: Data(), authenticatorData: Data([2]), signature: Data([3]), userHandle: nil, attachment: nil))
check((noHandle["response"] as? [String: Any])?["userHandle"] == nil, "no user handle key when absent")

// Errors
let domain = "com.apple.AuthenticationServices.AuthorizationError"
eq(L.errorCode(domain: domain, code: 1001, message: "The operation couldn't be completed."), "canceled", "cancel")
eq(L.errorCode(domain: domain, code: 1006, message: ""), "already_registered", "excluded credential")
eq(L.errorCode(domain: domain, code: 1004, message: "Application with identifier Q9R78TPNXS.com.descall.app is not associated with domain descall.com"), "domain", "association missing")
eq(L.errorCode(domain: "NSURLErrorDomain", code: -1, message: "x"), "failed", "other domains")
eq(L.errorCode(domain: domain, code: 1005, message: ""), "canceled", "AutoFill closed without a pick (not interactive)")
eq(L.errorCode(domain: domain, code: 1003, message: ""), "unsupported", "not handled")
eq(L.errorCode(domain: domain, code: 1004, message: "webcredentials entitlement missing"), "domain", "entitlement missing")

if failures > 0 {
    print("passkey logic selftest: \(failures) failure(s)")
    exit(1)
}
print("passkey logic selftest OK")
