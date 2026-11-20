//! Pure hotkey logic for the Descall+ global hotkeys (port of electron/premium/hotkeyLogic.cjs).
//! Accelerators keep Electron's syntax ("CommandOrControl+Alt+M") so saved settings and the
//! settings UI stay the same; [`to_plugin_accel`] converts one for tauri-plugin-global-shortcut.
//! Mouse buttons ("Mouse4", "Mouse5") are only valid for hold-to-talk (Raw Input, not a hotkey).

use std::collections::{BTreeMap, HashMap};

use serde_json::{json, Value};

pub const MODIFIER_ORDER: &[&str] = &["CommandOrControl", "Control", "Command", "Alt", "AltGr", "Shift", "Super"];

fn modifier_alias(s: &str) -> Option<&'static str> {
    Some(match s {
        "cmdorctrl" | "commandorcontrol" | "mod" => "CommandOrControl",
        "ctrl" | "control" => "Control",
        "cmd" | "command" => "Command",
        "alt" | "option" => "Alt",
        "altgr" => "AltGr",
        "shift" => "Shift",
        "super" | "meta" | "win" => "Super",
        _ => return None,
    })
}

pub const NAMED_KEYS: &[&str] = &[
    "Space", "Tab", "Backspace", "Delete", "Insert", "Return", "Enter", "Up", "Down", "Left", "Right",
    "Home", "End", "PageUp", "PageDown", "Escape", "Esc", "Plus", "CapsLock", "NumLock", "ScrollLock",
    "PrintScreen", "VolumeUp", "VolumeDown", "VolumeMute", "MediaNextTrack", "MediaPreviousTrack",
    "MediaStop", "MediaPlayPause", "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight",
    "Semicolon", "Quote", "Comma", "Period", "Slash", "Backslash",
    "num0", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9",
    "numdec", "numadd", "numsub", "nummult", "numdiv",
];
const MEDIA_KEYS: &[&str] = &["MediaNextTrack", "MediaPreviousTrack", "MediaStop", "MediaPlayPause", "VolumeUp", "VolumeDown", "VolumeMute"];
const MOUSE_KEYS: &[&str] = &["Mouse3", "Mouse4", "Mouse5"];

/// Shortcuts Descall already registers itself.
pub const RESERVED: &[&str] = &["F12", "CommandOrControl+Shift+I", "F11"];

pub struct ActionSpec {
    pub id: &'static str,
    pub feature: &'static str,
    pub default: &'static str,
    pub hold: bool,
}

/// Action ids, the feature that owns each, and the default binding.
pub const ACTIONS: &[ActionSpec] = &[
    ActionSpec { id: "toggle_mute", feature: "global_mute", default: "CommandOrControl+Alt+M", hold: false },
    ActionSpec { id: "toggle_deafen", feature: "global_mute", default: "CommandOrControl+Alt+D", hold: false },
    ActionSpec { id: "push_to_talk", feature: "global_ptt", default: "Mouse4", hold: true },
    ActionSpec { id: "quick_launcher", feature: "quick_launcher", default: "CommandOrControl+Shift+K", hold: false },
    ActionSpec { id: "volume_up", feature: "per_user_volume_hotkeys", default: "CommandOrControl+Alt+Up", hold: false },
    ActionSpec { id: "volume_down", feature: "per_user_volume_hotkeys", default: "CommandOrControl+Alt+Down", hold: false },
];

pub fn action(id: &str) -> Option<&'static ActionSpec> {
    ACTIONS.iter().find(|a| a.id == id)
}

/// The ACTIONS table as the renderer saw it from Electron ({ id: { feature, default, hold? } }).
pub fn actions_json() -> Value {
    let mut m = serde_json::Map::new();
    for a in ACTIONS {
        let mut o = json!({ "feature": a.feature, "default": a.default });
        if a.hold {
            o["hold"] = json!(true);
        }
        m.insert(a.id.into(), o);
    }
    Value::Object(m)
}

