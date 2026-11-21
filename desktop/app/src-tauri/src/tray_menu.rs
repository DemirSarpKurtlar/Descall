//! Tray panel window (owner pick, draft B "Gelismis menu"), the Tauri side of
//! frontend/electron/trayMenuWindow.cjs. Right click on the tray icon opens a frameless,
//! transparent, always-on-top window above the icon (frontend/dist/tray-menu/tray-menu.html)
//! inside the work area of the icon's monitor; it closes on blur, Esc or after an action.
//!
//! The page talks through tray-menu-shim.js (getState / onState / act) and has its own
//! capability (capabilities/tray-menu.json: event listen only). Every action is checked
//! with descall_shell::tray_panel::validate_action and the window label. The window is
//! shown only after the page acknowledged the state it was given; a page that fails to
//! load, crashes or never answers pops the old native menu instead (tray::popup_native)
//! and right click keeps using it for ten minutes. Rules and placement math live in
//! descall_shell::tray_panel (unit-tested on any host).

use std::sync::Mutex;
use std::time::Duration;

use descall_shell::tray_panel::{self as model, Arg, Kind, Placement, Rect, PANEL};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::state::{self, now_ms, to_main};

pub const LABEL: &str = "tray-menu";
const SHIM: &str = include_str!("../../shim/tray-menu-shim.js");
const PAGE: &str = "tray-menu/tray-menu.html";
const ACK_WARM_MS: u64 = 1500;
const ACK_COLD_MS: u64 = 6000;
const NATIVE_AFTER_FAIL_MS: u64 = 10 * 60 * 1000;
const IDLE_DESTROY_MS: u64 = 5 * 60 * 1000;
/// The click on the tray icon that blurred the panel must close it, not reopen it.
const REOPEN_GUARD_MS: u64 = 300;
const SNOOZE_FILE: &str = "notification-snooze.json";

#[derive(Default)]
pub struct TrayMenu {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Latest state from the main page (normalised).
    app_state: Option<Value>,
    snooze_until: u64,
    seq: u64,
    open_seq: u64,
    /// The state seq the page has to acknowledge before the window shows.
    pending: Option<u64>,
    failed_until: u64,
    had_focus: bool,
    hidden_at: u64,
    idle_gen: u64,
    placement: Option<Placement>,
    premium_ids: Vec<String>,
    last_state: Option<Value>,
}

fn tm<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, TrayMenu> {
    app.state::<TrayMenu>()
}

fn window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(LABEL)
}

fn visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    window(app).is_some_and(|w| w.is_visible().unwrap_or(false))
}

// ---- notification snooze --------------------------------------------------------------------

/// Boot: the saved snooze (same file name and shape as Electron's).
pub fn load_snooze<R: Runtime>(app: &AppHandle<R>) {
    let until = state::data_dir(app).and_then(|d| std::fs::read_to_string(d.join(SNOOZE_FILE)).ok()).map(|t| model::parse_snooze_file(&t, now_ms())).unwrap_or(0);
    tm(app).inner.lock().unwrap().snooze_until = until;
}

fn set_snooze<R: Runtime>(app: &AppHandle<R>, minutes: u64) {
    let until = model::snooze_until_for(minutes, now_ms());
    tm(app).inner.lock().unwrap().snooze_until = until;
    if let Some(d) = state::data_dir(app) {
        let path = d.join(SNOOZE_FILE);
        let r = if until > 0 { std::fs::write(&path, model::snooze_file_json(until)) } else { std::fs::remove_file(&path).or(Ok(())) };
        if let Err(e) = r {
            log::warn!("[tray-menu] snooze not saved: {e}");
        }
    }
    log::info!("[tray-menu] notifications {}", if until > 0 { "muted" } else { "on" });
}

