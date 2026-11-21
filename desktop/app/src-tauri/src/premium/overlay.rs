//! Small always-on-top windows for the HUDs, widgets and the quick drop zone (port of
//! electron/premium/overlayKit.cjs). Transparent, frameless, not in the taskbar; the HUDs are
//! click-through. Nothing is injected into other processes, which is why they show over
//! borderless / windowed games but not over exclusive fullscreen ones (anti-cheat safe).
//!
//! Pages come from the `descallhud` URI scheme (hud/hud.html, the Electron markup) and talk
//! through `window.descallHud` (shim/premium-hud-shim.js): state in, whitelisted actions out.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde_json::Value;
use tauri::http::{Request, Response};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use super::logic::geom::{self, Rect};
use super::{lock, wins, Host};

pub const SCHEME: &str = "descallhud";
const HTML: &str = include_str!("hud/hud.html");
const HUD_SHIM: &str = include_str!("../../../shim/premium-hud-shim.js");
const KINDS: &[&str] = &["voice", "gaming", "widget", "quickdrop"];
pub const ACTIONS: &[&str] = &["ready", "drop", "open", "close", "moved", "pick", "size"];

#[derive(Clone, Debug)]
pub struct Overlay {
    pub id: String,
    /// Feature that owns it (actions are routed there).
    pub owner: &'static str,
    pub last: Option<Value>,
    pub widget_kind: Option<String>,
}

fn reg() -> &'static Mutex<HashMap<String, Overlay>> {
    static R: OnceLock<Mutex<HashMap<String, Overlay>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Window label of an overlay id ("hud:voice_hud" -> "hud-voice_hud", "widget:x" -> "widget-x").
pub fn label_for(id: &str) -> String {
    if let Some(rest) = id.strip_prefix("widget:") {
        format!("widget-{rest}")
    } else {
        format!("hud-{}", id.trim_start_matches("hud:"))
    }
}

pub fn is_overlay(label: &str) -> bool {
    lock(reg()).contains_key(label)
}

pub fn serve(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let kind = request.uri().path().trim_matches('/');
    let kind = if KINDS.contains(&kind) { kind } else { "widget" };
    Response::builder()
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; connect-src ipc: http://ipc.localhost")
        .body(HTML.replace("__KIND__", kind).into_bytes())
        .unwrap_or_default()
}

pub struct OpenOpts<'a> {
    pub id: &'a str,
    pub kind: &'a str,
    pub owner: &'static str,
    pub bounds: Rect,
    pub click_through: bool,
    pub opacity: f64,
    pub focusable: bool,
    pub state: Option<Value>,
    pub widget_kind: Option<String>,
}

