//! quick_launcher (Plus): a global hotkey opens a small frameless search window
//! (frontend/dist/premium-launcher/launcher.html, unchanged). The main renderer does the
//! searching; this module owns the window and relays launcher -> shell -> renderer -> shell ->
//! launcher. The window is created on first use and destroyed after a minute hidden. Off by
//! default.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WebviewWindowBuilder};

use super::global_mute::custom;
use super::Gen;
use crate::premium::logic::rules::{cut, launcher_results, s};
use crate::premium::{arg, host, lock, ok, wins, Bus, Caller, Feature, From, Host};

const LABEL: &str = "launcher";
const WIDTH: f64 = 640.0;
const HEIGHT: f64 = 420.0;
const SHIM: &str = include_str!("../../../../shim/premium-launcher-shim.js");

#[derive(Default)]
pub struct F {
    pending: Mutex<HashMap<u64, Sender<Value>>>,
    idle: Gen,
}

fn strings(h: &Host) -> Value {
    json!({
        "lang": h.locale(),
        "placeholder": h.et("launcher.placeholder", &[]),
        "empty": h.et("launcher.empty", &[]),
        "hint": h.et("launcher.hint", &[]),
        "loading": h.et("launcher.loading", &[]),
        "title": h.et("launcher.title", &[]),
    })
}

fn place(h: &Host, w: &tauri::WebviewWindow) {
    let (x, y) = crate::premium::platform::cursor_pos().unwrap_or((0, 0));
    let area = wins::display_at(h, x, y).map(|d| d.1).unwrap_or_else(|| wins::primary_area(h));
    let sc = w.scale_factor().unwrap_or(1.0);
    let (pw, ph) = ((WIDTH * sc).round() as i32, (HEIGHT * sc).round() as i32);
    let r = crate::premium::logic::geom::Rect::new(area.x + (area.width - pw) / 2, area.y + ((area.height as f64 * 0.18).max(40.0 * sc)).round() as i32, pw, ph);
    wins::set_bounds(w, r);
}

impl F {
    fn show(&self, h: &Host) -> bool {
        self.idle.bump();
        let w = match h.app.get_webview_window(LABEL) {
            Some(w) => w,
            None => {
                let Some(url) = super::multi_window::app_url(h, "/premium-launcher/launcher.html") else { return false };
                let origin = url.origin();
                let built = WebviewWindowBuilder::new(&h.app, LABEL, tauri::WebviewUrl::External(url))
                    .devtools(crate::webview::devtools_allowed(&h.app)) // support opt-in only (webview.rs)
                    .title("Descall")
                    .inner_size(WIDTH, HEIGHT)
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .resizable(false)
                    .maximizable(false)
                    .minimizable(false)
                    .skip_taskbar(true)
                    .always_on_top(true)
                    .visible_on_all_workspaces(true)
                    .visible(false)
                    .use_https_scheme(true)
                    // Same WebView2 browser arguments as the main window (shared user data
                    // folder; other arguments fail with ERROR_INVALID_STATE).
                    .additional_browser_args(crate::BROWSER_ARGS)
                    .initialization_script(SHIM)
                    .on_navigation(move |u| u.origin() == origin)
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .on_page_load(|w, p| {
                        if p.event() == PageLoadEvent::Finished {
                            if let Some(h) = host() {
                                let _ = w.emit_to(LABEL, "premium:launcher:reset", strings(h));
                            }
                        }
                    })
                    .build();
                match built {
                    Ok(w) => {
                        wins::track(h, LABEL, "launcher", "quick_launcher", json!({}));
                        w
                    }
                    Err(e) => {
                        log::warn!("[premium] launcher failed: {e}");
                        return false;
                    }
                }
            }
        };
        place(h, &w);
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit_to(LABEL, "premium:launcher:reset", strings(h));
        true
    }

    fn hide(&self, h: &Host) {
        let Some(w) = h.app.get_webview_window(LABEL) else { return };
        let _ = w.hide();
        let g = self.idle.bump();
        h.tick("quick_launcher", "idle", g, 60_000);
    }

    fn toggle(&self, h: &Host) {
        match h.app.get_webview_window(LABEL) {
            Some(w) if w.is_visible().unwrap_or(false) => self.hide(h),
            _ => {
                self.show(h);
            }
        }
    }

    fn query(&self, h: &Host, q: &Value) -> Value {
        let id = h.next_id();
        let (tx, rx) = channel();
        lock(&self.pending).insert(id, tx);
        if !h.send("premium:launcher-query", json!({ "id": id, "q": cut(q.as_str().unwrap_or(""), 120) })) {
            lock(&self.pending).remove(&id);
            return ok(json!({ "results": [], "offline": true }));
        }
        match rx.recv_timeout(Duration::from_millis(1500)) {
            Ok(v) => v,
            Err(_) => {
                lock(&self.pending).remove(&id);
                ok(json!({ "results": [], "timeout": true }))
            }
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "quick_launcher"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[
            ("premium:launcher:strings", From::App),
            ("premium:launcher:query", From::App),
            ("premium:launcher:run", From::App),
            ("premium:launcher:close", From::App),
            ("premium:launcher:results", From::Main),
            ("premium:launcher:open", From::Main),
        ]
    }
    fn start(&self, h: &Host) {
        let f: Arc<dyn Fn() + Send + Sync> = Arc::new(|| {
            if let Some(h) = host() {
                h.bus(Bus::Tick { key: "quick_launcher", tag: "toggle", gen: 0 });
            }
        });
        h.hotkeys.set_handler(&custom(h), "quick_launcher", Some(f));
    }
    fn stop(&self, h: &Host) {
        h.hotkeys.set_handler(&custom(h), "quick_launcher", None);
        for (_, tx) in lock(&self.pending).drain() {
            let _ = tx.send(ok(json!({ "results": [] })));
        }
        self.idle.bump();
        if let Some(w) = h.app.get_webview_window(LABEL) {
            let _ = w.destroy();
        }
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let a0 = arg(args, 0);
        Ok(match ch {
            "premium:launcher:strings" => strings(h),
            "premium:launcher:query" => self.query(h, &a0),
            "premium:launcher:run" => {
                let id = s(&a0, "id");
                if a0.get("id").and_then(Value::as_str).is_none() {
                    return Ok(json!({ "ok": false }));
                }
                self.hide(h);
                if crate::premium::logic::rules::truthy(a0.get("focus")) {
                    h.show_main();
                }
                h.send("premium:launcher-run", json!({ "id": cut(&id, 200) }));
                ok(json!({}))
            }
            "premium:launcher:close" => {
                self.hide(h);
                ok(json!({}))
            }
            "premium:launcher:results" => {
                let id = a0.get("id").and_then(Value::as_u64).or_else(|| a0.get("id").and_then(Value::as_f64).map(|f| f as u64)).unwrap_or(0);
                match lock(&self.pending).remove(&id) {
                    Some(tx) => {
                        let _ = tx.send(ok(json!({ "results": launcher_results(a0.get("results")) })));
                        ok(json!({}))
                    }
                    None => json!({ "ok": false }),
                }
            }
            _ => json!({ "ok": self.show(h) }),
        })
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::Tick { key: "quick_launcher", tag: "toggle", .. } => self.toggle(h),
            Bus::Focus(l, false) if l == LABEL && std::env::var_os("DESCALL_LAUNCHER_KEEP_OPEN").is_none() => self.hide(h),
            Bus::Tick { key: "quick_launcher", tag: "idle", gen } if self.idle.is(*gen) => {
                if let Some(w) = h.app.get_webview_window(LABEL) {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.destroy();
                    }
                }
            }
            _ => {}
        }
    }
}
