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

/// Electron's native menu (main.cjs 'context-menu'): on an editable field Undo, Redo, Cut,
/// Copy, Paste, Select all; elsewhere only Copy, and only while text is selected.
#[cfg_attr(not(windows), allow(dead_code))]
const EDIT_MENU: &[&str] = &["undo", "redo", "cut", "copy", "paste", "selectAll"];

/// Which WebView2 menu items (name, is_separator) stay so the menu matches Electron's. WebView2
/// adds Emoji, Paste as plain text, Search the web, Share, Web capture, Inspect and the like;
/// those go. Separators survive only between two kept items. All false = show no menu.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn electron_menu_items(editable: bool, has_selection: bool, items: &[(String, bool)]) -> Vec<bool> {
    let wanted = |name: &str| -> bool {
        if editable {
            EDIT_MENU.contains(&name)
        } else {
            has_selection && name == "copy"
        }
    };
    let mut keep: Vec<bool> = items.iter().map(|(name, sep)| !*sep && wanted(name.as_str())).collect();
    let mut seen_item = false;
    let mut pending: Option<usize> = None;
    for (i, (_, sep)) in items.iter().enumerate() {
        if *sep {
            if seen_item && pending.is_none() {
                pending = Some(i);
            }
        } else if keep[i] {
            if let Some(p) = pending.take() {
                keep[p] = true;
            }
            seen_item = true;
        }
    }
    keep
}

/// Electron never showed a browser menu or ran browser shortcuts. WebView2 does both (Back,
/// Reload, Save as, Print, More tools; Ctrl+R, F5, Alt+Left, Ctrl+P, Ctrl+Shift+I), which could
/// reload the app or navigate it away. Browser accelerator keys go off (editing keys such as
/// Ctrl+C/V/X/A/Z stay with the page); the default menu is trimmed to Electron's
/// ([`electron_menu_items`]: edit items on a field, Copy on selected text, else none). The
/// page's own menus call preventDefault, so WebView2 never asks for them. Autofill pop-ups
/// (WebView2 offers saved names, e-mails and addresses under the login and search fields; the
/// Electron app never did) and password saving go off. electron-api-shim.js has the same rules
/// on the page side.
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
                if let Ok(s4) = settings.cast::<ICoreWebView2Settings4>() {
                    let _ = s4.SetIsGeneralAutofillEnabled(false);
                    let _ = s4.SetIsPasswordAutosaveEnabled(false);
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
                let menu = args.MenuItems()?;
                let mut count = 0u32;
                menu.Count(&mut count)?;
                let mut items = Vec::with_capacity(count as usize);
                for i in 0..count {
                    let item = menu.GetValueAtIndex(i)?;
                    let mut name = windows_core::PWSTR::null();
                    item.Name(&mut name)?;
                    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                    item.Kind(&mut kind)?;
                    items.push((webview2_com::take_pwstr(name), kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR));
                }
                let keep = electron_menu_items(editable.as_bool(), selection.as_bool(), &items);
                if !keep.iter().any(|k| *k) {
                    args.SetHandled(true)?;
                    return Ok(());
                }
                for i in (0..count).rev() {
                    if !keep[i as usize] {
                        menu.RemoveValueAtIndex(i)?;
                    }
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

#[cfg(test)]
mod tests {
    use super::electron_menu_items;

    fn menu(spec: &[&str]) -> Vec<(String, bool)> {
        spec.iter().map(|s| if *s == "-" { (String::new(), true) } else { (s.to_string(), false) }).collect()
    }
    fn kept(spec: &[&str], keep: &[bool]) -> Vec<String> {
        spec.iter().zip(keep).filter(|(_, k)| **k).map(|(s, _)| s.to_string()).collect()
    }

    #[test]
    fn editable_field_gets_electrons_edit_menu() {
        let spec = ["emoji", "-", "undo", "redo", "-", "cut", "copy", "paste", "pasteAndMatchStyle", "-", "selectAll", "-", "other", "inspectElement"];
        let keep = electron_menu_items(true, false, &menu(&spec));
        assert_eq!(kept(&spec, &keep), ["undo", "redo", "-", "cut", "copy", "paste", "-", "selectAll"]);
    }

    #[test]
    fn selected_text_gets_copy_only() {
        let spec = ["copy", "-", "share", "webCapture", "-", "inspectElement"];
        assert_eq!(kept(&spec, &electron_menu_items(false, true, &menu(&spec))), ["copy"]);
    }

    #[test]
    fn page_without_selection_gets_no_menu() {
        let spec = ["back", "forward", "reload", "-", "saveAs", "print", "-", "inspectElement"];
        assert!(!electron_menu_items(false, false, &menu(&spec)).iter().any(|k| *k));
        // A link or image without a selection: nothing either (the page's own menus handle those).
        let link = ["openLinkInNewWindow", "copyLinkLocation", "-", "copy"];
        assert!(!electron_menu_items(false, false, &menu(&link)).iter().any(|k| *k));
    }
}
