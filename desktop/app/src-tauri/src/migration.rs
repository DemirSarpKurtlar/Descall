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
//!   14 days after the commit) on every start, off the UI thread.

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

fn ready(signed_out: bool) {
    let Some(run) = RUN.get() else { return };
    if let Ok(mut p) = PROGRESS.lock() {
        if p.finished {
            return;
        }
        p.finished = true;
    }
    log::info!("[migration] ready (signed out: {signed_out})");
    write(run, &run.reporter.ready(descall_migrate::unix_now(), signed_out));
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
        Some(Import::Imported { session_key: None }) => ready(true),
        Some(Import::Imported { session_key: Some(key) }) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move { check_session(app, key).await });
        }
    }
}

/// `GET /api/auth/me` with the imported session, retried until it answers.
async fn check_session<R: Runtime>(app: AppHandle<R>, key: String) {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = match reqwest::Client::builder()
        .user_agent(concat!("Descall-Desktop/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(AUTH_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("[migration] http client: {e}");
            return;
        }
    };
    for _ in 0..AUTH_MAX_TRIES {
        // Read the sealed token each time: the page may have refreshed it meanwhile.
        let Some(token) = crate::secure_store::get(&app, &key) else {
            fail(codes::AUTH_REJECTED);
            return;
        };
        let status = client.get(AUTH_ME_URL).bearer_auth(token).send().await.map(|r| r.status().as_u16()).unwrap_or(0);
        match descall_migrate::app::auth_check(status) {
            AuthCheck::Ok => return ready(false),
            AuthCheck::Rejected => return fail(codes::AUTH_REJECTED),
            AuthCheck::Retry => log::info!("[migration] auth check: {status}, retrying"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(AUTH_RETRY_SECS)).await;
    }
}

/// The 14-day cleanup of the old Electron install (descall_migrate::runner::run_cleanup).
/// A machine-wide install needs `DescallMigrator.exe --cleanup-machine` elevated; that is
/// only logged here.
pub fn cleanup_on_start() {
    #[cfg(windows)]
    {
        let _ = std::thread::Builder::new().name("descall-legacy-cleanup".into()).spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(CLEANUP_DELAY_SECS));
            let Some(env) = descall_migrate::win::env_from_process() else { return };
            let sys = descall_migrate::win::WinSys::new(&env);
            match descall_migrate::runner::run_cleanup(&sys, &env, false) {
                descall_migrate::runner::CleanupResult::NothingToDo | descall_migrate::runner::CleanupResult::NotDue => {}
                r => log::info!("[migration] legacy cleanup: {r:?}"),
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = CLEANUP_DELAY_SECS;
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

    #[test]
    fn auth_retries_outlast_the_longest_health_timeout() {
        assert!(u64::from(super::AUTH_MAX_TRIES) * super::AUTH_RETRY_SECS >= descall_migrate::job::MAX_HEALTH_TIMEOUT_SECS);
    }
}
