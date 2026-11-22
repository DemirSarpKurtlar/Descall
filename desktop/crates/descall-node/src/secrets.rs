//! The setup form: which values the PC node needs, where each goes, how each is checked,
//! and what the popover may show after saving. Every value is stored with DPAPI
//! (CurrentUser) by the app, one sealed file per field; secret fields are never sent back to
//! the page: it only learns "set" (and can replace or clear). URLs are not secret and are shown.
//!
//! The short form asks for four values (primary URL, node key, tunnel token, the Key Value
//! external URL). Everything else the backend needs comes from the primary in one call
//! (POST /api/node/bootstrap, [`crate::bootstrap`]) and is stored as `bootstrapEnv`; the
//! "Gelişmiş (elle gir)" fields and extra `KEY=value` lines still exist and win over it.

use std::collections::BTreeMap;

use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Check {
    /// http(s) URL (`https_only`: https).
    Url { https_only: bool },
    /// LiveKit server URL: wss://, ws:// or https://.
    LiveKitUrl,
    RedisUrl,
    NodeKey,
    TunnelToken,
    SupabaseKey,
    /// Free text of at least `min` characters.
    Text { min: usize },
    EnvLines,
    /// The environment the primary handed out: a JSON object of names to string values.
    EnvJson,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Field {
    pub id: &'static str,
    /// Environment variable of the backend (None: used by the app itself, e.g. the tunnel).
    pub env: Option<&'static str>,
    pub required: bool,
    pub secret: bool,
    pub check: Check,
    /// Popover group: "connection" (the short form), "advanced" (the "Gelişmiş (elle gir)"
    /// section), "auto" (filled from the primary, never typed in the page).
    pub group: &'static str,
    /// Shown in the empty input (and saved with the form) until the owner types another.
    pub default: Option<&'static str>,
}

const fn f(id: &'static str, env: Option<&'static str>, required: bool, secret: bool, check: Check, group: &'static str) -> Field {
    Field { id, env, required, secret, check, group, default: None }
}

pub const FIELDS: &[Field] = &[
    Field { default: Some(crate::DEFAULT_PRIMARY_URL), ..f("primaryUrl", Some("DESCALL_NODE_PRIMARY_URL"), true, false, Check::Url { https_only: true }, "connection") },
    f("nodeKey", Some("DESCALL_NODE_KEY"), true, true, Check::NodeKey, "connection"),
    f("tunnelToken", None, true, true, Check::TunnelToken, "connection"),
    f("redisUrl", Some("REDIS_URL"), false, true, Check::RedisUrl, "connection"),
    f("publicUrl", Some("DESCALL_NODE_PUBLIC_URL"), false, false, Check::Url { https_only: true }, "advanced"),
    f("supabaseUrl", Some("SUPABASE_URL"), false, false, Check::Url { https_only: true }, "advanced"),
    f("supabaseServiceKey", Some("SUPABASE_SERVICE_ROLE_KEY"), false, true, Check::SupabaseKey, "advanced"),
    f("jwtSecret", Some("JWT_SECRET"), false, true, Check::Text { min: 16 }, "advanced"),
    f("livekitUrl", Some("LIVEKIT_URL"), false, false, Check::LiveKitUrl, "advanced"),
    f("livekitApiKey", Some("LIVEKIT_API_KEY"), false, true, Check::Text { min: 6 }, "advanced"),
    f("livekitApiSecret", Some("LIVEKIT_API_SECRET"), false, true, Check::Text { min: 16 }, "advanced"),
    f("extraEnv", None, false, true, Check::EnvLines, "advanced"),
    f("bootstrapEnv", None, false, true, Check::EnvJson, "auto"),
];

/// Fields the page may write; `bootstrapEnv` comes from the primary only.
pub fn page_writable(id: &str) -> bool {
    field(id).is_some_and(|f| f.group != "auto")
}

/// The backend does not start without these. Each comes from its advanced field, an extra
/// line or the primary's environment, in that order of precedence.
pub const REQUIRED_ENV: &[(&str, &str)] = &[("SUPABASE_URL", "supabaseUrl"), ("SUPABASE_SERVICE_ROLE_KEY", "supabaseServiceKey"), ("JWT_SECRET", "jwtSecret")];

pub fn field(id: &str) -> Option<&'static Field> {
    FIELDS.iter().find(|f| f.id == id)
}

