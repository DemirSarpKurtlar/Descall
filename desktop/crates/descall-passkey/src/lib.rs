//! Passkeys for the Descall Tauri app (Windows).
//!
//! The app's WebView2 origin is https://tauri.localhost, and WebAuthn only lets
//! https://descall.com (or a subdomain) use the relying party id descall.com, so the page
//! cannot run the ceremony itself. The shell does: it calls the Windows WebAuthn API
//! (webauthn.dll, Windows 10 1903+, [`win`]) with rp id descall.com and a clientDataJSON it
//! builds with origin https://descall.com, so Windows Hello (and phones, security keys) appear
//! inside the app. The server (frontend/backend/routes/passkeys.js) verifies the result exactly
//! like a browser's.
//!
//! This module is platform independent: reading the server's WebAuthn JSON options, the
//! clientDataJSON, the RegistrationResponseJSON / AuthenticationResponseJSON, and the error
//! codes the page maps (frontend/src/lib/passkeys/errors.js).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::{json, Value};

#[cfg(windows)]
pub mod win;

/// The relying party the server uses (PASSKEY_RP_ID).
pub const RP_ID: &str = "descall.com";
/// The origin put in clientDataJSON (the server's first PASSKEY_ORIGINS entry).
pub const ORIGIN: &str = "https://descall.com";
/// Upper bound for one ceremony (the server's challenges live 5 minutes).
pub const MAX_TIMEOUT_MS: u32 = 5 * 60 * 1000;
const MAX_OPTIONS_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ceremony {
    Create,
    Get,
}

impl Ceremony {
    pub fn client_data_type(self) -> &'static str {
        match self {
            Ceremony::Create => "webauthn.create",
            Ceremony::Get => "webauthn.get",
        }
    }
}

/// Why options were refused (before any OS dialog opens).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OptionsError {
    Invalid(&'static str),
    WrongRelyingParty,
}

impl OptionsError {
    /// Code for the page (frontend/src/lib/passkeys/errors.js NATIVE_CODES).
    pub fn code(&self) -> &'static str {
        match self {
            OptionsError::Invalid(_) => "failed",
            OptionsError::WrongRelyingParty => "domain",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreationOptions {
    pub rp_id: String,
    pub rp_name: String,
    /// base64url exactly as the server sent it (it is echoed into clientDataJSON).
    pub challenge: String,
    pub user_id: Vec<u8>,
    pub user_name: String,
    pub user_display_name: String,
    pub exclude: Vec<Vec<u8>>,
    /// COSE algorithm ids in the server's order (-8 EdDSA, -7 ES256, -257 RS256).
    pub algorithms: Vec<i32>,
    pub timeout_ms: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestOptions {
    pub rp_id: String,
    pub challenge: String,
    pub allow: Vec<Vec<u8>>,
    pub timeout_ms: u32,
}

pub fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn from_b64url(text: &str) -> Option<Vec<u8>> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return None;
    }
    URL_SAFE_NO_PAD.decode(text).ok()
}

fn parse(json: &str) -> Result<Value, OptionsError> {
    if json.len() > MAX_OPTIONS_BYTES {
        return Err(OptionsError::Invalid("options too large"));
    }
    serde_json::from_str::<Value>(json).map_err(|_| OptionsError::Invalid("options are not JSON"))
}

fn challenge_of(v: &Value) -> Result<String, OptionsError> {
    let c = v.get("challenge").and_then(Value::as_str).ok_or(OptionsError::Invalid("no challenge"))?;
    match from_b64url(c) {
        Some(bytes) if bytes.len() >= 16 && c.len() <= 128 => Ok(c.to_string()),
        _ => Err(OptionsError::Invalid("bad challenge")),
    }
}

fn timeout_of(v: &Value) -> u32 {
    let t = v.get("timeout").and_then(Value::as_u64).unwrap_or(u64::from(MAX_TIMEOUT_MS));
    u32::try_from(t).unwrap_or(MAX_TIMEOUT_MS).clamp(10_000, MAX_TIMEOUT_MS)
}

fn ids_of(v: Option<&Value>) -> Vec<Vec<u8>> {
    v.and_then(Value::as_array)
        .map(|list| list.iter().filter_map(|d| d.get("id").and_then(Value::as_str)).filter_map(from_b64url).collect())
        .unwrap_or_default()
}

/// PublicKeyCredentialCreationOptionsJSON from POST /api/auth/passkeys/register/options.
pub fn parse_creation_options(json: &str) -> Result<CreationOptions, OptionsError> {
    let v = parse(json)?;
    let rp = v.get("rp").ok_or(OptionsError::Invalid("no rp"))?;
    let rp_id = rp.get("id").and_then(Value::as_str).unwrap_or_default();
    if rp_id != RP_ID {
        return Err(OptionsError::WrongRelyingParty);
    }
    let rp_name = rp.get("name").and_then(Value::as_str).unwrap_or("Descall").to_string();
    let user = v.get("user").ok_or(OptionsError::Invalid("no user"))?;
    let user_id = user.get("id").and_then(Value::as_str).and_then(from_b64url).filter(|id| !id.is_empty() && id.len() <= 64).ok_or(OptionsError::Invalid("bad user id"))?;
    let user_name = user.get("name").and_then(Value::as_str).filter(|n| !n.is_empty()).ok_or(OptionsError::Invalid("no user name"))?.to_string();
    let user_display_name = user.get("displayName").and_then(Value::as_str).filter(|n| !n.is_empty()).unwrap_or(&user_name).to_string();
    let mut algorithms: Vec<i32> = v
        .get("pubKeyCredParams")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(|p| p.get("alg").and_then(Value::as_i64)).filter_map(|a| i32::try_from(a).ok()).collect())
        .unwrap_or_default();
    if algorithms.is_empty() {
        algorithms = vec![-7, -257];
    }
    Ok(CreationOptions {
        rp_id: rp_id.to_string(),
        rp_name,
        challenge: challenge_of(&v)?,
        user_id,
        user_name,
        user_display_name,
        exclude: ids_of(v.get("excludeCredentials")),
        algorithms,
        timeout_ms: timeout_of(&v),
    })
}