/// Open (or move / restyle the existing) overlay window.
pub fn open(h: &Host, o: OpenOpts<'_>) {
    let label = label_for(o.id);
    let bounds = wins::display_for(h, o.bounds).map(|d| geom::clamp_to_area(o.bounds, d.1)).unwrap_or(o.bounds);
    {
        let mut r = lock(reg());
        let e = r.entry(label.clone()).or_insert_with(|| Overlay { id: o.id.into(), owner: o.owner, last: None, widget_kind: None });
        if o.state.is_some() {
            e.last = o.state.clone();
        }
        if o.widget_kind.is_some() {
            e.widget_kind = o.widget_kind.clone();
        }
    }
    let w = match h.app.get_webview_window(&label) {
        Some(w) => w,
        None => {
            let Ok(url) = format!("http://{SCHEME}.localhost/{}", o.kind).parse() else { return };
            let sc = wins::scale(h).max(0.1);
            let built = WebviewWindowBuilder::new(&h.app, &label, WebviewUrl::CustomProtocol(url))
                .title("Descall")
                .transparent(true)
                .decorations(false)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .focused(false)
                .focusable(o.focusable)
                // Shown at creation, never through show(): tao shows a hidden window with
                // SW_SHOW, which activates it and can take the focus from the game (a hotkey
                // gives Descall the foreground right). Created visible and unfocused it uses
                // SW_SHOWNOACTIVATE, like Electron's showInactive(). The page is transparent
                // until its first state, so nothing shows before set_bounds below.
                .visible(true)
                .position(bounds.x as f64 / sc, bounds.y as f64 / sc)
                .inner_size(bounds.width.max(1) as f64 / sc, bounds.height.max(1) as f64 / sc)
                .visible_on_all_workspaces(true)
                // Same WebView2 browser arguments as the main window: windows that share its
                // user data folder with other arguments fail to start (ERROR_INVALID_STATE),
                // so no HUD, widget or drop zone ever opened.
                .additional_browser_args(crate::BROWSER_ARGS)
                // The quick drop zone reads dropped files through HTML5 drop events, which
                // Tauri's own file-drop handler would swallow.
                .disable_drag_drop_handler()
                .initialization_script(HUD_SHIM)
                .on_navigation(|u| u.host_str() == Some("descallhud.localhost"))
                .build();
            match built {
                Ok(w) => w,
                Err(e) => {
                    log::warn!("[premium] overlay {label} failed: {e}");
                    lock(reg()).remove(&label);
                    return;
                }
            }
        }
    };
    wins::set_bounds(&w, bounds);
    let _ = w.set_ignore_cursor_events(o.click_through);
    // After click-through: it makes tao rewrite the window style (wins::set_opacity).
    wins::set_opacity(&w, o.opacity.clamp(0.2, 1.0));
}

pub fn send(h: &Host, id: &str, state: Value) -> bool {
    let label = label_for(id);
    {
        let mut r = lock(reg());
        let Some(e) = r.get_mut(&label) else { return false };
        e.last = Some(state.clone());
    }
    h.app.emit_to(label.as_str(), "descall:hud:state", state).is_ok()
}

pub fn close(h: &Host, id: &str) {
    let label = label_for(id);
    lock(reg()).remove(&label);
    if let Some(w) = h.app.get_webview_window(&label) {
        let _ = w.destroy();
    }
}

pub fn close_where(h: &Host, pred: impl Fn(&Overlay) -> bool) {
    let ids: Vec<String> = lock(reg()).values().filter(|o| pred(o)).map(|o| o.id.clone()).collect();
    for id in ids {
        close(h, &id);
    }
}

pub fn list(h: &Host) -> Vec<Overlay> {
    lock(reg()).iter().filter(|(l, _)| h.app.get_webview_window(l).is_some()).map(|(_, o)| o.clone()).collect()
}

pub fn get(h: &Host, id: &str) -> Option<Overlay> {
    let label = label_for(id);
    h.app.get_webview_window(&label)?;
    lock(reg()).get(&label).cloned()
}

pub fn window_bounds(h: &Host, id: &str) -> Option<Rect> {
    h.app.get_webview_window(&label_for(id)).and_then(|w| wins::bounds(&w))
}

pub fn set_window_bounds(h: &Host, id: &str, b: Rect) {
    if let Some(w) = h.app.get_webview_window(&label_for(id)) {
        wins::set_bounds(&w, b);
    }
}

/// `descallHud.action(type, payload)` from an overlay page.
pub fn on_action(h: &Host, label: &str, kind: &str, payload: Value) {
    if !ACTIONS.contains(&kind) {
        return;
    }
    let Some(o) = lock(reg()).get(label).cloned() else { return };
    if kind == "ready" {
        if let Some(last) = o.last.clone() {
            let _ = h.app.emit_to(label, "descall:hud:state", last);
        }
        return;
    }
    super::features::on_overlay(h, o.owner, &o.id, kind, &payload);
}

/// A drag ended: tell the owner (widgets report the new position to the renderer).
pub fn on_moved(h: &Host, label: &str) {
    let Some(o) = lock(reg()).get(label).cloned() else { return };
    let Some(b) = h.app.get_webview_window(label).and_then(|w| wins::bounds(&w)) else { return };
    super::features::on_overlay(h, o.owner, &o.id, "moved", &b.to_json());
}
