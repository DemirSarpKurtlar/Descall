//! Always-on-top voice overlay (electron/overlayWindow.cjs): a transparent, frameless card in
//! the top-right corner of the primary work area with mute / deafen / leave. The card is
//! overlayHtml.cjs, served by descall-shell://localhost/overlay.html.
//!
//! Electron showed the card with showInactive(). Tauri has no inactive show: show() on a
//! hidden window is ShowWindow(SW_SHOW), which activates it and takes the focus away from
//! Descall's own window (joining a call) or from a full-screen game. So every overlay window
//! is born visible and unfocused (tao shows it with SW_SHOWNOACTIVATE) and is never hidden
//! and shown again: hiding destroys it, the next call gets a new window ("overlay-<n>", so a
//! window that is still being destroyed never answers for the new one). A position the user
//! dragged the card to is kept for 60 s, like Electron's idle window.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::{self, to_main};

/// Window labels are `overlay-<n>` (capabilities/default.json lists `overlay-*`).
pub const LABEL_PREFIX: &str = "overlay-";
const CARD_W: f64 = 280.0;
const CARD_H: f64 = 104.0;
const PAD: f64 = 14.0;
const WIDTH: f64 = CARD_W + PAD * 2.0;
const HEIGHT: f64 = CARD_H + PAD * 2.0 + 4.0;
const MARGIN: f64 = 16.0;
/// Electron kept a hidden overlay (and where it was dragged) for 60 s.
const KEEP_POSITION: Duration = Duration::from_secs(60);

#[derive(Default)]
struct Live {
    /// Label of the current overlay window and whether its page has loaded.
    window: Option<(String, bool)>,
    next: u64,
    /// Logical position of the last overlay (it can be dragged) and when it closed.
    last_pos: Option<(f64, f64, Instant)>,
}

pub struct Overlay {
    state: Mutex<Map<String, Value>>,
    live: Mutex<Live>,
}

impl Default for Overlay {
    fn default() -> Self {
        let v = json!({ "title": "", "muted": false, "deafened": false, "connected": false, "pending": false, "kind": "dm", "since": 0, "lang": "en", "avatarUrl": "", "brandRgb": "" });
        Overlay { state: Mutex::new(v.as_object().cloned().unwrap_or_default()), live: Mutex::new(Live::default()) }
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

/// The current overlay window and whether its page has loaded.
fn current<R: Runtime>(app: &AppHandle<R>) -> Option<(WebviewWindow<R>, bool)> {
    let (label, loaded) = app.state::<Overlay>().live.lock().unwrap().window.clone()?;
    app.get_webview_window(&label).map(|w| (w, loaded))
}

fn push<R: Runtime>(app: &AppHandle<R>) {
    let Some((w, true)) = current(app) else { return };
    let js = format!("window.__overlayUpdate && window.__overlayUpdate({});", Value::Object(app.state::<Overlay>().state.lock().unwrap().clone()));
    let _ = w.eval(&js);
}

pub fn is_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    current(app).is_some()
}

fn default_position<R: Runtime>(app: &AppHandle<R>) -> (f64, f64) {
    match app.primary_monitor().ok().flatten() {
        Some(m) => {
            let s = m.scale_factor();
            let wa = m.work_area();
            let (wx, wy, ww) = (wa.position.x as f64 / s, wa.position.y as f64 / s, wa.size.width as f64 / s);
            // The window carries a transparent shadow margin; keep the card itself 16 px in.
            ((wx + ww - WIDTH - MARGIN + PAD).max(wx), (wy + MARGIN - PAD).max(wy))
        }
        None => (100.0, 100.0),
    }
}

/// Create the overlay window when there is none (or one is being built). Born visible: see
/// the module comment. Built off the UI thread: overlay_show is a synchronous command (UI
/// thread, inside WebView2's IPC callback) and building a webview window there deadlocks on
/// Windows (Tauri's documented WebView2 issue), so joining a call froze the app. The label is
/// claimed here, in command order; a window whose label was dropped while it was being built
/// (the call ended) is destroyed as soon as it exists.
fn ensure<R: Runtime>(app: &AppHandle<R>) {
    let (label, kept) = {
        let o = app.state::<Overlay>();
        let mut live = o.live.lock().unwrap();
        if live.window.is_some() {
            return;
        }
        live.next += 1;
        let label = format!("{LABEL_PREFIX}{}", live.next);
        live.window = Some((label.clone(), false));
        let kept = live.last_pos.filter(|p| p.2.elapsed() < KEEP_POSITION).map(|p| (p.0, p.1));
        (label, kept)
    };
    let (x, y) = kept.unwrap_or_else(|| default_position(app));
    let locale = state::locale(app);
    let app_build = app.clone();
    let app_load = app.clone();
    let mine = label.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let built = WebviewWindowBuilder::new(&app_build, &label, WebviewUrl::CustomProtocol(crate::shell_url("overlay.html")))
            .devtools(crate::webview::devtools_allowed(&app_build)) // support opt-in only (webview.rs)
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
            // Shown without activation (SW_SHOWNOACTIVATE); the page is transparent until drawn.
            .focused(false)
            // tao drops the "don't focus" marker after creation, so the card could still be
            // activated later and take the keyboard (or a game's foreground) away. Not
            // activatable (WS_EX_NOACTIVATE); clicks still work, as on the capsules (T7).
            .focusable(false)
            .visible(true)
            .use_https_scheme(true)
            .additional_browser_args(crate::BROWSER_ARGS)
            .initialization_script(format!("window.__DESCALL_OVERLAY__ = {};", json!({ "locale": locale })))
            .on_navigation(|u| descall_shell::ipc_policy::is_shell_page(u.as_str()))
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_page_load(move |_w, p| {
                if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                    {
                        let o = app_load.state::<Overlay>();
                        let mut live = o.live.lock().unwrap();
                        match live.window.as_mut() {
                            Some((l, loaded)) if l.as_str() == mine.as_str() => *loaded = true,
                            _ => return,
                        }
                    }
                    push(&app_load);
                }
            })
            .build();
        let o = app_build.state::<Overlay>();
        let mut live = o.live.lock().unwrap();
        let still = live.window.as_ref().is_some_and(|(l, _)| l.as_str() == label.as_str());
        match built {
            Ok(w) if !still => {
                drop(live);
                let _ = w.destroy();
            }
            Ok(_) => {}
            Err(e) => {
                log::warn!("[overlay] window failed: {e}");
                if still {
                    live.window = None;
                }
            }
        }
    });
}

