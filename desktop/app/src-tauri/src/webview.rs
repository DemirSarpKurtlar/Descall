//! WebView2 specifics of the main window: the boot-retry clean reload, page permissions
//! without prompts (Electron's session permission handlers) and the Retry / Quit dialog.

use tauri::{Runtime, WebviewWindow};

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
/// setPermissionRequestHandler did (descall_shell::clipboard::permission_allowed).
pub fn install_permission_handler<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(|pw| unsafe {
            use descall_shell::clipboard::{permission_allowed, PermissionKind};
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
                if permission_allowed(k, &uri, cfg!(debug_assertions)) {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
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
