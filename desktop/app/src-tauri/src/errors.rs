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

/// Native crashes (an access violation in our code, a COM callback or a DLL) never reach the
/// panic hook: the process just vanished with nothing in main.log or Error logs. A top-level
/// exception filter writes the same crash file (exception code, module and offset), which the
/// next start forwards like a panic, and a main.log line. Call first thing in main().
#[cfg(windows)]
pub fn install_native_crash_filter() {
    use std::ffi::c_void;

    // EXCEPTION_RECORD / EXCEPTION_POINTERS (winnt.h); only code and address are read.
    #[repr(C)]
    #[allow(dead_code)]
    struct ExceptionRecord {
        code: u32,
        flags: u32,
        next: *mut ExceptionRecord,
        address: *mut c_void,
        params: u32,
        info: [usize; 15],
    }
    #[repr(C)]
    #[allow(dead_code)]
    struct ExceptionPointers {
        record: *mut ExceptionRecord,
        context: *mut c_void,
    }
    type Filter = Option<unsafe extern "system" fn(*const ExceptionPointers) -> i32>;
    #[link(name = "kernel32")]
    extern "system" {
        fn SetUnhandledExceptionFilter(filter: Filter) -> Filter;
    }

    /// Module (file name) and offset of `addr`, best effort.
    fn module_of(addr: *mut c_void) -> (Option<String>, Option<usize>) {
        use windows::Win32::Foundation::HMODULE;
        use windows::Win32::System::LibraryLoader::{GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT};
        let mut module = HMODULE::default();
        let flags = GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
        // SAFETY: with FROM_ADDRESS the "name" argument is the address itself.
        if unsafe { GetModuleHandleExW(flags, windows_core::PCWSTR(addr as *const u16), &mut module) }.is_err() {
            return (None, None);
        }
        let mut buf = [0u16; 260];
        let n = unsafe { GetModuleFileNameW(Some(module), &mut buf) } as usize;
        let name = (n > 0).then(|| String::from_utf16_lossy(&buf[..n.min(buf.len())]));
        (name, (addr as usize).checked_sub(module.0 as usize))
    }

    unsafe extern "system" fn filter(info: *const ExceptionPointers) -> i32 {
        static ONCE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !ONCE.swap(true, std::sync::atomic::Ordering::AcqRel) {
            // SAFETY: Windows passes valid pointers for the duration of the filter.
            if let Some(rec) = unsafe { info.as_ref() }.and_then(|i| unsafe { i.record.as_ref() }) {
                let (module, offset) = module_of(rec.address);
                let thread = std::thread::current();
                let s = main_errors::native_crash_summary(rec.code, module.as_deref(), offset, thread.name());
                if let Some(p) = CRASH_PATH.get() {
                    let _ = std::fs::write(p, main_errors::encode_crash(&s, crate::state::now_ms()));
                }
                log::error!("[main] native crash: {} ({})", s.message, s.stack);
                log::logger().flush();
            }
        }
        0 // EXCEPTION_CONTINUE_SEARCH: Windows Error Reporting still gets the crash.
    }

    // SAFETY: plain Win32 call with a valid function pointer.
    unsafe {
        SetUnhandledExceptionFilter(Some(filter));
    }
}

#[cfg(not(windows))]
pub fn install_native_crash_filter() {}

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
