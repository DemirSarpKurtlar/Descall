//! First-start import from Electron, the boot script (sync values the old preload gave the
//! page through ipcRenderer.sendSync), cold-start visibility, window state, navigation guard,
//! window events, the paint watchdog and the migrator health signal.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WindowEvent};

use descall_migrate::app::ImportMarker;
use descall_migrate::handoff::Handoff;

pub struct Imported {
    pub local_storage: BTreeMap<String, String>,
    /// ImportMarker::import_id of the import this came from (`__DESCALL_BOOT__.importId`).
    pub id: String,
}

pub struct InitialWindow {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    /// Top-left corner in physical pixels (window-state.json px/py, written by this shell).
    /// Wins over x/y: a logical point is ambiguous across monitors with different scaling.
    pub physical: Option<(i32, i32)>,
    pub maximized: bool,
    pub min_width: f64,
    pub min_height: f64,
}

fn migration_dir(app: &AppHandle) -> Option<PathBuf> {
    let d = app.path().app_data_dir().ok()?.join("migration");
    std::fs::create_dir_all(&d).ok()?;
    Some(d)
}

/// DescallMigrator's work folder (`%LOCALAPPDATA%\Descall-Migration`): the sealed handoff
/// (owner-only ACL, CREATE_NEW) waits there as `handoff.bin`.
#[cfg(windows)]
fn migration_work_dir(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().local_data_dir().ok()?.join(descall_migrate::paths::WORK_DIR_NAME))
}

/// Electron userData (%APPDATA%\Descall): the fallback source when there is no handoff.
#[cfg(windows)]
fn electron_user_data(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().data_dir().ok()?.join(descall_migrate::paths::ELECTRON_USER_DATA))
}

/// Secret-store key of the session the migration health check signs in with.
#[cfg(windows)]
fn session_key(h: &Handoff) -> Option<String> {
    if h.token.is_some() {
        Some(crate::secure_store::TOKEN.to_string())
    } else {
        h.accounts.first().map(|a| format!("account-{}", a.id))
    }
}

/// One-time import of the Electron session and settings (once per install, and once per
/// migration: see descall_migrate::app::should_import). The handoff is unsealed, validated
/// and shredded by descall_migrate::import::take; its secrets go straight into the DPAPI
/// secret store and never touch the disk in clear.
fn import_from_electron_once(app: &AppHandle) -> Option<Imported> {
    let marker = migration_dir(app)?.join("imported");
    let migration_id = crate::migration::migration_id();
    let previous = std::fs::read(&marker).ok();
    if !descall_migrate::app::should_import(previous.as_deref(), migration_id) {
        if migration_id.is_some() {
            // A relaunch within the same migration: the handoff was taken on the first start.
            let m = descall_migrate::app::ImportMarker::parse(previous.as_deref().unwrap_or_default());
            crate::migration::note_import(crate::migration::Import::Imported { session_key: m.session_key });
        }
        return None;
    }
    let now = descall_migrate::unix_now();
    let mut record = ImportMarker { migration_id: migration_id.unwrap_or_default().to_string(), at_unix: now, ..Default::default() };
    let mut result = None;
    #[cfg(windows)]
    {
        use crate::migration::{note_import, Import};
        match migration_work_dir(app).map(|dir| descall_migrate::import::take(&dir, now, migration_id)) {
            Some(Ok(Some(h))) => {
                apply_handoff(app, &h);
                record.has_session = h.has_session();
                record.session_key = session_key(&h);
                note_import(Import::Imported { session_key: record.session_key.clone() });
                result = Some(Imported { local_storage: h.local_storage.clone(), id: record.import_id() });
            }
            Some(Ok(None)) | None => note_import(Import::Missing),
            Some(Err(e)) => {
                log::warn!("[migration] handoff refused: {e}");
                note_import(Import::Invalid);
            }
        }
        if result.is_none() {
            // Fallback: decrypt Electron's safeStorage file directly (oscrypt.rs). Settings in
            // localStorage are not recovered on this path (they default; the server profile
            // still has the account settings).
            if let Some(token) = electron_user_data(app).and_then(|ud| descall_migrate::import::electron_token_fallback(&ud)) {
                crate::secure_store::set(app, crate::secure_store::TOKEN, &token.0);
            }
        }
    }
    let _ = std::fs::write(marker, serde_json::to_vec(&record).unwrap_or_else(|_| b"1".to_vec()));
    result
}