/// notification_show: drop a desktop card while the snooze runs (calls still ring).
pub fn suppress_notification<R: Runtime>(app: &AppHandle<R>, options: &Value) -> bool {
    let until = tm(app).inner.lock().unwrap().snooze_until;
    model::suppress_notification(options, until, now_ms())
}

// ---- state ------------------------------------------------------------------------------------

fn build_state<R: Runtime>(app: &AppHandle<R>) -> Value {
    let locale = state::locale(app);
    let all = descall_shell::i18n::namespace_for_all("tray");
    let strings = all.get(&locale).or_else(|| all.get("en")).cloned().unwrap_or(Value::Null);
    let (premium, ids) = crate::premium::logic::tray::panel_items(&crate::premium::tray::items());
    let sh = tm(app);
    let mut i = sh.inner.lock().unwrap();
    i.premium_ids = ids;
    i.seq += 1;
    let placement = i.placement.unwrap_or(model::place_panel(Rect::new(0.0, 0.0, 1.0, 1.0), Rect::new(0.0, 0.0, 1920.0, 1080.0), 1.0, &PANEL));
    let snooze = model::active_snooze(i.snooze_until, now_ms());
    let app_state = i.app_state.clone().unwrap_or_else(|| model::normalize_app_state(&Value::Null));
    let s = json!({
        "seq": i.seq,
        "openSeq": i.open_seq,
        "lang": locale,
        "strings": strings,
        "app": app_state,
        "shell": {
            "version": app.package_info().version.to_string(),
            "updateVersion": crate::commands::updates::ready_version(app).unwrap_or_default(),
            "autostart": crate::platform::autostart_enabled(),
            "autostartKey": "startWithWindows",
            "snoozeUntil": snooze,
        },
        "premium": premium,
        "placement": placement.page_json(&PANEL),
    });
    i.last_state = Some(s.clone());
    s
}

fn send<R: Runtime>(app: &AppHandle<R>, s: &Value) {
    let _ = app.emit_to(LABEL, "tray-menu:state", s.clone());
}

/// Something the panel shows changed (page state, update, language, Descall+ entries).
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let opening = tm(app).inner.lock().unwrap().pending.is_some();
    if visible(app) || opening {
        let s = build_state(app);
        send(app, &s);
    }
}

// ---- window -----------------------------------------------------------------------------------

fn ensure<R: Runtime>(app: &AppHandle<R>) -> Option<(WebviewWindow<R>, bool)> {
    if let Some(w) = window(app) {
        return Some((w, false));
    }
    let w_px = PANEL.pad * 2.0 + PANEL.card + PANEL.gap + PANEL.flyout;
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(PAGE.into()))
        .title("Descall")
        .inner_size(w_px, PANEL.max_height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .focused(true)
        .use_https_scheme(true) // same origin rules as the main window (https://tauri.localhost)
        .additional_browser_args(crate::BROWSER_ARGS)
        .initialization_script(SHIM)
        .on_navigation(|url| url.path().ends_with("/tray-menu/tray-menu.html") && crate::boot::is_app_url(url))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build();
    match built {
        Ok(w) => {
            let app2 = app.clone();
            w.on_window_event(move |e| match e {
                WindowEvent::Focused(true) => tm(&app2).inner.lock().unwrap().had_focus = true,
                WindowEvent::Focused(false) => {
                    let had = std::mem::take(&mut tm(&app2).inner.lock().unwrap().had_focus);
                    if had {
                        hide(&app2, "blur");
                    }
                }
                _ => {}
            });
            Some((w, true))
        }
        Err(e) => {
            log::warn!("[tray-menu] window failed: {e}");
            None
        }
    }
}

fn destroy<R: Runtime>(app: &AppHandle<R>) {
    tm(app).inner.lock().unwrap().pending = None;
    if let Some(w) = window(app) {
        let _ = w.destroy();
    }
}

