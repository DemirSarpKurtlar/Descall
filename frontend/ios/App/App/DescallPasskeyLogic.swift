import Foundation

/// Pure helpers of the passkey plugin (DescallPasskeyPlugin.swift): base64url, reading the
/// server's WebAuthn JSON options, building the RegistrationResponseJSON /
/// AuthenticationResponseJSON the server verifies, and the error codes the JS side maps
/// (src/lib/passkeys/errors.js). Foundation only, so selftest/passkey/main.swift runs it with
/// swiftc on the CI Mac (ios-build-check.yml) without a simulator.
enum DescallPasskeyLogic {
    static let relyingParty = "descall.com"

    struct CreationOptions: Equatable {
        let rpId: String
        let challenge: Data
        let userId: Data
        let userName: String
        let excludeCredentialIds: [Data]
    }

    struct RequestOptions: Equatable {
        let rpId: String
        let challenge: Data
        let allowCredentialIds: [Data]
    }

    enum OptionsError: Error, Equatable {
        case invalidJSON
        case wrongRelyingParty
        case missingChallenge
        case missingUser
    }

    static func base64urlEncode(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func base64urlDecode(_ text: String) -> Data? {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        guard text.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let rest = s.count % 4
        if rest == 1 { return nil }
        if rest > 0 { s += String(repeating: "=", count: 4 - rest) }
        return Data(base64Encoded: s)
    }

    private static func object(_ json: String) -> [String: Any]? {
        guard json.utf8.count <= 64 * 1024, let data = json.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private static func credentialIds(_ list: Any?) -> [Data] {
        guard let items = list as? [[String: Any]] else { return [] }
        return items.compactMap { ($0["id"] as? String).flatMap(base64urlDecode) }
    }

    /// PublicKeyCredentialCreationOptionsJSON from routes/passkeys.js /register/options.
    static func parseCreationOptions(_ json: String, expectedRpId: String = relyingParty) -> Result<CreationOptions, OptionsError> {
        guard let o = object(json) else { return .failure(.invalidJSON) }
        guard let rp = o["rp"] as? [String: Any], let rpId = rp["id"] as? String, rpId == expectedRpId else { return .failure(.wrongRelyingParty) }
        guard let c = o["challenge"] as? String, let challenge = base64urlDecode(c), challenge.count >= 16 else { return .failure(.missingChallenge) }
        guard let user = o["user"] as? [String: Any],
              let idText = user["id"] as? String, let userId = base64urlDecode(idText), !userId.isEmpty,
              let name = user["name"] as? String, !name.isEmpty else { return .failure(.missingUser) }
        return .success(CreationOptions(rpId: rpId, challenge: challenge, userId: userId, userName: name, excludeCredentialIds: credentialIds(o["excludeCredentials"])))
    }

    /// PublicKeyCredentialRequestOptionsJSON from /auth/options or /reauth/options.
    static func parseRequestOptions(_ json: String, expectedRpId: String = relyingParty) -> Result<RequestOptions, OptionsError> {
        guard let o = object(json) else { return .failure(.invalidJSON) }
        guard let rpId = o["rpId"] as? String, rpId == expectedRpId else { return .failure(.wrongRelyingParty) }
        guard let c = o["challenge"] as? String, let challenge = base64urlDecode(c), challenge.count >= 16 else { return .failure(.missingChallenge) }
        return .success(RequestOptions(rpId: rpId, challenge: challenge, allowCredentialIds: credentialIds(o["allowCredentials"])))
    }

    private static func serialize(_ value: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    /// RegistrationResponseJSON. `attachment` is "platform" or "cross-platform" when known.
    static func registrationJSON(credentialID: Data, clientDataJSON: Data, attestationObject: Data, attachment: String?) -> String {
        let id = base64urlEncode(credentialID)
        var out: [String: Any] = [
            "id": id,
            "rawId": id,
            "type": "public-key",
            "response": [
                "clientDataJSON": base64urlEncode(clientDataJSON),
                "attestationObject": base64urlEncode(attestationObject),
                "transports": attachment == "cross-platform" ? ["usb", "nfc"] : ["internal", "hybrid"],
            ] as [String: Any],
            "clientExtensionResults": [String: Any](),
        ]
        if let attachment = attachment { out["authenticatorAttachment"] = attachment }
        return serialize(out)
    }

    /// AuthenticationResponseJSON. userHandle is required for a discoverable sign-in.
    static func assertionJSON(credentialID: Data, clientDataJSON: Data, authenticatorData: Data, signature: Data, userHandle: Data?, attachment: String?) -> String {
        let id = base64urlEncode(credentialID)
        var response: [String: Any] = [
            "clientDataJSON": base64urlEncode(clientDataJSON),
            "authenticatorData": base64urlEncode(authenticatorData),
            "signature": base64urlEncode(signature),
        ]
        if let handle = userHandle, !handle.isEmpty { response["userHandle"] = base64urlEncode(handle) }
        var out: [String: Any] = [
            "id": id,
            "rawId": id,
            "type": "public-key",
            "response": response,
            "clientExtensionResults": [String: Any](),
        ]
        if let attachment = attachment { out["authenticatorAttachment"] = attachment }
        return serialize(out)
    }

    /// ASAuthorizationError (domain com.apple.AuthenticationServices.AuthorizationError) -> JS code.
    /// Raw values: 1000 unknown, 1001 canceled, 1002 invalidResponse, 1003 notHandled,
    /// 1004 failed, 1005 notInteractive, 1006 matchedExcludedCredential.
    static func errorCode(domain: String, code: Int, message: String) -> String {
        let lower = message.lowercased()
        if lower.contains("not associated with domain") || lower.contains("associated domain") || lower.contains("webcredentials") {
            return "domain"
        }
        guard domain == "com.apple.AuthenticationServices.AuthorizationError" else { return "failed" }
        switch code {
        case 1001: return "canceled"
        case 1006: return "already_registered"
        case 1005: return "canceled"
        case 1003: return "unsupported"
        default: return "failed"
        }
    }
}
