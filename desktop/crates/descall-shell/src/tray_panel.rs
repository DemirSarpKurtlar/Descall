//! Tray panel (owner pick, draft B "Gelismis menu"): the shell rules of
//! frontend/electron/trayMenuModel.cjs, ported. The panel page itself is
//! frontend/public/tray-menu/ (shipped in frontend/dist); the Tauri app owns the window
//! (app/src-tauri/src/tray_menu.rs) and calls these.
//!
//! - [`normalize_app_state`]: the compact state the main page pushes, cleaned and capped.
//! - [`validate_action`]: the only actions the panel window may ask for.
//! - [`place_panel`]: the window rect above the tray icon, taskbar on any edge, any DPI.
//! - snooze: the desktop-level "mute notifications" until a timestamp.

use serde_json::{json, Map, Value};

pub const STATUSES: [&str; 4] = ["online", "idle", "dnd", "invisible"];
pub const SNOOZE_MINUTES: [u64; 3] = [30, 60, 480];
const SNOOZE_MAX_MS: u64 = 24 * 60 * 60 * 1000;

/// Panel geometry in logical px (trayMenuModel.cjs PANEL).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Geometry {
    pub card: f64,
    pub flyout: f64,
    pub gap: f64,
    pub pad: f64,
    pub max_height: f64,
}

pub const PANEL: Geometry = Geometry { card: 290.0, flyout: 232.0, gap: 6.0, pad: 14.0, max_height: 780.0 };

impl Geometry {
    /// The placement fields the page reads (state.placement), cardLeft etc. added by the caller.
    pub fn page_fields(&self) -> Map<String, Value> {
        let mut m = Map::new();
        m.insert("pad".into(), json!(self.pad));
        m.insert("gap".into(), json!(self.gap));
        m.insert("card".into(), json!(self.card));
        m.insert("flyoutWidth".into(), json!(self.flyout));
        m
    }
}

// ---- app state ------------------------------------------------------------------------------

fn clean_str(v: Option<&Value>, max: usize) -> String {
    let s = v.and_then(Value::as_str).unwrap_or("");
    let s: String = s.chars().map(|c| if (c as u32) < 0x20 || c as u32 == 0x7f { ' ' } else { c }).collect();
    s.trim().chars().take(max).collect::<String>().trim().to_string()
}

fn count(v: Option<&Value>) -> u64 {
    let n = v.and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()))).unwrap_or(0.0).floor();
    if n.is_finite() && n > 0.0 {
        n.min(9999.0) as u64
    } else {
        0
    }
}

fn time(v: Option<&Value>) -> u64 {
    let n = v.and_then(Value::as_f64).unwrap_or(0.0).floor();
    if n.is_finite() && n > 0.0 && n < 9.0e15 {
        n as u64
    } else {
        0
    }
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_)) | Some(Value::Object(_)) => true,
        _ => false,
    }
}

/// https: or data:image avatars only (the panel page loads nothing else).
pub fn safe_image_url(v: Option<&Value>) -> String {
    let s = v.and_then(Value::as_str).unwrap_or("").trim();
    let lower = s.to_ascii_lowercase();
    let no_bad = |t: &str| !t.chars().any(|c| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>'));
    if lower.starts_with("https://") && s.len() > 8 && s.len() <= 2048 && no_bad(s) {
        return s.to_string();
    }
    for prefix in ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,", "data:image/webp;base64,", "data:image/gif;base64,"] {
        if lower.starts_with(prefix) && s.len() <= 262_144 {
            let body = &s[prefix.len()..];
            if !body.is_empty() && body.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=')) {
                return s.to_string();
            }
        }
    }
    String::new()
}

