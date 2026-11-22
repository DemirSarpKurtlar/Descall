//! WebView2 specifics of the main window: the boot-retry clean reload, page permissions
//! without prompts (Electron's session permission handlers) and the Retry / Quit dialog.

use tauri::{Manager, Runtime, WebviewWindow};

/// DevTools for every webview of the app (windowKeys.cjs canOpenDevTools): dev runs, or a
/// release build with `<app data>/devtools-enabled` (support opt-in). The tauri `devtools`
/// feature is on so the opt-in can work in release; without `.devtools(..)` a builder would then
/// default to on, so every WebviewWindowBuilder sets it from here. Read once per run.
pub fn devtools_allowed<R: Runtime>(app: &tauri::AppHandle<R>) -> bool {
    use tauri::Manager;
    static ALLOWED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ALLOWED.get_or_init(|| {
        let dir = app.path().app_data_dir().ok();
        descall_shell::window_keys::devtools_allowed(cfg!(debug_assertions), dir.as_deref(), |p| p.is_file())
    })
}

/// Script fallback for a clean reload: drop Service Workers and Cache Storage, reload.
const CLEAR_JS: &str = "(async()=>{try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);}catch(e){}location.reload();})()";

/// clearAndReloadRenderer: Service Workers + Cache Storage + HTTP disk cache, then reload.
/// localStorage, IndexedDB and cookies stay (BOOT_RETRY_STORAGES).
pub fn clear_and_reload<R: Runtime>(window: &WebviewWindow<R>, why: &str) {
    log::warn!("[boot] clean reload ({why})");
    #[cfg(windows)]
    {
        let fallback = window.clone();
        let done = window.with_webview(|pw| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2Profile2, ICoreWebView2_13, COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE, COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE,
                COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS,
            };
            use windows_core::Interface;
            let r = (|| -> windows_core::Result<()> {
                let core = pw.controller().CoreWebView2()?;
                let profile: ICoreWebView2Profile2 = core.cast::<ICoreWebView2_13>()?.Profile()?.cast()?;
                let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE | COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS | COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE;
                let reload = core.clone();
                let handler = webview2_com::ClearBrowsingDataCompletedHandler::create(Box::new(move |_| {
                    let _ = reload.Reload();
                    Ok(())
                }));
                profile.ClearBrowsingData(kinds, &handler)
            })();
            if r.is_err() {
                if let Ok(core) = pw.controller().CoreWebView2() {
                    let _ = core.ExecuteScript(&windows_core::HSTRING::from(CLEAR_JS), None);
                }
            }
        });
        if done.is_err() {
            let _ = fallback.eval(CLEAR_JS);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window.eval(CLEAR_JS);
    }
}

