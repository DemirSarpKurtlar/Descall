//! focus_mode (Plus), desktop part: tray entries to start / end focus. The rule itself runs in
//! the renderer, which mirrors the end time here so the tray label is right.
//! Renderer: premium:tray-action { action: 'focus', minutes } (0 ends it).

use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};

use super::Poll;
use crate::premium::logic::rules::{minutes_left, num};
use crate::premium::logic::tray::{self, TrayItem};
use crate::premium::{arg, now_ms, ok, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    until: AtomicU64,
    refresh: Poll,
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "focus_mode"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:focus_mode:state", From::Main)]
    }
    fn stop(&self, _h: &Host) {
        self.refresh.stop();
        self.until.store(0, Ordering::Relaxed);
    }
    fn call(&self, h: &Host, _ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let n = num(arg(args, 0).get("until")).unwrap_or(0.0);
        let until = if n > now_ms() as f64 { n as u64 } else { 0 };
        self.until.store(until, Ordering::Relaxed);
        // Refresh the "N min left" label once a minute, only while focus is on.
        if until > 0 {
            self.refresh.start(h, "focus_mode", "refresh", 60_000);
        } else {
            self.refresh.stop();
        }
        h.refresh_tray();
        Ok(ok(json!({})))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        if matches!(ev, Bus::Tick { key: "focus_mode", tag: "refresh", .. }) {
            if minutes_left(self.until.load(Ordering::Relaxed), now_ms()) == 0 {
                self.until.store(0, Ordering::Relaxed);
                self.refresh.stop();
            }
            h.refresh_tray();
        }
    }
    fn tray(&self, h: &Host) -> Vec<TrayItem> {
        tray::focus(&h.locale(), self.until.load(Ordering::Relaxed), now_ms())
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        let Some(m) = rest.strip_prefix("focus|").and_then(|m| m.parse::<u64>().ok()) else { return false };
        h.send("premium:tray-action", json!({ "action": "focus", "minutes": m }));
        true
    }
}
