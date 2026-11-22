//! electron-updater replacement: tauri-plugin-updater (minisign-verified) with the same
//! deferral rules as main.cjs + updateDeferral.cjs (descall_shell::deferral): download any
//! time; install only when no call, no typing / upload, and the user is away (post-call
//! grace elapsed, locked, idle 2 min, or 12 s in the background), or on an explicit
//! confirmed restart. Same page events: update:downloading, update:progress, update:ready,
//! update:installing, update:error, update:confirm-restart.

use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::Duration;

use descall_shell::deferral::{self, Action, Event};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::UpdaterExt;

use crate::state::{self, now_ms, shell, to_main};

#[derive(Default)]
pub struct Updates {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    deferral: deferral::State,
    version: Option<String>,
    staged: Option<(tauri_plugin_updater::Update, Vec<u8>)>,
    check_in_flight: bool,
    /// Version being downloaded right now (a check that finds one in flight reports it).
    downloading: Option<String>,
    install_started: bool,
    poll_running: bool,
    last_hold: Option<&'static str>,
}

/// The updater is usable only once a real minisign public key is configured.
pub fn configured<R: Runtime>(app: &AppHandle<R>) -> bool {
    let key = app.config().plugins.0.get("updater").and_then(|u| u.get("pubkey")).and_then(Value::as_str).unwrap_or("");
    !key.is_empty() && !key.starts_with("REPLACE")
}

fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    !state::is_dev() && configured(app)
}

pub fn is_ready<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<Updates>().inner.lock().unwrap().deferral.update_ready
}

pub fn ready_version<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let u = app.state::<Updates>();
    let i = u.inner.lock().unwrap();
    i.deferral.update_ready.then(|| i.version.clone()).flatten()
}

/// Busy with a live session: the page's flag or a visible voice overlay (isBusyWithLiveSession).
fn live_busy<R: Runtime>(app: &AppHandle<R>) -> bool {
    shell(app).voice_busy.load(Ordering::Acquire) || crate::commands::overlay::is_visible(app)
}

/// syncDeferralSignals: fold the current busy / presence readings into the state.
fn sync<R: Runtime>(app: &AppHandle<R>, inner: &mut Inner) {
    let now = now_ms();
    let busy = live_busy(app);
    if busy != inner.deferral.voice_busy {
        inner.deferral = deferral::apply(&inner.deferral, Event::VoiceBusy(busy), now);
    }
    let user = shell(app).user_busy.load(Ordering::Acquire);
    if user != inner.deferral.user_busy {
        inner.deferral = deferral::apply(&inner.deferral, Event::UserBusy(user), now);
    }
    inner.deferral = deferral::apply(
        &inner.deferral,
        Event::Presence {
            app_in_background: state::app_in_background(app),
            system_idle_ms: crate::platform::system_idle_ms(),
            session_locked: crate::platform::session_locked(),
            prelaunch: false,
        },
        now,
    );
}

/// voice:set-busy / activity:set-busy from the page.
pub fn note_busy<R: Runtime>(app: &AppHandle<R>) {
    let ready = {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        sync(app, &mut i);
        i.deferral.update_ready
    };
    if ready {
        evaluate(app, "busy-change");
    }
}

/// Page crash / reload: a call cannot survive it; post-call grace still applies.
pub fn reset_voice<R: Runtime>(app: &AppHandle<R>) {
    shell(app).voice_busy.store(false, Ordering::Release);
    shell(app).user_busy.store(false, Ordering::Release);
    let u = app.state::<Updates>();
    let mut i = u.inner.lock().unwrap();
    i.deferral = deferral::apply(&i.deferral, Event::ResetVoice, now_ms());
}

/// Install the staged update now. The plugin starts the NSIS installer (passive) and exits.
fn install<R: Runtime>(app: &AppHandle<R>, reason: &str, allow_during_call: bool) -> bool {
    if !allow_during_call && live_busy(app) {
        log::info!("[updater] install blocked, voice session active ({reason})");
        return false;
    }
    let (update, bytes, version) = {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        if i.install_started {
            return true;
        }
        let Some((update, bytes)) = i.staged.take() else { return false };
        i.install_started = true;
        (update, bytes, i.version.clone())
    };
    log::info!("[updater] install ({reason}) -> v{}", version.clone().unwrap_or_default());
    to_main(app, "update:installing", json!({ "version": version }));
    let relaunch = relaunch_after_install(reason);
    if relaunch {
        crate::boot::write_relaunch_marker(app);
    }
    state::set_quitting(app);
    let update = update.restart_after_install(relaunch);
    match update.install(&bytes) {
        Ok(()) => {
            app.exit(0);
            true
        }
        Err(e) => {
            log::error!("[updater] install failed: {e}");
            crate::boot::clear_relaunch_marker(app);
            let u = app.state::<Updates>();
            let mut i = u.inner.lock().unwrap();
            i.install_started = false;
            i.staged = Some((update.restart_after_install(true), bytes));
            shell(app).quitting.store(false, Ordering::Release);
            to_main(app, "update:error", error_payload(&e.to_string(), "install"));
            false
        }
    }
}