/// PublicKeyCredentialRequestOptionsJSON from /auth/options or /reauth/options.
pub fn parse_request_options(json: &str) -> Result<RequestOptions, OptionsError> {
    let v = parse(json)?;
    let rp_id = v.get("rpId").and_then(Value::as_str).unwrap_or_default();
    if rp_id != RP_ID {
        return Err(OptionsError::WrongRelyingParty);
    }
    Ok(RequestOptions {
        rp_id: rp_id.to_string(),
        challenge: challenge_of(&v)?,
        allow: ids_of(v.get("allowCredentials")),
        timeout_ms: timeout_of(&v),
    })
}

/// CollectedClientData as a browser serializes it (type, challenge, origin, crossOrigin, in
/// this order). The challenge is the server's base64url string, unchanged.
pub fn client_data_json(ceremony: Ceremony, challenge: &str, origin: &str) -> String {
    // serde_json escapes each value; the key order is fixed by hand.
    format!(
        "{{\"type\":{},\"challenge\":{},\"origin\":{},\"crossOrigin\":false}}",
        Value::from(ceremony.client_data_type()),
        Value::from(challenge),
        Value::from(origin)
    )
}

/// WEBAUTHN_CTAP_TRANSPORT_* flags -> AuthenticatorTransport names.
pub fn transports_from_flags(flags: u32) -> Vec<&'static str> {
    let mut out = Vec::new();
    if flags & 0x1 != 0 {
        out.push("usb");
    }
    if flags & 0x2 != 0 {
        out.push("nfc");
    }
    if flags & 0x4 != 0 {
        out.push("ble");
    }
    if flags & 0x10 != 0 {
        out.push("internal");
    }
    if flags & 0x20 != 0 {
        out.push("hybrid");
    }
    out
}

fn attachment_for(transports: &[&str]) -> Option<&'static str> {
    if transports.contains(&"internal") {
        Some("platform")
    } else if transports.is_empty() {
        None
    } else {
        Some("cross-platform")
    }
}

/// RegistrationResponseJSON for POST /register/verify.
pub fn registration_response(credential_id: &[u8], client_data: &[u8], attestation_object: &[u8], transport_flags: u32) -> String {
    let id = b64url(credential_id);
    let transports = transports_from_flags(transport_flags);
    let mut out = json!({
        "id": id,
        "rawId": id,
        "type": "public-key",
        "response": {
            "clientDataJSON": b64url(client_data),
            "attestationObject": b64url(attestation_object),
            "transports": transports,
        },
        "clientExtensionResults": {},
    });
    if let Some(a) = attachment_for(&transports) {
        out["authenticatorAttachment"] = Value::from(a);
    }
    out.to_string()
}

