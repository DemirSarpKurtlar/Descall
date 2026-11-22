//! Global hotkey manager shared by the Descall+ hotkey features (port of
//! electron/premium/hotkeys.cjs) on tauri-plugin-global-shortcut. A feature switches an action
//! on with set_handler(action, fn); only those actions are registered, and only Descall's own
//! registrations are released. With every action off nothing is registered.
//! Custom bindings (features.custom_hotkeys.bindings) apply only while custom_hotkeys runs.
//! The compat features (command_center, workspace_profiles, instant_clip) register free-form
//! accelerators per owner with register_extra / unregister_owner.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use super::lock;
use super::logic::hotkey_logic::{find_conflicts, is_mouse_binding, normalize_accelerator, resolve_bindings, to_plugin_accel, Issue, ACTIONS, RESERVED};

pub type Handler = Arc<dyn Fn() + Send + Sync>;

#[derive(Default)]
struct State {
    handlers: HashMap<String, Handler>,
    /// plugin accelerator -> (action, Electron accelerator)
    owned: HashMap<String, (String, String)>,
    failures: Vec<Issue>,
    custom_allowed: bool,
    /// owner -> plugin accelerators
    extras: HashMap<String, Vec<String>>,
}

pub struct HotkeyManager {
    app: AppHandle,
    st: Mutex<State>,
}

impl HotkeyManager {
    pub fn new(app: AppHandle) -> Self {
        Self { app, st: Mutex::new(State::default()) }
    }

    fn gs(&self) -> &tauri_plugin_global_shortcut::GlobalShortcut<Wry> {
        self.app.global_shortcut()
    }

    /// Register `accel` (plugin syntax) so `f` runs on key-down, off the UI thread.
    fn register(&self, accel: &str, f: Handler) -> bool {
        self.gs()
            .on_shortcut(accel, move |_app, _sc, ev| {
                if ev.state == ShortcutState::Pressed {
                    let f = f.clone();
                    std::thread::spawn(move || f());
                }
            })
            .is_ok()
    }

    fn bindings_with(&self, custom: &Map<String, Value>, allow: bool) -> BTreeMap<String, String> {
        resolve_bindings(custom, allow)
    }

    pub fn bindings(&self, custom: &Map<String, Value>) -> BTreeMap<String, String> {
        let allow = lock(&self.st).custom_allowed;
        self.bindings_with(custom, allow)
    }

    pub fn status(&self, custom: &Map<String, Value>) -> Value {
        let st = lock(&self.st);
        let b = self.bindings_with(custom, st.custom_allowed);
        json!({
            "bindings": b,
            "customAllowed": st.custom_allowed,
            "active": st.handlers.keys().collect::<Vec<_>>(),
            "registered": st.owned.values().map(|(action, accel)| json!({ "action": action, "accel": accel })).collect::<Vec<_>>(),
            "failures": st.failures.iter().map(Issue::to_json).collect::<Vec<_>>(),
        })
    }

    /// Re-register every action that has a handler. Returns the status.
    pub fn apply(&self, custom: &Map<String, Value>) -> Value {
        {
            let mut st = lock(&self.st);
            for accel in st.owned.keys() {
                let _ = self.gs().unregister(accel.as_str());
            }
            st.owned.clear();
            st.failures.clear();
            let map = self.bindings_with(custom, st.custom_allowed);
            let active: Vec<(String, String)> = ACTIONS
                .iter()
                .filter_map(|a| {
                    let accel = map.get(a.id).cloned().unwrap_or_default();
                    (st.handlers.contains_key(a.id) && !accel.is_empty()).then(|| (a.id.to_string(), accel))
                })
                .collect();
            let issues = find_conflicts(&active, None, "win32");
            let blocked: Vec<String> = issues.iter().map(|i| i.action.clone()).collect();
            st.failures = issues;
            for (action, accel) in active {
                if blocked.contains(&action) || is_mouse_binding(&accel) {
                    continue;
                }
                let Some(plugin) = to_plugin_accel(&accel) else {
                    st.failures.push(Issue { action, accel, reason: "taken", other: None });
                    continue;
                };
                let handler = st.handlers.get(&action).cloned();
                let ok = handler.is_some_and(|h| self.register(&plugin, h));
                if ok {
                    st.owned.insert(plugin, (action, accel));
                } else {
                    // Held by another Descall feature (the command center's default Ctrl+Shift+K
                    // is also the quick launcher's): say which, not "another app".
                    // (Only owners the settings page has a label for: premiumAudio.hotkeys.actions.)
                    let holder = extra_holder(&st.extras, &plugin).filter(|o| o == "command_center");
                    let reason = if holder.is_some() { "duplicate" } else { "taken" };
                    st.failures.push(Issue { action, accel, reason, other: holder });
                }
            }
            if !st.failures.is_empty() {
                log::info!("[premium:hotkeys] not registered: {}", st.failures.iter().map(|f| format!("{}={} ({})", f.action, f.accel, f.reason)).collect::<Vec<_>>().join(", "));
            }
        }
        self.status(custom)
    }