struct PendingImport(std::sync::Mutex<Option<Imported>>);

/// Runs the one-time import during plugin setup: registered before the Descall+ plugin, so
/// its settings store (premium-settings.json, premium/*.json) opens on the imported files,
/// and before the app's own setup, so the UI locale is the imported one from the first frame.
pub fn import_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("descall-import")
        .setup(|app, _api| {
            let imported = import_from_electron_once(app);
            app.manage(PendingImport(std::sync::Mutex::new(imported)));
            Ok(())
        })
        .build()
}

/// The import result for the first boot script (taken once).
pub fn take_imported(app: &AppHandle) -> Option<Imported> {
    app.try_state::<PendingImport>().and_then(|p| p.0.lock().ok()?.take())
}

fn apply_handoff(app: &AppHandle, h: &Handoff) {
    use crate::secure_store::{set, APP_LOCK, TOKEN};
    if let Some(t) = &h.token {
        set(app, TOKEN, &t.0);
    }
    for a in &h.accounts {
        set(app, &format!("account-{}", a.id), &a.token.0);
    }
    if let Some(r) = &h.app_lock_record {
        set(app, APP_LOCK, &r.0);
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(dir.join("premium"));
        for (name, body) in &h.premium_files {
            // Descall+ settings in the layout src/premium reads (premium-settings.json and
            // premium/<n>.json); the bridge's names are mapped and checked by the crate.
            match descall_migrate::app::premium_file_target(name) {
                Some(rel) => {
                    let _ = std::fs::write(dir.join(rel), body);
                }
                None => log::warn!("[migration] premium file skipped: {name}"),
            }
        }
        // Each extra account's own saved settings, in that account's folder until its window
        // first opens (boot_script_for_premium_window); removed with the account. A file left
        // by an earlier migration goes first: an account without settings now writes none.
        for a in &h.accounts {
            if let Some(rel) = descall_migrate::app::account_local_storage_target(&a.id) {
                let _ = std::fs::remove_file(dir.join(rel));
            }
        }
        for (rel, body) in descall_migrate::app::account_local_storage_files(h) {
            let path = dir.join(rel);
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Err(e) = std::fs::write(&path, body) {
                log::warn!("[migration] account settings not written: {e}");
            }
        }
        if let Some(ws) = &h.window_state {
            let _ = std::fs::write(dir.join("window-state.json"), serde_json::to_vec(ws).unwrap_or_default());
        }
        if let Some(id) = h.locale.as_deref().and_then(|l| descall_shell::i18n::match_locale(l, false)) {
            let _ = std::fs::write(dir.join("ui-locale.json"), descall_shell::i18n::saved_locale_json(&id));
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Boot<'a> {
    version: String,
    platform: &'static str,
    token: Option<String>,
    reduced_transparency: bool,
    locale: String,
    mode: &'static str,
    import_local_storage: Option<&'a BTreeMap<String, String>>,
    import_id: Option<&'a str>,
}

/// window.__DESCALL_BOOT__: the values the Electron preload answered synchronously.
pub fn boot_script<R: Runtime>(app: &AppHandle<R>, imported: Option<&Imported>) -> String {
    boot_script_with(app, imported, "main")
}

/// Boot values for a secondary window (`mode` "admin" selects adminPreload behaviour).
pub fn boot_script_for<R: Runtime>(app: &AppHandle<R>, mode: &'static str) -> String {
    boot_script_with(app, None, mode)
}

/// Boot values for a Descall+ app window (premium::set_boot_script_provider): pop-outs run
/// as the owner; an extra-account window (`acct-<id>`) gets that account's own token, never
/// the owner's, and the settings the account had in Electron (applied once by the shim,
/// guarded by `__descall_import_v1` in the account's own WebView2 profile).
pub fn boot_script_for_premium_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> String {
    let (token_key, imported) = match label.strip_prefix("acct-") {
        Some(id) => (format!("account-{id}"), account_import(app, id)),
        None => (crate::secure_store::TOKEN.to_string(), None),
    };
    boot_script_token(app, imported.as_ref(), "main", crate::secure_store::get(app, &token_key))
}

/// The Electron settings of extra account `id` (written by the one-time import), if any.
fn account_import<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<Imported> {
    let rel = descall_migrate::app::account_local_storage_target(id)?;
    let dir = crate::state::data_dir(app)?;
    let bytes = std::fs::read(dir.join(rel)).ok()?;
    // Named after the import that wrote the file, so the account window applies a later
    // migration's settings too (the shim keeps one marker per import id).
    let marker = std::fs::read(dir.join("migration").join("imported")).ok();
    let import_id = ImportMarker::parse(marker.as_deref().unwrap_or_default()).import_id();
    descall_migrate::app::read_account_local_storage(&bytes).map(|local_storage| Imported { local_storage, id: import_id })
}

fn boot_script_with<R: Runtime>(app: &AppHandle<R>, imported: Option<&Imported>, mode: &'static str) -> String {
    boot_script_token(app, imported, mode, crate::secure_store::get(app, crate::secure_store::TOKEN))
}

fn boot_script_token<R: Runtime>(app: &AppHandle<R>, imported: Option<&Imported>, mode: &'static str, token: Option<String>) -> String {
    let boot = Boot {
        mode,
        version: app.package_info().version.to_string(),
        platform: "win32",
        token,
        reduced_transparency: crate::platform::reduced_transparency(),
        locale: crate::state::locale(app),
        import_local_storage: imported.map(|i| &i.local_storage),
        import_id: imported.map(|i| i.id.as_str()),
    };
    format!("window.__DESCALL_BOOT__ = Object.freeze({});", serde_json::to_string(&boot).unwrap_or_else(|_| "{}".into()))
}

// ---- window state (Electron window-state.json, DIP = Tauri logical units) -------------------

const MIN_W: f64 = 1200.0;
const MIN_H: f64 = 700.0;

fn state_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    crate::state::data_dir(app).map(|d| d.join("window-state.json"))
}

pub fn initial_window_state<R: Runtime>(app: &AppHandle<R>) -> InitialWindow {
    let v = state_file(app).and_then(|p| std::fs::read_to_string(p).ok()).and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).unwrap_or_default();
    let n = |k: &str| v.get(k).and_then(|x| x.as_f64());
    // Fit the saved bounds into the monitor they were on (else the primary one): a monitor
    // that went away must not leave the window off screen (fitBoundsToWorkArea).
    let monitors = app.available_monitors().unwrap_or_default();
    let to_rect = |m: &tauri::Monitor| {
        let s = m.scale_factor();
        let wa = m.work_area();
        descall_shell::occlusion::Rect { x: wa.position.x as f64 / s, y: wa.position.y as f64 / s, width: wa.size.width as f64 / s, height: wa.size.height as f64 / s }
    };
    let maximized = v.get("maximized").and_then(|x| x.as_bool()).unwrap_or(false);
    // Saved by this shell: the physical corner finds its monitor exactly, whatever the scaling
    // of the others (a logical x/y from the 150 % screen also lands inside the 100 % one).
    let (mut sx, mut sy) = (n("x"), n("y"));
    if let (Some(px), Some(py)) = (v.get("px").and_then(|x| x.as_i64()), v.get("py").and_then(|x| x.as_i64())) {
        let screens: Vec<Screen> = monitors
            .iter()
            .map(|m| {
                let wa = m.work_area();
                Screen { x: wa.position.x, y: wa.position.y, width: wa.size.width, height: wa.size.height, scale: m.scale_factor() }
            })
            .collect();
        if let Some((f, corner)) = restore_physical(px as i32, py as i32, n("width"), n("height"), &screens) {
            return InitialWindow { width: f.width, height: f.height, x: None, y: None, physical: Some(corner), maximized, min_width: f.min_width, min_height: f.min_height };
        }
        // That monitor is gone: centre on the primary one (below).
        sx = None;
        sy = None;
    }
    let inside = |r: &descall_shell::occlusion::Rect| matches!((sx, sy), (Some(x), Some(y)) if x >= r.x - 8.0 && y >= r.y - 8.0 && x < r.x + r.width && y < r.y + r.height);
    let saved_monitor = monitors.iter().map(to_rect).find(|r| inside(r));
    let on_screen = saved_monitor.is_some();
    let work = saved_monitor.or_else(|| app.primary_monitor().ok().flatten().map(|m| to_rect(&m)));
    let f = descall_shell::occlusion::fit_bounds_to_work_area(sx.filter(|_| on_screen), sy.filter(|_| on_screen), n("width"), n("height"), work, MIN_W, MIN_H);
    InitialWindow { width: f.width, height: f.height, x: f.x, y: f.y, physical: None, maximized, min_width: f.min_width, min_height: f.min_height }
}

