//! The app side of the Electron -> Tauri migration (desktop/crates/descall-migrate). The
//! pure rules live in `descall_migrate::app` (tested there together with the migrator's half);
//! this module adds the I/O.
//!
//! - Start: DescallMigrator runs `Descall.exe --migrated --migration-id <id> [--hidden]`.
//!   [`begin`] (first thing in main) writes health `started`; any other start is untouched
//!   (unknown arguments such as `-Embedding` are ignored).
//! - Import: boot::import_from_electron_once takes the DPAPI-sealed handoff once
//!   (`%LOCALAPPDATA%\Descall-Migration\handoff.bin`, shredded after reading) and reports
//!   the outcome here ([`note_import`]).
//! - Ready: when the page reports `app-mounted` ([`on_app_mounted`]) and the handoff was
//!   imported, the app checks the imported session itself (`GET /api/auth/me`) and writes
//!   health `ready` (or `ready` + `signedOut` when the handoff had no session). A missing or
//!   invalid handoff, a refused session or a crash at start writes `failed` with a code, so
//!   the migrator rolls back to Electron at once instead of waiting for its timeout.
//! - Health file: `%APPDATA%\com.descall.app\migration\health.json`, the same `%APPDATA%`
//!   the migrator reads (`win::env_from_process`), written atomically by `health::write`.
//! - Cleanup: [`cleanup_on_start`] runs `runner::run_cleanup` (removes the `.legacy` install
//!   14 days after the commit) on every start, off the UI thread, and asks for elevation for a
//!   machine-wide old install.
//! - Reports: `done` after the migrator committed, and the cleanup outcome, to
//!   `POST /api/desktop/migration/report` (failures are reported by the Electron bridge
//!   after the rollback, with this app's health code).

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use descall_migrate::app::{codes, AuthCheck, Reporter};
use tauri::{AppHandle, Runtime};

/// Same backend as the page (frontend/src/config/api.js PRODUCTION_URL).
const AUTH_ME_URL: &str = "https://des-call.onrender.com/api/auth/me";
const AUTH_TIMEOUT_SECS: u64 = 8;
const AUTH_RETRY_SECS: u64 = 5;
/// 15 minutes, the longest health timeout a job may ask for (job::MAX_HEALTH_TIMEOUT_SECS):
/// the migrator's own deadline always decides first.
const AUTH_MAX_TRIES: u32 = 15 * 60 / AUTH_RETRY_SECS as u32;
/// Let the first start settle before touching the old install.
const CLEANUP_DELAY_SECS: u64 = 30;
const REPORT_URL: &str = "https://des-call.onrender.com/api/desktop/migration/report";
/// Waiting for the migrator's commit after `ready` (it commits within seconds).
const COMMIT_WAIT_TRIES: u32 = 120;
#[cfg(windows)]
const MIGRATOR_EXE: &str = "DescallMigrator.exe";
#[cfg(windows)]
const ELEVATED_TIMEOUT_MS: u32 = 10 * 60 * 1000;

struct Run {
    reporter: Reporter,
    appdata: PathBuf,
}

static RUN: OnceLock<Run> = OnceLock::new();

/// What the one-time import found on a migrated start.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Import {
    /// The handoff was applied; `session_key` names the secret-store entry to check
    /// (None: the handoff carried no session).
    Imported { session_key: Option<String> },
    Missing,
    Invalid,
}

struct Progress {
    import: Option<Import>,
    checking: bool,
    finished: bool,
}

static PROGRESS: Mutex<Progress> = Mutex::new(Progress { import: None, checking: false, finished: false });

/// Call first in main(): on a migrated start, remember the run and write `started`.
pub fn begin<S: AsRef<str>>(argv: &[S]) {
    let Some(id) = descall_migrate::app::migration_id_from_args(argv) else { return };
    let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) else { return };
    let health = std::fs::read(descall_migrate::health::health_path(&appdata)).ok();
    if descall_migrate::app::handshake_finished(health.as_deref(), &id) {
        log::info!("[migration] relaunch with the migrator's arguments after the handshake: normal start");
        return;
    }
    let reporter = Reporter { migration_id: id, pid: std::process::id(), version: env!("CARGO_PKG_VERSION").to_string() };
    if RUN.set(Run { reporter, appdata }).is_ok() {
        log::info!("[migration] started by the migrator");
        if let Some(run) = RUN.get() {
            write(run, &run.reporter.started(descall_migrate::unix_now()));
        }
    }
}

/// The migration id of this start (None for a normal start).
pub fn migration_id() -> Option<&'static str> {
    RUN.get().map(|r| r.reporter.migration_id.as_str())
}

