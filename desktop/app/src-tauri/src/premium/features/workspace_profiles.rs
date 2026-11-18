//! workspace_profiles (Ultra), shell side: global hotkeys and tray entries that switch the
//! active profile. The profiles themselves live in the renderer, which applies them
//! (premium:workspace_profiles:switch { id, via }).

use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::premium::logic::rules::{cut, s, workspace_profiles, WorkspaceProfile};
use crate::premium::logic::tray::{self, TrayItem};
use crate::premium::{arg, host, lock, ok, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    menu: Mutex<(String, Vec<WorkspaceProfile>)>,
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "workspace_profiles"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:workspace_profiles:bind", From::Main)]
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.unregister_owner("workspace_profiles");
        *lock(&self.menu) = (String::new(), Vec::new());
        h.refresh_tray();
    }
    fn call(&self, h: &Host, _ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        h.hotkeys.unregister_owner("workspace_profiles");
        let payload = arg(args, 0);
        let profiles = workspace_profiles(&payload);
        let mut bound = Vec::new();
        for p in &profiles {
            if p.hotkey.is_empty() {
                continue;
            }
            let id = p.id.clone();
            let f: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                if let Some(h) = host() {
                    if h.has("workspace_profiles") {
                        h.send("premium:workspace_profiles:switch", json!({ "id": id, "via": "hotkey" }));
                    }
                }
            });
            if h.hotkeys.register_extra("workspace_profiles", &p.hotkey, f) {
                bound.push(p.id.clone());
            }
        }
        *lock(&self.menu) = (cut(&s(&payload, "trayTitle"), 40), profiles);
        h.refresh_tray();
        Ok(ok(json!({ "bound": bound })))
    }
    fn tray(&self, _h: &Host) -> Vec<TrayItem> {
        let m = lock(&self.menu);
        tray::workspace(&m.0, &m.1)
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        let Some(id) = rest.strip_prefix("workspace|") else { return false };
        h.send("premium:workspace_profiles:switch", json!({ "id": id, "via": "tray" }));
        true
    }
}
