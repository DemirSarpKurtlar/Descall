//! global_mute (Plus): global hotkeys toggle mute and deafen from any app. Off by default (a
//! global hotkey takes the key away from other apps). Settings: { enabled, deafen }.
//! Renderer: premium:hotkey { action: 'toggle_mute' | 'toggle_deafen', source: 'hotkey' }.

use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::premium::{host, ok, Bus, Caller, Feature, From, Host};

pub struct F;

/// features.custom_hotkeys.bindings (the hotkey manager applies it only while allowed).
pub(crate) fn custom(h: &Host) -> Map<String, Value> {
    h.feature_settings("custom_hotkeys").get("bindings").and_then(Value::as_object).cloned().unwrap_or_default()
}

pub(crate) fn fire(action: &'static str) -> Arc<dyn Fn() + Send + Sync> {
    Arc::new(move || {
        if let Some(h) = host() {
            h.send("premium:hotkey", json!({ "action": action, "source": "hotkey" }));
        }
    })
}

fn sync(h: &Host) {
    let c = custom(h);
    let deafen = h.feature_settings("global_mute").get("deafen") != Some(&Value::Bool(false));
    h.hotkeys.set_handler(&c, "toggle_mute", Some(fire("toggle_mute")));
    h.hotkeys.set_handler(&c, "toggle_deafen", deafen.then(|| fire("toggle_deafen")));
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "global_mute"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:global_mute:status", From::Main)]
    }
    fn start(&self, h: &Host) {
        sync(h);
    }
    fn stop(&self, h: &Host) {
        let c = custom(h);
        h.hotkeys.set_handler(&c, "toggle_mute", None);
        h.hotkeys.set_handler(&c, "toggle_deafen", None);
    }
    fn call(&self, h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(ok(json!({ "hotkeys": h.hotkeys.status(&custom(h)) })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        if matches!(ev, Bus::Settings(k) if k == "global_mute") {
            sync(h);
        }
    }
}