pub fn note_import(outcome: Import) {
    if let Ok(mut p) = PROGRESS.lock() {
        p.import = Some(outcome);
    }
}

fn write(run: &Run, report: &descall_migrate::health::HealthReport) {
    if let Err(e) = descall_migrate::health::write(&run.appdata, report) {
        log::warn!("[migration] health.json ({}): {e}", report.stage);
    }
}

/// Write `failed` once (safe from the panic hook: never blocks on the progress lock).
pub fn fail(code: &str) {
    let Some(run) = RUN.get() else { return };
    if let Ok(mut p) = PROGRESS.try_lock() {
        if p.finished {
            return;
        }
        p.finished = true;
    }
    log::warn!("[migration] reporting failure: {code}");
    write(run, &run.reporter.failed(descall_migrate::unix_now(), code));
}

fn ready<R: Runtime>(app: &AppHandle<R>, signed_out: bool) {
    let Some(run) = RUN.get() else { return };
    if let Ok(mut p) = PROGRESS.lock() {
        if p.finished {
            return;
        }
        p.finished = true;
    }
    log::info!("[migration] ready (signed out: {signed_out})");
    write(run, &run.reporter.ready(descall_migrate::unix_now(), signed_out));
    // The migrator commits next; report the finished move to the server once it has.
    let app = app.clone();
    tauri::async_runtime::spawn(async move { report_done_when_committed(app).await });
}

/// The page reported `app-mounted`: finish the health handshake (once per start).
pub fn on_app_mounted<R: Runtime>(app: &AppHandle<R>) {
    if RUN.get().is_none() {
        return;
    }
    let import = {
        let Ok(mut p) = PROGRESS.lock() else { return };
        if p.finished || p.checking {
            return;
        }
        let import = p.import.clone();
        if matches!(import, Some(Import::Imported { session_key: Some(_) })) {
            p.checking = true;
        }
        import
    };
    match import {
        None | Some(Import::Missing) => fail(codes::HANDOFF_MISSING),
        Some(Import::Invalid) => fail(codes::HANDOFF_INVALID),
        Some(Import::Imported { session_key: None }) => ready(app, true),
        Some(Import::Imported { session_key: Some(key) }) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move { check_session(app, key).await });
        }
    }
}

/// `GET /api/auth/me` with the imported session, retried until it answers.
fn http_client() -> Option<reqwest::Client> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("Descall-Desktop/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(AUTH_TIMEOUT_SECS))
        .build()
        .map_err(|e| log::warn!("[migration] http client: {e}"))
        .ok()
}

