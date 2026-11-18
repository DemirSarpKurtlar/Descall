//! desktop_automations (Ultra), shell side: the OS idle signal for "idle" triggers. Polls
//! GetLastInputInfo every 15 s only while a rule uses the idle trigger; the session lock counts
//! as idle. The rule engine runs in the renderer and can only fire its fixed action list.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use serde_json::{json, Value};

use super::Poll;
use crate::premium::logic::rules::num;
use crate::premium::{arg, ok, platform, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    threshold: AtomicU64,
    idle: AtomicBool,
    poll: Poll,
}

impl F {
    fn set_idle(&self, h: &Host, next: bool, seconds: u64) {
        if self.idle.swap(next, Ordering::Relaxed) != next {
            h.send("premium:desktop_automations:idle", json!({ "idle": next, "seconds": seconds }));
        }
    }

    fn arm(&self, h: &Host, sec: u64) {
        self.poll.stop();
        self.threshold.store(sec, Ordering::Relaxed);
        if sec == 0 {
            self.idle.store(false, Ordering::Relaxed);
            return;
        }
        self.poll.start(h, "desktop_automations", "idle", 15_000);
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "desktop_automations"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:desktop_automations:watch-idle", From::Main)]
    }
    fn stop(&self, h: &Host) {
        self.arm(h, 0);
    }
    fn call(&self, h: &Host, _ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let sec = num(args.first()).unwrap_or(0.0).round().clamp(0.0, 24.0 * 3600.0) as u64;
        let _ = arg(args, 0);
        self.arm(h, sec);
        Ok(ok(json!({ "thresholdSec": sec })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        let t = self.threshold.load(Ordering::Relaxed);
        if t == 0 {
            return;
        }
        match ev {
            Bus::Tick { key: "desktop_automations", tag: "idle", .. } => {
                let s = platform::idle_seconds();
                self.set_idle(h, s >= t, s);
            }
            Bus::SessionLock(true) => self.set_idle(h, true, t),
            Bus::SessionLock(false) => self.set_idle(h, false, 0),
            _ => {}
        }
    }
}
