//! Automatic setup: the environment of the PC's backend comes from the primary in one call,
//! `POST {primary}/api/node/bootstrap` with the node key (frontend/backend/routes/node.js).
//! The primary answers only inside the key's enrollment window (30 min after the key was
//! created or reopened in Admin > Sunucu Ağı) and only with the names it shares
//! (lib/nodeKeys/bootstrapEnv.js). This side filters again: a name the app owns, a Render or
//! OS variable, or a malformed value is dropped whatever the primary sends.
//!
//! Precedence in the backend environment (crate::env::backend_env): the primary's values,
//! then the owner's extra `KEY=value` lines, then the named advanced fields, then the
//! contract variables of this app. A value typed by hand always wins.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

pub const PATH: &str = "/api/node/bootstrap";
/// A sane upper bound (the backend reads ~140 names, ~110 are shared).
pub const MAX_VARS: usize = 400;
/// One value; PEM keys and a service-account JSON are a few KB.
pub const MAX_VALUE: usize = 32 * 1024;

/// Never taken from the primary: the app's own variables, the Key Value URL (the primary
/// only knows the internal one), the tunnel token, and what the child process inherits.
pub const DENY: &[&str] = &["PORT", "NODE_ENV", "NODE_OPTIONS", "NODE_PATH", "TUNNEL_TOKEN", "REDIS_URL", "PATH", "HOME", "HOSTNAME", "PUBLIC_URL"];
pub const DENY_PREFIX: &[&str] = &["DESCALL_NODE_", "RENDER", "NPM_", "TUNNEL_"];

/// `UPPER_SNAKE`, not one the app owns or inherits.
pub fn accept_name(name: &str) -> bool {
    let b = name.as_bytes();
    if b.is_empty() || b.len() > 128 || !b[0].is_ascii_uppercase() || !b.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == b'_') {
        return false;
    }
    if DENY.contains(&name) || DENY_PREFIX.iter().any(|p| name.starts_with(p)) {
        return false;
    }
    !crate::env::INHERIT.iter().any(|k| k.eq_ignore_ascii_case(name))
}

fn accept_value(v: &str) -> bool {
    !v.is_empty() && v.len() <= MAX_VALUE && !v.contains('\0')
}

/// Keep what this app accepts from a `{ name: value }` object.
pub fn filter(obj: &Map<String, Value>) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for (k, v) in obj {
        if out.len() >= MAX_VARS {
            break;
        }
        if let Some(s) = v.as_str() {
            if accept_name(k) && accept_value(s) {
                out.insert(k.clone(), s.to_string());
            }
        }
    }
    out
}

/// Body of the request: who asks (the primary logs the node id with the event).
pub fn request_body(node_id: &str, version: &str) -> Value {
    json!({ "id": node_id, "version": version })
}

/// The primary's answer -> the accepted environment, or the i18n key of the error the
/// setup form shows. `status` 0 is a network error.
pub fn parse_reply(status: u16, body: &Value) -> Result<BTreeMap<String, String>, &'static str> {
    let code = body.get("code").and_then(Value::as_str).unwrap_or("");
    match status {
        200 => match body.get("env").and_then(Value::as_object) {
            Some(obj) if body.get("ok").and_then(Value::as_bool) == Some(true) => Ok(filter(obj)),
            _ => Err("setup.err.bootstrapServer"),
        },
        0 => Err("setup.err.bootstrapNetwork"),
        401 => Err("setup.err.bootstrapKey"),
        403 if code == "BOOTSTRAP_WINDOW_CLOSED" => Err("setup.err.bootstrapWindow"),
        403 if code == "NODE_BOOTSTRAP_TUNNEL" => Err("setup.err.bootstrapTunnel"),
        403 => Err("setup.err.bootstrapKey"),
        // A secondary, an older primary without the endpoint, or not a Descall server at all.
        404 | 405 => Err("setup.err.bootstrapMissing"),
        429 => Err("setup.err.bootstrapLimited"),
        _ => Err("setup.err.bootstrapServer"),
    }
}

/// Stored form (sealed with DPAPI as the `bootstrapEnv` field).
pub fn to_json(env: &BTreeMap<String, String>) -> String {
    let m: Map<String, Value> = env.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
    Value::Object(m).to_string()
}

/// Read the stored form back, filtered the same way (a stored file never widens the set).
pub fn from_json(text: &str) -> BTreeMap<String, String> {
    serde_json::from_str::<Map<String, Value>>(text).map(|m| filter(&m)).unwrap_or_default()
}