/// The user quit Descall (tray Quit, ExitRequested) with an update staged: install it but do
/// not start the app again, as electron main.cjs before-quit (startUpdateInstall forceRun
/// false). The plugin's default (/R) brought the app back right after the user quit it.
/// Every other install (quiet moment, Restart now, confirmed restart) relaunches.
fn relaunch_after_install(reason: &str) -> bool {
    reason != "quit"
}

/// evaluatePendingUpdate: decide, re-check right before installing.
pub fn evaluate<R: Runtime>(app: &AppHandle<R>, why: &str) {
    let decision = {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        if !i.deferral.update_ready || i.install_started {
            return;
        }
        sync(app, &mut i);
        let d = deferral::decide(&i.deferral, now_ms(), false);
        if d.action != Action::Install {
            if i.last_hold != Some(d.reason) {
                log::info!("[updater] holding staged update ({})", d.reason);
                i.last_hold = Some(d.reason);
            }
            return;
        }
        sync(app, &mut i);
        let again = deferral::decide(&i.deferral, now_ms(), false);
        if again.action != Action::Install {
            i.last_hold = Some(again.reason);
            return;
        }
        i.last_hold = None;
        again
    };
    log::info!("[updater] applying staged update ({} via {why})", decision.reason);
    install(app, decision.reason, false);
}

fn start_poll<R: Runtime>(app: &AppHandle<R>) {
    {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        if i.poll_running {
            return;
        }
        i.poll_running = true;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(deferral::UPDATE_INSTALL_POLL_MS)).await;
            if !is_ready(&app) {
                break;
            }
            evaluate(&app, "poll");
        }
        app.state::<Updates>().inner.lock().unwrap().poll_running = false;
    });
}

/// checkForAppUpdates: check, download (with progress), stage, start the install poll.
pub async fn check<R: Runtime>(app: AppHandle<R>, reason: &str) -> Result<Value, String> {
    if !enabled(&app) {
        return Ok(json!({ "success": true, "skipped": true }));
    }
    {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        if i.deferral.update_ready || i.check_in_flight {
            // Settings > Desktop app "Check" during a download used to read "up to date".
            return Ok(in_flight_result(i.deferral.update_ready, i.version.clone(), i.downloading.clone()));
        }
        i.check_in_flight = true;
    }
    log::info!("[updater] checking ({reason}), current {}", app.package_info().version);
    let result = check_and_stage(&app).await;
    {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        i.check_in_flight = false;
        i.downloading = None;
    }
    match result {
        Ok(version) => {
            let (ready, v) = {
                let u = app.state::<Updates>();
                let i = u.inner.lock().unwrap();
                (i.deferral.update_ready, i.version.clone())
            };
            Ok(check_result(version, ready, v))
        }
        Err((phase, e)) => {
            let message = error_message(&e);
            log::warn!("[updater] {phase} failed ({reason}): {message}");
            to_main(&app, "update:error", error_payload(&e, phase));
            Err(message)
        }
    }
}

/// check-for-updates answer, as main.cjs: `available` tells the update card whether anything
/// newer exists (ElectronUpdateToast.jsx drops the card when it is false); a staged one counts.
fn check_result(version: Option<String>, ready: bool, ready_version: Option<String>) -> Value {
    json!({
        "success": true,
        "available": version.is_some() || ready,
        "updateInfo": version.map(|v| json!({ "version": v })),
        "updateReady": ready,
        "updateVersion": ready_version,
    })
}

/// check-for-updates while a check / download already runs or an update is staged.
fn in_flight_result(ready: bool, ready_version: Option<String>, downloading: Option<String>) -> Value {
    json!({
        "success": true,
        "available": ready || downloading.is_some(),
        "updateInfo": downloading.map(|v| json!({ "version": v })),
        "updateReady": ready,
        "updateVersion": ready_version,
    })
}

/// update:error text: no local paths or user names (temp file errors), at most 200 chars.
pub fn error_message(e: &str) -> String {
    descall_shell::main_errors::scrub_paths(e).chars().take(200).collect()
}

