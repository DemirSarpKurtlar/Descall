//! Input rules of the individual features (sanitising what the renderer sends, the same
//! limits as the Electron modules). Pure, so every limit has a test.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::{json, Map, Value};

pub fn s(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(x)) => x.clone(),
        Some(Value::Null) | None => String::new(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => other.to_string(),
    }
}

pub fn cut(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

pub fn num(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(t) => t.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::Null => Some(0.0),
        _ => None,
    }
    .filter(|f| f.is_finite())
}

pub fn clamp_num(v: Option<&Value>, lo: f64, hi: f64, dflt: f64) -> f64 {
    num(v).map(|n| n.clamp(lo, hi)).unwrap_or(dflt)
}

pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(t)) => !t.is_empty(),
        Some(_) => true,
    }
}

// ---- core state ---------------------------------------------------------------------------

/// premium:call-state snapshot.
pub fn call_state(snap: &Value) -> Value {
    json!({
        "active": truthy(snap.get("active")),
        "title": cut(&s(snap, "title"), 120),
        "muted": truthy(snap.get("muted")),
        "deafened": truthy(snap.get("deafened")),
        "pending": truthy(snap.get("pending")),
        "kind": cut(&s(snap, "kind"), 16),
        "since": num(snap.get("since")).unwrap_or(0.0),
    })
}

/// premium:app-state snapshot.
pub fn app_state(snap: &Value) -> Value {
    json!({
        "unread": num(snap.get("unread")).unwrap_or(0.0).clamp(0.0, 99999.0).floor(),
        "status": cut(&s(snap, "status"), 16),
        "ready": true,
    })
}

pub fn valid_settings_key(k: &str) -> bool {
    let b = k.as_bytes();
    (2..=41).contains(&b.len()) && b[0].is_ascii_lowercase() && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

/// Channel allow-list of the bridge: `premium:` + up to 64 of [a-z0-9:_-] (any case).
pub fn valid_channel(c: &str) -> bool {
    let Some(rest) = c.strip_prefix("premium:") else { return false };
    (1..=64).contains(&rest.len()) && rest.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'_' | b'-'))
}

// ---- multi_window ---------------------------------------------------------------------------

pub const POPOUT_MAX: usize = 4;

fn seg_ok(seg: &str) -> bool {
    (1..=64).contains(&seg.chars().count()) && !seg.chars().any(|c| matches!(c, '/' | '?' | '#') || c.is_whitespace())
}

/// Pop-out route rule: /direct/<x>, /groups/<x>, /servers/<x>/<y>; nothing else.
pub fn valid_route(route: &str) -> Option<String> {
    if route.contains("..") {
        return None;
    }
    let rest = route.strip_prefix('/')?;
    let parts: Vec<&str> = rest.split('/').collect();
    let ok = match parts.as_slice() {
        ["direct", a] | ["groups", a] => seg_ok(a),
        ["servers", a, b] => seg_ok(a) && seg_ok(b),
        _ => false,
    };
    ok.then(|| route.to_string())
}

// ---- quick_launcher ---------------------------------------------------------------------------

pub fn launcher_results(results: Option<&Value>) -> Vec<Value> {
    let Some(list) = results.and_then(Value::as_array) else { return Vec::new() };
    list.iter()
        .take(30)
        .map(|r| {
            let avatar = s(r, "avatar");
            let lower = avatar.to_ascii_lowercase();
            json!({
                "id": cut(&s(r, "id"), 200),
                "kind": cut(&s(r, "kind").chars().filter(|c| c.is_ascii_lowercase() || *c == '_').collect::<String>(), 20),
                "title": cut(&s(r, "title"), 120),
                "subtitle": cut(&s(r, "subtitle"), 160),
                "avatar": if lower.starts_with("https://") || lower.starts_with("data:image/") { cut(&avatar, 4096) } else { String::new() },
                "focus": truthy(r.get("focus")),
            })
        })
        .filter(|r| !r["id"].as_str().unwrap_or("").is_empty() && !r["title"].as_str().unwrap_or("").is_empty())
        .collect()
}