/// A monitor's work area in physical pixels and its scale factor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Restore from a saved physical corner: the monitor whose work area holds it (a few pixels
/// of slack for the invisible resize border), the bounds fitted into that work area in its
/// own logical units, and the fitted corner back in physical pixels. None when no monitor
/// holds the corner (unplugged, resolution changed): the caller centres on the primary one.
pub fn restore_physical(px: i32, py: i32, width: Option<f64>, height: Option<f64>, screens: &[Screen]) -> Option<(descall_shell::occlusion::Fitted, (i32, i32))> {
    let slack = 16;
    let s = screens.iter().copied().find(|s| s.width > 0 && s.height > 0 && px >= s.x - slack && py >= s.y - slack && px < s.x + s.width as i32 && py < s.y + s.height as i32)?;
    let scale = if s.scale.is_finite() && s.scale > 0.0 { s.scale } else { 1.0 };
    let local = descall_shell::occlusion::Rect { x: 0.0, y: 0.0, width: s.width as f64 / scale, height: s.height as f64 / scale };
    let f = descall_shell::occlusion::fit_bounds_to_work_area(Some((px - s.x) as f64 / scale), Some((py - s.y) as f64 / scale), width, height, Some(local), MIN_W, MIN_H);
    let corner = (s.x + (f.x.unwrap_or(0.0) * scale).round() as i32, s.y + (f.y.unwrap_or(0.0) * scale).round() as i32);
    Some((f, corner))
}

