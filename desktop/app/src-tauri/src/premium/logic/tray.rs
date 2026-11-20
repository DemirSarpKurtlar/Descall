//! Tray entries the Descall+ features add to the shell's tray menu, as plain data (the shell
//! turns them into tauri::menu items, see premium/tray.rs). Menu ids start with "premium|"
//! and carry the action, so a click needs no closure.

use serde_json::Value;

use super::i18n::et;
use super::rules::{minutes_left, WorkspaceProfile};

#[derive(Clone, Debug, PartialEq)]
pub enum TrayItem {
    Item { id: String, label: String, enabled: bool },
    Radio { id: String, label: String, checked: bool },
    Submenu { label: String, items: Vec<TrayItem> },
    Separator,
}

fn item(id: &str, label: String) -> TrayItem {
    TrayItem::Item { id: format!("premium|{id}"), label, enabled: true }
}

fn radio(id: &str, label: String, checked: bool) -> TrayItem {
    TrayItem::Radio { id: format!("premium|{id}"), label, checked }
}

/// focus_mode: start 30 / 60 / 120 min, end.
pub fn focus(locale: &str, until: u64, now: u64) -> Vec<TrayItem> {
    let left = minutes_left(until, now);
    let label = if left > 0 { et(locale, "tray.focusOn", &[("minutes", &left.to_string())]) } else { et(locale, "tray.focus", &[]) };
    vec![TrayItem::Submenu {
        label,
        items: vec![
            item("focus|30", et(locale, "tray.focus30", &[])),
            item("focus|60", et(locale, "tray.focus60", &[])),
            item("focus|120", et(locale, "tray.focus120", &[])),
            TrayItem::Separator,
            TrayItem::Item { id: "premium|focus|0".into(), label: et(locale, "tray.focusOff", &[]), enabled: left > 0 },
        ],
    }]
}

pub const STATUSES: &[&str] = &["online", "idle", "dnd", "invisible"];

/// tray_controls_plus: call controls while in a call, then the status submenu.
pub fn call_controls(locale: &str, call: &Value, status: &str) -> Vec<TrayItem> {
    let mut out = Vec::new();
    let flag = |k: &str| call.get(k).and_then(Value::as_bool).unwrap_or(false);
    if flag("active") {
        let title = call.get("title").and_then(Value::as_str).unwrap_or("");
        out.push(TrayItem::Item { id: "premium|noop".into(), label: et(locale, "tray.inCall", &[("title", title)]), enabled: false });
        out.push(item("action|mute", et(locale, if flag("muted") { "tray.unmute" } else { "tray.mute" }, &[])));
        out.push(item("action|deafen", et(locale, if flag("deafened") { "tray.undeafen" } else { "tray.deafen" }, &[])));
        out.push(item("action|leave", et(locale, "tray.hangup", &[])));
        out.push(TrayItem::Separator);
    }
    let status = if STATUSES.contains(&status) { status } else { "online" };
    out.push(TrayItem::Submenu {
        label: et(locale, "tray.status", &[]),
        items: STATUSES.iter().map(|s| radio(&format!("status|{s}"), et(locale, &format!("tray.{s}"), &[]), *s == status)).collect(),
    });
    out
}

/// audio_device_profiles: switch profile.
pub fn audio_profiles(locale: &str, profiles: &[(String, String)], active: Option<&str>) -> Vec<TrayItem> {
    if profiles.is_empty() {
        return Vec::new();
    }
    vec![TrayItem::Submenu {
        label: et(locale, "tray.audioProfile", &[]),
        items: profiles.iter().map(|(id, name)| radio(&format!("audio|{id}"), name.clone(), Some(id.as_str()) == active)).collect(),
    }]
}

/// workspace_profiles: a radio list under the renderer's own title.
pub fn workspace(title: &str, profiles: &[WorkspaceProfile]) -> Vec<TrayItem> {
    if title.is_empty() || profiles.is_empty() {
        return Vec::new();
    }
    vec![TrayItem::Submenu {
        label: title.to_string(),
        items: profiles.iter().map(|p| radio(&format!("workspace|{}", p.id), if p.label.is_empty() { p.id.clone() } else { p.label.clone() }, p.active)).collect(),
    }]
}

/// multi_account: main account, extra accounts, "add" while under the cap.
pub fn accounts(menu: &str, main: &str, add: &str, unnamed: &str, list: &[(String, String)], max: usize) -> Vec<TrayItem> {
    if menu.is_empty() {
        return Vec::new();
    }
    let mut items = vec![item("account|main", if main.is_empty() { "Descall".into() } else { main.into() })];
    for (id, label) in list {
        let l = if !label.is_empty() { label.clone() } else if !unnamed.is_empty() { unnamed.into() } else { id.clone() };
        items.push(item(&format!("account|{id}"), l));
    }
    if list.len() < max && !add.is_empty() {
        items.push(TrayItem::Separator);
        items.push(item("account|add", add.into()));
    }
    vec![TrayItem::Submenu { label: menu.into(), items }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn menus() {
        let f = focus("en", 0, 0);
        let TrayItem::Submenu { label, items } = &f[0] else { panic!() };
        assert_eq!(label, "Focus mode");
        assert!(matches!(&items[4], TrayItem::Item { enabled: false, .. }), "nothing to end");
        let f = focus("en", 30 * 60_000, 0);
        assert!(matches!(&f[0], TrayItem::Submenu { label, .. } if label == "Focus mode: 30 min left"));

        let idle = call_controls("en", &json!({"active": false}), "dnd");
        assert_eq!(idle.len(), 1);
        let TrayItem::Submenu { items, .. } = &idle[0] else { panic!() };
        assert!(items.iter().any(|i| matches!(i, TrayItem::Radio { id, checked: true, .. } if id == "premium|status|dnd")));
        let live = call_controls("en", &json!({"active": true, "muted": true, "title": "Ada"}), "bogus");
        assert!(matches!(&live[1], TrayItem::Item { label, .. } if label == "Unmute"));
        assert_eq!(live.len(), 6);

        assert!(audio_profiles("en", &[], None).is_empty());
        let a = audio_profiles("en", &[("p1".into(), "Headset".into())], Some("p1"));
        assert!(matches!(&a[0], TrayItem::Submenu { items, .. } if matches!(&items[0], TrayItem::Radio { checked: true, .. })));
        assert!(workspace("", &[]).is_empty());
        let acc = accounts("Accounts", "", "Add", "", &[("abc".into(), String::new())], 3);
        let TrayItem::Submenu { items, .. } = &acc[0] else { panic!() };
        assert_eq!(items.len(), 4);
        assert!(accounts("", "", "", "", &[], 3).is_empty());
    }
}