fn normalize_key(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    let lower = s.to_lowercase();
    if lower.len() == 6 && lower.starts_with("mouse") && matches!(&lower[5..], "3" | "4" | "5") {
        return format!("Mouse{}", &lower[5..]);
    }
    if let Some(n) = lower.strip_prefix('f') {
        if let Ok(v) = n.parse::<u8>() {
            if (1..=24).contains(&v) && !n.starts_with('0') {
                return lower.to_uppercase();
            }
        }
    }
    if lower.len() == 1 && lower.chars().all(|c| c.is_ascii_alphanumeric()) {
        return lower.to_uppercase();
    }
    if let Some(k) = NAMED_KEYS.iter().find(|k| k.to_lowercase() == lower) {
        return (*k).to_string();
    }
    if s.chars().count() == 1 && "`-=[];',./\\".contains(s) {
        return s.to_string();
    }
    String::new()
}

/// Canonical form ("ctrl+shift+m" -> "Control+Shift+M"), or "" when invalid.
pub fn normalize_accelerator(input: &str) -> String {
    let parts: Vec<&str> = input.split('+').map(str::trim).filter(|p| !p.is_empty()).collect();
    if parts.is_empty() || parts.len() > 5 {
        return String::new();
    }
    let mut mods: Vec<&'static str> = Vec::new();
    let mut key = String::new();
    for part in parts {
        if let Some(m) = modifier_alias(&part.to_lowercase()) {
            if !mods.contains(&m) {
                mods.push(m);
            }
            continue;
        }
        if !key.is_empty() {
            return String::new();
        }
        key = normalize_key(part);
        if key.is_empty() {
            return String::new();
        }
    }
    if key.is_empty() || (is_mouse_binding(&key) && !mods.is_empty()) {
        return String::new();
    }
    let mut out: Vec<String> = MODIFIER_ORDER.iter().filter(|m| mods.contains(m)).map(|m| m.to_string()).collect();
    out.push(key);
    out.join("+")
}

/// Same, for a JSON value (non-strings are invalid, as in Electron).
pub fn normalize_value(v: &Value) -> String {
    v.as_str().map(normalize_accelerator).unwrap_or_default()
}

pub fn is_mouse_binding(accel: &str) -> bool {
    MOUSE_KEYS.contains(&accel)
}

pub fn is_media_key(accel: &str) -> bool {
    MEDIA_KEYS.contains(&accel)
}

/// A bare letter / digit / typing key without a modifier would swallow typing in other apps.
pub fn needs_modifier(accel: &str) -> bool {
    if accel.is_empty() || is_mouse_binding(accel) || is_media_key(accel) || accel.contains('+') {
        return false;
    }
    (accel.len() == 1 && accel.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()))
        || ["Space", "Tab", "Backspace", "Return", "Enter", "Escape", "Esc"].contains(&accel)
}

/// CommandOrControl is Control on Windows / Linux, Command on macOS.
pub fn comparable(accel: &str, platform: &str) -> String {
    if platform == "darwin" {
        accel.replacen("CommandOrControl", "Command", 1)
    } else {
        accel.replacen("CommandOrControl", "Control", 1)
    }
}

/// Bindings in effect: defaults, overridden by the user's map when custom hotkeys are allowed.
/// A user value of "" (or null) disables that action.
pub fn resolve_bindings(custom: &serde_json::Map<String, Value>, allow_custom: bool) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for a in ACTIONS {
        let mut accel = a.default.to_string();
        if allow_custom {
            if let Some(raw) = custom.get(a.id) {
                accel = match raw {
                    Value::Null => String::new(),
                    Value::String(s) if s.is_empty() => String::new(),
                    Value::String(s) => Some(normalize_accelerator(s)).filter(|n| !n.is_empty()).unwrap_or_else(|| a.default.to_string()),
                    other => Some(normalize_accelerator(&other.to_string())).filter(|n| !n.is_empty()).unwrap_or_else(|| a.default.to_string()),
                };
            }
        }
        out.insert(a.id.to_string(), accel);
    }
    out
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Issue {
    pub action: String,
    pub accel: String,
    pub reason: &'static str,
    pub other: Option<String>,
}

