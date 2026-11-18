//! media_keys (Plus): keyboard media keys control the call. Registered ONLY while a call is
//! live and released when it ends, since the registration takes play / pause away from music
//! players. Off by default. Settings: { playPause, next, previous, stop } each one of
//! toggle_mute | toggle_deafen | none.

use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::CallEdge;
use crate::premium::logic::rules::{media_mapping, MEDIA_KEYS};
use crate::premium::{host, lock, ok, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    edge: CallEdge,
    active: Mutex<Vec<String>>,
    failed: Mutex<Vec<String>>,
}

impl F {
    fn release(&self, h: &Host) {
        h.hotkeys.unregister_owner("media_keys");
        lock(&self.active).clear();
    }

    fn sync(&self, h: &Host) {
        self.release(h);
        lock(&self.failed).clear();
        if !h.in_call() {
            return;
        }
        let map = media_mapping(&h.feature_settings("media_keys"));
        for (name, accel) in MEDIA_KEYS {
            let action = map[*name].as_str().unwrap_or("none").to_string();
            if action == "none" {
                continue;
            }
            let f: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                if let Some(h) = host() {
                    h.send("premium:hotkey", json!({ "action": action, "source": "media" }));
                }
            });
            if h.hotkeys.register_extra("media_keys", accel, f) {
                lock(&self.active).push(accel.to_string());
            } else {
                lock(&self.failed).push(accel.to_string());
            }
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "media_keys"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:media_keys:status", From::Main)]
    }
    fn start(&self, h: &Host) {
        self.edge.reset(h);
        self.sync(h);
    }
    fn stop(&self, h: &Host) {
        self.release(h);
    }
    fn call(&self, h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(ok(json!({ "inCall": h.in_call(), "active": *lock(&self.active), "failed": *lock(&self.failed), "mapping": media_mapping(&h.feature_settings("media_keys")) })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::Call if self.edge.changed(h).is_some() => self.sync(h),
            Bus::Settings(k) if k == "media_keys" => self.sync(h),
            _ => {}
        }
    }
}