async fn check_session<R: Runtime>(app: AppHandle<R>, key: String) {
    let Some(client) = http_client() else { return };
    let mut seen = false;
    for _ in 0..AUTH_MAX_TRIES {
        // Read the sealed token each time: the page may have refreshed it meanwhile.
        let Some(token) = crate::secure_store::get(&app, &key) else {
            // Gone after it was there: the user signed out in the new app (the page cleared
            // the store), which proves it runs. Rolling back to Electron for that would undo
            // a working move; missing from the start, the import did not land: fail.
            if seen {
                return ready(&app, true);
            }
            fail(codes::AUTH_REJECTED);
            return;
        };
        seen = true;
        let status = client.get(AUTH_ME_URL).bearer_auth(token).send().await.map(|r| r.status().as_u16()).unwrap_or(0);
        match descall_migrate::app::auth_check(status) {
            AuthCheck::Ok => return ready(&app, false),
            AuthCheck::Rejected => return fail(codes::AUTH_REJECTED),
            AuthCheck::Retry => log::info!("[migration] auth check: {status}, retrying"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(AUTH_RETRY_SECS)).await;
    }
}

// ---- outcome reports -------------------------------------------------------------------------
// See descall_migrate::app: the new app reports `done` once the migrator committed (rollbacks
// are reported by the Electron bridge, with the health code as `app_<code>`), and the outcome
// of the 14-day cleanup. Signed-in only (the endpoint needs the session); a report that
// cannot go out now is retried on the next start.

/// One report at a time (the post-ready task and the start-up retry may overlap).
static REPORTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// POST the report with the owner's session. True when the server took it.
async fn post_report<R: Runtime>(app: &AppHandle<R>, body: &serde_json::Value) -> bool {
    let Some(token) = crate::secure_store::get(app, crate::secure_store::TOKEN) else { return false };
    let Some(client) = http_client() else { return false };
    match client.post(REPORT_URL).bearer_auth(token).json(body).send().await {
        Ok(r) if r.status().is_success() => true,
        Ok(r) => {
            log::warn!("[migration] report {}: HTTP {}", body["event"], r.status());
            false
        }
        Err(e) => {
            log::info!("[migration] report {}: {e}", body["event"]);
            false
        }
    }
}

/// `done` for a committed move that the server has not seen yet; marks state.json after.
async fn report_pending_done<R: Runtime>(app: &AppHandle<R>, work_dir: &std::path::Path) -> bool {
    use std::sync::atomic::Ordering;
    let path = descall_migrate::state::state_path(work_dir);
    let Ok(bytes) = std::fs::read(&path) else { return false };
    let Some(body) = descall_migrate::app::pending_done_report(&bytes, env!("CARGO_PKG_VERSION")) else { return false };
    if REPORTING.swap(true, Ordering::AcqRel) {
        return false;
    }
    let sent = post_report(app, &body).await;
    if sent {
        // Re-read: only the `reported` flag changes, and the migrator is done with the file.
        if let Some(marked) = std::fs::read(&path).ok().and_then(|b| descall_migrate::app::mark_reported(&b)) {
            let _ = descall_migrate::write_atomic(&path, &marked);
        }
        log::info!("[migration] outcome reported: done");
    }
    REPORTING.store(false, Ordering::Release);
    sent
}

/// After `ready`: wait for the migrator's commit (state.json step `done`), then report it.
async fn report_done_when_committed<R: Runtime>(app: AppHandle<R>) {
    let Some(work_dir) = work_dir() else { return };
    for _ in 0..COMMIT_WAIT_TRIES {
        tokio::time::sleep(std::time::Duration::from_secs(AUTH_RETRY_SECS)).await;
        if report_pending_done(&app, &work_dir).await {
            return;
        }
    }
}

async fn report_cleanup<R: Runtime>(app: &AppHandle<R>, work_dir: &std::path::Path, done: bool, code: Option<&str>) {
    let Ok(bytes) = std::fs::read(descall_migrate::state::state_path(work_dir)) else { return };
    if let Some(body) = descall_migrate::app::cleanup_report(&bytes, done, code, env!("CARGO_PKG_VERSION")) {
        post_report(app, &body).await;
    }
}

/// `%LOCALAPPDATA%\Descall-Migration`, the folder the migrator reads (from the environment).
fn work_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        descall_migrate::win::env_from_process().map(|e| e.work_dir)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

// ---- 14-day cleanup ----------------------------------------------------------------------------

/// On every start, off the UI thread: report a committed move that is still unreported, run
/// the 14-day cleanup of the old Electron install (descall_migrate::runner::run_cleanup) and
/// report its outcome. A machine-wide old install needs `DescallMigrator.exe --cleanup-machine`
/// elevated: the UAC prompt is shown only while the window is on screen, and at most
/// `MAX_ELEVATION_ASKS` times a week apart (descall_migrate::app::ElevationAsks).
pub fn cleanup_on_start<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    {
        let app = app.clone();
        let _ = std::thread::Builder::new().name("descall-legacy-cleanup".into()).spawn(move || {
            use descall_migrate::runner::CleanupResult;
            std::thread::sleep(std::time::Duration::from_secs(CLEANUP_DELAY_SECS));
            let Some(env) = descall_migrate::win::env_from_process() else { return };
            if !env.work_dir.exists() {
                return; // never migrated
            }
            tauri::async_runtime::block_on(report_pending_done(&app, &env.work_dir));
            let sys = descall_migrate::win::WinSys::new(&env);
            let result = descall_migrate::runner::run_cleanup(&sys, &env, false);
            match &result {
                CleanupResult::NothingToDo | CleanupResult::NotDue => {}
                r => log::info!("[migration] legacy cleanup: {r:?}"),
            }
            match result {
                CleanupResult::Done => tauri::async_runtime::block_on(report_cleanup(&app, &env.work_dir, true, None)),
                CleanupResult::Failed(code) => tauri::async_runtime::block_on(report_cleanup(&app, &env.work_dir, false, Some(&code))),
                CleanupResult::NeedsElevation => machine_cleanup(&app, &env.work_dir),
                CleanupResult::NothingToDo | CleanupResult::NotDue => {}
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (app, CLEANUP_DELAY_SECS);
    }
}

#[cfg(windows)]
fn machine_cleanup<R: Runtime>(app: &AppHandle<R>, work_dir: &std::path::Path) {
    use descall_migrate::app::ElevationAsks;
    let path = ElevationAsks::path(work_dir);
    let mut asks = ElevationAsks::parse(std::fs::read(&path).ok().as_deref());
    let now = descall_migrate::unix_now();
    if !asks.may_ask(now) {
        return;
    }
    let exe = work_dir.join(MIGRATOR_EXE);
    if !exe.exists() {
        log::warn!("[migration] machine-wide cleanup due, but {MIGRATOR_EXE} is gone");
        return;
    }
    // A UAC prompt out of nowhere while Descall sits in the tray would look suspicious.
    let on_screen = crate::state::main_window(app).is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(true));
    if !on_screen {
        return;
    }
    let outcome = run_elevated(&exe, "--cleanup-machine");
    log::info!("[migration] machine-wide cleanup: {outcome:?}");
    asks.note(now, &outcome);
    if let Ok(b) = serde_json::to_vec(&asks) {
        let _ = descall_migrate::write_atomic(&path, &b);
    }
    let (done, code) = outcome.report();
    tauri::async_runtime::block_on(report_cleanup(app, work_dir, done, code));
}

/// ShellExecuteEx "runas" (the UAC prompt), then wait for the elevated process.
#[cfg(windows)]
fn run_elevated(exe: &std::path::Path, params: &str) -> descall_migrate::app::ElevatedRun {
    use descall_migrate::app::ElevatedRun;
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, ERROR_CANCELLED, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let file = HSTRING::from(exe.as_os_str());
    let args = HSTRING::from(params);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        lpVerb: w!("runas"),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(args.as_ptr()),
        nShow: SW_HIDE.0,
        ..Default::default()
    };
    if let Err(e) = unsafe { ShellExecuteExW(&mut info) } {
        return if e.code() == ERROR_CANCELLED.to_hresult() { ElevatedRun::Declined } else { ElevatedRun::Failed };
    }
    if info.hProcess.is_invalid() {
        return ElevatedRun::Failed;
    }
    let mut code = 0u32;
    let finished = unsafe { WaitForSingleObject(info.hProcess, ELEVATED_TIMEOUT_MS) } == WAIT_OBJECT_0;
    let read = finished && unsafe { GetExitCodeProcess(info.hProcess, &mut code) }.is_ok();
    unsafe {
        let _ = CloseHandle(info.hProcess);
    }
    if read {
        ElevatedRun::Exit(code as i32)
    } else {
        ElevatedRun::Failed
    }
}
#[cfg(test)]
mod tests {
    use descall_shell::launch::{decide_cold_start, StartAction};

    /// The migrator's command line goes through the app's cold-start rule unchanged:
    /// `--hidden` keeps the window in the tray like Electron was, anything else shows it.
    #[test]
    fn migrated_starts_follow_the_cold_start_rule() {
        let exe = r"C:\Apps\Descall\Descall.exe".to_string();
        let argv = |hidden: bool| -> Vec<String> { std::iter::once(exe.clone()).chain(descall_migrate::app::launch_args("mig-1234-x", hidden)).collect() };
        assert_eq!(decide_cold_start(&argv(false), None, false).action, StartAction::Show);
        assert_eq!(decide_cold_start(&argv(true), None, false).action, StartAction::Hide);
        assert_eq!(descall_migrate::app::migration_id_from_args(&argv(true)).as_deref(), Some("mig-1234-x"));
        // Windows COM activation (toast activator) is a normal start, not a migration.
        let com = [exe.clone(), "-Embedding".to_string()];
        assert_eq!(decide_cold_start(&com, None, false).action, StartAction::Show);
        assert_eq!(descall_migrate::app::migration_id_from_args(&com), None);
    }

    /// A sign-out in the new app while the health check runs is not a failed move (it rolled
    /// back a working migration to Electron); a session that never landed still fails.
    #[test]
    fn sign_out_during_the_check_is_ready_signed_out() {
        let src = include_str!("migration.rs");
        let body = &src[src.find("async fn check_session").unwrap()..src.find("// ---- outcome reports").unwrap()];
        let missing = &body[body.find("secure_store::get(&app, &key) else {").unwrap()..];
        let missing = &missing[..missing.find("seen = true;").unwrap()];
        assert!(missing.find("if seen {").unwrap() < missing.find("return ready(&app, true);").unwrap());
        assert!(missing.contains("fail(codes::AUTH_REJECTED);"), "never there: the import failed");
    }

    #[test]
    fn auth_retries_outlast_the_longest_health_timeout() {
        assert!(u64::from(super::AUTH_MAX_TRIES) * super::AUTH_RETRY_SECS >= descall_migrate::job::MAX_HEALTH_TIMEOUT_SECS);
    }
}
