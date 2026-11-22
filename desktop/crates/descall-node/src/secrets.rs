//! The first-run setup form: which values the PC node needs, where each goes, how each is
//! checked, and what the popover may show after saving. Every value is stored with DPAPI
//! (CurrentUser) by the app, one sealed file per field; secret fields are never sent back to
//! the page: it only learns "set" (and can replace or clear). URLs are not secret and are shown.

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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Field {
    pub id: &'static str,
    /// Environment variable of the backend (None: used by the app itself, e.g. the tunnel).
    pub env: Option<&'static str>,
    pub required: bool,
    pub secret: bool,
    pub check: Check,
    /// Popover group ("connection", "backend", "livekit", "advanced").
    pub group: &'static str,
}

pub const FIELDS: &[Field] = &[
    Field { id: "primaryUrl", env: Some("DESCALL_NODE_PRIMARY_URL"), required: true, secret: false, check: Check::Url { https_only: true }, group: "connection" },
    Field { id: "publicUrl", env: Some("DESCALL_NODE_PUBLIC_URL"), required: false, secret: false, check: Check::Url { https_only: true }, group: "connection" },
    Field { id: "nodeKey", env: Some("DESCALL_NODE_KEY"), required: true, secret: true, check: Check::NodeKey, group: "connection" },
    Field { id: "tunnelToken", env: None, required: true, secret: true, check: Check::TunnelToken, group: "connection" },
    Field { id: "supabaseUrl", env: Some("SUPABASE_URL"), required: true, secret: false, check: Check::Url { https_only: true }, group: "backend" },
    Field { id: "supabaseServiceKey", env: Some("SUPABASE_SERVICE_ROLE_KEY"), required: true, secret: true, check: Check::SupabaseKey, group: "backend" },
    Field { id: "jwtSecret", env: Some("JWT_SECRET"), required: true, secret: true, check: Check::Text { min: 16 }, group: "backend" },
    Field { id: "redisUrl", env: Some("REDIS_URL"), required: false, secret: true, check: Check::RedisUrl, group: "backend" },
    Field { id: "livekitUrl", env: Some("LIVEKIT_URL"), required: true, secret: false, check: Check::LiveKitUrl, group: "livekit" },
    Field { id: "livekitApiKey", env: Some("LIVEKIT_API_KEY"), required: true, secret: true, check: Check::Text { min: 6 }, group: "livekit" },
    Field { id: "livekitApiSecret", env: Some("LIVEKIT_API_SECRET"), required: true, secret: true, check: Check::Text { min: 16 }, group: "livekit" },
    Field { id: "extraEnv", env: None, required: false, secret: true, check: Check::EnvLines, group: "advanced" },
];

pub fn field(id: &str) -> Option<&'static Field> {
    FIELDS.iter().find(|f| f.id == id)
}

/// Max stored length of one value (the extra env block may hold a whole .env file).
pub const MAX_VALUE: usize = 64 * 1024;

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
    };
    if !ok {
        return Err(match f.check {
            Check::Url { .. } | Check::LiveKitUrl | Check::RedisUrl => "setup.err.url",
            Check::NodeKey => "setup.err.nodeKey",
            Check::TunnelToken => "setup.err.tunnelToken",
            Check::SupabaseKey => "setup.err.supabaseKey",
            Check::Text { .. } => "setup.err.short",
            Check::EnvLines => "setup.err.envLines",
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

/// Required fields that are still missing.
pub fn missing(is_set: &dyn Fn(&str) -> bool) -> Vec<&'static str> {
    FIELDS.iter().filter(|f| f.required && !is_set(f.id)).map(|f| f.id).collect()
}

/// What the setup form may know: per field, set or not, and the value only when not secret.
/// The extra env block reports how many variables it holds.
pub fn status_json(get: &dyn Fn(&str) -> Option<String>) -> Value {
    let fields: Vec<Value> = FIELDS
        .iter()
        .map(|f| {
            let v = get(f.id).filter(|v| !v.is_empty());
            let mut o = json!({ "id": f.id, "group": f.group, "required": f.required, "secret": f.secret, "set": v.is_some() });
            if !f.secret {
                o["value"] = json!(v.clone().unwrap_or_default());
            }
            if f.check == Check::EnvLines {
                o["count"] = json!(v.as_deref().map(|t| parse_env_lines(t).vars.len()).unwrap_or(0));
            }
            o
        })
        .collect();
    let complete = missing(&|id| get(id).is_some_and(|v| !v.is_empty())).is_empty();
    json!({ "fields": fields, "complete": complete })
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
        assert_eq!(validate("supabaseUrl", ""), Err("setup.err.required"));
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
        let get = |id: &str| m.get(id).cloned();
        let s = status_json(&get);
        let text = s.to_string();
        assert!(!text.contains(KEY) && !text.contains("A=1"));
        let f = |id: &str| s["fields"].as_array().unwrap().iter().find(|x| x["id"] == id).unwrap().clone();
        assert_eq!(f("primaryUrl")["value"], "https://des-call.onrender.com");
        assert_eq!(f("nodeKey")["set"], true);
        assert!(f("nodeKey").get("value").is_none());
        assert_eq!(f("extraEnv")["count"], 2);
        assert_eq!(s["complete"], false);
        assert!(missing(&|id| get(id).is_some()).contains(&"tunnelToken"));
    }
}