impl Issue {
    pub fn to_json(&self) -> Value {
        let mut v = json!({ "action": self.action, "accel": self.accel, "reason": self.reason });
        if let Some(o) = &self.other {
            v["other"] = json!(o);
        }
        v
    }
}

/// Problems with a binding map (in insertion order). Reasons: invalid | duplicate | reserved |
/// needs_modifier | mouse_not_allowed | registered.
pub fn find_conflicts(bindings: &[(String, String)], is_registered: Option<&dyn Fn(&str) -> bool>, platform: &str) -> Vec<Issue> {
    let mut issues = Vec::new();
    let mut seen: HashMap<String, String> = HashMap::new();
    let reserved: Vec<String> = RESERVED.iter().map(|r| comparable(&normalize_accelerator(r), platform)).collect();
    for (act, raw) in bindings {
        if raw.is_empty() {
            continue;
        }
        let accel = normalize_accelerator(raw);
        let issue = |accel: &str, reason| Issue { action: act.clone(), accel: accel.to_string(), reason, other: None };
        if accel.is_empty() {
            issues.push(issue(raw, "invalid"));
            continue;
        }
        let hold = action(act).map(|a| a.hold).unwrap_or(false);
        if is_mouse_binding(&accel) && !hold {
            issues.push(issue(&accel, "mouse_not_allowed"));
            continue;
        }
        if needs_modifier(&accel) && !hold {
            issues.push(issue(&accel, "needs_modifier"));
            continue;
        }
        let key = comparable(&accel, platform);
        if let Some(other) = seen.get(&key) {
            issues.push(Issue { other: Some(other.clone()), ..issue(&accel, "duplicate") });
            continue;
        }
        seen.insert(key.clone(), act.clone());
        if reserved.contains(&key) {
            issues.push(issue(&accel, "reserved"));
            continue;
        }
        if let Some(f) = is_registered {
            if !is_mouse_binding(&accel) && f(&accel) {
                issues.push(issue(&accel, "registered"));
            }
        }
    }
    issues
}