/// update:error, as main.cjs: the scrubbed message and the phase. 'download' = a visible
/// download failed (the card offers retry); 'check' = a quiet background check, which the
/// page does not surface; 'install' = the staged installer did not start.
fn error_payload(message: &str, phase: &'static str) -> Value {
    json!({ "message": error_message(message), "phase": phase })
}

/// No request may hang: reqwest has no timeout by default, so one stalled connection to the
/// first endpoint (or a half-open download) kept `check_in_flight` set forever and the app never
/// checked again until restarted. Connect / read-gap limits, not a total limit, so a slow but
/// moving download of the installer still finishes.
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
pub const READ_TIMEOUT: Duration = Duration::from_secs(45);

fn updater_for<R: Runtime>(app: &AppHandle<R>) -> tauri_plugin_updater::Result<tauri_plugin_updater::Updater> {
    let handle = app.clone();
    app.updater_builder()
        .configure_client(|b| b.connect_timeout(CONNECT_TIMEOUT).read_timeout(READ_TIMEOUT))
        // install() ends the process with std::process::exit right after starting the
        // installer, so RunEvent::Exit never runs: drop the tray icon (no ghost icon in the
        // notification area until hovered), hide the windows and flush the log first.
        .on_before_exit(move || {
            log::info!("[updater] installer starting, app exits");
            log::logger().flush();
            handle.cleanup_before_exit();
        })
        .build()
}

async fn check_and_stage<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, (&'static str, String)> {
    let updater = updater_for(app).map_err(|e| ("check", e.to_string()))?;
    let Some(update) = updater.check().await.map_err(|e| ("check", e.to_string()))? else { return Ok(None) };
    let version = update.version.clone();
    app.state::<Updates>().inner.lock().unwrap().downloading = Some(version.clone());
    to_main(app, "update:downloading", json!({ "version": version }));
    let app_p = app.clone();
    let (mut got, mut last_emit, started) = (0u64, 0u64, now_ms());
    let ver_p = version.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                got += chunk as u64;
                let now = now_ms();
                if now.saturating_sub(last_emit) < 250 && Some(got) != total {
                    return;
                }
                last_emit = now;
                let elapsed = (now.saturating_sub(started)).max(1) as f64 / 1000.0;
                let percent = total.map(|t| got as f64 * 100.0 / t.max(1) as f64).unwrap_or(0.0);
                to_main(&app_p, "update:progress", json!({ "percent": percent, "bytesPerSecond": (got as f64 / elapsed).round(), "transferred": got, "total": total, "version": ver_p }));
            },
            || {},
        )
        .await
        .map_err(|e| ("download", e.to_string()))?;
    let busy = live_busy(app);
    {
        let u = app.state::<Updates>();
        let mut i = u.inner.lock().unwrap();
        sync(app, &mut i);
        i.deferral = deferral::apply(&i.deferral, Event::UpdateReady, now_ms());
        i.version = Some(version.clone());
        i.staged = Some((update, bytes));
    }
    log::info!("[updater] update downloaded: {version}");
    to_main(app, "update:ready", json!({ "version": version, "deferred": busy }));
    to_main(app, "update-downloaded", json!({ "version": version }));
    crate::tray::rebuild(app);
    let key = if busy { "update.downloadedDeferred" } else { "update.downloaded" };
    let body = state::et(app, key, &[("version", &version)]);
    let _ = crate::commands::notify::show_capsule(app, "Descall", &json!({ "body": body, "tag": "descall-update", "data": { "type": "announcement" } }));
    start_poll(app);
    evaluate(app, "staged");
    Ok(Some(version))
}

/// Background checks: 45 s after start, then every 5 minutes (incl. tray), as main.cjs.
pub fn schedule_background_checks<R: Runtime>(app: &AppHandle<R>) {
    if !enabled(app) {
        log::info!("[updater] background checks off (debug build or no updater key)");
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(45)).await;
        loop {
            let _ = check(app.clone(), "interval").await;
            tokio::time::sleep(Duration::from_millis(deferral::UPDATE_CHECK_INTERVAL_MS)).await;
        }
    });
}

/// requestExplicitInstall: tray "Update and quit", the page's Restart button.
pub fn request_explicit_install<R: Runtime>(app: &AppHandle<R>, reason: &str) -> Value {
    if !is_ready(app) {
        // app.restart() keeps argv: without the marker a login start (`--autostart --hidden`)
        // would come back hidden after the user pressed Restart.
        crate::boot::write_relaunch_marker(app);
        state::set_quitting(app);
        app.restart();
    }
    if live_busy(app) {
        state::show_main(app);
        to_main(app, "update:confirm-restart", json!({ "version": ready_version(app), "reason": reason }));
        return json!({ "needsConfirm": true, "installing": false });
    }
    let installing = install(app, reason, false);
    json!({ "installing": installing, "needsConfirm": false })
}