/// AuthenticationResponseJSON for POST /auth/verify (userHandle required for discoverable sign-in).
pub fn assertion_response(credential_id: &[u8], client_data: &[u8], authenticator_data: &[u8], signature: &[u8], user_handle: Option<&[u8]>, transport_flags: u32) -> String {
    let id = b64url(credential_id);
    let mut response = json!({
        "clientDataJSON": b64url(client_data),
        "authenticatorData": b64url(authenticator_data),
        "signature": b64url(signature),
    });
    if let Some(h) = user_handle.filter(|h| !h.is_empty()) {
        response["userHandle"] = Value::from(b64url(h));
    }
    let mut out = json!({
        "id": id,
        "rawId": id,
        "type": "public-key",
        "response": response,
        "clientExtensionResults": {},
    });
    if let Some(a) = attachment_for(&transports_from_flags(transport_flags)) {
        out["authenticatorAttachment"] = Value::from(a);
    }
    out.to_string()
}

/// HRESULT (and WebAuthNGetErrorName) of a failed call -> code for the page.
pub fn error_code(hresult: i32, name: &str) -> &'static str {
    // Compare as u32: HRESULTs are usually written in hex.
    match hresult as u32 {
        0x8009_0036 | 0x8007_04C7 => return "canceled", // NTE_USER_CANCELLED, HRESULT_FROM_WIN32(ERROR_CANCELLED)
        0x8007_05B4 => return "timeout",                // HRESULT_FROM_WIN32(ERROR_TIMEOUT)
        0x8009_0011 => return "no_credential",          // NTE_NOT_FOUND
        0x8009_000F => return "already_registered",     // NTE_EXISTS
        0x8009_0035 => return "unsupported",            // NTE_DEVICE_NOT_FOUND
        _ => {}
    }
    match name {
        "NotAllowedError" | "AbortError" => "canceled",
        "InvalidStateError" => "already_registered",
        "NotSupportedError" => "unsupported",
        "SecurityError" => "domain",
        _ => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHALLENGE: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    fn creation() -> String {
        json!({
            "rp": { "id": "descall.com", "name": "Descall" },
            "user": { "id": "ERERERERERERERERERERERERERE", "name": "alice", "displayName": "Alice" },
            "challenge": CHALLENGE,
            "pubKeyCredParams": [{ "type": "public-key", "alg": -8 }, { "type": "public-key", "alg": -7 }, { "type": "public-key", "alg": -257 }],
            "excludeCredentials": [{ "id": "AQID", "type": "public-key" }],
            "timeout": 300000,
            "authenticatorSelection": { "residentKey": "required", "userVerification": "required" },
        })
        .to_string()
    }

    #[test]
    fn base64url_round_trip() {
        let bytes = [0u8, 1, 2, 250, 251, 252, 253, 254, 255];
        assert_eq!(b64url(&bytes), "AAEC-vv8_f7_");
        assert_eq!(from_b64url("AAEC-vv8_f7_").unwrap(), bytes);
        assert!(from_b64url("AA+/").is_none(), "standard alphabet refused");
        assert!(from_b64url("").is_none());
    }

    #[test]
    fn reads_creation_options() {
        let o = parse_creation_options(&creation()).unwrap();
        assert_eq!(o.rp_id, "descall.com");
        assert_eq!(o.user_name, "alice");
        assert_eq!(o.user_display_name, "Alice");
        assert_eq!(o.algorithms, vec![-8, -7, -257]);
        assert_eq!(o.exclude, vec![vec![1u8, 2, 3]]);
        assert_eq!(o.challenge, CHALLENGE);
        assert_eq!(o.timeout_ms, 300_000);
    }

    #[test]
    fn refuses_other_relying_parties_and_bad_input() {
        let other = creation().replace("\"descall.com\"", "\"evil.example\"");
        assert_eq!(parse_creation_options(&other), Err(OptionsError::WrongRelyingParty));
        assert_eq!(parse_creation_options(&other).unwrap_err().code(), "domain");
        assert!(matches!(parse_creation_options("{"), Err(OptionsError::Invalid(_))));
        let short = creation().replace(CHALLENGE, "AAAA");
        assert!(matches!(parse_creation_options(&short), Err(OptionsError::Invalid(_))));
        let r = json!({ "rpId": "descall.com.evil.example", "challenge": CHALLENGE }).to_string();
        assert_eq!(parse_request_options(&r), Err(OptionsError::WrongRelyingParty));
        let big = "x".repeat(MAX_OPTIONS_BYTES + 1);
        assert!(parse_request_options(&big).is_err());
    }

    #[test]
    fn reads_request_options() {
        let r = json!({ "rpId": "descall.com", "challenge": CHALLENGE, "userVerification": "required", "timeout": 999_999_999u64 }).to_string();
        let o = parse_request_options(&r).unwrap();
        assert!(o.allow.is_empty(), "discoverable sign-in");
        assert_eq!(o.timeout_ms, MAX_TIMEOUT_MS, "clamped to the challenge lifetime");
        let r = json!({ "rpId": "descall.com", "challenge": CHALLENGE, "allowCredentials": [{ "id": "AQ", "type": "public-key" }] }).to_string();
        assert_eq!(parse_request_options(&r).unwrap().allow, vec![vec![1u8]]);
    }

    #[test]
    fn client_data_matches_what_the_server_expects() {
        let cd = client_data_json(Ceremony::Get, CHALLENGE, ORIGIN);
        assert_eq!(cd, format!("{{\"type\":\"webauthn.get\",\"challenge\":\"{CHALLENGE}\",\"origin\":\"https://descall.com\",\"crossOrigin\":false}}"));
        let v: Value = serde_json::from_str(&client_data_json(Ceremony::Create, CHALLENGE, ORIGIN)).unwrap();
        assert_eq!(v["type"], "webauthn.create");
        assert_eq!(v["origin"], "https://descall.com");
        // A hostile challenge string can never break out of the JSON value.
        let v: Value = serde_json::from_str(&client_data_json(Ceremony::Get, "a\",\"origin\":\"https://evil", ORIGIN)).unwrap();
        assert_eq!(v["origin"], "https://descall.com");
    }

    #[test]
    fn builds_response_json() {
        let reg: Value = serde_json::from_str(&registration_response(&[1, 2, 3], b"{}", &[7], 0x10 | 0x20)).unwrap();
        assert_eq!(reg["id"], "AQID");
        assert_eq!(reg["rawId"], reg["id"], "rawId equals id (the server checks it)");
        assert_eq!(reg["type"], "public-key");
        assert_eq!(reg["response"]["clientDataJSON"], "e30");
        assert_eq!(reg["response"]["attestationObject"], "Bw");
        assert_eq!(reg["response"]["transports"], json!(["internal", "hybrid"]));
        assert_eq!(reg["authenticatorAttachment"], "platform");

        let a: Value = serde_json::from_str(&assertion_response(&[1], b"{}", &[2], &[3], Some(&[9]), 0x1)).unwrap();
        assert_eq!(a["response"]["authenticatorData"], "Ag");
        assert_eq!(a["response"]["signature"], "Aw");
        assert_eq!(a["response"]["userHandle"], "CQ");
        assert_eq!(a["authenticatorAttachment"], "cross-platform");
        let none: Value = serde_json::from_str(&assertion_response(&[1], b"{}", &[2], &[3], None, 0)).unwrap();
        assert!(none["response"].get("userHandle").is_none());
        assert!(none.get("authenticatorAttachment").is_none());
    }

    #[test]
    fn maps_windows_errors() {
        assert_eq!(error_code(0x8009_0036u32 as i32, ""), "canceled");
        assert_eq!(error_code(0x8007_04C7u32 as i32, ""), "canceled");
        assert_eq!(error_code(0x8009_0011u32 as i32, ""), "no_credential");
        assert_eq!(error_code(0x8009_000Fu32 as i32, ""), "already_registered");
        assert_eq!(error_code(0x8007_05B4u32 as i32, ""), "timeout");
        assert_eq!(error_code(1, "NotAllowedError"), "canceled");
        assert_eq!(error_code(1, "InvalidStateError"), "already_registered");
        assert_eq!(error_code(1, "UnknownError"), "failed");
    }
}
