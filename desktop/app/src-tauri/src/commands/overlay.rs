//! Always-on-top voice overlay (electron/overlayWindow.cjs): a transparent, frameless card in
//! the top-right corner of the primary work area with mute / deafen / leave. The card is
//! overlayHtml.cjs, served by descall-shell://localhost/overlay.html. A hidden overlay is
//! destroyed after 60 s to free its renderer.

use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::{self, to_main};

pub const LABEL: &str = "overlay";
const CARD_W: f64 = 280.0;
const CARD_H: f64 = 104.0;
const PAD: f64 = 14.0;
const WIDTH: f64 = CARD_W + PAD * 2.0;
const HEIGHT: f64 = CARD_H + PAD * 2.0 + 4.0;
const MARGIN: f64 = 16.0;
const IDLE_DESTROY: Duration = Duration::from_secs(60);

pub struct Overlay {
    state: Mutex<Map<String, Value>>,
    loaded: Mutex<bool>,
    idle_gen: Mutex<u64>,
}

impl Default for Overlay {
    fn default() -> Self {
        let v = json!({ "title": "", "muted": false, "deafened": false, "connected": false, "pending": false, "kind": "dm", "since": 0, "lang": "en", "avatarUrl": "", "brandRgb": "" });
        Overlay { state: Mutex::new(v.as_object().cloned().unwrap_or_default()), loaded: Mutex::new(false), idle_gen: Mutex::new(0) }
    }
}

fn merge<R: Runtime>(app: &AppHandle<R>, payload: &Value, extra: &[(&str, Value)]) {
    let o = app.state::<Overlay>();
    let mut s = o.state.lock().unwrap();
    if let Some(p) = payload.as_object() {
        for (k, v) in p {
            s.insert(k.clone(), v.clone());
        }
    }
    for (k, v) in extra {
        s.insert((*k).to_string(), v.clone());
    }
    // The overlay speaks the shell language, whatever lang the payload carries.
    s.insert("lang".into(), Value::String(state::locale(app)));
}

fn push<R: Runtime>(app: &AppHandle<R>) {
    let o = app.state::<Overlay>();
    if !*o.loaded.lock().unwrap() {
        return;
    }
    let js = format!("window.__overlayUpdate && window.__overlayUpdate({});", Value::Object(o.state.lock().unwrap().clone()));
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.eval(&js);
    }
}

pub fn is_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window(LABEL).is_some_and(|w| w.is_visible().unwrap_or(false))
}

fn ensure<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Some(w);
    }
    *app.state::<Overlay>().loaded.lock().unwrap() = false;
    let (x, y) = match app.primary_monitor().ok().flatten() {
        Some(m) => {
            let s = m.scale_factor();
            let wa = m.work_area();
            let (wx, wy, ww) = (wa.position.x as f64 / s, wa.position.y as f64 / s, wa.size.width as f64 / s);
            // The window carries a transparent shadow margin; keep the card itself 16 px in.
            ((wx + ww - WIDTH - MARGIN + PAD).max(wx), (wy + MARGIN - PAD).max(wy))
        }
        None => (100.0, 100.0),
    };
    let app_load = app.clone();
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::CustomProtocol(crate::shell_url("overlay.html")))
        .devtools(crate::webview::devtools_allowed(app)) // support opt-in only (webview.rs)
        .title("Descall")
        .inner_size(WIDTH, HEIGHT)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .visible(false)
        .use_https_scheme(true)
        .additional_browser_args(crate::BROWSER_ARGS)
        .initialization_script(format!("window.__DESCALL_OVERLAY__ = {};", json!({ "locale": state::locale(app) })))
        .on_navigation(|u| descall_shell::ipc_policy::is_shell_page(u.as_str()))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_page_load(move |w, p| {
            if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                *app_load.state::<Overlay>().loaded.lock().unwrap() = true;
                let connected = app_load.state::<Overlay>().state.lock().unwrap().get("connected").and_then(Value::as_bool).unwrap_or(false);
                if connected {
                    let _ = w.show();
                    push(&app_load);
                }
            }
        })
        .build()
        .ok()
}

/// electronAPI.overlayShow(payload) -> descall:overlay:show.
#[tauri::command]
pub fn overlay_show<R: Runtime>(app: AppHandle<R>, payload: Value) {
    *app.state::<Overlay>().idle_gen.lock().unwrap() += 1;
    merge(&app, &payload, &[("connected", Value::Bool(true))]);
    if let Some(w) = ensure(&app) {
        if *app.state::<Overlay>().loaded.lock().unwrap() {
            if !w.is_visible().unwrap_or(false) {
                let _ = w.show();
            }
            push(&app);
        }
    }
}

/// electronAPI.overlayUpdate(payload) -> descall:overlay:update (only while visible).
#[tauri::command]
pub fn overlay_update<R: Runtime>(app: AppHandle<R>, payload: Value) {
    merge(&app, &payload, &[]);
    if is_visible(&app) {
        push(&app);
    }
}

/// electronAPI.overlayHide() -> descall:overlay:hide; destroyed after 60 s hidden.
#[tauri::command]
pub fn overlay_hide<R: Runtime>(app: AppHandle<R>) {
    merge(&app, &Value::Null, &[("connected", Value::Bool(false))]);
    let Some(w) = app.get_webview_window(LABEL) else { return };
    let _ = w.hide();
    let gen = {
        let o = app.state::<Overlay>();
        let mut g = o.idle_gen.lock().unwrap();
        *g += 1;
        *g
    };
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(IDLE_DESTROY).await;
        let current = *app2.state::<Overlay>().idle_gen.lock().unwrap();
        if current == gen && !is_visible(&app2) {
            if let Some(w) = app2.get_webview_window(LABEL) {
                let _ = w.destroy();
            }
        }
    });
}

/// The UI language changed: relabel a visible overlay.
pub fn refresh_language<R: Runtime>(app: &AppHandle<R>) {
    merge(app, &Value::Null, &[]);
    if is_visible(app) {
        push(app);
    }
}

/// window.overlayAPI.action(type) from the overlay page -> descall:overlay:action to the app.
#[tauri::command]
pub fn overlay_action<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: String) {
    if window.label() != LABEL || !matches!(action.as_str(), "mute" | "deafen" | "leave") {
        return;
    }
    to_main(&app, "descall:overlay:action", action);
}