fn save_window_state<R: Runtime>(w: &WebviewWindow<R>) {
    let Some(path) = state_file(w.app_handle()) else { return };
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = w.is_maximized().unwrap_or(false);
    let mut v = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).unwrap_or(json!({}));
    if !maximized {
        let s = w.scale_factor().unwrap_or(1.0);
        if let (Ok(p), Ok(sz)) = (w.outer_position(), w.inner_size()) {
            v["x"] = json!((p.x as f64 / s).round());
            v["y"] = json!((p.y as f64 / s).round());
            v["width"] = json!((sz.width as f64 / s).round());
            v["height"] = json!((sz.height as f64 / s).round());
            v["px"] = json!(p.x);
            v["py"] = json!(p.y);
        }
    }
    v["maximized"] = json!(maximized);
    // Flushed temp file + rename: a crash or power cut during the write left a truncated
    // window-state.json and the window came back at the default size and place.
    let _ = descall_shell::durable::replace(&path, v.to_string().as_bytes());
}

/// main.cjs saveWindowStateSoon: a drag or a resize fires Moved / Resized many times a second;
/// write window-state.json once the window has been still for 400 ms, not on every event (each
/// write read and rewrote the file on the UI thread while the user dragged the window).
static SAVE_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub const SAVE_STATE_DEBOUNCE_MS: u64 = 400;

fn save_window_state_soon<R: Runtime>(w: &WebviewWindow<R>) {
    use std::sync::atomic::Ordering;
    let gen = SAVE_GEN.fetch_add(1, Ordering::AcqRel) + 1;
    let w = w.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(SAVE_STATE_DEBOUNCE_MS)).await;
        if SAVE_GEN.load(Ordering::Acquire) == gen {
            save_window_state(&w);
        }
    });
}

// ---- cold start (launchVisibility.cjs) --------------------------------------------------------

const RELAUNCH_MARKER: &str = "updater-relaunch.json";

/// Written right before a quiet update install: the relaunched app comes back the way the
/// user left it (tray or minimized), once, within 15 minutes.
pub fn write_relaunch_marker<R: Runtime>(app: &AppHandle<R>) {
    let Some(dir) = crate::state::data_dir(app) else { return };
    let mode = crate::state::main_window(app).map(|w| {
        if !w.is_visible().unwrap_or(true) {
            "hidden"
        } else if w.is_minimized().unwrap_or(false) {
            "minimized"
        } else {
            "shown"
        }
    });
    let _ = std::fs::write(dir.join(RELAUNCH_MARKER), json!({ "mode": mode, "at": crate::state::now_ms() }).to_string());
}

/// The install did not start after all: a manual launch must not read the marker.
pub fn clear_relaunch_marker<R: Runtime>(app: &AppHandle<R>) {
    if let Some(dir) = crate::state::data_dir(app) {
        let _ = std::fs::remove_file(dir.join(RELAUNCH_MARKER));
    }
}