fn hide<R: Runtime>(app: &AppHandle<R>, why: &str) {
    let gen = {
        let sh = tm(app);
        let mut i = sh.inner.lock().unwrap();
        i.pending = None;
        i.had_focus = false;
        i.idle_gen += 1;
        i.idle_gen
    };
    let Some(w) = window(app) else { return };
    if w.is_visible().unwrap_or(false) {
        tm(app).inner.lock().unwrap().hidden_at = now_ms();
        let _ = w.hide();
        if why != "blur" {
            log::info!("[tray-menu] closed ({why})");
        }
    }
    // Free the renderer after a few idle minutes.
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(IDLE_DESTROY_MS)).await;
        let idle = {
            let sh = tm(&app2);
            let i = sh.inner.lock().unwrap();
            i.idle_gen == gen && i.pending.is_none()
        };
        if idle && !visible(&app2) {
            destroy(&app2);
        }
    });
}

/// The page failed to load, crashed or never answered: the native menu takes over.
fn fail<R: Runtime>(app: &AppHandle<R>, reason: &str) {
    log::warn!("[tray-menu] panel failed ({reason}), native menu for now");
    tm(app).inner.lock().unwrap().failed_until = now_ms() + NATIVE_AFTER_FAIL_MS;
    destroy(app);
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || crate::tray::popup_native(&app2));
}

fn reveal<R: Runtime>(app: &AppHandle<R>) {
    tm(app).inner.lock().unwrap().pending = None;
    let Some(w) = window(app) else { return };
    let _ = w.set_always_on_top(true);
    let _ = w.show();
    let _ = w.set_focus();
}

/// Right click on the tray icon (physical rect of the icon, cursor as fallback). Runs off
/// the UI thread (it may create the webview). False: use the native menu instead.
pub fn open<R: Runtime>(app: &AppHandle<R>, icon: Option<Rect>, cursor: (f64, f64)) -> bool {
    let now = now_ms();
    {
        let sh = tm(app);
        let i = sh.inner.lock().unwrap();
        if now < i.failed_until {
            return false;
        }
        if i.pending.is_some() {
            drop(i);
            hide(app, "toggle");
            return true;
        }
        if now.saturating_sub(i.hidden_at) < REOPEN_GUARD_MS {
            return true;
        }
    }
    if visible(app) {
        hide(app, "toggle");
        return true;
    }
    let tray = icon.filter(|r| r.width > 0.0 && r.height > 0.0).unwrap_or(Rect::new(cursor.0, cursor.1, 1.0, 1.0));
    let (cx, cy) = (tray.x + tray.width / 2.0, tray.y + tray.height / 2.0);
    let monitor = app.monitor_from_point(cx, cy).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let (work, scale) = match &monitor {
        Some(m) => {
            let wa = m.work_area();
            (Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64), m.scale_factor())
        }
        None => (Rect::new(0.0, 0.0, 1920.0, 1040.0), 1.0),
    };
    let p = model::place_panel(tray, work, scale, &PANEL);
    let Some((w, cold)) = ensure(app) else {
        tm(app).inner.lock().unwrap().failed_until = now + NATIVE_AFTER_FAIL_MS;
        return false;
    };
    // Position first, then size, then position again: moving to a monitor with another
    // scale makes Windows rescale the window in between.
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
    let _ = w.set_size(PhysicalSize::new(p.width, p.height));
    let _ = w.set_position(PhysicalPosition::new(p.x, p.y));
    {
        let sh = tm(app);
        let mut i = sh.inner.lock().unwrap();
        i.placement = Some(p);
        i.open_seq += 1;
        i.had_focus = false;
        i.idle_gen += 1;
    }
    let s = build_state(app);
    let seq = s["seq"].as_u64().unwrap_or(0);
    tm(app).inner.lock().unwrap().pending = Some(seq);
    send(app, &s);
    let app2 = app.clone();
    let wait = if cold { ACK_COLD_MS } else { ACK_WARM_MS };
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(wait)).await;
        let stuck = tm(&app2).inner.lock().unwrap().pending.is_some_and(|p| p <= seq);
        if stuck {
            fail(&app2, "no answer from the page");
        }
    });
    true
}

