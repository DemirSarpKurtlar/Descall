use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};

use super::AppState;

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// app:locale. Tray menu, dialogs, toasts and the overlay follow the UI language.
#[tauri::command]
pub fn app_set_locale(app: AppHandle, locale: String) {
    let locale: String = locale.chars().take(16).collect();
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::write(dir.join("locale"), &locale);
    }
    // TODO(P1): rebuild the tray menu with the new strings (mainI18n.cjs port).
}

/// app:boot-retry: clear Service Worker + Cache Storage, reload ignoring cache.
#[tauri::command]
pub fn app_boot_retry(window: tauri::WebviewWindow) {
    let _ = window.eval("(async()=>{try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);}catch(e){}location.reload();})()");
    // TODO(P1): ICoreWebView2Profile2::ClearBrowsingDataAsync(CACHE_STORAGE|SERVICE_WORKERS|DISK_CACHE)
}

/// app:boot-state milestones. "ready" also writes migration/health.json for the migrator.
#[tauri::command]
pub fn app_boot_state(app: AppHandle, phase: String, ms: f64) {
    log::info!("[boot] {phase} {ms}ms");
    if phase == "ready" {
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::write(dir.join("migration").join("health.json"), format!("{{\"phase\":\"ready\",\"ms\":{ms}}}"));
        }
    }
}

/// native-theme:reduced-transparency (sync in Electron; the shim reads the boot value and
/// refreshes it from this command).
#[tauri::command]
pub fn app_reduced_transparency() -> bool {
    reduced_transparency()
}

/// Windows "Transparency effects" off = HKCU\...\Themes\Personalize EnableTransparency = 0.
pub fn reduced_transparency() -> bool {
    false // TODO(P1): read the registry value; listen for WM_SETTINGCHANGE "ImmersiveColorSet".
}

#[tauri::command]
pub fn voice_set_busy(state: State<'_, AppState>, busy: bool) {
    state.voice_busy.store(busy, Ordering::Release);
}

#[tauri::command]
pub fn activity_set_busy(state: State<'_, AppState>, busy: bool) {
    state.user_busy.store(busy, Ordering::Release);
}