/// The voice overlay follows the main window's call only. A Descall+ pop-out or extra-account
/// window runs the app too (useElectronOverlay); without this its idle call state hid or
/// overwrote the card of the call running in the main window.
fn from_main<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window.label() == state::MAIN
}

/// electronAPI.overlayShow(payload) -> descall:overlay:show. The overlay commands are async
/// (T7): a sync command runs inside WebView2's IPC callback on the UI thread, where building
/// (ensure) or destroying (overlay_hide) a webview deadlocks on Windows.
#[tauri::command]
pub async fn overlay_show<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, payload: Value) {
    if !from_main(&window) {
        return;
    }
    merge(&app, &payload, &[("connected", Value::Bool(true))]);
    ensure(&app);
    push(&app);
}

/// electronAPI.overlayUpdate(payload) -> descall:overlay:update (only while shown).
#[tauri::command]
pub async fn overlay_update<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, payload: Value) {
    if !from_main(&window) {
        return;
    }
    merge(&app, &payload, &[]);
    push(&app);
}

/// electronAPI.overlayHide() -> descall:overlay:hide. The window goes away (see the module
/// comment); where it was is remembered for the next one.
#[tauri::command]
pub async fn overlay_hide<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) {
    if !from_main(&window) {
        return;
    }
    merge(&app, &Value::Null, &[("connected", Value::Bool(false))]);
    let Some((w, _)) = current(&app) else {
        app.state::<Overlay>().live.lock().unwrap().window = None;
        return;
    };
    let pos = w.outer_position().ok().map(|p| {
        let s = w.scale_factor().unwrap_or(1.0);
        (p.x as f64 / s, p.y as f64 / s, Instant::now())
    });
    {
        let o = app.state::<Overlay>();
        let mut live = o.live.lock().unwrap();
        live.window = None;
        if pos.is_some() {
            live.last_pos = pos;
        }
    }
    let _ = w.destroy();
}

/// The UI language changed: relabel a visible overlay.
pub fn refresh_language<R: Runtime>(app: &AppHandle<R>) {
    merge(app, &Value::Null, &[]);
    push(app);
}

/// window.overlayAPI.action(type) from the overlay page -> descall:overlay:action to the app.
#[tauri::command]
pub fn overlay_action<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: String) {
    let mine = app.state::<Overlay>().live.lock().unwrap().window.as_ref().is_some_and(|(l, _)| l == window.label());
    if !mine || !matches!(action.as_str(), "mute" | "deafen" | "leave") {
        return;
    }
    to_main(&app, "descall:overlay:action", action);
}