/// On quit with a staged update (autoInstallOnAppQuit).
pub fn install_on_quit<R: Runtime>(app: &AppHandle<R>) {
    if is_ready(app) {
        let _ = install(app, "quit", true);
    }
}

#[tauri::command]
pub async fn updates_check<R: Runtime>(app: AppHandle<R>) -> Value {
    match check(app, "ipc").await {
        Ok(v) => v,
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// restart-app (confirmed = false) / restart-app-confirmed (true).
#[tauri::command]
pub fn updates_restart<R: Runtime>(app: AppHandle<R>, confirmed: bool) -> Value {
    if !confirmed {
        return request_explicit_install(&app, "ipc");
    }
    if !is_ready(&app) {
        crate::boot::write_relaunch_marker(&app);
        state::set_quitting(&app);
        app.restart();
    }
    // The user explicitly chose to end the call and restart.
    let ok = {
        let u = app.state::<Updates>();
        let i = u.inner.lock().unwrap();
        deferral::decide(&i.deferral, now_ms(), true).reason == "user-confirmed"
    };
    let installing = ok && install(&app, "user-confirmed", true);
    json!({ "installing": installing })
}

#[tauri::command]
pub fn updates_status<R: Runtime>(app: AppHandle<R>) -> Value {
    json!({ "updateReady": is_ready(&app), "updateVersion": ready_version(&app) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quitting_installs_without_relaunch() {
        assert!(!relaunch_after_install("quit"));
        for reason in ["ipc", "user-confirmed", "idle", "background", "locked", "post-call-grace"] {
            assert!(relaunch_after_install(reason), "{reason}");
        }
        let src = include_str!("updates.rs");
        assert!(src.contains("install(app, \"quit\", true)"), "install_on_quit passes the quit reason");
    }

    /// A stalled endpoint must fail the check (and free check_in_flight), not hang it.
    #[test]
    fn update_requests_have_timeouts() {
        let src = include_str!("updates.rs");
        let check = &src[src.find("async fn check_and_stage").unwrap()..];
        assert!(check[..300].contains("updater_for(app)"), "checks use the configured updater");
        assert!(src.contains(".connect_timeout(CONNECT_TIMEOUT).read_timeout(READ_TIMEOUT)"));
        assert!(CONNECT_TIMEOUT.as_secs() <= 30 && READ_TIMEOUT.as_secs() <= 60);
        assert!(src.contains("handle.cleanup_before_exit()"), "tray icon removed before the process exits");
    }

    #[test]
    fn update_errors_carry_no_user_paths() {
        let m = super::error_message(r"failed to write C:\Users\demir\AppData\Local\Temp\Descall_4.1.0_x64-setup.exe: disk full");
        assert!(!m.contains("demir") && m.contains("disk full"), "{m}");
        assert!(super::error_message(&"x".repeat(500)).chars().count() == 200);
        assert!(!error_payload(r"open C:\Users\demir\x.exe failed", "install")["message"].as_str().unwrap().contains("demir"));
    }

    /// ElectronUpdateToast.jsx reads `available` (retry card) and update:error `phase`.
    #[test]
    fn answers_match_main_cjs() {
        let none = check_result(None, false, None);
        assert_eq!(none["available"], json!(false));
        assert_eq!(none["success"], json!(true));
        let found = check_result(Some("4.2.0".into()), true, Some("4.2.0".into()));
        assert_eq!(found["available"], json!(true));
        assert_eq!(found["updateInfo"]["version"], json!("4.2.0"));
        assert_eq!(found["updateReady"], json!(true));
        // A second Check while 4.2.0 downloads: available, not "up to date".
        let busy = in_flight_result(false, None, Some("4.2.0".into()));
        assert_eq!(busy["available"], json!(true));
        assert_eq!(busy["updateInfo"]["version"], json!("4.2.0"));
        assert_eq!(in_flight_result(false, None, None)["available"], json!(false));
        assert_eq!(in_flight_result(true, Some("4.2.0".into()), None)["updateReady"], json!(true));
        let long = "x".repeat(500);
        let e = error_payload(&long, "download");
        assert_eq!(e["phase"], json!("download"));
        assert_eq!(e["message"].as_str().unwrap().chars().count(), 200);
    }
}
