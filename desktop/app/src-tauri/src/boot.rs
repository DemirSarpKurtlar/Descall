//! First-start import from Electron, the boot script (sync values the old preload gave the
//! page through ipcRenderer.sendSync), cold-start visibility, window state, navigation guard,
//! window events, the paint watchdog and the migrator health signal.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WindowEvent};

use descall_migrate::handoff::{Handoff, ENTROPY};

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

/// Where DescallMigrator.exe leaves the sealed handoff (owner-only ACL, CREATE_NEW).
pub fn handoff_path(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().local_data_dir().ok()?.join("Descall-Migration").join("handoff.bin"))
}

/// Electron userData (%APPDATA%\Descall): the fallback source when there is no handoff.
fn electron_user_data(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().data_dir().ok()?.join("Descall"))
}

pub fn import_from_electron_once(app: &AppHandle) -> Option<Imported> {
    let marker = migration_dir(app)?.join("imported");
    if marker.exists() {
        return None;
    }
    let mut result = None;
    #[cfg(windows)]
    {
        if let Some(p) = handoff_path(app) {
            if let Ok(sealed) = std::fs::read(&p) {
                if let Ok(plain) = descall_migrate::dpapi::unprotect(&sealed, Some(ENTROPY)) {
                    if let Ok(h) = serde_json::from_slice::<Handoff>(&plain) {
                        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                        if h.validate(now).is_ok() {
                            apply_handoff(app, &h);
                            result = Some(Imported { local_storage: h.local_storage.clone() });
                        }
                    }
                }
                descall_migrate::secure_file::shred(&p);
            }
        }
        if result.is_none() {
            // Fallback: decrypt Electron's safeStorage file directly (oscrypt.rs). Settings in
            // localStorage are not recovered on this path (they default; the server profile
            // still has the account settings).
            if let Some(ud) = electron_user_data(app) {
                if let Ok(blob) = std::fs::read(ud.join("auth-token.bin")) {
                    if let Ok(token) = descall_migrate::oscrypt::decrypt_electron_file(&ud, &blob) {
                        if descall_migrate::handoff::looks_like_jwt(&token) {
                            crate::secure_store::set(app, crate::secure_store::TOKEN, &token);
                        }
                    }
                }
            }
        }
    }
    let _ = std::fs::write(marker, b"1");
    result
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
        let premium = dir.join("premium");
        let _ = std::fs::create_dir_all(&premium);
        for (name, body) in &h.premium_files {
            // Plain file names only (same rule as electron/safeDownload.cjs).
            if !name.contains(['/', '\\']) && !name.contains("..") {
                let _ = std::fs::write(premium.join(name), body);
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
    import_local_storage: Option<&'a BTreeMap<String, String>>,
}

/// window.__DESCALL_BOOT__: the values the Electron preload answered synchronously.
pub fn boot_script<R: Runtime>(app: &AppHandle<R>, imported: Option<&Imported>) -> String {
    let boot = Boot {
        version: app.package_info().version.to_string(),
        platform: "win32",
        token: crate::secure_store::get(app, crate::secure_store::TOKEN),
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

/// The new app is up: tells DescallMigrator (AwaitHealth) the migration can commit.
pub fn write_health<R: Runtime>(app: &AppHandle<R>, ms: Option<u64>) {
    let Some(dir) = crate::state::data_dir(app).map(|d| d.join("migration")) else { return };
    if std::fs::create_dir_all(&dir).is_ok() {
        let _ = std::fs::write(dir.join("health.json"), json!({ "phase": "app-mounted", "ms": ms, "version": app.package_info().version.to_string(), "at": crate::state::now_ms() }).to_string());
    }
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
                } else {
                    let _ = win.minimize();
                }
                visibility(&win, true);
            }
            WindowEvent::Resized(_) => {
                let maximized = win.is_maximized().unwrap_or(false);
                let changed = {
                    let mut last = crate::state::shell(app).last_maximized.lock().unwrap();
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
        let mut b = crate::state::shell(&app).boot.lock().unwrap();
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
                let b = crate::state::shell(&app).boot.lock().unwrap();
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