// ---- HUDs ------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct HudConfig {
    pub corner: String,
    pub margin: f64,
    pub scale: f64,
    pub opacity: f64,
    pub width: f64,
    pub click_through: bool,
}

impl HudConfig {
    pub fn to_json(&self) -> Value {
        json!({ "corner": self.corner, "margin": self.margin, "scale": self.scale, "opacity": self.opacity, "width": self.width, "clickThrough": self.click_through })
    }
}

pub fn hud_config(raw: &Value, default_corner: &str, default_width: f64) -> HudConfig {
    let corner = match raw.get("corner").and_then(Value::as_str) {
        Some(c @ ("tl" | "tr" | "bl" | "br")) => c.to_string(),
        _ => default_corner.to_string(),
    };
    HudConfig {
        corner,
        margin: clamp_num(raw.get("margin"), 0.0, 400.0, 16.0),
        scale: clamp_num(raw.get("scale"), 0.75, 1.5, 1.0),
        opacity: clamp_num(raw.get("opacity"), 0.3, 1.0, 0.92),
        width: clamp_num(raw.get("width"), 160.0, 520.0, default_width),
        click_through: raw.get("clickThrough") != Some(&Value::Bool(false)),
    }
}

/// First height guess of a HUD before its page measured itself.
pub fn hud_height(kind: &str, state: &Value) -> f64 {
    let len = |k: &str| state.get(k).and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) as f64;
    if kind == "voice" {
        return 58.0 + 34.0 * len("members").clamp(1.0, 10.0);
    }
    let show = state.get("show").cloned().unwrap_or(json!({}));
    let on = |k: &str| show.get(k) != Some(&Value::Bool(false));
    let mut h = 52.0;
    if on("clock") {
        h += 20.0;
    }
    if on("ping") {
        let lk = state.get("ping").and_then(|p| p.get("livekit")).is_some_and(|v| !v.is_null());
        h += 20.0 * if lk { 2.0 } else { 1.0 };
    }
    if on("call") {
        h += 54.0;
    }
    if on("friends") {
        h += 46.0 + 34.0 * len("friends").clamp(1.0, 6.0);
    }
    h
}

// ---- widgets -----------------------------------------------------------------------------------

pub const WIDGET_KINDS: &[&str] = &["friends", "calls", "notifications"];
pub const MAX_WIDGETS: usize = 4;

pub fn norm_widget(w: &Value, i: usize) -> Option<Value> {
    let kind = w.get("kind").and_then(Value::as_str).filter(|k| WIDGET_KINDS.contains(k))?;
    let mut id: String = s(w, "id").chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').take(40).collect();
    if id.is_empty() {
        id = format!("{kind}-{i}");
    }
    let n = |k: &str, lo: f64, hi: f64, d: f64| clamp_num(w.get(k), lo, hi, d);
    Some(json!({
        "id": id,
        "kind": kind,
        "x": n("x", -10000.0, 10000.0, 40.0 + i as f64 * 30.0).round(),
        "y": n("y", -10000.0, 10000.0, 80.0 + i as f64 * 30.0).round(),
        "width": n("width", 180.0, 420.0, 240.0).round(),
        "height": n("height", 120.0, 520.0, 220.0).round(),
        "opacity": n("opacity", 0.3, 1.0, 0.95),
    }))
}

pub fn norm_widgets(list: Option<&Value>) -> Vec<Value> {
    list.and_then(Value::as_array)
        .map(|a| a.iter().take(MAX_WIDGETS).enumerate().filter_map(|(i, w)| norm_widget(w, i)).collect())
        .unwrap_or_default()
}

// ---- custom_layouts / window_layouts -------------------------------------------------------------

pub const CUSTOM_LAYOUTS_MAX: usize = 8;
pub const WINDOW_LAYOUTS_MAX: usize = 12;

