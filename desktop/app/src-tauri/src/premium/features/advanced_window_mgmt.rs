//! advanced_window_mgmt (Ultra): window behaviour across monitors.
//!  - snap (default on): Descall windows snap to work-area edges when dropped within 18 px;
//!  - keepVisible (default on): after a monitor change, windows left off-screen come back;
//!  - mainMonitor (default on): the main window opens on the monitor it was last on.
//! Event driven (WM_DISPLAYCHANGE from the watcher window, window moves): no polling.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::Manager;

use super::Gen;
use crate::premium::logic::geom::{self, Rect};
use crate::premium::{lock, ok, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    moves: Mutex<HashMap<String, u64>>,
    rescue_gen: Gen,
    seq: Gen,
}

fn opt(h: &Host, name: &str) -> bool {
    h.setting_bool(&format!("features.advanced_window_mgmt.{name}"), true)
}

fn snap(h: &Host, label: &str) {
    if !opt(h, "snap") {
        return;
    }
    let Some(w) = h.app.get_webview_window(label) else { return };
    if w.is_maximized().unwrap_or(false) || w.is_fullscreen().unwrap_or(false) || w.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(b) = wins::bounds(&w) else { return };
    let Some((_, area)) = wins::display_for(h, b) else { return };
    let next = geom::snap_to_edges(b, area, (18.0 * w.scale_factor().unwrap_or(1.0)).round() as i32);
    if next.x != b.x || next.y != b.y {
        let _ = w.set_position(tauri::PhysicalPosition::new(next.x, next.y));
    }
}

fn rescue(h: &Host) {
    if !opt(h, "keepVisible") {
        return;
    }
    for (label, _) in wins::all(h) {
        let Some(w) = h.app.get_webview_window(&label) else { continue };
        if w.is_maximized().unwrap_or(false) || w.is_minimized().unwrap_or(false) {
            continue;
        }
        let Some(b) = wins::bounds(&w) else { continue };
        if let Some(f) = wins::fit(h, b) {
            if f != b {
                wins::set_bounds(&w, f);
            }
        }
    }
}

fn remember_main(h: &Host) {
    let Some(w) = h.app.get_webview_window("main") else { return };
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    if let Some((d, _)) = wins::bounds(&w).and_then(|b| wins::display_for(h, b)) {
        h.store_set("advanced.mainDisplay", json!({ "id": format!("{},{}", d.x, d.y), "bounds": d.to_json() }));
    }
}

fn restore_main(h: &Host) {
    if !opt(h, "mainMonitor") {
        return;
    }
    let Some(saved) = h.store().get("advanced.mainDisplay") else { return };
    let Some(target) = saved.get("bounds").and_then(Rect::from_json) else { return };
    let Some(w) = h.app.get_webview_window("main") else { return };
    let (list, _) = wins::displays(h);
    if !list.iter().any(|(b, _)| *b == target) {
        return;
    }
    let Some(b) = wins::bounds(&w) else { return };
    let Some((current, _)) = wins::display_for(h, b) else { return };
    if current == target {
        return;
    }
    let was_max = w.is_maximized().unwrap_or(false);
    if was_max {
        let _ = w.unmaximize();
    }
    if let Some(nb) = wins::fit(h, geom::map_between_displays(b, Some(current), Some(target))) {
        wins::set_bounds(&w, nb);
    }
    if was_max {
        let _ = w.maximize();
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "advanced_window_mgmt"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:windows:rescue", From::App)]
    }
    fn start(&self, h: &Host) {
        restore_main(h);
    }
    fn call(&self, h: &Host, _ch: &str, _args: &[Value], _c: &Caller) -> Result<Value, String> {
        rescue(h);
        Ok(ok(json!({})))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            // Tauri reports moves during the drag: snap once it has been still for 300 ms.
            Bus::Moved(label) => {
                let kind = wins::kind_of(h, label);
                if matches!(kind.as_deref(), Some("main" | "call" | "popout")) {
                    let g = self.seq.bump();
                    lock(&self.moves).insert(label.clone(), g);
                    h.tick("advanced_window_mgmt", "snap", g, 300);
                }
            }
            Bus::Displays => {
                let g = self.rescue_gen.bump();
                h.tick("advanced_window_mgmt", "rescue", g, 300);
            }
            Bus::Tick { key: "advanced_window_mgmt", tag: "snap", gen } => {
                let label = lock(&self.moves).iter().find(|(_, g)| **g == *gen).map(|(l, _)| l.clone());
                if let Some(label) = label {
                    lock(&self.moves).remove(&label);
                    snap(h, &label);
                    if label == "main" {
                        remember_main(h);
                    }
                }
            }
            Bus::Tick { key: "advanced_window_mgmt", tag: "rescue", gen } if self.rescue_gen.is(*gen) => rescue(h),
            _ => {}
        }
    }
}
