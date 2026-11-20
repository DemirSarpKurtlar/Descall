//! tray_controls_plus (Plus): tray entries for the call (mute, deafen, leave) and your status.
//! Clicks go to the renderer as premium:action, which runs the call UI's own handlers. The
//! menu is rebuilt only when the call state or the status changes.

use std::sync::Mutex;

use serde_json::{json, Value};

use crate::premium::logic::tray::{self, TrayItem};
use crate::premium::{lock, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    last: Mutex<String>,
}

fn status(h: &Host) -> String {
    lock(&h.app_state).get("status").and_then(Value::as_str).unwrap_or("online").to_string()
}

impl F {
    fn maybe_refresh(&self, h: &Host) {
        let c = lock(&h.call_state).clone();
        let key = format!("{}|{}|{}|{}|{}", c["active"], c["title"], c["muted"], c["deafened"], status(h));
        let mut last = lock(&self.last);
        if *last != key {
            *last = key;
            drop(last);
            h.refresh_tray();
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "tray_controls_plus"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[]
    }
    fn start(&self, h: &Host) {
        lock(&self.last).clear();
        self.maybe_refresh(h);
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        if matches!(ev, Bus::Call | Bus::App | Bus::ModulesChanged) {
            self.maybe_refresh(h);
        }
    }
    fn tray(&self, h: &Host) -> Vec<TrayItem> {
        let call = lock(&h.call_state).clone();
        tray::call_controls(&h.locale(), &call, &status(h))
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        if let Some(a) = rest.strip_prefix("action|") {
            h.send("premium:action", json!({ "action": a, "value": Value::Null }));
            return true;
        }
        if let Some(s) = rest.strip_prefix("status|") {
            h.send("premium:action", json!({ "action": "status", "value": s }));
            return true;
        }
        false
    }
}