/// Load the page ahead of the first right click (pointer over the tray icon).
pub fn warm<R: Runtime>(app: &AppHandle<R>) {
    if now_ms() < tm(app).inner.lock().unwrap().failed_until || window(app).is_some() {
        return;
    }
    if ensure(app).is_some() {
        hide(app, "warm");
    }
}

/// Left click / double click: the panel goes away when Descall opens.
pub fn close<R: Runtime>(app: &AppHandle<R>) {
    if visible(app) || tm(app).inner.lock().unwrap().pending.is_some() {
        hide(app, "tray-click");
    }
}

// ---- actions ----------------------------------------------------------------------------------

fn run<R: Runtime>(app: &AppHandle<R>, a: model::Action) {
    if a.kind == Kind::App {
        // These open something in the window (DM list, requests, the clip editor).
        if matches!(a.action, "openDms" | "openRequests" | "clip") {
            state::show_main(app);
        }
        to_main(app, "tray:action", json!({ "action": a.action, "arg": a.arg_json() }));
        return;
    }
    match a.action {
        "open" => state::show_main(app),
        "settings" => {
            state::show_main(app);
            to_main(app, "tray:action", json!({ "action": "openSettings", "arg": null }));
        }
        "autostart" => {
            crate::platform::set_autostart(!crate::platform::autostart_enabled());
            crate::tray::rebuild(app);
        }
        "snooze" => {
            if let Arg::Minutes(m) = a.arg {
                set_snooze(app, m);
            }
            crate::tray::rebuild(app);
        }
        "quit" | "update" => crate::tray::quit(app),
        _ => {}
    }
}

/// electronAPI.setTrayState(state) from the main page (src/lib/desktopTray.js).
#[tauri::command]
pub fn tray_set_state<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, state: Value) {
    if window.label() != state::MAIN {
        return;
    }
    let next = model::normalize_app_state(&state);
    let unread = next.get("signedIn").and_then(Value::as_bool) == Some(true) && next.get("unreadMessages").and_then(Value::as_u64).unwrap_or(0) > 0;
    crate::tray::set_unread(&app, unread);
    {
        let sh = tm(&app);
        let mut i = sh.inner.lock().unwrap();
        if i.app_state.as_ref() == Some(&next) {
            return;
        }
        i.app_state = Some(next);
    }
    refresh(&app);
}

/// trayMenuAPI.getState() from the panel page.
#[tauri::command]
pub fn tray_menu_state<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<Value, String> {
    if window.label() != LABEL {
        return Err("E_UNTRUSTED_SENDER".into());
    }
    let last = tm(&app).inner.lock().unwrap().last_state.clone();
    Ok(last.unwrap_or_else(|| build_state(&app)))
}

/// trayMenuAPI.act(action, arg) from the panel page.
#[tauri::command]
pub fn tray_menu_act<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, action: String, arg: Option<Value>) {
    if window.label() != LABEL {
        return;
    }
    let ids = tm(&app).inner.lock().unwrap().premium_ids.clone();
    let Some(a) = model::validate_action(&action, &arg.unwrap_or(Value::Null), &ids) else {
        log::warn!("[tray-menu] refused action: {}", action.chars().take(32).collect::<String>());
        return;
    };
    match (a.action, &a.arg) {
        ("ack", Arg::Seq(seq)) => {
            let ok = tm(&app).inner.lock().unwrap().pending.is_some_and(|p| *seq >= p);
            if ok {
                reveal(&app);
            }
        }
        ("close", _) => hide(&app, "close"),
        ("premium", Arg::Id(id)) => {
            hide(&app, "premium");
            crate::premium::tray::on_menu_event(id);
        }
        _ => {
            if a.closes {
                hide(&app, a.action);
            }
            run(&app, a);
        }
    }
}