/// Should the log redactor mask this value literally? Everything except plain switches,
/// numbers and URLs without credentials (masking "true" or "https://descall.com" in every
/// log line would hide what the log is for). Secret shapes are masked by pattern anyway.
pub fn is_secret_value(value: &str) -> bool {
    let v = value.trim();
    if v.is_empty() {
        return false;
    }
    let lower = v.to_ascii_lowercase();
    if ["true", "false", "on", "off", "yes", "no", "production", "development", "staging", "enforce", "monitor"].contains(&lower.as_str()) {
        return false;
    }
    if v.parse::<f64>().is_ok() {
        return false;
    }
    if (lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("wss://")) && !v.contains('@') && !v.contains('?') && !v.contains(char::is_whitespace) {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn names_the_app_owns_never_come_from_the_primary() {
        let got = filter(&obj(json!({
            "SUPABASE_URL": "https://x.supabase.co",
            "JWT_SECRET": "jwt",
            "PORT": "10000",
            "NODE_ENV": "production",
            "NODE_OPTIONS": "--inspect",
            "REDIS_URL": "redis://internal:6379",
            "DESCALL_NODE_ROLE": "primary",
            "DESCALL_NODE_KEY": "dsk_node_x",
            "RENDER_EXTERNAL_URL": "https://des-call.onrender.com",
            "TUNNEL_TOKEN": "eyJ",
            "PATH": "/usr/bin",
            "SystemRoot": "C:\\evil",
            "SYSTEMROOT": "C:\\evil",
            "COMSPEC": "evil.exe",
            "lower_case": "x",
            "1BAD": "x",
            "EMPTY": "",
            "NUMBER": 5,
            "NUL": "a\u{0}b",
            "PEM": "-----BEGIN-----\nabc\n-----END-----",
        })));
        let names: Vec<&str> = got.keys().map(|s| s.as_str()).collect();
        assert_eq!(names, vec!["JWT_SECRET", "PEM", "SUPABASE_URL"]);
        assert!(got["PEM"].contains('\n'), "multi-line values survive");
    }

    #[test]
    fn replies_map_to_setup_errors() {
        let ok = json!({ "ok": true, "env": { "SUPABASE_URL": "https://x.supabase.co", "PORT": "1" }, "count": 2 });
        let env = parse_reply(200, &ok).unwrap();
        assert_eq!(env.len(), 1);
        assert_eq!(parse_reply(200, &json!({ "ok": true })), Err("setup.err.bootstrapServer"));
        assert_eq!(parse_reply(200, &json!("<html>")), Err("setup.err.bootstrapServer"));
        assert_eq!(parse_reply(0, &Value::Null), Err("setup.err.bootstrapNetwork"));
        assert_eq!(parse_reply(401, &json!({ "code": "NODE_KEY_INVALID" })), Err("setup.err.bootstrapKey"));
        assert_eq!(parse_reply(403, &json!({ "code": "BOOTSTRAP_WINDOW_CLOSED" })), Err("setup.err.bootstrapWindow"));
        assert_eq!(parse_reply(403, &json!({ "code": "NODE_BOOTSTRAP_TUNNEL" })), Err("setup.err.bootstrapTunnel"));
        assert_eq!(parse_reply(404, &json!({ "code": "NOT_FOUND" })), Err("setup.err.bootstrapMissing"));
        assert_eq!(parse_reply(429, &json!({})), Err("setup.err.bootstrapLimited"));
        assert_eq!(parse_reply(502, &Value::Null), Err("setup.err.bootstrapServer"));
    }

    #[test]
    fn stored_form_round_trips_and_stays_filtered() {
        let mut env = BTreeMap::new();
        env.insert("A_B".to_string(), "x=y\nz".to_string());
        env.insert("JWT_SECRET".to_string(), "s".to_string());
        assert_eq!(from_json(&to_json(&env)), env);
        assert!(from_json(r#"{"PORT":"1","DESCALL_NODE_ID":"x","OK_NAME":"v"}"#).keys().eq(["OK_NAME"].iter()));
        assert!(from_json("not json").is_empty());
        assert_eq!(request_body("pc-a1b2c3", "1.0.0")["id"], "pc-a1b2c3");
    }

    #[test]
    fn redaction_choice() {
        for v in ["sb_secret_abc", "jwt-secret-value", "redis://u:p@h:1", "https://x.co/?token=1", "-----BEGIN PRIVATE KEY-----"] {
            assert!(is_secret_value(v), "{v}");
        }
        for v in ["true", "FALSE", "production", "60", "0.5", "https://descall.com", "", "wss://descall.livekit.cloud"] {
            assert!(!is_secret_value(v), "{v}");
        }
    }
}