/// Max stored length of one value (the extra env block may hold a whole .env file; the
/// primary's environment is a few KB, PEM keys included).
pub const MAX_VALUE: usize = 256 * 1024;

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for c in s.trim().bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            _ => return None,
        } as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

fn url_ok(v: &str, schemes: &[&str]) -> bool {
    let Some((scheme, rest)) = v.split_once("://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit('@').next().unwrap_or("");
    schemes.contains(&scheme.to_ascii_lowercase().as_str()) && !host.is_empty() && !host.contains(char::is_whitespace) && !v.contains(char::is_whitespace)
}

/// The admin panel's key format: `dsk_node_` + 43 base64url characters (32 random bytes).
pub fn node_key_ok(v: &str) -> bool {
    v.strip_prefix("dsk_node_").is_some_and(|r| r.len() == 43 && r.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
}

/// A Cloudflare tunnel token is base64 JSON `{"a": account, "t": tunnel id, "s": secret}`.
pub fn tunnel_token_ok(v: &str) -> bool {
    if v.len() < 40 || v.len() > 4096 {
        return false;
    }
    b64_decode(v).and_then(|b| serde_json::from_slice::<Value>(&b).ok()).is_some_and(|j| j.get("t").and_then(Value::as_str).is_some_and(|t| !t.is_empty()) && j.get("s").is_some())
}

/// Validate one value. Ok(normalised value) or Err(i18n key of the message).
pub fn validate(id: &str, raw: &str) -> Result<String, &'static str> {
    let f = field(id).ok_or("setup.err.unknown")?;
    let v = if f.check == Check::EnvLines { raw.replace("\r\n", "\n").trim().to_string() } else { raw.trim().to_string() };
    if v.is_empty() {
        return if f.required { Err("setup.err.required") } else { Ok(String::new()) };
    }
    if v.len() > MAX_VALUE {
        return Err("setup.err.tooLong");
    }
    let ok = match f.check {
        Check::Url { https_only } => url_ok(&v, if https_only { &["https"] } else { &["https", "http"] }),
        Check::LiveKitUrl => url_ok(&v, &["wss", "ws", "https"]),
        Check::RedisUrl => url_ok(&v, &["redis", "rediss"]),
        Check::NodeKey => node_key_ok(&v),
        Check::TunnelToken => tunnel_token_ok(&v),
        Check::SupabaseKey => (v.starts_with("eyJ") && v.matches('.').count() == 2) || (v.starts_with("sb_secret_") && v.len() > 20),
        Check::Text { min } => v.chars().count() >= min && !v.contains(['\n', '\r']),
        Check::EnvLines => parse_env_lines(&v).errors.is_empty(),
        Check::EnvJson => serde_json::from_str::<serde_json::Map<String, Value>>(&v).is_ok_and(|m| m.values().all(Value::is_string)),
    };
    if !ok {
        return Err(match f.check {
            Check::Url { .. } | Check::LiveKitUrl | Check::RedisUrl => "setup.err.url",
            Check::NodeKey => "setup.err.nodeKey",
            Check::TunnelToken => "setup.err.tunnelToken",
            Check::SupabaseKey => "setup.err.supabaseKey",
            Check::Text { .. } => "setup.err.short",
            Check::EnvLines => "setup.err.envLines",
            Check::EnvJson => "setup.err.unknown",
        });
    }
    let v = match f.check {
        Check::Url { .. } | Check::LiveKitUrl => v.trim_end_matches('/').to_string(),
        _ => v,
    };
    Ok(v)
}

/// Variables the app sets itself; an extra env line may not override them.
pub const RESERVED: &[&str] = &["PORT", "NODE_OPTIONS", "NODE_ENV", "TUNNEL_TOKEN"];
pub const RESERVED_PREFIX: &str = "DESCALL_NODE_";

#[derive(Debug, Default, PartialEq)]
pub struct EnvLines {
    pub vars: Vec<(String, String)>,
    /// Line numbers (1-based) that are not `KEY=value`.
    pub errors: Vec<usize>,
    /// Keys dropped because the app owns them.
    pub reserved: Vec<String>,
}

/// `.env` text (as exported from Render's Environment page): `KEY=value` lines, `#` comments,
/// optional `export `, optional quotes.
pub fn parse_env_lines(text: &str) -> EnvLines {
    let mut out = EnvLines::default();
    for (i, line) in text.lines().enumerate() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        let l = l.strip_prefix("export ").unwrap_or(l);
        let Some((k, v)) = l.split_once('=') else {
            out.errors.push(i + 1);
            continue;
        };
        let k = k.trim();
        if k.is_empty() || !k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') || k.as_bytes()[0].is_ascii_digit() {
            out.errors.push(i + 1);
            continue;
        }
        let v = v.trim();
        let v = if v.len() >= 2 && ((v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\''))) { &v[1..v.len() - 1] } else { v };
        if RESERVED.contains(&k) || k.starts_with(RESERVED_PREFIX) {
            out.reserved.push(k.to_string());
            continue;
        }
        out.vars.retain(|(ek, _)| ek != k);
        out.vars.push((k.to_string(), v.to_string()));
    }
    out
}

