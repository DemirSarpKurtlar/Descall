//! Main-process errors to the page: `app:main-error` (electronAPI.onMainError), which the
//! page's Sentry client reports (frontend/src/lib/sentry.js reportMainProcessError). Rules in
//! descall_shell::main_errors (scrubbed summaries, queue until the page has mounted).
//!
//! Release builds abort on panic, so the hook also writes the summary to the crash file in
//! the app data folder; the next start forwards it once the page has mounted.

use std::path::PathBuf;
use std::sync::{LazyLock, Mutex, OnceLock};

use descall_shell::main_errors::{self, Relay, Summary, CRASH_FILE};
use tauri::{AppHandle, Runtime};

static RELAY: LazyLock<Mutex<Relay>> = LazyLock::new(|| Mutex::new(Relay::default()));
static CRASH_PATH: OnceLock<PathBuf> = OnceLock::new();
/// Set once the app handle exists: the hook can emit to a page that is already attached.
type EmitHook = Box<dyn Fn(&Summary) + Send + Sync>;
static EMIT: OnceLock<EmitHook> = OnceLock::new();

/// First thing in main(): panics during plugin setup (before `init`) still reach the crash
/// file. Same folder as Tauri's app_data_dir: `%APPDATA%\<identifier>`.
pub fn init_early() {
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let _ = CRASH_PATH.set(PathBuf::from(appdata).join(descall_migrate::paths::NEW_APP_ID).join(CRASH_FILE));
    }
}

/// Call in setup, once the data folder is known.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    if let Some(dir) = crate::state::data_dir(app) {
        let _ = CRASH_PATH.set(dir.join(CRASH_FILE));
    }
    let h = app.clone();
    let _ = EMIT.set(Box::new(move |s: &Summary| crate::state::to_main(&h, "app:main-error", s.clone())));
}

fn send(list: Vec<Summary>) {
    if let Some(emit) = EMIT.get() {
        for s in &list {
            emit(s);
        }
    }
}

/// A shell-side error (renderer process gone, ...): logged, then to the page.
pub fn report(s: Summary) {
    log::error!("[main] {}: {}: {}", s.kind, s.name, s.message);
    let out = RELAY.lock().map(|mut r| r.push(s)).unwrap_or_default();
    send(out);
}

/// From the panic hook: never blocks (try_lock), never panics.
pub fn on_panic(info: &std::panic::PanicHookInfo<'_>) {
    let thread = std::thread::current();
    let s = main_errors::panic_summary(&main_errors::payload_text(info.payload()), info.location().map(|l| l.file()), info.location().map(|l| l.line()), thread.name());
    if cfg!(panic = "abort") {
        // The process ends right after this hook: an event would never be delivered.
        if let Some(p) = CRASH_PATH.get() {
            let _ = std::fs::write(p, main_errors::encode_crash(&s, crate::state::now_ms()));
        }
        return;
    }
    let out = RELAY.try_lock().map(|mut r| r.push(s)).unwrap_or_default();
    send(out);
}

/// The page mounted (app-mounted): forward the previous run's crash and everything queued.
pub fn attach() {
    if let Some(p) = CRASH_PATH.get() {
        if let Ok(bytes) = std::fs::read(p) {
            let _ = std::fs::remove_file(p);
            if let Some(prev) = main_errors::decode_crash(&bytes, crate::state::now_ms()) {
                log::warn!("[main] previous run ended with {}: {}", prev.kind, prev.message);
                if let Ok(mut r) = RELAY.lock() {
                    r.push(prev);
                }
            }
        }
    }
    let out = RELAY.lock().map(|mut r| r.attach()).unwrap_or_default();
    send(out);
}

/// A new main-frame document: queue until it mounts.
pub fn detach() {
    if let Ok(mut r) = RELAY.lock() {
        r.detach();
    }
}