/// Electron accelerator -> the string tauri-plugin-global-shortcut parses on Windows, or None
/// (mouse buttons, unknown keys). "CommandOrControl" means Control off macOS.
pub fn to_plugin_accel(accel: &str) -> Option<String> {
    let a = normalize_accelerator(accel);
    if a.is_empty() || is_mouse_binding(&a) {
        return None;
    }
    let mut out: Vec<String> = Vec::new();
    let parts: Vec<&str> = a.split('+').collect();
    let (key, mods) = parts.split_last()?;
    for m in mods {
        let mapped: &[&str] = match *m {
            "CommandOrControl" | "Control" => &["Control"],
            "Command" | "Super" => &["Super"],
            "Alt" => &["Alt"],
            "AltGr" => &["Control", "Alt"],
            "Shift" => &["Shift"],
            _ => return None,
        };
        for x in mapped {
            if !out.iter().any(|o| o == x) {
                out.push(x.to_string());
            }
        }
    }
    let k = match *key {
        "Return" => "Enter".to_string(),
        "Esc" => "Escape".to_string(),
        "Plus" => "Equal".to_string(),
        "MediaNextTrack" => "MediaTrackNext".to_string(),
        "MediaPreviousTrack" => "MediaTrackPrevious".to_string(),
        "numdec" => "NumpadDecimal".to_string(),
        "numadd" => "NumpadAdd".to_string(),
        "numsub" => "NumpadSubtract".to_string(),
        "nummult" => "NumpadMultiply".to_string(),
        "numdiv" => "NumpadDivide".to_string(),
        k if k.starts_with("num") && k.len() == 4 => format!("Numpad{}", &k[3..]),
        k => k.to_string(),
    };
    out.push(k);
    Some(out.join("+"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
    }

    #[test]
    fn normalisation() {
        assert_eq!(normalize_accelerator("ctrl+shift+m"), "Control+Shift+M");
        assert_eq!(normalize_accelerator("Shift+CmdOrCtrl+m"), "CommandOrControl+Shift+M");
        assert_eq!(normalize_accelerator("alt+alt+f5"), "Alt+F5");
        assert_eq!(normalize_accelerator("mouse4"), "Mouse4");
        assert_eq!(normalize_accelerator("Ctrl+Mouse4"), "", "mouse buttons take no modifiers");
        assert_eq!(normalize_accelerator("Ctrl+A+B"), "", "one key only");
        assert_eq!(normalize_accelerator("Ctrl+Shift"), "", "a key is required");
        assert_eq!(normalize_accelerator("Ctrl+Nope"), "");
        assert_eq!(normalize_accelerator("mediaplaypause"), "MediaPlayPause");
        assert_eq!(normalize_value(&json!(42)), "");
        assert_eq!(normalize_accelerator("f24"), "F24");
        assert_eq!(normalize_accelerator("f25"), "");
    }

    #[test]
    fn bindings() {
        let custom = json!({ "toggle_mute": "Alt+F1" });
        let d = resolve_bindings(custom.as_object().unwrap(), false);
        assert_eq!(d["toggle_mute"], "CommandOrControl+Alt+M");
        let custom = json!({ "toggle_mute": "alt+f1", "quick_launcher": "", "toggle_deafen": "garbage+++" });
        let c = resolve_bindings(custom.as_object().unwrap(), true);
        assert_eq!(c["toggle_mute"], "Alt+F1");
        assert_eq!(c["quick_launcher"], "");
        assert_eq!(c["toggle_deafen"], "CommandOrControl+Alt+D", "invalid custom value falls back to the default");
    }

    #[test]
    fn conflicts() {
        let issues = find_conflicts(
            &pairs(&[("toggle_mute", "Ctrl+Alt+M"), ("toggle_deafen", "Control+Alt+M"), ("quick_launcher", "F12"), ("volume_up", "A"), ("volume_down", "Mouse4"), ("push_to_talk", "Mouse4")]),
            None,
            "win32",
        );
        let by = |a: &str| issues.iter().find(|i| i.action == a).map(|i| i.reason);
        assert_eq!(by("toggle_deafen"), Some("duplicate"));
        assert_eq!(issues.iter().find(|i| i.action == "toggle_deafen").unwrap().other.as_deref(), Some("toggle_mute"));
        assert_eq!(by("quick_launcher"), Some("reserved"));
        assert_eq!(by("volume_up"), Some("needs_modifier"));
        assert_eq!(by("volume_down"), Some("mouse_not_allowed"));
        assert_eq!(by("push_to_talk"), None, "mouse is fine for hold-to-talk");
        let two = pairs(&[("toggle_mute", "CommandOrControl+M"), ("toggle_deafen", "Control+M")]);
        assert_eq!(find_conflicts(&two, None, "win32")[0].reason, "duplicate");
        assert!(find_conflicts(&two, None, "darwin").is_empty());
        let reg = |a: &str| a == "Control+Alt+K";
        let taken = find_conflicts(&pairs(&[("toggle_mute", "Ctrl+Alt+K")]), Some(&reg), "win32");
        assert_eq!(taken.iter().map(|i| i.reason).collect::<Vec<_>>(), vec!["registered"]);
        assert_eq!(find_conflicts(&pairs(&[("toggle_mute", "nonsense+")]), None, "win32")[0].reason, "invalid");
    }

    #[test]
    fn plugin_accelerators() {
        assert_eq!(to_plugin_accel("CommandOrControl+Alt+M").as_deref(), Some("Control+Alt+M"));
        assert_eq!(to_plugin_accel("CommandOrControl+Shift+F9").as_deref(), Some("Control+Shift+F9"));
        assert_eq!(to_plugin_accel("MediaPlayPause").as_deref(), Some("MediaPlayPause"));
        assert_eq!(to_plugin_accel("MediaPreviousTrack").as_deref(), Some("MediaTrackPrevious"));
        assert_eq!(to_plugin_accel("Control+num5").as_deref(), Some("Control+Numpad5"));
        assert_eq!(to_plugin_accel("Super+Return").as_deref(), Some("Super+Enter"));
        assert_eq!(to_plugin_accel("Mouse4"), None);
        assert_eq!(to_plugin_accel("bogus"), None);
    }
}