pub fn layout_id(raw: &str) -> String {
    raw.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').take(32).collect()
}

/// premium:custom_layouts:save -> new file content, or the error code.
pub fn custom_layout_save(all: &Value, layout: &Value, now_iso: &str, now_id: &str) -> Result<Value, &'static str> {
    let name = cut(s(layout, "name").trim(), 40);
    if name.is_empty() {
        return Err("name");
    }
    let widgets: Vec<Value> = layout.get("widgets").and_then(Value::as_array).map(|a| a.iter().take(4).cloned().collect()).unwrap_or_default();
    let raw_id = s(layout, "id");
    let id = layout_id(if raw_id.is_empty() { now_id } else { &raw_id });
    let rest: Vec<Value> = all.get("layouts").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().filter(|l| l.get("id").and_then(Value::as_str) != Some(&id)).collect();
    if rest.len() >= CUSTOM_LAYOUTS_MAX {
        return Err("limit");
    }
    let mut layouts = rest;
    layouts.push(json!({ "id": id, "name": name, "widgets": widgets, "savedAt": now_iso }));
    Ok(json!({ "layouts": layouts, "active": id }))
}

pub fn layouts_file(v: Option<Value>) -> Value {
    let v = v.unwrap_or(json!({}));
    json!({
        "layouts": v.get("layouts").filter(|l| l.is_array()).cloned().unwrap_or(json!([])),
        "active": v.get("active").filter(|a| truthy(Some(a))).cloned().unwrap_or(Value::Null),
    })
}

// ---- tray mirrors -------------------------------------------------------------------------------

/// audio_device_profiles mirror: [{id,name}] (max 12) + active id.
pub fn audio_profiles(payload: &Value) -> (Vec<(String, String)>, Option<String>) {
    let list = payload.get("profiles").and_then(Value::as_array).cloned().unwrap_or_default();
    let profiles = list
        .iter()
        .take(12)
        .map(|p| (cut(&s(p, "id"), 64), cut(&s(p, "name"), 60)))
        .filter(|(id, name)| !id.is_empty() && !name.is_empty())
        .collect();
    let active = Some(cut(&s(payload, "activeId"), 64)).filter(|a| !a.is_empty() && truthy(payload.get("activeId")));
    (profiles, active)
}

#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceProfile {
    pub id: String,
    pub label: String,
    pub hotkey: String,
    pub active: bool,
}