    pub fn set_handler(&self, custom: &Map<String, Value>, action: &str, f: Option<Handler>) {
        if !ACTIONS.iter().any(|a| a.id == action) {
            return;
        }
        let changed = {
            let mut st = lock(&self.st);
            let had = st.handlers.contains_key(action);
            match f {
                Some(f) => {
                    st.handlers.insert(action.to_string(), f);
                }
                None => {
                    st.handlers.remove(action);
                }
            }
            had || st.handlers.contains_key(action)
        };
        if changed {
            self.apply(custom);
        }
    }

    pub fn set_custom_allowed(&self, custom: &Map<String, Value>, on: bool) {
        let changed = {
            let mut st = lock(&self.st);
            let c = st.custom_allowed != on;
            st.custom_allowed = on;
            c
        };
        if changed {
            self.apply(custom);
        }
    }

    /// Validate a proposed map (settings UI). Descall's own registrations are not "taken".
    pub fn check(&self, custom: &Map<String, Value>, proposed: &BTreeMap<String, String>) -> Vec<Issue> {
        let mut merged = self.bindings(custom);
        for (k, v) in proposed {
            merged.insert(k.clone(), v.clone());
        }
        let ordered: Vec<(String, String)> = merged.into_iter().collect();
        let owned: Vec<String> = lock(&self.st).owned.keys().cloned().collect();
        let gs = self.gs();
        let is_reg = |accel: &str| to_plugin_accel(accel).is_some_and(|p| !owned.contains(&p) && gs.is_registered(p.as_str()));
        find_conflicts(&ordered, Some(&is_reg), "win32")
    }

    /// Does another app hold this accelerator? Register and release it at once.
    pub fn probe(&self, accel: &str) -> Value {
        let a = normalize_accelerator(accel);
        if a.is_empty() {
            return json!({ "accel": "", "free": false, "invalid": true });
        }
        if is_mouse_binding(&a) {
            return json!({ "accel": a, "free": true, "mouse": true });
        }
        let Some(p) = to_plugin_accel(&a) else { return json!({ "accel": a, "free": false }) };
        if lock(&self.st).owned.contains_key(&p) {
            return json!({ "accel": a, "free": true, "ours": true });
        }
        if self.gs().is_registered(p.as_str()) {
            return json!({ "accel": a, "free": false });
        }
        let free = self.gs().register(p.as_str()).is_ok();
        if free {
            let _ = self.gs().unregister(p.as_str());
        }
        json!({ "accel": a, "free": free })
    }

    /// compat registerHotkey: free-form accelerator for one owner feature. Like Electron's
    /// compat.cjs it only replaces this owner's own registration: an accelerator another
    /// feature holds (the command center's default Ctrl+Shift+K is also the quick launcher's)
    /// is refused, never taken away from it.
    pub fn register_extra(&self, owner: &str, accel: &str, f: Handler) -> bool {
        let Some(p) = to_plugin_accel(accel) else { return false };
        let mine = lock(&self.st).extras.get(owner).is_some_and(|l| l.contains(&p));
        if mine {
            let _ = self.gs().unregister(p.as_str());
            if let Some(l) = lock(&self.st).extras.get_mut(owner) {
                l.retain(|x| x != &p);
            }
        } else if self.gs().is_registered(p.as_str()) {
            return false;
        }
        let ok = self.register(&p, f);
        if ok {
            lock(&self.st).extras.entry(owner.to_string()).or_default().push(p);
        }
        ok
    }

    /// Which Descall hotkey holds `accel` (Electron accelerator): an action of this manager
    /// ("quick_launcher" ...) or a register_extra owner ("command_center" ...).
    pub fn holder_of(&self, accel: &str) -> Option<String> {
        let p = to_plugin_accel(accel)?;
        let st = lock(&self.st);
        st.owned.get(&p).map(|(action, _)| action.clone()).or_else(|| extra_holder(&st.extras, &p))
    }

    pub fn unregister_owner(&self, owner: &str) {
        let list = lock(&self.st).extras.remove(owner).unwrap_or_default();
        for p in list {
            let _ = self.gs().unregister(p.as_str());
        }
    }

    pub fn reserved() -> Value {
        json!(RESERVED)
    }
}

/// The register_extra owner that holds plugin accelerator `p`, if any.
fn extra_holder(extras: &HashMap<String, Vec<String>>, p: &str) -> Option<String> {
    let mut owners: Vec<&String> = extras.iter().filter(|(_, l)| l.iter().any(|x| x == p)).map(|(o, _)| o).collect();
    owners.sort();
    owners.first().map(|o| o.to_string())
}

#[cfg(test)]
mod tests {
    use super::extra_holder;
    use std::collections::HashMap;

    #[test]
    fn extra_holder_names_the_owner() {
        let mut extras: HashMap<String, Vec<String>> = HashMap::new();
        assert_eq!(extra_holder(&extras, "control+shift+KeyK"), None);
        extras.insert("command_center".into(), vec!["control+shift+KeyK".into()]);
        extras.insert("instant_clip".into(), vec!["control+shift+F9".into()]);
        assert_eq!(extra_holder(&extras, "control+shift+KeyK").as_deref(), Some("command_center"));
        assert_eq!(extra_holder(&extras, "control+shift+F9").as_deref(), Some("instant_clip"));
        assert_eq!(extra_holder(&extras, "control+alt+KeyM"), None);
    }
}
