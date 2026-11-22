//! command_center (Ultra), shell side: a global hotkey brings Descall forward and opens the
//! command panel (premium:command_center:toggle { via: 'hotkey' }).

use std::sync::Arc;

use serde_json::{json, Value};

use crate::premium::logic::rules::cut;
use crate::premium::{arg, host, Caller, Feature, From, Host};

pub struct F;

impl Feature for F {
    fn key(&self) -> &'static str {
        "command_center"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:command_center:hotkey", From::Main)]
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.unregister_owner("command_center");
    }
    fn call(&self, h: &Host, _ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        h.hotkeys.unregister_owner("command_center");
        let accel = arg(args, 0);
        let accel = accel.as_str().map(|a| cut(a, 40)).unwrap_or_default();
        if accel.is_empty() {
            return Ok(json!({ "ok": true, "hotkey": "" }));
        }
        let f: Arc<dyn Fn() + Send + Sync> = Arc::new(|| {
            if let Some(h) = host() {
                if h.has("command_center") {
                    h.show_main();
                    h.send("premium:command_center:toggle", json!({ "via": "hotkey" }));
                }
            }
        });
        let ok = h.hotkeys.register_extra("command_center", &accel, f);
        if ok {
            return Ok(json!({ "ok": true, "hotkey": accel }));
        }
        // Refused: name the Descall feature that holds it (quick launcher, same default
        // Ctrl+Shift+K) so Settings can show the clash; otherwise another app has it.
        let conflict = h.hotkeys.holder_of(&accel).filter(|o| o != "command_center");
        if let Some(o) = &conflict {
            log::info!("[premium:command_center] {accel} is held by {o}");
        }
        Ok(json!({ "ok": false, "hotkey": "", "conflict": conflict }))
    }
}