pub fn cold_start<R: Runtime>(app: &AppHandle<R>, argv: &[String]) -> descall_shell::launch::ColdStart {
    use descall_shell::launch::{decide_cold_start, is_fresh_relaunch_marker, BackgroundMode};
    let (mut mode, mut fresh) = (None, false);
    if let Some(p) = crate::state::data_dir(app).map(|d| d.join(RELAUNCH_MARKER)) {
        if let Ok(text) = std::fs::read_to_string(&p) {
            let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            fresh = is_fresh_relaunch_marker(v.get("at").and_then(|a| a.as_i64()), crate::state::now_ms() as i64);
            mode = match v.get("mode").and_then(|m| m.as_str()) {
                Some("hidden") => Some(BackgroundMode::Hidden),
                Some("minimized") => Some(BackgroundMode::Minimized),
                _ => None,
            };
        }
        let _ = std::fs::remove_file(&p); // one-shot
    }
    decide_cold_start(argv, mode, fresh)
}

/// Same rule as electron/appTrust.cjs: only the app origin navigates in-app; everything
/// else opens in the default browser (the shim's link handler and on_new_window).
pub fn is_app_url(url: &tauri::Url) -> bool {
    descall_shell::trust::is_app_url(url.as_str(), crate::state::is_dev())
}

/// Main window will-navigate (main.cjs): only the app navigates in place. A web or mail link
/// the page navigates to by itself (location.assign, a form, a link the shim's click handler
/// did not see) opens in the default browser, as openExternalSafely did; it used to do nothing.
pub fn main_navigation<R: Runtime>(app: &AppHandle<R>, url: &tauri::Url) -> bool {
    if is_app_url(url) {
        return true;
    }
    if descall_shell::trust::is_safe_external_url(url.as_str()) {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    } else {
        // Redact before cutting: a token cut in half no longer looks like one.
        log::warn!("[nav] not opening will-navigate: {}", descall_shell::secrets::redact(url.as_str()).chars().take(120).collect::<String>());
    }
    false
}

/// window.open / target=_blank from an app window (main, pop-outs, account windows, call and
/// sidebar portals) that is not a portal or an admin route: web and mail links go to the
/// default browser by the same rule everywhere (trust::main_window_open: http, https and
/// mailto, never the app or shell origin, never file:, javascript: or other schemes). Nothing
/// ever opens inside the app. Pop-outs and portals used to open any https URL (the app's own
/// pages included) and no mail link; account windows opened nothing at all.
pub fn open_external_window<R: Runtime>(app: &AppHandle<R>, url: &tauri::Url) {
    if descall_shell::trust::main_window_open(url.as_str()) == descall_shell::trust::WindowOpen::External {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

// ---- window events ---------------------------------------------------------------------------

/// main.cjs containRestoredWindow (on 'unmaximize' and 'restore'): a restored window that hangs
/// past the work area of its monitor (resolution or scaling changed while it was maximized or
/// minimized, a monitor went away) is pulled back inside it, smaller if it must be.
fn contain_restored<R: Runtime>(w: &WebviewWindow<R>) {
    use descall_shell::occlusion::{fit_bounds_to_work_area, overflows, Rect};
    if w.is_maximized().unwrap_or(false) || w.is_fullscreen().unwrap_or(false) || w.is_minimized().unwrap_or(false) || in_move_size_loop() {
        return;
    }
    let Some(m) = w.current_monitor().ok().flatten() else { return };
    let s = m.scale_factor();
    let wa = m.work_area();
    let work = Rect { x: wa.position.x as f64 / s, y: wa.position.y as f64 / s, width: wa.size.width as f64 / s, height: wa.size.height as f64 / s };
    let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) else { return };
    let b = Rect { x: p.x as f64 / s, y: p.y as f64 / s, width: sz.width as f64 / s, height: sz.height as f64 / s };
    if !overflows(b, work) {
        return;
    }
    let f = fit_bounds_to_work_area(Some(b.x), Some(b.y), Some(b.width), Some(b.height), Some(work), MIN_W, MIN_H);
    log::info!("[window] restored past the work area: fitted to {}x{}", f.width, f.height);
    let _ = w.set_min_size(Some(tauri::LogicalSize::new(f.min_width, f.min_height)));
    let _ = w.set_size(tauri::LogicalSize::new(f.width, f.height));
    if let (Some(x), Some(y)) = (f.x, f.y) {
        let _ = w.set_position(tauri::LogicalPosition::new(x, y));
    }
}

/// The user is dragging or sizing the window (a maximized window dragged off its title bar is
/// restored inside that loop): moving it then would fight the drag; the drag ends where the
/// user puts it.
fn in_move_size_loop() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Threading::GetCurrentThreadId;
        use windows::Win32::UI::WindowsAndMessaging::{GetGUIThreadInfo, GUITHREADINFO, GUI_INMOVESIZE};
        let mut info = GUITHREADINFO { cbSize: std::mem::size_of::<GUITHREADINFO>() as u32, ..Default::default() };
        GetGUIThreadInfo(GetCurrentThreadId(), &mut info).is_ok() && (info.flags.0 & GUI_INMOVESIZE.0) != 0
    }
    #[cfg(not(windows))]
    false
}