/// "Ctrl+Shift+M"-like hint, or "" (letters, digits, + . _ - space, arrows, Mac symbols).
pub fn safe_hint(v: Option<&Value>) -> String {
    let s = clean_str(v, 32);
    let ok = s.chars().all(|c| c.is_alphanumeric() || matches!(c, '+' | ' ' | '.' | '_' | '-' | '\u{2190}'..='\u{2193}' | '\u{2318}' | '\u{2325}' | '\u{21e7}'));
    if ok {
        s
    } else {
        String::new()
    }
}

fn accent(v: Option<&Value>) -> String {
    let s: String = clean_str(v, 20).chars().filter(|c| !c.is_whitespace()).collect();
    let parts: Vec<&str> = s.split(',').collect();
    let valid = parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit()) && p.parse::<u16>().is_ok_and(|n| n <= 255));
    if valid {
        s
    } else {
        String::new()
    }
}

/// trayMenuModel.cjs normalizeAppState: only known keys, capped strings and counts.
pub fn normalize_app_state(raw: &Value) -> Value {
    let get = |k: &str| raw.get(k);
    let hints = raw.get("hints").filter(|h| h.is_object()).cloned().unwrap_or(Value::Null);
    let status = get("status").and_then(Value::as_str).filter(|s| STATUSES.contains(s)).unwrap_or("online");
    let locale: String = clean_str(get("locale"), 16).chars().filter(|c| c.is_ascii_alphabetic() || *c == '-').collect();
    json!({
        "signedIn": truthy(get("signedIn")),
        "name": clean_str(get("name"), 64),
        "avatarUrl": safe_image_url(get("avatarUrl")),
        "status": status,
        "statusUntil": time(get("statusUntil")),
        "statusText": clean_str(get("statusText"), 80),
        "unreadMessages": count(get("unreadMessages")),
        "friendRequests": count(get("friendRequests")),
        "micMuted": truthy(get("micMuted")),
        "deafened": truthy(get("deafened")),
        "inCall": truthy(get("inCall")),
        "clipAvailable": truthy(get("clipAvailable")),
        "notificationsMutedUntil": time(get("notificationsMutedUntil")),
        "hints": {
            "open": safe_hint(hints.get("open")),
            "mute": safe_hint(hints.get("mute")),
            "deafen": safe_hint(hints.get("deafen")),
            "clip": safe_hint(hints.get("clip")),
        },
        "theme": if get("theme").and_then(Value::as_str) == Some("light") { "light" } else { "dark" },
        "accent": accent(get("accent")),
        "locale": locale,
    })
}