pub fn workspace_profiles(payload: &Value) -> Vec<WorkspaceProfile> {
    payload
        .get("profiles")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .take(8)
                .map(|p| WorkspaceProfile { id: cut(&s(p, "id"), 40), label: cut(&s(p, "label"), 40), hotkey: cut(&s(p, "hotkey"), 40), active: truthy(p.get("active")) })
                .filter(|p| !p.id.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// focus_mode: minutes left (rounded up), 0 when off.
pub fn minutes_left(until: u64, now: u64) -> u64 {
    if until > now { (until - now).div_ceil(60_000) } else { 0 }
}

// ---- media_keys ---------------------------------------------------------------------------------

pub const MEDIA_KEYS: &[(&str, &str)] = &[("playPause", "MediaPlayPause"), ("next", "MediaNextTrack"), ("previous", "MediaPreviousTrack"), ("stop", "MediaStop")];

pub fn media_mapping(settings: &Map<String, Value>) -> Map<String, Value> {
    let defaults = [("playPause", "toggle_mute"), ("next", "toggle_deafen"), ("previous", "none"), ("stop", "none")];
    let mut out = Map::new();
    for (name, d) in defaults {
        let v = settings.get(name).and_then(Value::as_str).filter(|v| matches!(*v, "toggle_mute" | "toggle_deafen" | "none")).unwrap_or(d);
        out.insert(name.into(), json!(v));
    }
    out
}

// ---- quick_reply / quick_file_drop / instant_clip ------------------------------------------------

/// Conversation id for the quick-reply route ("dm:<peerId>"), or None when not replyable.
pub fn reply_target(data: &Value) -> Option<String> {
    let t = s(data, "type");
    let dm_conv = truthy(data.get("dmConversationId"));
    if t == "dm" || (t == "mention" && dm_conv) {
        for k in ["fromId", "conversationId", "dmConversationId"] {
            if truthy(data.get(k)) {
                return Some(format!("dm:{}", cut(&s(data, k), 64)));
            }
        }
    }
    None
}

/// instant_clip H.264 bitrate for the clip height (the renderer recorder's bitrateFor table).
pub fn clip_bitrate(height: u32, fps: u32) -> u32 {
    let base: u32 = if height >= 1080 { 10_000_000 } else if height >= 720 { 4_000_000 } else { 2_000_000 };
    if fps > 30 { base / 10 * 16 } else { base }
}

/// Toast activation arguments: the toast id and the conversation, so a reply that starts
/// Descall (cold start, COM activator) still knows where it goes.
pub fn toast_args(id: &str, conv: &str) -> String {
    format!("descall-qr|{id}|{conv}")
}

pub fn parse_toast_args(args: &str) -> Option<(String, String)> {
    let rest = args.strip_prefix("descall-qr|")?;
    let (id, conv) = rest.split_once('|')?;
    let conv = conv.strip_suffix("|reply").unwrap_or(conv);
    let ok_id = !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    let ok_conv = conv.starts_with("dm:") && conv.len() > 3 && conv.chars().count() <= 70 && !conv.contains('|');
    (ok_id && ok_conv).then(|| (id.to_string(), conv.to_string()))
}

pub fn drop_targets(next: &Value) -> Vec<Value> {
    next.get("targets")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .take(12)
                .map(|t| json!({ "id": cut(&s(t, "id"), 120), "label": cut(&s(t, "label"), 60) }))
                .filter(|t| !t["id"].as_str().unwrap_or("").is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub const DROP_MAX_BYTES: usize = 100 * 1024 * 1024;
/// All raw bodies held at once (premium_blob_put, clip exports). Without a total, a page or
/// HUD window could park 100 MB per call for two minutes, without limit.
pub const BLOB_TOTAL_MAX_BYTES: usize = 3 * DROP_MAX_BYTES;

/// Blob ids to drop, oldest (smallest id) first, so `incoming` more bytes fit under
/// [`BLOB_TOTAL_MAX_BYTES`]. `held` is (id, size) of the blobs still held.
pub fn blobs_to_evict(held: &[(u64, usize)], incoming: usize) -> Vec<u64> {
    let mut by_age: Vec<(u64, usize)> = held.to_vec();
    by_age.sort_by_key(|(id, _)| *id);
    let mut total: usize = by_age.iter().map(|(_, n)| *n).sum::<usize>().saturating_add(incoming);
    let mut out = Vec::new();
    for (id, n) in by_age {
        if total <= BLOB_TOTAL_MAX_BYTES {
            break;
        }
        total -= n;
        out.push(id);
    }
    out
}

/// instant_clip save name: [\w.-] only, at most 80 chars, "clip.webm" when empty.
pub fn safe_file_name(name: &str) -> String {
    let mut out = String::new();
    let mut last_us = false;
    for c in name.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' {
            out.push(c);
            last_us = false;
        } else if !last_us {
            out.push('_');
            last_us = true;
        }
    }
    let out = cut(&out, 80);
    if out.is_empty() { "clip.webm".into() } else { out }
}

/// Username claim of a JWT (display only, never trusted for auth).
pub fn jwt_username(jwt: &str) -> String {
    let Some(part) = jwt.split('.').nth(1) else { return String::new() };
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(part.trim_end_matches('=')) else { return String::new() };
    serde_json::from_slice::<Value>(&bytes).map(|v| cut(&s(&v, "username"), 40)).unwrap_or_default()
}

pub fn looks_like_jwt(t: &str) -> bool {
    let parts: Vec<&str> = t.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'='))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_store_has_a_total_cap() {
        const MB: usize = 1024 * 1024;
        assert!(blobs_to_evict(&[(1, 10 * MB)], 10 * MB).is_empty());
        let held = [(5, 100 * MB), (2, 100 * MB), (9, 100 * MB)];
        assert_eq!(blobs_to_evict(&held, 100 * MB), vec![2], "the oldest goes first");
        assert_eq!(blobs_to_evict(&held, 250 * MB), vec![2, 5, 9], "everything older goes when one big body arrives");
        assert!(blobs_to_evict(&[], 100 * MB).is_empty());
    }

    #[test]
    fn channels_and_keys() {
        assert!(valid_channel("premium:window:pin"));
        assert!(!valid_channel("premium:"));
        assert!(!valid_channel("app:boot"));
        assert!(!valid_channel("premium:a b"));
        assert!(valid_settings_key("global_ptt"));
        assert!(!valid_settings_key("Global"));
        assert!(!valid_settings_key("a"));
    }

    #[test]
    fn popout_routes() {
        assert_eq!(POPOUT_MAX, 4);
        assert_eq!(valid_route("/direct/deniz").as_deref(), Some("/direct/deniz"));
        assert_eq!(valid_route("/servers/s1/c2").as_deref(), Some("/servers/s1/c2"));
        assert_eq!(valid_route("/groups/g1").as_deref(), Some("/groups/g1"));
        for bad in ["https://evil.example/", "/settings/security", "/direct/../x", "/direct/a?x=1", "/servers/s1", "javascript:alert(1)", "/direct/a b"] {
            assert_eq!(valid_route(bad), None, "{bad}");
        }
    }

    #[test]
    fn states_and_mirrors() {
        let c = call_state(&json!({"active": 1, "title": "x".repeat(200), "kind": "dm-call-with-a-long-kind"}));
        assert_eq!(c["active"], true);
        assert_eq!(c["title"].as_str().unwrap().len(), 120);
        assert_eq!(c["kind"].as_str().unwrap().len(), 16);
        assert_eq!(app_state(&json!({"unread": 1e9}))["unread"], 99999.0);
        assert_eq!(app_state(&json!({"unread": -3}))["unread"], 0.0);
        let (p, a) = audio_profiles(&json!({"profiles": [{"id": "a", "name": "Headset"}, {"id": "", "name": "x"}], "activeId": "a"}));
        assert_eq!(p, vec![("a".to_string(), "Headset".to_string())]);
        assert_eq!(a.as_deref(), Some("a"));
        let w = workspace_profiles(&json!({"profiles": [{"id": "work", "label": "Work", "hotkey": "Ctrl+Alt+1", "active": true}, {"label": "no id"}]}));
        assert_eq!(w.len(), 1);
        assert!(w[0].active);
        assert_eq!(minutes_left(0, 5), 0);
        assert_eq!(minutes_left(61_000, 0), 2);
        assert_eq!(minutes_left(60_000, 0), 1);
    }

    #[test]
    fn launcher_and_widgets() {
        let r = launcher_results(Some(&json!([{"id": "u1", "kind": "Friend!", "title": "Ada", "avatar": "javascript:x"}, {"id": "", "title": "x"}, {"id": "a", "title": ""}])));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0]["kind"], "riend");
        assert_eq!(r[0]["avatar"], "");
        let w = norm_widgets(Some(&json!([{"kind": "friends", "x": 99999, "width": 10}, {"kind": "evil"}, {"kind": "calls", "id": "c/1"}])));
        assert_eq!(w.len(), 2);
        assert_eq!(w[0]["x"], 10000.0);
        assert_eq!(w[0]["width"], 180.0);
        assert_eq!(w[0]["id"], "friends-0");
        assert_eq!(w[1]["id"], "c1");
    }

    #[test]
    fn huds() {
        let c = hud_config(&json!({"corner": "xx", "scale": 9, "opacity": 0, "clickThrough": false}), "tr", 230.0);
        assert_eq!(c.corner, "tr");
        assert_eq!(c.scale, 1.5);
        assert_eq!(c.opacity, 0.3);
        assert_eq!(c.width, 230.0);
        assert!(!c.click_through);
        assert!(hud_config(&json!({}), "tl", 220.0).click_through);
        assert_eq!(hud_height("voice", &json!({"members": [1, 2, 3]})), 58.0 + 34.0 * 3.0);
        assert_eq!(hud_height("gaming", &json!({"show": {"clock": false, "call": false, "friends": false}})), 72.0);
        assert_eq!(hud_height("gaming", &json!({"ping": {"livekit": 20}, "show": {"clock": false, "call": false, "friends": false}})), 92.0);
    }

    #[test]
    fn layouts() {
        let all = layouts_file(None);
        let saved = custom_layout_save(&all, &json!({"name": "  Stream  ", "widgets": [1, 2, 3, 4, 5]}), "t", "lx").unwrap();
        assert_eq!(saved["active"], "lx");
        assert_eq!(saved["layouts"][0]["widgets"].as_array().unwrap().len(), 4);
        assert_eq!(saved["layouts"][0]["name"], "Stream");
        assert_eq!(custom_layout_save(&all, &json!({"name": " "}), "t", "x"), Err("name"));
        let full = json!({"layouts": (0..8).map(|i| json!({"id": format!("l{i}")})).collect::<Vec<_>>()});
        assert_eq!(custom_layout_save(&full, &json!({"name": "n", "id": "new"}), "t", "x"), Err("limit"));
        assert!(custom_layout_save(&full, &json!({"name": "n", "id": "l3"}), "t", "x").is_ok(), "replacing an existing id is fine");
    }

    #[test]
    fn replies_files_tokens() {
        assert_eq!(reply_target(&json!({"type": "dm", "fromId": "u1"})).as_deref(), Some("dm:u1"));
        assert_eq!(reply_target(&json!({"type": "mention", "dmConversationId": "c9"})).as_deref(), Some("dm:c9"));
        assert_eq!(reply_target(&json!({"type": "mention"})), None);
        assert_eq!(reply_target(&json!({"type": "call", "fromId": "u1"})), None);
        assert_eq!(clip_bitrate(720, 30), 4_000_000);
        assert_eq!(clip_bitrate(1080, 60), 16_000_000);
        assert_eq!(clip_bitrate(480, 30), 2_000_000);
        let a = toast_args("descall-qr-1-2", "dm:u1");
        assert_eq!(parse_toast_args(&a), Some(("descall-qr-1-2".into(), "dm:u1".into())));
        assert_eq!(parse_toast_args(&format!("{a}|reply")), Some(("descall-qr-1-2".into(), "dm:u1".into())));
        assert_eq!(parse_toast_args("descall-qr|x|group:1"), None, "only DMs are replyable");
        assert_eq!(parse_toast_args("other|x|dm:1"), None);
        assert_eq!(parse_toast_args("descall-qr|a b|dm:1"), None);
        assert_eq!(safe_file_name("my clip (1).webm"), "my_clip_1_.webm");
        assert_eq!(safe_file_name(""), "clip.webm");
        assert_eq!(drop_targets(&json!({"targets": [{"id": "dm:1", "label": "Ada"}, {"label": "x"}]})).len(), 1);
        let payload = URL_SAFE_NO_PAD.encode(br#"{"username":"deniz","sub":"1"}"#);
        let jwt = format!("eyJhbGciOiJIUzI1NiJ9.{payload}.sig");
        assert_eq!(jwt_username(&jwt), "deniz");
        assert!(looks_like_jwt(&jwt));
        assert!(!looks_like_jwt("{\"a\":1}"));
        let m = media_mapping(json!({"next": "none", "stop": "launch_rockets"}).as_object().unwrap());
        assert_eq!(m["playPause"], "toggle_mute");
        assert_eq!(m["next"], "none");
        assert_eq!(m["stop"], "none");
    }
}