fn publish_content_box<R: Runtime>(w: &WebviewWindow<R>) {
    crate::state::to_main(w.app_handle(), "window:content-box", crate::commands::window::content_box(w));
}

fn visibility<R: Runtime>(w: &WebviewWindow<R>, backgrounded: bool) {
    crate::state::to_main(w.app_handle(), "app:visibility", json!({ "backgrounded": backgrounded }));
    // Tray / minimized for a while without a call: WebView2 memory target low (webview.rs).
    crate::webview::update_main_memory(w.app_handle());
}

/// The page loaded while the window is in the tray or minimized (sign-in autostart with
/// --hidden, a reload while hidden): no hide / minimize event follows for it, so the page took
/// itself for on screen (Electron the same): its animations ran in the tray and a DM in an open
/// chat was marked read while nobody looked. Told twice, once the page had time to listen; a
/// window shown meanwhile is left alone (show_main sends backgrounded:false).
pub fn tell_page_if_away<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for wait_ms in [2_000u64, 6_000] {
            tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
            let Some(w) = crate::state::main_window(&app) else { return };
            let away = !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false);
            if !away {
                return;
            }
            visibility(&w, true);
        }
    });
}

/// Same file name as main.cjs (userData/background-notice-shown).
const BACKGROUND_NOTICE: &str = "background-notice-shown";

/// True the first time only: writes the marker in `dir` and answers whether it was new.
/// A marker that cannot be written still answers true once per run of the caller.
pub fn background_notice_due(dir: &std::path::Path) -> bool {
    let marker = dir.join(BACKGROUND_NOTICE);
    if marker.exists() {
        return false;
    }
    let _ = std::fs::write(&marker, crate::state::now_ms().to_string());
    true
}

/// First close to the tray: "Descall keeps running in the background" (main.cjs showed it
/// once; the Tauri shell hid the window without a word). Off the event-loop thread, since
/// the capsule is a new window.
fn background_notice_once<R: Runtime>(app: &AppHandle<R>) {
    let Some(dir) = crate::state::data_dir(app) else { return };
    // A user moved over from Electron already saw it there (same marker in %APPDATA%\Descall).
    let seen_in_electron = app.path().data_dir().ok().is_some_and(|d| d.join(descall_migrate::paths::ELECTRON_USER_DATA).join(BACKGROUND_NOTICE).exists());
    if !background_notice_due(&dir) || seen_in_electron {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let body = crate::state::et(&app, "notice.background", &[]);
        let _ = crate::commands::notify::show_capsule(&app, "Descall", &json!({ "body": body, "tag": "descall-background", "data": { "type": "announcement" } }));
    });
}