// ---- actions --------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Shell,
    App,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Arg {
    None,
    Status(&'static str),
    Minutes(u64),
    Seq(u64),
    Id(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Action {
    pub action: &'static str,
    pub arg: Arg,
    pub kind: Kind,
    /// The panel hides after it runs.
    pub closes: bool,
}

impl Action {
    /// The argument as JSON (what the page receives with an app action).
    pub fn arg_json(&self) -> Value {
        match &self.arg {
            Arg::None => Value::Null,
            Arg::Status(s) => json!(s),
            Arg::Minutes(m) => json!(m),
            Arg::Seq(n) => json!(n),
            Arg::Id(id) => json!(id),
        }
    }
}

/// (name, kind, closes, argument rule) — trayMenuModel.cjs ACTIONS.
const ACTIONS: &[(&str, Kind, bool, &str)] = &[
    ("open", Kind::Shell, true, ""),
    ("settings", Kind::Shell, true, ""),
    ("autostart", Kind::Shell, false, ""),
    ("quit", Kind::Shell, true, ""),
    ("update", Kind::Shell, true, ""),
    ("close", Kind::Shell, true, ""),
    ("ack", Kind::Shell, false, "seq"),
    ("snooze", Kind::Shell, true, "snooze"),
    ("premium", Kind::Shell, true, "premium"),
    ("status", Kind::App, true, "status"),
    ("mute", Kind::App, false, ""),
    ("deafen", Kind::App, false, ""),
    ("clip", Kind::App, true, ""),
    ("openDms", Kind::App, true, ""),
    ("openRequests", Kind::App, true, ""),
];

fn as_u64(v: &Value) -> Option<u64> {
    let f = v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()))?;
    (f.is_finite() && f >= 0.0 && f.fract() == 0.0 && f <= 9.0e15).then_some(f as u64)
}

/// An allowed request from the panel, else None. `premium_ids`: the Descall+ entry ids the
/// panel was last given (only those can be clicked).
pub fn validate_action(action: &str, arg: &Value, premium_ids: &[String]) -> Option<Action> {
    let &(name, kind, closes, rule) = ACTIONS.iter().find(|(n, ..)| *n == action)?;
    let arg = match rule {
        "status" => Arg::Status(STATUSES.iter().find(|s| arg.as_str() == Some(**s)).copied()?),
        "snooze" => {
            let m = as_u64(arg)?;
            if m != 0 && !SNOOZE_MINUTES.contains(&m) {
                return None;
            }
            Arg::Minutes(m)
        }
        "seq" => Arg::Seq(as_u64(arg)?),
        "premium" => {
            let id = arg.as_str().filter(|s| !s.is_empty() && s.len() <= 200)?;
            if !premium_ids.iter().any(|p| p == id) {
                return None;
            }
            Arg::Id(id.to_string())
        }
        _ => Arg::None,
    };
    Some(Action { action: name, arg, kind, closes })
}

// ---- notification snooze --------------------------------------------------------------------

/// Until when notifications stay quiet for a snooze choice (0 = off).
pub fn snooze_until_for(minutes: u64, now: u64) -> u64 {
    if SNOOZE_MINUTES.contains(&minutes) {
        now + minutes * 60_000
    } else {
        0
    }
}

/// A stored value still in the future (and not absurdly far), else 0.
pub fn active_snooze(until: u64, now: u64) -> u64 {
    if until > now && until - now <= SNOOZE_MAX_MS {
        until
    } else {
        0
    }
}

/// Desktop cards stay quiet while snoozed; incoming calls (requireInteraction) still ring.
pub fn suppress_notification(options: &Value, until: u64, now: u64) -> bool {
    if active_snooze(until, now) == 0 {
        return false;
    }
    let call = options.get("requireInteraction").and_then(Value::as_bool).unwrap_or(false)
        || matches!(options.get("data").and_then(|d| d.get("type")).and_then(Value::as_str), Some("call" | "group-call"));
    !call
}

/// The snooze file (`notification-snooze.json`, same shape as Electron's).
pub fn parse_snooze_file(text: &str, now: u64) -> u64 {
    serde_json::from_str::<Value>(text).ok().map(|v| active_snooze(time(v.get("until")), now)).unwrap_or(0)
}

pub fn snooze_file_json(until: u64) -> String {
    json!({ "until": until }).to_string()
}

// ---- placement ------------------------------------------------------------------------------

/// A rectangle in the units the caller uses (Tauri: physical px).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Rect { x, y, width, height }
    }
    fn right(&self) -> f64 {
        self.x + self.width
    }
    fn bottom(&self) -> f64 {
        self.y + self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge {
    Bottom,
    Top,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Logical px from the window's left edge to the card.
    pub card_left: i32,
    /// The card sits on the window's top edge (taskbar on top), else on its bottom edge.
    pub top: bool,
    pub flyout: Side,
    pub edge: Edge,
}

impl Placement {
    /// state.placement for the page.
    pub fn page_json(&self, g: &Geometry) -> Value {
        let mut m = g.page_fields();
        m.insert("cardLeft".into(), json!(self.card_left));
        m.insert("vertical".into(), json!(if self.top { "top" } else { "bottom" }));
        m.insert("flyout".into(), json!(if self.flyout == Side::Left { "left" } else { "right" }));
        Value::Object(m)
    }
}

/// Which edge of the monitor the tray (taskbar) is on.
pub fn taskbar_edge(tray: Rect, work: Rect) -> Edge {
    if tray.y >= work.bottom() - 1.0 {
        return Edge::Bottom;
    }
    if tray.bottom() <= work.y + 1.0 {
        return Edge::Top;
    }
    if tray.x >= work.right() - 1.0 {
        return Edge::Right;
    }
    if tray.right() <= work.x + 1.0 {
        return Edge::Left;
    }
    // Auto-hide taskbar or the overflow flyout: the nearest edge of the work area.
    let (cx, cy) = (tray.x + tray.width / 2.0, tray.y + tray.height / 2.0);
    let mut d = [(Edge::Bottom, work.bottom() - cy), (Edge::Top, cy - work.y), (Edge::Right, work.right() - cx), (Edge::Left, cx - work.x)];
    d.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    d[0].0
}

/// trayMenuModel.cjs placePanel. `tray` and `work` in physical px, `scale` the monitor's
/// scale factor; the window holds the card, a flyout lane on one side and a shadow pad and
/// stays inside the work area.
pub fn place_panel(tray: Rect, work: Rect, scale: f64, g: &Geometry) -> Placement {
    let s = if scale > 0.0 { scale } else { 1.0 };
    let (cw, fw, gap, pad) = (g.card * s, g.flyout * s, g.gap * s, g.pad * s);
    let edge = taskbar_edge(tray, work);
    let cx = tray.x + tray.width / 2.0;
    let card_x = match edge {
        Edge::Left => work.x + pad,
        Edge::Right => work.right() - pad - cw,
        _ => (cx - cw / 2.0).min(work.right() - pad - cw).max(work.x + pad),
    };
    let room_right = work.right() - (card_x + cw) - pad;
    let room_left = card_x - work.x - pad;
    let flyout = if room_right >= fw + gap {
        Side::Right
    } else if room_left >= fw + gap {
        Side::Left
    } else if room_right >= room_left {
        Side::Right
    } else {
        Side::Left
    };
    let mut x = if flyout == Side::Right { card_x - pad } else { card_x - gap - fw - pad };
    let mut width = pad + cw + gap + fw + pad;
    if x < work.x {
        width -= work.x - x;
        x = work.x;
    }
    if x + width > work.right() {
        width = work.right() - x;
    }
    let height = (g.max_height * s).min(work.height);
    let (y, top) = match edge {
        Edge::Top => (work.y, true),
        Edge::Bottom => (work.bottom() - height, false),
        _ => {
            let card_bottom = (tray.bottom() + pad).min(work.bottom()).max(work.y + height);
            (card_bottom - height, false)
        }
    };
    let xr = x.round();
    Placement {
        x: xr as i32,
        y: y.round() as i32,
        width: width.round().max(1.0) as u32,
        height: height.round().max(1.0) as u32,
        card_left: ((card_x - xr) / s).round() as i32,
        top,
        flyout,
        edge,
    }
}

/// Tray icon with an unread dot (owner checklist: "a badge on the tray icon for unread
/// messages"; Electron had none): a red disc in the bottom-right corner, cut out of the logo
/// with a transparent ring so it reads at 16 px. Straight RGBA in, same size out; anything
/// that is not a square `size` x `size` RGBA buffer comes back unchanged.
pub fn unread_dot_rgba(icon: &[u8], size: u32) -> Vec<u8> {
    let mut out = icon.to_vec();
    if size == 0 || icon.len() != (size as usize) * (size as usize) * 4 {
        return out;
    }
    const DOT: [f64; 3] = [242.0, 63.0, 67.0];
    let s = size as f64;
    let r = (s * 0.25).max(3.0);
    let ring = (s / 16.0).max(1.0);
    let (cx, cy) = (s - r, s - r);
    for y in 0..size as usize {
        for x in 0..size as usize {
            let d = ((x as f64 + 0.5 - cx).powi(2) + (y as f64 + 0.5 - cy).powi(2)).sqrt();
            let cut = (r + ring + 0.5 - d).clamp(0.0, 1.0);
            if cut <= 0.0 {
                continue;
            }
            let dot = (r + 0.5 - d).clamp(0.0, 1.0);
            let i = (y * size as usize + x) * 4;
            let base_a = out[i + 3] as f64 / 255.0 * (1.0 - cut);
            let a = dot + base_a * (1.0 - dot);
            for c in 0..3 {
                let v = if a > 0.0 { (DOT[c] * dot + out[i + c] as f64 * base_a * (1.0 - dot)) / a } else { 0.0 };
                out[i + c] = v.round().clamp(0.0, 255.0) as u8;
            }
            out[i + 3] = (a * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unread_dot_on_the_tray_icon() {
        let size = 16u32;
        let icon = [10u8, 20, 30, 255].repeat((size * size) as usize);
        let out = unread_dot_rgba(&icon, size);
        assert_eq!(out.len(), icon.len());
        let px = |x: usize, y: usize| &out[(y * 16 + x) * 4..(y * 16 + x) * 4 + 4];
        assert_eq!(px(0, 0), &[10, 20, 30, 255], "the logo stays where the dot is not");
        assert_eq!(px(12, 12), &[242, 63, 67, 255], "dot centre (r = 4 px at 16 px)");
        assert!(px(7, 12)[3] < 128, "transparent ring between logo and dot");
        assert_eq!(unread_dot_rgba(&icon[..12], size), icon[..12].to_vec(), "wrong size: unchanged");
        let big = unread_dot_rgba(&[0u8, 0, 0, 0].repeat(32 * 32), 32);
        assert_eq!(&big[(26 * 32 + 26) * 4..(26 * 32 + 26) * 4 + 4], &[242, 63, 67, 255], "transparent logo: dot only");
    }

    #[test]
    fn app_state_is_cleaned_and_capped() {
        let s = normalize_app_state(&json!({
            "signedIn": 1, "name": "  Demir\u{0} ", "avatarUrl": "javascript:alert(1)", "status": "busy",
            "unreadMessages": "12", "friendRequests": -3, "micMuted": "yes",
            "hints": { "mute": "Ctrl+Shift+M", "deafen": "<img src=x>", "clip": "Alt+F10" },
            "theme": "light", "accent": "88, 122, 245", "locale": "pt-BR<", "extra": "dropped"
        }));
        assert_eq!(s["name"], "Demir");
        assert_eq!(s["avatarUrl"], "");
        assert_eq!(s["status"], "online");
        assert_eq!(s["unreadMessages"], 12);
        assert_eq!(s["friendRequests"], 0);
        assert_eq!(s["micMuted"], true);
        assert_eq!(s["hints"]["mute"], "Ctrl+Shift+M");
        assert_eq!(s["hints"]["deafen"], "");
        assert_eq!(s["theme"], "light");
        assert_eq!(s["accent"], "88,122,245");
        assert_eq!(s["locale"], "pt-BR");
        assert!(s.get("extra").is_none());
        assert_eq!(normalize_app_state(&json!({ "avatarUrl": "https://api.descall.com/a.png" }))["avatarUrl"], "https://api.descall.com/a.png");
        assert_eq!(normalize_app_state(&json!({ "avatarUrl": "http://x/a.png" }))["avatarUrl"], "");
        assert_eq!(normalize_app_state(&json!({ "avatarUrl": "data:image/png;base64,iVBOR=" }))["avatarUrl"], "data:image/png;base64,iVBOR=");
        assert_eq!(normalize_app_state(&json!({ "unreadMessages": 1e9 }))["unreadMessages"], 9999);
        assert_eq!(normalize_app_state(&json!({ "accent": "300,1,1" }))["accent"], "");
        assert_eq!(normalize_app_state(&Value::Null)["status"], "online");
    }

    #[test]
    fn only_allowed_actions() {
        let v = |a: &str, arg: Value| validate_action(a, &arg, &[]);
        for a in ["open", "settings", "autostart", "quit", "update", "close", "mute", "deafen", "clip", "openDms", "openRequests"] {
            assert!(v(a, Value::Null).is_some(), "{a}");
        }
        assert!(v("eval", Value::Null).is_none());
        assert!(v("__proto__", Value::Null).is_none());
        let s = v("status", json!("dnd")).unwrap();
        assert_eq!((s.action, s.kind, s.closes, s.arg_json()), ("status", Kind::App, true, json!("dnd")));
        assert!(v("status", json!("busy")).is_none());
        assert_eq!(v("snooze", json!(30)).unwrap().arg, Arg::Minutes(30));
        assert_eq!(v("snooze", json!(0)).unwrap().arg, Arg::Minutes(0));
        assert_eq!(v("snooze", json!("480")).unwrap().arg, Arg::Minutes(480));
        assert!(v("snooze", json!(45)).is_none());
        assert_eq!(v("ack", json!(7)).unwrap().arg, Arg::Seq(7));
        assert!(v("ack", json!(-1)).is_none());
        assert!(v("ack", json!(1.5)).is_none());
        let ids = vec!["premium|focus|30".to_string()];
        assert_eq!(validate_action("premium", &json!("premium|focus|30"), &ids).unwrap().arg, Arg::Id("premium|focus|30".into()));
        assert!(validate_action("premium", &json!("premium|account|x"), &ids).is_none());
        assert!(v("premium", json!("premium|focus|30")).is_none());
        assert_eq!(v("mute", Value::Null).unwrap().kind, Kind::App);
        assert!(!v("mute", Value::Null).unwrap().closes);
        assert!(!v("autostart", Value::Null).unwrap().closes);
        assert_eq!(v("quit", Value::Null).unwrap().kind, Kind::Shell);
    }

    #[test]
    fn snooze() {
        let now = 1_700_000_000_000u64;
        assert_eq!(snooze_until_for(30, now), now + 30 * 60_000);
        assert_eq!(snooze_until_for(480, now), now + 8 * 3_600_000);
        assert_eq!(snooze_until_for(0, now), 0);
        assert_eq!(snooze_until_for(5, now), 0);
        assert_eq!(active_snooze(now + 1000, now), now + 1000);
        assert_eq!(active_snooze(now - 1, now), 0);
        assert_eq!(active_snooze(now + 30 * 86_400_000, now), 0);
        assert!(suppress_notification(&json!({}), now + 1000, now));
        assert!(!suppress_notification(&json!({ "requireInteraction": true }), now + 1000, now), "calls still ring");
        assert!(!suppress_notification(&json!({ "data": { "type": "group-call" } }), now + 1000, now));
        assert!(!suppress_notification(&json!({}), 0, now));
        assert_eq!(parse_snooze_file(&snooze_file_json(now + 60_000), now), now + 60_000);
        assert_eq!(parse_snooze_file("not json", now), 0);
        assert_eq!(parse_snooze_file(&snooze_file_json(now - 5), now), 0);
    }

    fn win_w(g: &Geometry, s: f64) -> u32 {
        ((g.pad * 2.0 + g.card + g.gap + g.flyout) * s).round() as u32
    }

    #[test]
    fn placement_bottom_taskbar() {
        let g = PANEL;
        let work = Rect::new(0.0, 0.0, 1920.0, 1032.0);
        // Icon near the right end: card on the right edge, flyout to the left.
        let p = place_panel(Rect::new(1780.0, 1040.0, 24.0, 32.0), work, 1.0, &g);
        assert_eq!(p.edge, Edge::Bottom);
        assert_eq!(p.flyout, Side::Left);
        assert!(!p.top);
        assert_eq!(p.width, win_w(&g, 1.0));
        assert_eq!(p.x + p.width as i32, 1920);
        assert_eq!(p.y + p.height as i32, 1032);
        assert_eq!(p.height, g.max_height as u32);
        assert_eq!(p.card_left, (g.pad + g.flyout + g.gap) as i32);
        // Icon in the middle: centred card, flyout to the right.
        let p = place_panel(Rect::new(950.0, 1040.0, 20.0, 32.0), work, 1.0, &g);
        assert_eq!(p.flyout, Side::Right);
        assert_eq!(p.card_left, g.pad as i32);
        assert_eq!(p.x + p.card_left + (g.card / 2.0) as i32, 960);
        // Page fields.
        let j = p.page_json(&g);
        assert_eq!(j["vertical"], "bottom");
        assert_eq!(j["flyout"], "right");
        assert_eq!(j["card"], 290.0);
    }

    #[test]
    fn placement_other_edges() {
        let g = PANEL;
        let p = place_panel(Rect::new(1800.0, 0.0, 24.0, 40.0), Rect::new(0.0, 40.0, 1920.0, 1040.0), 1.0, &g);
        assert_eq!((p.edge, p.top, p.y), (Edge::Top, true, 40));
        let p = place_panel(Rect::new(8.0, 980.0, 32.0, 24.0), Rect::new(48.0, 0.0, 1872.0, 1080.0), 1.0, &g);
        assert_eq!((p.edge, p.flyout, p.x), (Edge::Left, Side::Right, 48));
        assert_eq!(p.y + p.height as i32 - g.pad as i32, 1004, "card bottom = icon bottom");
        let p = place_panel(Rect::new(1880.0, 10.0, 32.0, 24.0), Rect::new(0.0, 0.0, 1872.0, 1080.0), 1.0, &g);
        assert_eq!((p.edge, p.flyout, p.y), (Edge::Right, Side::Left, 0));
        assert_eq!(p.x + p.width as i32, 1872);
        assert_eq!(taskbar_edge(Rect::new(1700.0, 1050.0, 24.0, 24.0), Rect::new(0.0, 0.0, 1920.0, 1080.0)), Edge::Bottom, "auto-hide taskbar");
    }

    #[test]
    fn placement_multi_monitor_and_dpi() {
        let g = PANEL;
        // Second monitor left of the primary (negative x), 150 % scale, physical px.
        let p = place_panel(Rect::new(-300.0, 1580.0, 36.0, 48.0), Rect::new(-2880.0, 0.0, 2880.0, 1572.0), 1.5, &g);
        assert_eq!(p.edge, Edge::Bottom);
        assert!(p.x >= -2880 && p.x + p.width as i32 <= 0, "inside the second monitor");
        assert_eq!(p.width, win_w(&g, 1.5));
        assert_eq!(p.height, (g.max_height * 1.5).round() as u32);
        assert_eq!(p.y + p.height as i32, 1572);
        assert_eq!(p.card_left, (g.pad + g.flyout + g.gap) as i32, "card offset stays in logical px");
        // 4K at 200 %.
        let p = place_panel(Rect::new(3700.0, 2100.0, 48.0, 60.0), Rect::new(0.0, 0.0, 3840.0, 2088.0), 2.0, &g);
        assert_eq!(p.width, win_w(&g, 2.0));
        assert_eq!(p.x + p.width as i32, 3840);
        // Small work area: clamped, never larger than the screen.
        let p = place_panel(Rect::new(780.0, 600.0, 20.0, 30.0), Rect::new(0.0, 0.0, 800.0, 560.0), 1.0, &g);
        assert!(p.height <= 560 && p.x >= 0 && p.x + p.width as i32 <= 800);
    }

    #[test]
    fn same_answers_as_the_electron_model() {
        // Values computed by trayMenuModel.cjs placePanel for the same inputs.
        let g = PANEL;
        let p = place_panel(Rect::new(1780.0, 1040.0, 24.0, 32.0), Rect::new(0.0, 0.0, 1920.0, 1032.0), 1.0, &g);
        assert_eq!((p.x, p.y, p.width, p.height, p.card_left), (1364, 252, 556, 780, 252));
    }
}