/// The stored primary environment (`bootstrapEnv`), filtered again on the way out.
pub fn parse_env_json(text: &str) -> BTreeMap<String, String> {
    crate::bootstrap::from_json(text)
}

/// Is `env` provided by any source: its advanced field, an extra line or the primary?
fn env_provided(get: &dyn Fn(&str) -> Option<String>, env: &str, field_id: &str) -> bool {
    if get(field_id).is_some_and(|v| !v.is_empty()) {
        return true;
    }
    if get("extraEnv").is_some_and(|t| parse_env_lines(&t).vars.iter().any(|(k, v)| k == env && !v.is_empty())) {
        return true;
    }
    get("bootstrapEnv").is_some_and(|t| parse_env_json(&t).get(env).is_some_and(|v| !v.is_empty()))
}

/// What is still missing before the node can start: required fields that are not set, and
/// required backend variables (Supabase, JWT) that no source provides (by their field id).
pub fn missing(get: &dyn Fn(&str) -> Option<String>) -> Vec<&'static str> {
    let set = |id: &str| get(id).is_some_and(|v| !v.is_empty());
    let mut out: Vec<&'static str> = FIELDS.iter().filter(|f| f.required && !set(f.id)).map(|f| f.id).collect();
    for (env, id) in REQUIRED_ENV {
        if !env_provided(get, env, id) {
            out.push(id);
        }
    }
    out
}

