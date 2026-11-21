//! desktop_sidebar (Ultra): a slim, frameless, topmost panel docked to the left or right
//! screen edge (online friends, recent DMs, the active call), drawn by the main renderer as a
//! portal window. Settings: edge 'left'|'right' (default right), autoHide (default true: hides
//! when it loses focus; screen_edge_actions or the settings button brings it back).

use serde_json::{json, Value};
use tauri::Manager;

use super::Gen;
use crate::premium::logic::geom;
use crate::premium::{ok, wins, Bus, Caller, Feature, From, Host};

const LABEL: &str = "sidebar";

#[derive(Default)]
pub struct F {
    hide: Gen,
}

fn auto_hide(h: &Host) -> bool {
    h.setting_bool("features.desktop_sidebar.autoHide", true)
}

fn dock(h: &Host, point: Option<(i32, i32)>) {
    let Some(w) = h.app.get_webview_window(LABEL) else { return };
    let area = match point {
        Some((x, y)) => wins::display_at(h, x, y).map(|d| d.1),
        None => h.app.get_webview_window("main").and_then(|m| wins::bounds(&m)).and_then(|b| wins::display_for(h, b)).map(|d| d.1),
    }
    .unwrap_or_else(|| wins::primary_area(h));
    let width = (300.0 * w.scale_factor().unwrap_or(1.0)).round() as i32;
    wins::set_bounds(&w, geom::docked_bounds(area, &wins::sidebar_edge(h), width));
}

fn reveal(h: &Host, point: Option<(i32, i32)>) {
    let Some(w) = h.app.get_webview_window(LABEL) else {
        h.send("premium:open", json!({ "kind": "sidebar" }));
        return;
    };
    dock(h, point);
    wins::show(h, &w, "sidebar");
    let _ = w.set_focus();
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "desktop_sidebar"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[("premium:sidebar:toggle", From::App)]
    }
    fn stop(&self, h: &Host) {
        h.send("premium:close", json!({ "kind": "sidebar" }));
        wins::close_kind(h, "sidebar");
    }
    fn call(&self, h: &Host, _ch: &str, _args: &[Value], _c: &Caller) -> Result<Value, String> {
        if let Some(w) = h.app.get_webview_window(LABEL) {
            if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
                return Ok(ok(json!({ "visible": false })));
            }
        }
        reveal(h, None);
        Ok(ok(json!({ "visible": true })))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::SidebarReveal(p) => reveal(h, *p),
            Bus::Settings(k) if k == "desktop_sidebar" => dock(h, None),
            Bus::Displays => dock(h, None),
            Bus::WindowOpened { label, .. } if label == LABEL => dock(h, None),
            Bus::Focus(label, false) if label == LABEL && auto_hide(h) => {
                let g = self.hide.bump();
                h.tick("desktop_sidebar", "hide", g, 350);
            }
            Bus::Focus(label, true) if label == LABEL => {
                self.hide.bump();
            }
            Bus::Tick { key: "desktop_sidebar", tag: "hide", gen } if self.hide.is(*gen) => {
                if let Some(w) = h.app.get_webview_window(LABEL) {
                    if !w.is_focused().unwrap_or(false) {
                        let _ = w.hide();
                    }
                }
            }
            _ => {}
        }
    }
}
