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
