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
}

pub struct InitialWindow {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
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
                result = Some(Imported { local_storage: h.local_storage.clone() });
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
        // first opens (boot_script_for_premium_window); removed with the account.
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
    let bytes = std::fs::read(crate::state::data_dir(app)?.join(rel)).ok()?;
    descall_migrate::app::read_account_local_storage(&bytes).map(|local_storage| Imported { local_storage })
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
    let (sx, sy) = (n("x"), n("y"));
    let inside = |r: &descall_shell::occlusion::Rect| matches!((sx, sy), (Some(x), Some(y)) if x >= r.x - 8.0 && y >= r.y - 8.0 && x < r.x + r.width && y < r.y + r.height);
    let saved_monitor = monitors.iter().map(to_rect).find(|r| inside(r));
    let on_screen = saved_monitor.is_some();
    let work = saved_monitor.or_else(|| app.primary_monitor().ok().flatten().map(|m| to_rect(&m)));
    let f = descall_shell::occlusion::fit_bounds_to_work_area(sx.filter(|_| on_screen), sy.filter(|_| on_screen), n("width"), n("height"), work, MIN_W, MIN_H);
    InitialWindow { width: f.width, height: f.height, x: f.x, y: f.y, maximized: v.get("maximized").and_then(|x| x.as_bool()).unwrap_or(false), min_width: f.min_width, min_height: f.min_height }
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
        }
    }
    v["maximized"] = json!(maximized);
    let _ = std::fs::write(path, v.to_string());
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

// ---- window events ---------------------------------------------------------------------------

fn publish_content_box<R: Runtime>(w: &WebviewWindow<R>) {
    crate::state::to_main(w.app_handle(), "window:content-box", crate::commands::window::content_box(w));
}

fn visibility<R: Runtime>(w: &WebviewWindow<R>, backgrounded: bool) {
    crate::state::to_main(w.app_handle(), "app:visibility", json!({ "backgrounded": backgrounded }));
}

/// "Descall keeps running in the background" the first time the window closes to the tray
/// (main.cjs 'close': same text, same marker file name). show_capsule builds its window off
/// the UI thread, so this is safe inside the window event handler.
fn background_notice<R: Runtime>(app: &AppHandle<R>) {
    let Some(dir) = crate::state::data_dir(app) else { return };
    let marker = dir.join("background-notice-shown");
    if marker.exists() {
        return;
    }
    if std::fs::write(&marker, crate::state::now_ms().to_string()).is_err() {
        log::warn!("[window] background notice marker not saved, it shows again next time");
    }
    let body = crate::state::et(app, "notice.background", &[]);
    let _ = crate::commands::notify::show_capsule(app, "Descall", &json!({ "body": body, "tag": "descall-background" }));
}

pub fn bind_window_events<R: Runtime>(w: &WebviewWindow<R>) {
    let win = w.clone();
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
                    background_notice(app);
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
                }
                if win.is_minimized().unwrap_or(false) {
                    visibility(&win, true);
                } else {
                    publish_content_box(&win);
                    save_window_state(&win);
                }
            }
            WindowEvent::Moved(_) => {
                publish_content_box(&win);
                save_window_state(&win);
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

/// Windows "Transparency effects" switch: tell the page when it flips.
pub fn watch_reduced_transparency<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = crate::platform::reduced_transparency();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));
            let now = crate::platform::reduced_transparency();
            if now != last {
                last = now;
                crate::state::to_main(&app, "native-theme:reduced-transparency-changed", now);
            }
        }
    });
}
