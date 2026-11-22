//! The tray popover window (Draft A "Tepsi paneli") and its commands. One frameless,
//! always-on-top window ("popover") that is the card itself: Windows 11 rounds its corners
//! and draws the shadow, Acrylic sits behind the page's dark glass. It opens in the corner of
//! the work area on the taskbar's side (descall_node::placement), takes the height the page
//! reports, and hides on blur or Esc.
//!
//! Commands check the window label. Setup values go in through `node_setup_save` (validated,
//! sealed with DPAPI) and never come back: the page only sees "set" / "not set". The rest of
//! the backend environment comes from the primary (POST /api/node/bootstrap) when the setup
//! is saved for the first time or with a new key, and again on "Ayarları sunucudan yenile"
//! (`node_setup_refresh`); the answer goes straight into the DPAPI store, never to the page
//! or a log line (counts and status codes only).

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use descall_node::{bootstrap, secrets};
use descall_node::placement::{self, Rect};
use serde_json::{json, Map, Value};
use tauri::utils::config::WindowEffectsConfig;
use tauri::window::{Effect, EffectState};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::runner::{Msg, Shared};
use crate::logger::now_ms;

pub const LABEL: &str = "popover";
const INITIAL_HEIGHT: f64 = 540.0;
/// The click on the tray icon that blurred the popover closes it, not reopens it.
const REOPEN_GUARD_MS: u64 = 300;

static HIDDEN_AT: AtomicU64 = AtomicU64::new(0);
/// Blur closes the popover only after it had the focus (no close while it is still opening).
static HAD_FOCUS: AtomicBool = AtomicBool::new(false);
static ANCHOR: Mutex<Option<Rect>> = Mutex::new(None);
static HEIGHT: Mutex<f64> = Mutex::new(INITIAL_HEIGHT);

pub fn window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(LABEL)
}

pub fn visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    window(app).is_some_and(|w| w.is_visible().unwrap_or(false))
}

fn ensure(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = window(app) {
        return Some(w);
    }
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Descall Node")
        .inner_size(placement::WIDTH, INITIAL_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .focused(true)
        .effects(WindowEffectsConfig { effects: vec![Effect::Acrylic], state: Some(EffectState::Active), radius: None, color: Some(tauri::window::Color(22, 27, 42, 200)), interactive: false })
        .on_navigation(|url| url.path().ends_with("/index.html") || url.path() == "/")
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build();
    match built {
        Ok(w) => {
            crate::sys::round_corners(&w);
            let app2 = app.clone();
            w.on_window_event(move |e| match e {
                WindowEvent::Focused(true) => HAD_FOCUS.store(true, Ordering::Relaxed),
                WindowEvent::Focused(false) if HAD_FOCUS.swap(false, Ordering::Relaxed) => hide(&app2),
                _ => {}
            });
            Some(w)
        }
        Err(e) => {
            log::warn!("[popover] window failed: {e}");
            None
        }
    }
}

fn place(app: &AppHandle, w: &WebviewWindow) {
    let anchor = *ANCHOR.lock().unwrap();
    let tray = anchor.unwrap_or(Rect::new(100_000.0, 100_000.0, 1.0, 1.0));
    let monitor = app.monitor_from_point(tray.x + tray.w / 2.0, tray.y + tray.h / 2.0).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let (work, scale) = match &monitor {
        Some(m) => {
            let wa = m.work_area();
            (Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64), m.scale_factor())
        }
        None => (Rect::new(0.0, 0.0, 1920.0, 1040.0), 1.0),
    };
    let tray = if anchor.is_some() { tray } else { Rect::new(work.x + work.w - 40.0, work.y + work.h + 4.0, 24.0, 24.0) };
    let h = *HEIGHT.lock().unwrap();
    let p = placement::place(tray, work, scale, placement::WIDTH, h);
    // Position, size, position: moving between monitors of different scale rescales in between.
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
    let _ = w.set_size(PhysicalSize::new(p.w, p.h));
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
}

/// Left click on the tray icon (physical rect of the icon when known).
pub fn toggle(app: &AppHandle, icon: Option<Rect>) {
    if visible(app) {
        hide(app);
        return;
    }
    if now_ms().saturating_sub(HIDDEN_AT.load(Ordering::Relaxed)) < REOPEN_GUARD_MS {
        return;
    }
    show(app, icon);
}

/// Off the UI thread: building the webview from a tray / menu / single-instance callback on
/// the UI thread can deadlock on Windows (same rule as the desktop app's tray panel).
pub fn show_async(app: &AppHandle, icon: Option<Rect>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { show(&app, icon) });
}

pub fn toggle_async(app: &AppHandle, icon: Option<Rect>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { toggle(&app, icon) });
}