/// Grant microphone / camera / autoplay to the app origin without a prompt, as Electron's
/// setPermissionRequestHandler did (descall_shell::clipboard::permission_decision); every
/// other request is refused without a prompt, as Electron refused it.
pub fn install_permission_handler<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(|pw| unsafe {
            use descall_shell::clipboard::{permission_decision, PermissionKind};
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            let handler = webview2_com::PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
                args.PermissionKind(&mut kind)?;
                let mut uri = windows_core::PWSTR::null();
                args.Uri(&mut uri)?;
                let uri = webview2_com::take_pwstr(uri);
                let k = match kind {
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => PermissionKind::Microphone,
                    COREWEBVIEW2_PERMISSION_KIND_CAMERA => PermissionKind::Camera,
                    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY => PermissionKind::Autoplay,
                    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => PermissionKind::ClipboardRead,
                    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => PermissionKind::Notifications,
                    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => PermissionKind::Geolocation,
                    _ => PermissionKind::Other,
                };
                // Allow the app's media, refuse the rest silently as Electron did: left at
                // "default", WebView2 showed its own Edge prompt ("tauri.localhost wants to show
                // notifications") over the app. Kinds the shared rules do not know are refused
                // too (T8), except multiple automatic downloads (exports); autoplay outside the
                // app keeps WebView2's default (T7).
                match permission_decision(k, &uri, cfg!(debug_assertions)) {
                    Some(true) => args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?,
                    Some(false) => args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?,
                    None if k == PermissionKind::Other && kind != COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS => {
                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?
                    }
                    None => {}
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core.add_PermissionRequested(&handler, &mut token);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

/// Electron never showed a browser menu or ran browser shortcuts. WebView2 does both (Back,
/// Reload, Save as, Print, More tools; Ctrl+R, F5, Alt+Left, Ctrl+P, Ctrl+Shift+I), which could
/// reload the app or navigate it away. Browser accelerator keys go off (editing keys such as
/// Ctrl+C/V/X/A/Z stay with the page); the default menu stays only on editable fields (undo,
/// redo, cut, copy, paste, select all) and on selected text (Copy), as Electron's own menu.
/// The page's own menus call preventDefault, so WebView2 never asks for them.
/// electron-api-shim.js has the same rules on the page side.
pub fn install_browser_guards<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(|pw| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use windows_core::Interface;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            if let Ok(settings) = core.Settings() {
                if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                    let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
                }
                if let Ok(s6) = settings.cast::<ICoreWebView2Settings6>() {
                    let _ = s6.SetIsSwipeNavigationEnabled(false);
                }
            }
            let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
            let handler = webview2_com::ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let target = args.ContextMenuTarget()?;
                let mut editable = windows_core::BOOL(0);
                target.IsEditable(&mut editable)?;
                let mut selection = windows_core::BOOL(0);
                let _ = target.HasSelection(&mut selection);
                let editable = editable.as_bool();
                if !editable && !selection.as_bool() {
                    args.SetHandled(true)?;
                    return Ok(());
                }
                // Electron's menu: undo / redo / cut / copy / paste / select all in fields, Copy
                // for selected text (descall_shell::clipboard::context_menu_keep).
                let items = args.MenuItems()?;
                let mut count = 0u32;
                items.Count(&mut count)?;
                let mut last_sep = true; // no separator at the top
                let mut i = 0u32;
                while i < count {
                    let item = items.GetValueAtIndex(i)?;
                    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                    item.Kind(&mut kind)?;
                    let keep = if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR {
                        !last_sep
                    } else {
                        let mut name = windows_core::PWSTR::null();
                        item.Name(&mut name)?;
                        descall_shell::clipboard::context_menu_keep(&webview2_com::take_pwstr(name), editable)
                    };
                    if keep {
                        last_sep = kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR;
                        i += 1;
                    } else {
                        items.RemoveValueAtIndex(i)?;
                        count -= 1;
                    }
                }
                if count > 0 && last_sep {
                    items.RemoveValueAtIndex(count - 1)?;
                    count -= 1;
                }
                if count == 0 {
                    args.SetHandled(true)?;
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core11.add_ContextMenuRequested(&handler, &mut token);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

/// Page downloads (<a download> exports, blob: / data: files): WebView2's own download bubble
/// (an Edge flyout over the app) is replaced by what electronAPI.downloadFile does: the file
/// goes to Downloads under a free name (descall_shell::download) and is shown in Explorer.
pub fn on_download<R: Runtime>(webview: tauri::Webview<R>, event: tauri::webview::DownloadEvent<'_>) -> bool {
    use tauri::webview::DownloadEvent;
    use tauri::Manager;
    match event {
        DownloadEvent::Requested { destination, .. } => {
            let name = destination.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if let Ok(dir) = webview.app_handle().path().download_dir() {
                if let Ok((_, safe)) = descall_shell::download::resolve_download_path(&dir, &name) {
                    *destination = descall_shell::download::unique_path(&dir, &safe, |p| p.exists());
                }
            }
            true
        }
        DownloadEvent::Finished { path, success, .. } => {
            if success {
                if let Some(p) = path {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = webview.app_handle().opener().reveal_item_in_dir(&p);
                }
            }
            true
        }
        _ => true,
    }
}

static CRASH_RELOADS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static ASKING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Reload the main frame from any thread (WebView2 Reload; works while the renderer is hung).
fn reload<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(|pw| unsafe {
            if let Ok(core) = pw.controller().CoreWebView2() {
                let _ = core.Reload();
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = window.eval("location.reload()");
    }
}

/// WebView2 ProcessFailed on the main window (Electron render-process-gone / unresponsive /
/// child-process-gone). Before, a renderer crash left a dead page and was never reported.
/// The summary goes to the page's error reporting once the reloaded page has mounted.
pub fn on_process_failed<R: Runtime>(window: &WebviewWindow<R>, kind: i32) {
    use descall_shell::watchdog::{renderer_gone_action, RendererGone};
    use std::sync::atomic::Ordering;
    let app = window.app_handle().clone();
    let (action, name) = renderer_gone_action(kind, CRASH_RELOADS.load(Ordering::Acquire));
    if action != RendererGone::ReportOnly {
        // The page is gone or hung: hold the report for the next document, and a live call
        // cannot survive this (the update deferral treats it as "call ended").
        crate::errors::detach();
        crate::commands::updates::reset_voice(&app);
    }
    crate::errors::report(descall_shell::main_errors::summary("render-process-gone", name, &format!("WebView2 process failed (kind {kind})")));
    match action {
        RendererGone::ReportOnly => {}
        RendererGone::Reload => {
            CRASH_RELOADS.fetch_add(1, Ordering::AcqRel);
            log::warn!("[boot] {name}: reloading the page");
            reload(window);
        }
        RendererGone::Ask => {
            if ASKING.swap(true, Ordering::AcqRel) {
                return;
            }
            let win = window.clone();
            tauri::async_runtime::spawn(async move {
                let hung = kind == 2;
                let (title, detail) = if hung {
                    (crate::state::et(&app, "dialog.unresponsive", &[]), crate::state::et(&app, "dialog.unresponsiveDetail", &[]))
                } else {
                    (crate::state::et(&app, "dialog.openFailed", &[]), crate::state::et(&app, "dialog.openFailedDetail", &[]))
                };
                let retry = tauri::async_runtime::spawn_blocking(move || ask_retry(&title, &detail)).await.unwrap_or(false);
                ASKING.store(false, Ordering::Release);
                match (kind, retry) {
                    // Browser process gone: only a fresh start brings the WebView back.
                    (0, true) => {
                        crate::state::set_quitting(&app);
                        app.restart();
                    }
                    (0, false) => {
                        crate::state::set_quitting(&app);
                        app.exit(0);
                    }
                    (_, true) => reload(&win),
                    // Wait (hung) or keep the window as it is.
                    (_, false) => {}
                }
            });
        }
    }
}

/// Subscribe the main window to WebView2 ProcessFailed (see on_process_failed).
pub fn install_process_failed_handler<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let win = window.clone();
        let _ = window.with_webview(move |pw| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            let handler = webview2_com::ProcessFailedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                args.ProcessFailedKind(&mut kind)?;
                on_process_failed(&win, kind.0);
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core.add_ProcessFailed(&handler, &mut token);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

/// Native "Descall could not open" with Retry / Cancel(quit). Blocking; call off the UI thread.
pub fn ask_retry(title: &str, detail: &str) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDRETRY, MB_ICONWARNING, MB_RETRYCANCEL, MB_SETFOREGROUND};
        use windows_core::HSTRING;
        MessageBoxW(None, &HSTRING::from(detail), &HSTRING::from(title), MB_RETRYCANCEL | MB_ICONWARNING | MB_SETFOREGROUND) == IDRETRY
    }
    #[cfg(not(windows))]
    {
        let _ = (title, detail);
        true
    }
}
