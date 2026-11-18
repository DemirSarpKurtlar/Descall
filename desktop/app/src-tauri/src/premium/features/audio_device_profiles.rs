//! audio_device_profiles (Plus), desktop part: switch a device profile from the tray. Profiles
//! live in the renderer, which mirrors their names here.
//! Renderer: premium:tray-action { action: 'audio-profile', id }.

use std::sync::Mutex;

use serde_json::{json, Value};

use crate::premium::logic::rules::audio_profiles;
use crate::premium::logic::tray::{self, TrayItem};
use crate::premium::{arg, lock, ok, Caller, Feature, From, Host};

type Mirror = (Vec<(String, String)>, Option<String>);

#[derive(Default)]
pub struct F {
    mirror: Mutex<Mirror>,
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "audio_device_profiles"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:audio_device_profiles:mirror", From::Main)]
    }
    fn stop(&self, _h: &Host) {
        *lock(&self.mirror) = (Vec::new(), None);
    }
    fn call(&self, h: &Host, _ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        *lock(&self.mirror) = audio_profiles(&arg(args, 0));
        h.refresh_tray();
        Ok(ok(json!({})))
    }
    fn tray(&self, h: &Host) -> Vec<TrayItem> {
        let m = lock(&self.mirror);
        tray::audio_profiles(&h.locale(), &m.0, m.1.as_deref())
    }
    fn on_tray(&self, h: &Host, rest: &str) -> bool {
        let Some(id) = rest.strip_prefix("audio|") else { return false };
        h.send("premium:tray-action", json!({ "action": "audio-profile", "id": id }));
        true
    }
}
