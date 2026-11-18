//! window_opacity (Plus): see-through call, sidebar and pop-out windows
//! (features.window_opacity.<kind>, 0.3 .. 1) with WS_EX_LAYERED. Stopping makes every window
//! fully opaque again.

use serde_json::Value;
use tauri::Manager;

use crate::premium::{wins, Bus, Caller, Feature, From, Host};

pub struct F;

impl Feature for F {
    fn key(&self) -> &'static str {
        "window_opacity"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[]
    }
    fn start(&self, h: &Host) {
        wins::apply_all(h);
    }
    fn stop(&self, h: &Host) {
        for (label, _) in wins::all(h) {
            if let Some(w) = h.app.get_webview_window(&label) {
                wins::set_opacity(&w, 1.0);
            }
        }
    }
    fn call(&self, _h: &Host, _ch: &str, _args: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::WindowOpened { label, kind } => wins::apply_behaviour(h, label, kind),
            Bus::Settings(k) if k == "window_opacity" => wins::apply_all(h),
            _ => {}
        }
    }
}