pub fn show(app: &AppHandle, icon: Option<Rect>) {
    if let Some(r) = icon.filter(|r| r.w > 0.0 && r.h > 0.0) {
        *ANCHOR.lock().unwrap() = Some(r);
    }
    let Some(w) = ensure(app) else { return };
    place(app, &w);
    HAD_FOCUS.store(false, Ordering::Relaxed);
    let _ = w.set_always_on_top(true);
    let _ = w.show();
    let _ = w.set_focus();
    if let Some(s) = app.try_state::<Arc<Shared>>() {
        s.send(Msg::Publish);
    }
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = window(app) {
        if w.is_visible().unwrap_or(false) {
            HIDDEN_AT.store(now_ms(), Ordering::Relaxed);
            let _ = w.hide();
        }
    }
}

// ---- commands -----------------------------------------------------------------------------

fn mine(w: &WebviewWindow) -> Result<(), String> {
    if w.label() == LABEL {
        Ok(())
    } else {
        Err("E_UNTRUSTED_SENDER".into())
    }
}

#[tauri::command]
pub fn node_state(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>) -> Result<Value, String> {
    mine(&window)?;
    let mut s = shared.state.lock().map(|g| g.clone()).unwrap_or(Value::Null);
    if let Some(o) = s.as_object_mut() {
        if o.get("view").and_then(|v| v.get("needsSetup")).and_then(Value::as_bool) == Some(true) {
            o.insert("openView".into(), json!("setup"));
        }
    }
    Ok(s)
}

#[tauri::command]
pub fn node_act(app: AppHandle, window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>, action: String) -> Result<(), String> {
    mine(&window)?;
    match action.as_str() {
        "close" => hide(&app),
        "pause" | "resume" | "drain" | "retry" | "admin" | "openLogs" | "quit" => shared.send(Msg::Act(action)),
        other => log::warn!("[popover] refused action {}", other.chars().take(24).collect::<String>()),
    }
    Ok(())
}

#[tauri::command]
pub fn node_cfg(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>, patch: Value) -> Result<(), String> {
    mine(&window)?;
    match descall_node::cfg::popover_patch(&patch) {
        Some(p) => {
            shared.send(Msg::Cfg(p));
            Ok(())
        }
        None => Err("E_BAD_PATCH".into()),
    }
}

/// Fetch the primary's environment with the node key. The answer never reaches a log line:
/// only the number of variables or the status and the i18n error key.
async fn fetch_bootstrap(shared: &Shared, primary: &str, key: &str) -> Result<BTreeMap<String, String>, &'static str> {
    let id = shared.beat.lock().map(|b| b.id.clone()).unwrap_or_default();
    let id = if id.is_empty() { crate::settings::Settings::load().node_id() } else { id };
    let body = bootstrap::request_body(&id, descall_node::SERVICE_VERSION);
    let (status, reply) = crate::net::primary_post_with(primary, bootstrap::PATH, key, &body, Duration::from_secs(25)).await;
    let out = bootstrap::parse_reply(status, &reply);
    drop(reply);
    match &out {
        Ok(env) => log::info!("[setup] settings from the primary: {} variables", env.len()),
        Err(code) => log::warn!("[setup] settings from the primary refused: HTTP {status} ({code})"),
    }
    out
}