pub fn bind_window_events<R: Runtime>(w: &WebviewWindow<R>) {
    let win = w.clone();
    // Electron sent backgrounded:false on 'show' and 'restore' as well as 'focus'. Tauri only
    // had Focused(true): a window restored without activation (Win+D twice, a taskbar
    // thumbnail) kept html.app-backgrounded, every CSS animation stayed paused at frame 0
    // and Settings > Magaza showed an empty body (its cards fade in).
    w.on_window_event(move |e| {
        let app = win.app_handle();
        match e {
            WindowEvent::CloseRequested { api, .. } => {
                if crate::state::shell(app).quitting.load(std::sync::atomic::Ordering::Acquire) {
                    return;
                }
                // Close hides to the tray (main.cjs 'close'); without a tray it minimizes.
                api.prevent_close();
                save_window_state(&win);
                if crate::state::shell(app).has_tray.load(std::sync::atomic::Ordering::Acquire) {
                    let _ = win.hide();
                    background_notice_once(app);
                } else {
                    let _ = win.minimize();
                }
                visibility(&win, true);
            }
            WindowEvent::Resized(_) => {
                let maximized = win.is_maximized().unwrap_or(false);
                let changed = {
                    let sh = crate::state::shell(app);
                    let mut last = sh.last_maximized.lock().unwrap();
                    let changed = *last != Some(maximized);
                    *last = Some(maximized);
                    changed
                };
                if changed {
                    crate::state::to_main(app, "window:maximized", maximized);
                    if !maximized {
                        contain_restored(&win); // mainWindow 'unmaximize'
                    }
                }
                let minimized = win.is_minimized().unwrap_or(false);
                let was_minimized = crate::state::shell(app).minimized.swap(minimized, std::sync::atomic::Ordering::AcqRel);
                if minimized {
                    if !was_minimized {
                        visibility(&win, true); // mainWindow 'minimize'
                    }
                } else {
                    // mainWindow 'restore' sent app:visibility false on its own, focus or not:
                    // a restore without the focus (foreground lock) kept the page's animations
                    // paused. Not for a window restored while hidden to the tray.
                    if was_minimized && win.is_visible().unwrap_or(false) {
                        visibility(&win, false);
                    }
                    if was_minimized {
                        contain_restored(&win); // mainWindow 'restore'
                    }
                    publish_content_box(&win);
                    save_window_state_soon(&win);
                }
            }
            WindowEvent::Moved(_) => {
                publish_content_box(&win);
                save_window_state_soon(&win);
            }
            WindowEvent::Focused(true) => visibility(&win, false),
            WindowEvent::ScaleFactorChanged { .. } => publish_content_box(&win),
            _ => {}
        }
    });
}

// ---- paint watchdog (bootWatchdog.cjs) -------------------------------------------------------

/// A new main-frame document started loading: arm the paint watchdog for it.
pub fn arm_paint_watchdog<R: Runtime>(w: &WebviewWindow<R>) {
    use descall_shell::watchdog::{paint_watchdog_step, PaintStep};
    let app = w.app_handle().clone();
    let gen = {
        let sh = crate::state::shell(&app);
        let mut b = sh.boot.lock().unwrap();
        b.generation += 1;
        b.started_ms = crate::state::now_ms();
        b.painted = false;
        b.asked = false;
        b.generation
    };
    let win = w.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let (step, elapsed, painted) = {
                let sh = crate::state::shell(&app);
                let b = sh.boot.lock().unwrap();
                if b.generation != gen {
                    return;
                }
                let elapsed = crate::state::now_ms().saturating_sub(b.started_ms);
                (paint_watchdog_step(b.painted, elapsed, b.reloads, b.asked), elapsed, b.painted)
            };
            match step {
                PaintStep::None if painted => return,
                PaintStep::None => {}
                PaintStep::Nudge => {
                    // Force a fresh frame (webContents.invalidate in Electron).
                    let _ = win.eval("requestAnimationFrame(function(){document.documentElement.style.transform='translateZ(0)';requestAnimationFrame(function(){document.documentElement.style.transform='';});});");
                }
                PaintStep::Reload => {
                    log::warn!("[boot] no paint after {elapsed} ms: clean reload");
                    crate::state::shell(&app).boot.lock().unwrap().reloads += 1;
                    crate::webview::clear_and_reload(&win, "paint-watchdog");
                    return;
                }
                PaintStep::Ask => {
                    crate::state::shell(&app).boot.lock().unwrap().asked = true;
                    // Hidden in the tray (Windows login auto-start): no "could not open" box out
                    // of nowhere at sign-in; main.cjs returned here too (!win.isVisible()).
                    if !win.is_visible().unwrap_or(false) {
                        log::warn!("[boot] no paint after {elapsed} ms while hidden: not asking");
                        return;
                    }
                    let title = crate::state::et(&app, "dialog.openFailed", &[]);
                    let detail = crate::state::et(&app, "dialog.openFailedDetail", &[]);
                    let retry = tauri::async_runtime::spawn_blocking(move || crate::webview::ask_retry(&title, &detail)).await.unwrap_or(false);
                    if retry {
                        crate::webview::clear_and_reload(&win, "user-retry");
                    } else {
                        crate::state::set_quitting(&app);
                        app.exit(0);
                    }
                    return;
                }
            }
        }
    });
}

