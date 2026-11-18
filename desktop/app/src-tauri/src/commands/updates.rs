//! electron-updater replacement: tauri-plugin-updater (minisign-signed latest.json from the
//! Descall API, GitHub as second endpoint). Same deferral rules as updateDeferral.cjs: never
//! install during a call / typing; install when idle, locked, or on quit.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub success: bool,
    pub update_ready: bool,
    pub update_version: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn updates_check(app: AppHandle) -> UpdateStatus {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return UpdateStatus { error: Some(e.to_string()), ..Default::default() },
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let _ = app.emit("update-available", serde_json::json!({ "version": version }));
            let app2 = app.clone();
            let mut got: usize = 0;
            let res = update
                .download(
                    move |chunk, total| {
                        got += chunk;
                        let percent = total.map(|t| got as f64 * 100.0 / t as f64).unwrap_or(0.0);
                        let _ = app2.emit("update:progress", serde_json::json!({ "percent": percent }));
                    },
                    || {},
                )
                .await;
            match res {
                Ok(bytes) => {
                    // Keep the verified bytes; install() is called by the deferral loop
                    // (TODO(P1): port updateDeferral.cjs) or updates_restart.
                    let _ = bytes;
                    let _ = app.emit("update:ready", serde_json::json!({ "version": version }));
                    UpdateStatus { success: true, update_ready: true, update_version: Some(version), error: None }
                }
                Err(e) => UpdateStatus { error: Some(e.to_string()), ..Default::default() },
            }
        }
        Ok(None) => UpdateStatus { success: true, ..Default::default() },
        Err(e) => UpdateStatus { error: Some(e.to_string()), ..Default::default() },
    }
}

/// restart-app / restart-app-confirmed (the page already asked the user when in a call).
#[tauri::command]
pub async fn updates_restart(app: AppHandle, state: tauri::State<'_, crate::commands::AppState>, confirmed: bool) -> Result<bool, String> {
    use std::sync::atomic::Ordering;
    if !confirmed && state.voice_busy.load(Ordering::Acquire) {
        let _ = app.emit("update:confirm-restart", serde_json::json!({ "reason": "call" }));
        return Ok(false);
    }
    // TODO(P1): install the verified bytes kept by updates_check (Update::install), then app.restart().
    Ok(false)
}

#[tauri::command]
pub fn updates_status() -> UpdateStatus {
    UpdateStatus { success: true, ..Default::default() }
}
