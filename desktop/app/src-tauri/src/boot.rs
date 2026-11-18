//! First-start import from Electron, the boot script (sync values the old preload gave the
//! page through ipcRenderer.sendSync), window state, navigation guard, window events.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WindowEvent};

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
        if let Some(l) = &h.locale {
            let _ = std::fs::write(dir.join("locale"), l);
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
    import_local_storage: Option<&'a BTreeMap<String, String>>,
}

pub fn boot_script(app: &AppHandle, imported: Option<&Imported>) -> String {
    let boot = Boot {
        version: app.package_info().version.to_string(),
        platform: "win32",
        token: crate::secure_store::get(app, crate::secure_store::TOKEN),
        reduced_transparency: crate::commands::app::reduced_transparency(),
        import_local_storage: imported.map(|i| &i.local_storage),
    };
    format!("window.__DESCALL_BOOT__ = Object.freeze({});", serde_json::to_string(&boot).unwrap_or_else(|_| "{}".into()))
}

pub fn initial_window_state(app: &AppHandle) -> InitialWindow {
    let default = InitialWindow { width: 1400.0, height: 900.0, x: None, y: None, maximized: false };
    let Ok(dir) = app.path().app_data_dir() else { return default };
    let Ok(text) = std::fs::read_to_string(dir.join("window-state.json")) else { return default };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { return default };
    let n = |k: &str| v.get(k).and_then(|x| x.as_f64());
    // Electron saved DIP bounds = Tauri logical units. Off-screen fixing (pickRestoreBounds)
    // is done after creation against the current monitors.
    InitialWindow {
        width: n("width").unwrap_or(1400.0).max(1200.0),
        height: n("height").unwrap_or(900.0).max(700.0),
        x: n("x"),
        y: n("y"),
        maximized: v.get("maximized").and_then(|x| x.as_bool()).unwrap_or(false),
    }
}

/// Same rule as electron/appTrust.cjs: only the app origin navigates in-app; everything
/// else opens in the default browser (done by the shim's link handler).
pub fn is_app_url(url: &tauri::Url) -> bool {
    matches!(url.host_str(), Some("tauri.localhost")) || (cfg!(debug_assertions) && url.as_str().starts_with("http://localhost:5173"))
}

pub fn bind_window_events(w: &WebviewWindow) {
    let win = w.clone();
    w.on_window_event(move |e| match e {
        WindowEvent::CloseRequested { api, .. } => {
            // Close -> hide to tray (Electron mainWindow 'close' handler).
            api.prevent_close();
            let _ = win.hide();
            let _ = win.emit("app:visibility", serde_json::json!({ "visible": false, "reason": "hidden" }));
        }
        WindowEvent::Resized(_) => {
            let _ = win.emit("window:maximized", win.is_maximized().unwrap_or(false));
        }
        WindowEvent::Focused(f) => {
            let _ = win.emit("app:visibility", serde_json::json!({ "visible": true, "focused": f }));
        }
        _ => {}
    });
}
