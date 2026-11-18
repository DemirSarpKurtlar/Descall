//! per_user_volume_hotkeys (Ultra): global hotkeys raise / lower the playback volume of the
//! pinned participant. The renderer owns volumes and the pin; the shell only forwards the key
//! press, and only while a call is live. Settings: { enabled, step } (percent, 5..50).

use std::sync::Arc;

use serde_json::{json, Value};

use super::global_mute::custom;
use super::CallEdge;
use crate::premium::logic::rules::num;
use crate::premium::{host, ok, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    edge: CallEdge,
}

fn step(h: &Host) -> i64 {
    num(h.feature_settings("per_user_volume_hotkeys").get("step")).map(|n| n.round().clamp(5.0, 50.0) as i64).unwrap_or(10)
}

fn fire(action: &'static str) -> Arc<dyn Fn() + Send + Sync> {
    Arc::new(move || {
        if let Some(h) = host() {
            h.send("premium:hotkey", json!({ "action": action, "step": step(h), "source": "hotkey" }));
        }
    })
}

fn sync(h: &Host, on: bool) {
    let c = custom(h);
    h.hotkeys.set_handler(&c, "volume_up", on.then(|| fire("volume_up")));
    h.hotkeys.set_handler(&c, "volume_down", on.then(|| fire("volume_down")));
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "per_user_volume_hotkeys"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:per_user_volume_hotkeys:status", From::Main)]
    }
    fn start(&self, h: &Host) {
        self.edge.reset(h);
        sync(h, h.in_call());
    }
    fn stop(&self, h: &Host) {
        sync(h, false);
    }
    fn call(&self, h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(ok(json!({ "step": step(h), "inCall": h.in_call(), "bindings": h.hotkeys.bindings(&custom(h)) })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::Call => {
                if let Some(on) = self.edge.changed(h) {
                    sync(h, on);
                }
            }
            Bus::Settings(k) if k == "per_user_volume_hotkeys" || k == "custom_hotkeys" => sync(h, h.in_call()),
            _ => {}
        }
    }
}