/// What the setup form may know: per field, set or not, and the value only when not secret.
/// The extra env block and the primary's environment report how many variables they hold;
/// `missing` lists what still blocks the start (field ids).
pub fn status_json(get: &dyn Fn(&str) -> Option<String>) -> Value {
    let fields: Vec<Value> = FIELDS
        .iter()
        .map(|f| {
            let v = get(f.id).filter(|v| !v.is_empty());
            let mut o = json!({ "id": f.id, "group": f.group, "required": f.required, "secret": f.secret, "set": v.is_some() });
            if !f.secret {
                o["value"] = json!(v.clone().unwrap_or_default());
            }
            if let Some(d) = f.default {
                o["default"] = json!(d);
            }
            match f.check {
                Check::EnvLines => o["count"] = json!(v.as_deref().map(|t| parse_env_lines(t).vars.len()).unwrap_or(0)),
                Check::EnvJson => o["count"] = json!(v.as_deref().map(|t| parse_env_json(t).len()).unwrap_or(0)),
                _ => {}
            }
            o
        })
        .collect();
    let missing = missing(get);
    json!({ "fields": fields, "complete": missing.is_empty(), "missing": missing })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    pub const KEY: &str = "dsk_node_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
    // base64 of {"a":"acc123","t":"5f0c-tunnel-id","s":"c2VjcmV0LXZhbHVl"}
    pub const TUNNEL: &str = "eyJhIjoiYWNjMTIzIiwidCI6IjVmMGMtdHVubmVsLWlkIiwicyI6ImMyVmpjbVYwTFhaaGJIVmwifQ==";

    #[test]
    fn node_key_format() {
        assert_eq!(KEY.len(), 9 + 43);
        assert!(node_key_ok(KEY));
        assert!(!node_key_ok("dsk_node_short"));
        assert!(!node_key_ok(&KEY.replace('A', "+")));
        assert_eq!(validate("nodeKey", &format!("  {KEY}\n")), Ok(KEY.to_string()));
        assert_eq!(validate("nodeKey", "dsk_admin_x"), Err("setup.err.nodeKey"));
    }

    #[test]
    fn tunnel_token_format() {
        assert!(tunnel_token_ok(TUNNEL));
        assert!(!tunnel_token_ok("not-a-token-but-long-enough-to-pass-the-length-check"));
        assert_eq!(validate("tunnelToken", "x"), Err("setup.err.tunnelToken"));
    }

    #[test]
    fn urls() {
        assert_eq!(validate("primaryUrl", "https://des-call.onrender.com/"), Ok("https://des-call.onrender.com".into()));
        assert_eq!(validate("primaryUrl", "http://des-call.onrender.com"), Err("setup.err.url"));
        assert_eq!(validate("livekitUrl", "wss://descall.livekit.cloud"), Ok("wss://descall.livekit.cloud".into()));
        assert_eq!(validate("redisUrl", "rediss://red-x:pw@oregon-keyvalue.render.com:6379"), Ok("rediss://red-x:pw@oregon-keyvalue.render.com:6379".into()));
        assert_eq!(validate("redisUrl", ""), Ok(String::new()), "optional");
        assert_eq!(validate("supabaseUrl", ""), Ok(String::new()), "comes from the primary");
        assert_eq!(validate("primaryUrl", ""), Err("setup.err.required"));
        assert_eq!(validate("supabaseUrl", "https:// spaced.co"), Err("setup.err.url"));
    }

    #[test]
    fn supabase_and_text() {
        assert!(validate("supabaseServiceKey", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig").is_ok());
        assert!(validate("supabaseServiceKey", "sb_secret_0123456789abcdef").is_ok());
        assert_eq!(validate("supabaseServiceKey", "anon"), Err("setup.err.supabaseKey"));
        assert_eq!(validate("jwtSecret", "short"), Err("setup.err.short"));
        assert!(validate("jwtSecret", "0123456789abcdef0123").is_ok());
        assert_eq!(validate("nope", "x"), Err("setup.err.unknown"));
    }

    #[test]
    fn env_lines() {
        let e = parse_env_lines("# Render export\nexport TOTP_ENC_KEY=\"abc def\"\nMEDIA_URL_SECRET='x=y'\nPORT=1\nDESCALL_NODE_ID=evil\nbad line\n1X=2\nTOTP_ENC_KEY=second\n");
        assert_eq!(e.vars, vec![("MEDIA_URL_SECRET".into(), "x=y".into()), ("TOTP_ENC_KEY".into(), "second".into())]);
        assert_eq!(e.errors, vec![6, 7]);
        assert_eq!(e.reserved, vec!["PORT".to_string(), "DESCALL_NODE_ID".to_string()]);
        assert_eq!(validate("extraEnv", "A=1\r\nB=2"), Ok("A=1\nB=2".into()));
        assert_eq!(validate("extraEnv", "A=1\nnope"), Err("setup.err.envLines"));
    }

    #[test]
    fn status_never_carries_secret_values() {
        let mut m: HashMap<&str, String> = HashMap::new();
        m.insert("primaryUrl", "https://des-call.onrender.com".into());
        m.insert("nodeKey", KEY.into());
        m.insert("extraEnv", "A=1\nB=2".into());
        m.insert("bootstrapEnv", r#"{"SUPABASE_URL":"https://x.supabase.co","JWT_SECRET":"jwt-value-0123456789"}"#.into());
        let get = |id: &str| m.get(id).cloned();
        let s = status_json(&get);
        let text = s.to_string();
        assert!(!text.contains(KEY) && !text.contains("A=1") && !text.contains("jwt-value"));
        let f = |id: &str| s["fields"].as_array().unwrap().iter().find(|x| x["id"] == id).unwrap().clone();
        assert_eq!(f("primaryUrl")["value"], "https://des-call.onrender.com");
        assert_eq!(f("primaryUrl")["default"], crate::DEFAULT_PRIMARY_URL);
        assert_eq!(f("nodeKey")["set"], true);
        assert!(f("nodeKey").get("value").is_none());
        assert_eq!(f("extraEnv")["count"], 2);
        assert_eq!(f("bootstrapEnv")["count"], 2);
        assert_eq!(f("bootstrapEnv")["group"], "auto");
        assert_eq!(s["complete"], false);
        let miss = missing(&get);
        assert!(miss.contains(&"tunnelToken"));
        assert_eq!(miss, vec!["tunnelToken", "supabaseServiceKey"], "Supabase URL and JWT come from the primary");
    }

    #[test]
    fn short_form_and_optional_livekit() {
        let required: Vec<&str> = FIELDS.iter().filter(|f| f.required).map(|f| f.id).collect();
        assert_eq!(required, vec!["primaryUrl", "nodeKey", "tunnelToken"]);
        let short: Vec<&str> = FIELDS.iter().filter(|f| f.group == "connection").map(|f| f.id).collect();
        assert_eq!(short, vec!["primaryUrl", "nodeKey", "tunnelToken", "redisUrl"]);
        for id in ["livekitUrl", "livekitApiKey", "livekitApiSecret"] {
            assert!(!field(id).unwrap().required, "{id} is optional (Render has no LiveKit)");
            assert_eq!(validate(id, ""), Ok(String::new()));
        }
        assert!(!page_writable("bootstrapEnv") && page_writable("extraEnv") && !page_writable("nope"));
    }

    #[test]
    fn missing_counts_every_source() {
        let full = r#"{"SUPABASE_URL":"https://x.supabase.co","SUPABASE_SERVICE_ROLE_KEY":"sb_secret_0123456789abcdef","JWT_SECRET":"jwt-value-0123456789"}"#;
        let mut m: HashMap<&str, String> = HashMap::new();
        m.insert("primaryUrl", "https://des-call.onrender.com".into());
        m.insert("nodeKey", KEY.into());
        m.insert("tunnelToken", TUNNEL.into());
        fn miss(m: &HashMap<&str, String>) -> Vec<&'static str> {
            missing(&|id: &str| m.get(id).cloned())
        }
        assert_eq!(miss(&m), vec!["supabaseUrl", "supabaseServiceKey", "jwtSecret"]);
        m.insert("bootstrapEnv", full.into());
        assert!(miss(&m).is_empty(), "the primary's environment is enough");
        m.insert("bootstrapEnv", r#"{"SUPABASE_URL":"https://x.supabase.co"}"#.into());
        m.insert("extraEnv", "SUPABASE_SERVICE_ROLE_KEY=sb_secret_0123456789abcdef".into());
        m.insert("jwtSecret", "typed-by-hand-0123456789".into());
        assert!(miss(&m).is_empty(), "advanced fields and extra lines count too");
        m.insert("extraEnv", "SUPABASE_SERVICE_ROLE_KEY=".into());
        assert_eq!(miss(&m), vec!["supabaseServiceKey"], "an empty value does not count");
    }

    #[test]
    fn env_json_check() {
        assert!(validate("bootstrapEnv", r#"{"A":"1"}"#).is_ok());
        assert!(validate("bootstrapEnv", r#"{"A":1}"#).is_err());
        assert!(validate("bootstrapEnv", "A=1").is_err());
    }
}
