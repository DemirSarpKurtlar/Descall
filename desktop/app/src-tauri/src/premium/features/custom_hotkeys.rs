//! custom_hotkeys (Plus): remap the Descall+ global hotkeys (features.custom_hotkeys.bindings,
//! "" switches an action off). Saving validates first: invalid, duplicate, reserved, bare keys
//! that would swallow typing, and accelerators already held by Descall or another app come
//! back as issues.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use super::global_mute::custom;
use crate::premium::hotkeys::HotkeyManager;
use crate::premium::logic::hotkey_logic::{actions_json, find_conflicts, normalize_accelerator, ACTIONS};
use crate::premium::{arg, ok, Caller, Feature, From, Host};

pub struct F;

/// Only known actions; "" / null switch off; invalid values are dropped.
fn clean(map: &Value) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Some(m) = map.as_object() else { return out };
    for (action, raw) in m {
        if !ACTIONS.iter().any(|a| a.id == action) {
            continue;
        }
        match raw {
            Value::Null => {
                out.insert(action.clone(), String::new());
            }
            Value::String(s) if s.is_empty() => {
                out.insert(action.clone(), String::new());
            }
            other => {
                let a = normalize_accelerator(other.as_str().map(str::to_string).unwrap_or_else(|| other.to_string()).as_str());
                if !a.is_empty() {
                    out.insert(action.clone(), a);
                }
            }
        }
    }
    out
}

fn changed(h: &Host) -> Value {
    let status = h.hotkeys.apply(&custom(h));
    h.send("premium:hotkeys-changed", status.clone());
    // Features whose handlers depend on the bindings re-sync (Electron 'settings' listeners).
    h.bus(crate::premium::Bus::Settings("custom_hotkeys".into()));
    status
}

fn save(h: &Host, proposed: BTreeMap<String, String>, force: bool) -> Value {
    let mut merged = h.hotkeys.bindings(&custom(h));
    for (k, v) in &proposed {
        merged.insert(k.clone(), v.clone());
    }
    let hard = find_conflicts(&merged.into_iter().collect::<Vec<_>>(), None, "win32");
    if !hard.is_empty() && !force {
        return json!({ "ok": false, "issues": hard.iter().map(|i| i.to_json()).collect::<Vec<_>>() });
    }
    let mut next: Map<String, Value> = custom(h);
    for (k, v) in proposed {
        next.insert(k, json!(v));
    }
    h.patch_feature("custom_hotkeys", &json!({ "bindings": next }));
    let status = changed(h);
    let issues = status["failures"].clone();
    ok(json!({ "status": status, "issues": issues }))
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "custom_hotkeys"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[
            ("premium:hotkeys:status", From::Main),
            ("premium:hotkeys:check", From::Main),
            ("premium:hotkeys:probe", From::Main),
            ("premium:hotkeys:save", From::Main),
            ("premium:hotkeys:reset", From::Main),
        ]
    }
    fn start(&self, h: &Host) {
        h.hotkeys.set_custom_allowed(&custom(h), true);
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.set_custom_allowed(&custom(h), false); // back to the defaults
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let a0 = arg(args, 0);
        Ok(match ch {
            "premium:hotkeys:status" => {
                let mut s = h.hotkeys.status(&custom(h));
                s["actions"] = actions_json();
                s["reserved"] = HotkeyManager::reserved();
                ok(s)
            }
            "premium:hotkeys:check" => ok(json!({ "issues": h.hotkeys.check(&custom(h), &clean(&a0)).iter().map(|i| i.to_json()).collect::<Vec<_>>() })),
            "premium:hotkeys:probe" => ok(h.hotkeys.probe(a0.as_str().unwrap_or(""))),
            "premium:hotkeys:save" => save(h, clean(&a0), crate::premium::logic::rules::truthy(arg(args, 1).get("force"))),
            _ => {
                h.patch_feature("custom_hotkeys", &json!({ "bindings": {} }));
                ok(json!({ "status": changed(h) }))
            }
        })
    }
}
