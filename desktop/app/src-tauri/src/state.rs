//! Shell-wide state (what main.cjs kept in module variables) and small helpers shared by the
//! command modules: the active shell language, busy flags, the main-window accessors and
//! the event fan-out to the page.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use descall_shell::i18n;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

pub const MAIN: &str = "main";

#[derive(Default)]
pub struct Shell {
    /// Active language for shell text (tray, capsules, overlay, dialogs).
    pub locale: Mutex<String>,
    /// voice:set-busy from the page (call, ring, server voice, screen share).
    pub voice_busy: AtomicBool,
    /// activity:set-busy (typing, upload, recording).
    pub user_busy: AtomicBool,
    /// The app is really quitting (tray Quit, update install): close no longer hides.
    pub quitting: AtomicBool,
    /// The tray icon exists; without it the close button minimizes instead of hiding.
    pub has_tray: AtomicBool,
    pub boot: Mutex<BootWatch>,
    pub last_maximized: Mutex<Option<bool>>,
    /// The main window is minimized: the next non-minimized resize is mainWindow 'restore'.
    pub minimized: AtomicBool,
    /// A descall:// link from argv (cold start or second launch) the page has not taken yet.
    pub deep_link: Mutex<Option<String>>,
    /// A second launch asked for the window before the main window existed (Electron
    /// userRequestedShow); setup shows it once the window is built.
    pub show_requested: AtomicBool,
    /// A normal start (StartAction::Show): the main window shows once its boot splash is up
    /// (app_boot_state "splash") or the page finished loading, whichever comes first.
    pub show_on_load: AtomicBool,
    /// WebView2 memory target of the main window (webview::update_main_memory).
    pub memory: Mutex<descall_shell::memory_target::Target>,
}

#[derive(Default)]
pub struct BootWatch {
    /// Load generation of the main frame; a new document starts a new watch.
    pub generation: u64,
    pub started_ms: u64,
    pub painted: bool,
    pub reloads: u32,
    pub asked: bool,
    pub mounted: bool,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn shell<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, Shell> {
    app.state::<Shell>()
}

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN)
}

/// The page the user is looking at: main window visible, not minimized, focused.
pub fn main_in_front<R: Runtime>(app: &AppHandle<R>) -> bool {
    main_window(app).is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) && w.is_focused().unwrap_or(false))
}

/// main.cjs isAppInBackground: no window, hidden, minimized or not focused.
pub fn app_in_background<R: Runtime>(app: &AppHandle<R>) -> bool {
    !main_in_front(app)
}

/// The thread that runs the event loop (set first thing in main()).
static MAIN_THREAD: std::sync::OnceLock<std::thread::ThreadId> = std::sync::OnceLock::new();

pub fn mark_main_thread() {
    let _ = MAIN_THREAD.set(std::thread::current().id());
}

fn on_main_thread() -> bool {
    MAIN_THREAD.get().is_some_and(|id| *id == std::thread::current().id())
}

/// Bring the main window up (tray click, second launch, notification click).
///
/// On the event loop thread: tao queues show / unminimize from any other thread, and its
/// set_focus checks the visible / minimized flags at once, so from the ready fallback, a
/// toast click, an update prompt or a Descall+ action (all off that thread) a window coming
/// out of the tray was shown but never focused (Electron's showMainWindow always raised it).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if MAIN_THREAD.get().is_some() && !on_main_thread() {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || show_main(&a));
        return;
    }
    // Not built yet (WebView2 creation pumps messages during setup, so a second launch, a
    // descall:// link or a toast click can arrive first): kept, and setup shows the window
    // once it exists, whatever the start mode (main.cjs userRequestedShow).
    let Some(w) = main_window(app) else {
        shell(app).show_requested.store(true, Ordering::Release);
        return;
    };
    {
        let _ = w.set_skip_taskbar(false);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        // Electron sent app:visibility on 'show' / 'restore', not only on 'focus': Windows can
        // refuse the focus (foreground lock after a tray or notification click), and the page
        // then kept its animations paused (html.app-backgrounded) until the next click.
        to_main(app, "app:visibility", serde_json::json!({ "backgrounded": false }));
        // main.cjs mainWindow.on('show', publishBox).
        to_main(app, "window:content-box", crate::commands::window::content_box(&w));
        crate::webview::update_main_memory(app);
        // set_skip_taskbar(false) gave the window a new taskbar button: badge on it again.
        crate::taskbar::refresh(app, true);
    }
}