/// Windows "Transparency effects" switch: tell the page when it flips. The thread waits for
/// a registry change notification (Electron: nativeTheme 'updated'); it polled every 3 s
/// before, waking the CPU for the whole run.
pub fn watch_reduced_transparency<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = crate::platform::reduced_transparency();
        loop {
            if !crate::platform::wait_personalize_change() {
                std::thread::sleep(std::time::Duration::from_secs(3));
            }
            let now = crate::platform::reduced_transparency();
            if now != last {
                last = now;
                // Every window, as nativeTheme 'updated' did (BrowserWindow.getAllWindows): the
                // admin and Descall+ windows follow the switch too.
                use tauri::Emitter;
                let _ = app.emit("native-theme:reduced-transparency-changed", now);
            }
        }
    });
}

#[cfg(test)]
mod window_state_tests {
    use super::{restore_physical, Screen};

    // Laptop 1920x1080 at 100 % (taskbar 40 px), external 3840x2160 at 150 % on its right.
    const LAPTOP: Screen = Screen { x: 0, y: 0, width: 1920, height: 1040, scale: 1.0 };
    const EXTERNAL: Screen = Screen { x: 1920, y: 0, width: 3840, height: 2100, scale: 1.5 };

    #[test]
    fn the_window_comes_back_on_the_scaled_monitor_it_was_on() {
        // Saved at physical (2400, 300) on the external screen. As a logical point (1600, 200)
        // that also lies inside the laptop's work area, which is where it used to reopen.
        let (f, corner) = restore_physical(2400, 300, Some(1400.0), Some(900.0), &[LAPTOP, EXTERNAL]).expect("on the external screen");
        assert_eq!(corner, (2400, 300));
        assert_eq!((f.width, f.height), (1400.0, 900.0));
    }

    #[test]
    fn a_window_hanging_off_the_work_area_is_pulled_back() {
        let (f, corner) = restore_physical(100, 900, Some(1400.0), Some(900.0), &[LAPTOP, EXTERNAL]).expect("on the laptop");
        assert_eq!(corner, (100, 140));
        assert_eq!((f.width, f.height), (1400.0, 900.0));
        // Bigger than the screen: shrinks to the work area, and so does the minimum size.
        let small = Screen { x: 0, y: 0, width: 1366, height: 728, scale: 1.0 };
        let (f, corner) = restore_physical(0, 0, Some(1600.0), Some(1000.0), &[small]).expect("on screen");
        assert_eq!((f.width, f.height, corner), (1366.0, 728.0, (0, 0)));
        assert!(f.min_width <= 1366.0 && f.min_height <= 728.0);
    }

    #[test]
    fn the_resize_border_corner_still_counts_as_on_screen() {
        let (_, corner) = restore_physical(-8, -8, Some(1400.0), Some(900.0), &[LAPTOP, EXTERNAL]).expect("slack for the border");
        assert_eq!(corner, (0, 0));
        // Same on the scaled screen: its border is 12 physical px.
        let top = Screen { x: 0, y: -2100, width: 3840, height: 2100, scale: 1.5 };
        let (_, corner) = restore_physical(-12, -2112, Some(1400.0), Some(900.0), &[LAPTOP, top]).expect("slack on the upper screen");
        assert_eq!(corner, (0, -2100));
    }

    #[test]
    fn the_background_notice_is_not_repeated_after_the_move() {
        let src = include_str!("boot.rs");
        let f = &src[src.find("fn background_notice_once").unwrap()..];
        let f = &f[..f.find("show_capsule").unwrap()];
        assert!(f.contains("ELECTRON_USER_DATA).join(BACKGROUND_NOTICE).exists()") && f.contains("|| seen_in_electron"));
    }

    #[test]
    fn the_background_notice_shows_once() {
        let dir = std::env::temp_dir().join(format!("descall-bg-notice-{}-{}", std::process::id(), crate::state::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(super::background_notice_due(&dir), "first close to the tray");
        assert!(!super::background_notice_due(&dir), "never again");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unplugged_monitor_gives_none() {
        assert!(restore_physical(6000, 300, Some(1400.0), Some(900.0), &[LAPTOP, EXTERNAL]).is_none());
        assert!(restore_physical(-3000, 0, None, None, &[LAPTOP]).is_none());
        assert!(restore_physical(10, 10, None, None, &[]).is_none());
    }
}
