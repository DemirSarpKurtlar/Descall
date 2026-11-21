use std::sync::atomic::Ordering;

use descall_shell::watchdog;
use tauri::{AppHandle, Runtime, WebviewWindow};

use crate::state::{self, shell};

/// app-version.
#[tauri::command]
pub fn app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

/// app:locale: tray, capsules, overlay and dialogs follow the UI language.
#[tauri::command]
pub fn app_set_locale<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, locale: String) {
    if !descall_shell::bridge::sets_ui_locale(window.label()) {
        return;
    }
    let locale: String = locale.chars().take(16).collect();
    if state::set_ui_locale(&app, &locale) {
        crate::premium::set_locale(&locale);
        crate::tray::rebuild(&app);
        crate::commands::overlay::refresh_language(&app);
    }
}

/// app:boot-retry ("Tekrar dene"): Service Worker + Cache Storage + HTTP cache, then reload.
/// localStorage, IndexedDB and cookies are never touched (the session lives there).
#[tauri::command]
pub fn app_boot_retry<R: Runtime>(window: WebviewWindow<R>) {
    if window.label() != state::MAIN {
        return;
    }
    log::warn!("[boot] page asked for a boot retry");
    crate::webview::clear_and_reload(&window, "page-retry");
}

/// app:boot-state milestones (index.html / React). Feeds the paint watchdog; app-mounted also
/// finishes the migrator's health handshake on a migrated start (crate::migration).
#[tauri::command]
pub fn app_boot_state<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, phase: String, ms: f64) {
    if window.label() != state::MAIN {
        return;
    }
    let Some(report) = watchdog::normalize_boot_report(&phase, ms) else { return };
    log::info!("[boot] page {} ({} ms)", report.phase, report.ms.map(|m| m.to_string()).unwrap_or_else(|| "?".into()));
    {
        let sh = shell(&app);
        let mut b = sh.boot.lock().unwrap();
        if watchdog::ends_paint_watch(report.phase) {
            b.painted = true;
        }
        if report.phase == "app-mounted" {
            b.mounted = true;
        }
    }
    if report.phase == "app-mounted" {
        crate::migration::on_app_mounted(&app);
    }
    if report.phase == "inline-missing" {
        log::error!("[boot] index.html inline boot scripts did not run (CSP hash mismatch?)");
    }
}

/// native-theme:reduced-transparency (sendSync in Electron; the shim answers from the boot
/// snapshot and this command refreshes it).
#[tauri::command]
pub fn app_reduced_transparency() -> bool {
    crate::platform::reduced_transparency()
}

/// voice:set-busy: DM / group / server voice (ringing counts). Main window only.
#[tauri::command]
pub fn voice_set_busy<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, busy: bool) {
    if window.label() != state::MAIN {
        return;
    }
    if shell(&app).voice_busy.swap(busy, Ordering::AcqRel) != busy {
        crate::commands::updates::note_busy(&app);
    }
}

/// activity:set-busy: unsent composer text, an upload or a voice-message recording.
#[tauri::command]
pub fn activity_set_busy<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, busy: bool) {
    if window.label() != state::MAIN {
        return;
    }
    if shell(&app).user_busy.swap(busy, Ordering::AcqRel) != busy {
        crate::commands::updates::note_busy(&app);
    }
}