/// Second launch (shortcut, taskbar): show the main window. Early in the boot it does not exist
/// yet (WebView2 creation pumps messages, so the single-instance message is handled inside
/// the window build): the request is kept and setup honours it (descall_shell::launch::
/// with_show_request). Dropping it left the second click without any window.
pub fn request_show<R: Runtime>(app: &AppHandle<R>) {
    if main_window(app).is_some() {
        show_main(app);
    } else {
        log::info!("[boot] second launch before the main window exists: shown when ready");
        shell(app).show_requested.store(true, Ordering::Release);
    }
}

/// Send an event to the main page only (Electron: mainWindow.webContents.send).
pub fn to_main<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, event: &str, payload: S) {
    let _ = app.emit_to(MAIN, event, payload);
}

/// A descall:// link for the page: kept until the page takes it (deep_link_take), and
/// announced with `app:deep-link` for a page that is already running.
pub fn deliver_deep_link<R: Runtime>(app: &AppHandle<R>, url: String) {
    log::info!("[deep-link] {} chars", url.len());
    *shell(app).deep_link.lock().unwrap() = Some(url);
    to_main(app, "app:deep-link", ());
}

pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&d).ok()?;
    Some(d)
}

pub fn locale<R: Runtime>(app: &AppHandle<R>) -> String {
    let l = shell(app).locale.lock().unwrap().clone();
    if l.is_empty() {
        i18n::fallback_locale().to_string()
    } else {
        l
    }
}

/// Shell text in the active language.
pub fn et<R: Runtime>(app: &AppHandle<R>, key: &str, vars: &[(&str, &str)]) -> String {
    i18n::et_for(&locale(app), key, vars)
}

/// Boot: the last UI language (ui-locale.json, same file name and shape as Electron's),
/// else the OS languages and time zone.
pub fn init_locale<R: Runtime>(app: &AppHandle<R>) {
    let saved = data_dir(app).and_then(|d| std::fs::read_to_string(d.join("ui-locale.json")).ok()).and_then(|t| i18n::parse_saved_locale(&t));
    let id = i18n::resolve_locale(saved.as_deref(), &crate::platform::os_languages(), &crate::platform::time_zone());
    *shell(app).locale.lock().unwrap() = id;
}

/// The page reported its UI language. Returns true when the shell language changed.
pub fn set_ui_locale<R: Runtime>(app: &AppHandle<R>, value: &str) -> bool {
    let Some(id) = i18n::match_locale(value, false) else { return false };
    if let Some(d) = data_dir(app) {
        let _ = std::fs::write(d.join("ui-locale.json"), i18n::saved_locale_json(&id));
    }
    let sh = shell(app);
    let mut cur = sh.locale.lock().unwrap();
    if *cur == id {
        return false;
    }
    *cur = id;
    true
}

pub fn set_quitting<R: Runtime>(app: &AppHandle<R>) {
    shell(app).quitting.store(true, Ordering::Release);
}

/// Restart (Settings > Desktop app "Restart", Retry after the WebView2 browser process died).
/// app.restart() starts the new process with this run's arguments, and a session that began at
/// Windows login carries --autostart --hidden: the window the user was looking at came back
/// hidden in the tray. The one-shot relaunch marker (boot::write_relaunch_marker) records how
/// the window was left, and the cold-start rule follows it first (launch::decide_cold_start).
pub fn restart<R: Runtime>(app: &AppHandle<R>) -> ! {
    set_quitting(app);
    crate::boot::write_relaunch_marker(app);
    app.restart()
}

/// Time the page gets for its pagehide / beforeunload work (a socket emit to leave voice,
/// the app-time flush) before the process goes.
pub const QUIT_UNLOAD_GRACE_MS: u64 = 400;

/// Quit like Electron's app.quit(): that closed the window, so the page ran its pagehide /
/// beforeunload handlers (unsent draft saved, voice channel left at once instead of after the
/// server's reconnect grace, app time flushed). app.exit() tears WebView2 down without them:
/// tell the page (app:will-quit, the shim runs those handlers), wait a moment, then exit.
pub fn exit_after_unload<R: Runtime>(app: &AppHandle<R>) {
    set_quitting(app);
    if main_window(app).is_none() {
        app.exit(0);
        return;
    }
    to_main(app, "app:will-quit", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(QUIT_UNLOAD_GRACE_MS)).await;
        app.exit(0);
    });
}

pub fn is_dev() -> bool {
    cfg!(debug_assertions)
}