/// Does the stored setup plus `overlay` still lack a backend variable the primary should
/// have given (Supabase, JWT)?
fn incomplete_after(env: &BTreeMap<String, String>, overlay: &[(&'static str, String)]) -> bool {
    let env_json = bootstrap::to_json(env);
    let get = |id: &str| -> Option<String> {
        if id == "bootstrapEnv" {
            return Some(env_json.clone());
        }
        match overlay.iter().find(|(k, _)| *k == id) {
            Some((_, v)) if v.is_empty() => None,
            Some((_, v)) => Some(v.clone()),
            None => crate::store::get(id),
        }
    };
    let ids: Vec<&str> = secrets::REQUIRED_ENV.iter().map(|(_, id)| *id).collect();
    secrets::missing(&get).iter().any(|id| ids.contains(id))
}

/// Validate every given value first; store only when all are valid. `""` clears a field.
/// On the first save (no environment from the primary yet), or when the node key or the
/// primary URL changes, the primary's environment is fetched first; nothing is stored when
/// that fails. `skipBootstrap` (the advanced switch) uses only what was typed by hand.
#[tauri::command]
pub async fn node_setup_save(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>, values: Map<String, Value>, skip_bootstrap: Option<bool>) -> Result<Value, String> {
    mine(&window)?;
    let mut ok_values: Vec<(&'static str, String)> = Vec::new();
    let mut errors = Map::new();
    for (id, v) in &values {
        let Some(f) = secrets::field(id).filter(|f| secrets::page_writable(f.id)) else {
            errors.insert(id.chars().take(32).collect(), json!("setup.err.unknown"));
            continue;
        };
        let raw = v.as_str().unwrap_or_default();
        match secrets::validate(f.id, raw) {
            Ok(clean) => ok_values.push((f.id, clean)),
            Err(key) => {
                errors.insert(f.id.into(), json!(key));
            }
        }
    }
    // A required field may not be cleared.
    for (id, v) in &ok_values {
        if v.is_empty() && secrets::field(id).is_some_and(|f| f.required) {
            errors.insert((*id).into(), json!("setup.err.required"));
        }
    }
    if !errors.is_empty() {
        return Ok(json!({ "ok": false, "errors": errors }));
    }
    let typed = |id: &str| ok_values.iter().find(|(k, _)| *k == id).map(|(_, v)| v.clone()).filter(|v| !v.is_empty());
    let primary = typed("primaryUrl").or_else(|| crate::store::get("primaryUrl"));
    let key = typed("nodeKey").or_else(|| crate::store::get("nodeKey"));
    let changed = ["primaryUrl", "nodeKey"].iter().any(|id| typed(id).is_some_and(|v| Some(v) != crate::store::get(id)));
    let skip = skip_bootstrap.unwrap_or(false);
    let mut fetched: Option<BTreeMap<String, String>> = None;
    if !skip && (crate::store::get("bootstrapEnv").is_none() || changed) {
        let (Some(primary), Some(key)) = (primary, key) else {
            return Ok(json!({ "ok": false, "error": "setup.err.bootstrapNeeds" }));
        };
        match fetch_bootstrap(&shared, &primary, &key).await {
            Ok(env) => {
                if incomplete_after(&env, &ok_values) {
                    return Ok(json!({ "ok": false, "error": "setup.err.bootstrapIncomplete" }));
                }
                fetched = Some(env);
            }
            Err(code) => return Ok(json!({ "ok": false, "error": code })),
        }
    }
    for (id, v) in &ok_values {
        if !crate::store::set(id, v) {
            return Ok(json!({ "ok": false, "error": "setup.err.store" }));
        }
    }
    let count = fetched.as_ref().map(|e| e.len());
    if let Some(env) = &fetched {
        if !crate::store::set("bootstrapEnv", &bootstrap::to_json(env)) {
            return Ok(json!({ "ok": false, "error": "setup.err.store" }));
        }
    } else if skip {
        crate::store::set("bootstrapEnv", "");
    }
    // Names only: values never reach the log.
    let names: Vec<&str> = ok_values.iter().map(|(id, _)| *id).collect();
    log::info!("[setup] saved: {}{}", names.join(", "), if count.is_some() { " + the primary's environment" } else { "" });
    shared.send(Msg::BootstrapInfo { at: count.map(|_| now_ms()), skip });
    shared.send(Msg::SetupChanged);
    Ok(json!({ "ok": true, "fetched": count }))
}

#[tauri::command]
pub fn node_setup_wipe(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>) -> Result<(), String> {
    mine(&window)?;
    shared.send(Msg::Wipe);
    Ok(())
}

/// "Ayarları sunucudan yenile": fetch the primary's environment again with the stored key
/// (the key's setup window must be open) and restart the node with it.
#[tauri::command]
pub async fn node_setup_refresh(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>) -> Result<Value, String> {
    mine(&window)?;
    let (Some(primary), Some(key)) = (crate::store::get("primaryUrl"), crate::store::get("nodeKey")) else {
        return Ok(json!({ "ok": false, "error": "setup.err.bootstrapNeeds" }));
    };
    let env = match fetch_bootstrap(&shared, &primary, &key).await {
        Ok(env) => env,
        Err(code) => return Ok(json!({ "ok": false, "error": code })),
    };
    if incomplete_after(&env, &[]) {
        return Ok(json!({ "ok": false, "error": "setup.err.bootstrapIncomplete" }));
    }
    if !crate::store::set("bootstrapEnv", &bootstrap::to_json(&env)) {
        return Ok(json!({ "ok": false, "error": "setup.err.store" }));
    }
    shared.send(Msg::BootstrapInfo { at: Some(now_ms()), skip: false });
    shared.send(Msg::SetupChanged);
    Ok(json!({ "ok": true, "fetched": env.len() }))
}

#[tauri::command]
pub fn node_autostart(window: WebviewWindow, shared: tauri::State<'_, Arc<Shared>>, on: bool) -> Result<bool, String> {
    mine(&window)?;
    let ok = crate::sys::set_autostart(on);
    log::info!("[app] start with Windows: {on} ({})", if ok { "saved" } else { "failed" });
    shared.send(Msg::Publish);
    Ok(ok)
}

#[tauri::command]
pub fn node_logs(window: WebviewWindow) -> Result<Vec<String>, String> {
    mine(&window)?;
    Ok(crate::logger::tail(200))
}

#[tauri::command]
pub fn node_resize(app: AppHandle, window: WebviewWindow, height: f64) -> Result<(), String> {
    mine(&window)?;
    if !height.is_finite() {
        return Err("E_BAD_HEIGHT".into());
    }
    let h = height.clamp(200.0, 900.0);
    let changed = {
        let mut g = HEIGHT.lock().unwrap();
        let c = (*g - h).abs() >= 1.0;
        *g = h;
        c
    };
    if changed {
        place(&app, &window);
    }
    Ok(())
}
