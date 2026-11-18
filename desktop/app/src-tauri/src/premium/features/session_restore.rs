//! session_restore (Plus): on launch, reopen the previous pop-outs and the sidebar, and put the
//! main window back where it was (fitted to today's monitors). Voice is never rejoined.
//! Settings: popouts, mini (sidebar), bounds; all default on. Saved under session.* whenever a
//! Descall+ window opens or closes, when the main window moves, and before quit.

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{json, Value};
use tauri::Manager;

use super::Gen;
use crate::premium::logic::geom::Rect;
use crate::premium::{lock, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    restored: AtomicBool,
    quitting: AtomicBool,
    save_main: Gen,
    restore: Gen,
}

fn opt(h: &Host, name: &str) -> bool {
    h.setting_bool(&format!("features.session_restore.{name}"), true)
}

fn snapshot(h: &Host) {
    let entries = wins::list(h, None);
    let pops: Vec<Value> = entries
        .iter()
        .filter(|(_, e)| e.kind == "popout")
        .filter_map(|(l, e)| {
            let b = h.app.get_webview_window(l).and_then(|w| wins::bounds(&w))?;
            Some(json!({ "route": e.meta["route"], "bounds": b.to_json() }))
        })
        .collect();
    h.store_set("session.popouts", json!(pops));
    let open: Vec<&str> = entries.iter().filter(|(_, e)| e.kind == "sidebar").map(|_| "sidebar").collect();
    h.store_set("session.open", json!(open));
}

fn save_main(h: &Host) {
    let Some(w) = h.app.get_webview_window("main") else { return };
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = w.is_maximized().unwrap_or(false);
    let prev = h.store().get("session.main.bounds");
    let b = match (maximized, prev) {
        (true, Some(p)) => p,
        _ => match wins::bounds(&w) {
            Some(b) => b.to_json(),
            None => return,
        },
    };
    h.store_set("session.main", json!({ "bounds": b, "maximized": maximized }));
}

impl F {
    fn restore(&self, h: &Host) {
        if self.restored.load(Ordering::Relaxed) {
            return;
        }
        // The renderer host is up once it reported app state (it pushes on mount).
        if lock(&h.app_state).get("ready").and_then(Value::as_bool) != Some(true) {
            let g = self.restore.bump();
            h.tick("session_restore", "restore", g, 1000);
            return;
        }
        self.restored.store(true, Ordering::Relaxed);
        if opt(h, "bounds") {
            if let (Some(w), Some(saved)) = (h.app.get_webview_window("main"), h.store().get("session.main")) {
                if let Some(b) = saved.get("bounds").and_then(Rect::from_json).and_then(|b| wins::fit(h, b)) {
                    if saved.get("maximized").and_then(Value::as_bool) == Some(true) {
                        wins::set_bounds(&w, b);
                        let _ = w.maximize();
                    } else if !w.is_maximized().unwrap_or(false) {
                        wins::set_bounds(&w, b);
                    }
                }
            }
        }
        if opt(h, "popouts") {
            for p in h.store().get("session.popouts").and_then(|v| v.as_array().cloned()).unwrap_or_default() {
                if let Some(route) = p.get("route").and_then(Value::as_str) {
                    h.bus(Bus::PopoutOpen { route: route.into(), bounds: p.get("bounds").and_then(Rect::from_json) });
                }
            }
        }
        if opt(h, "mini") {
            for k in h.store().get("session.open").and_then(|v| v.as_array().cloned()).unwrap_or_default() {
                if k.as_str() == Some("sidebar") {
                    h.send("premium:open", json!({ "kind": "sidebar" }));
                }
            }
        }
        log::info!("[premium] session restored");
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "session_restore"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[]
    }
    fn start(&self, h: &Host) {
        self.quitting.store(false, Ordering::Relaxed);
        if !self.restored.load(Ordering::Relaxed) {
            let g = self.restore.bump();
            h.tick("session_restore", "restore", g, 1200);
        }
    }
    fn stop(&self, _h: &Host) {
        self.save_main.bump();
        self.restore.bump();
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::WindowOpened { .. } | Bus::WindowClosed { .. } if !self.quitting.load(Ordering::Relaxed) => snapshot(h),
            Bus::BeforeQuit => {
                snapshot(h);
                save_main(h);
                self.quitting.store(true, Ordering::Relaxed);
            }
            Bus::Moved(l) | Bus::Resized(l) if l == "main" => {
                let g = self.save_main.bump();
                h.tick("session_restore", "main", g, 800);
            }
            Bus::Tick { key: "session_restore", tag: "main", gen } if self.save_main.is(*gen) => save_main(h),
            Bus::Tick { key: "session_restore", tag: "restore", gen } if self.restore.is(*gen) => self.restore(h),
            _ => {}
        }
    }
}
