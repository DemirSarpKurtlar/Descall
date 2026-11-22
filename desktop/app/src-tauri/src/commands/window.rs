//! Window controls. Each command acts on the window that called it (main, admin, stats,
//! Descall+ pop-outs), like main.cjs controlledWindow().

use descall_shell::occlusion::{self, Insets, Rect};
use tauri::{Manager, Runtime, WebviewWindow};

#[tauri::command]
pub async fn window_minimize<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.minimize();
}

#[tauri::command]
pub async fn window_toggle_maximize<R: Runtime>(window: WebviewWindow<R>) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// F12 / Ctrl+Shift+I (windowKeys.cjs): DevTools of the calling window, only when
/// webview::devtools_allowed (dev run or the support opt-in file); otherwise nothing.
#[tauri::command]
pub async fn window_toggle_devtools<R: Runtime>(window: WebviewWindow<R>) {
    if !crate::webview::devtools_allowed(window.app_handle()) {
        return;
    }
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// window:close: the main window hides to the tray (CloseRequested in boot.rs); other
/// windows close.
#[tauri::command]
pub async fn window_close<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.close();
}

/// window:content-box (windowOcclusion.cjs): how far a maximized client hangs past the
/// monitor work area, in CSS px. A restored window always gets zeros.
pub fn content_box<R: Runtime>(window: &WebviewWindow<R>) -> Insets {
    let pinned = window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false);
    if !pinned {
        return Insets::default();
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let client = match (window.inner_position(), window.inner_size()) {
        (Ok(p), Ok(s)) => Some(Rect { x: p.x as f64 / scale, y: p.y as f64 / scale, width: s.width as f64 / scale, height: s.height as f64 / scale }),
        _ => None,
    };
    let work = window.current_monitor().ok().flatten().map(|m| {
        let s = m.scale_factor();
        let wa = m.work_area();
        Rect { x: wa.position.x as f64 / s, y: wa.position.y as f64 / s, width: wa.size.width as f64 / s, height: wa.size.height as f64 / s }
    });
    occlusion::measure(true, client, work)
}

#[tauri::command]
pub fn window_content_box<R: Runtime>(window: WebviewWindow<R>) -> Insets {
    let main = window.app_handle().get_webview_window(crate::state::MAIN).unwrap_or(window);
    content_box(&main)
}

/// is-window-focused: frameless windows can report focus while hidden or minimized, so
/// visibility is checked first (main.cjs).
#[tauri::command]
pub fn window_is_focused<R: Runtime>(window: WebviewWindow<R>) -> bool {
    let w = window.app_handle().get_webview_window(crate::state::MAIN).unwrap_or(window);
    w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) && w.is_focused().unwrap_or(false)
}

#[tauri::command]
pub fn window_focus<R: Runtime>(window: WebviewWindow<R>) {
    crate::state::show_main(window.app_handle());
}

/// Right-click on a title bar (data-tauri-drag-region, electron-api-shim.js): the Windows
/// window menu (Restore, Move, Size, Minimize, Maximize, Close) at the cursor. Electron's
/// app-region caption gave it natively; Tauri's drag regions are page script. The menu runs
/// its own modal loop, so it goes to the event loop instead of running inside the IPC call.
#[tauri::command]
pub async fn window_system_menu<R: Runtime>(window: WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let Some(h) = window.hwnd().ok().map(|h| h.0 as isize) else { return };
        let _ = window.run_on_main_thread(move || show_system_menu(h));
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

#[cfg(windows)]
fn show_system_menu(h: isize) {
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetCursorPos, GetSystemMenu, IsZoomed, PostMessageW, SetForegroundWindow, TrackPopupMenu, MENU_ITEM_FLAGS, MF_BYCOMMAND, MF_ENABLED, MF_GRAYED, SC_MAXIMIZE, SC_MOVE,
        SC_RESTORE, SC_SIZE, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_SYSCOMMAND,
    };
    unsafe {
        let hwnd = HWND(h as *mut core::ffi::c_void);
        let menu = GetSystemMenu(hwnd, false);
        if menu.is_invalid() {
            return;
        }
        // Same items enabled as the caption menu of a normal window in that state.
        let maximized = IsZoomed(hwnd).as_bool();
        let state = |on: bool| -> MENU_ITEM_FLAGS { MF_BYCOMMAND | if on { MF_ENABLED } else { MF_GRAYED } };
        let _ = EnableMenuItem(menu, SC_RESTORE, state(maximized));
        let _ = EnableMenuItem(menu, SC_MAXIMIZE, state(!maximized));
        let _ = EnableMenuItem(menu, SC_MOVE, state(!maximized));
        let _ = EnableMenuItem(menu, SC_SIZE, state(!maximized));
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_err() {
            return;
        }
        let _ = SetForegroundWindow(hwnd);
        let cmd = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.x, pt.y, None, hwnd, None);
        if cmd.0 != 0 {
            // SC_CLOSE becomes WM_CLOSE: the main window still hides to the tray.
            let _ = PostMessageW(Some(hwnd), WM_SYSCOMMAND, WPARAM(cmd.0 as usize), LPARAM(0));
        }
    }
}

/// zoom.set (smoothZoom.js): 0.5 .. 2.
#[tauri::command]
pub fn window_set_zoom<R: Runtime>(window: WebviewWindow<R>, factor: f64) {
    if (0.5..=2.0).contains(&factor) {
        let _ = window.set_zoom(factor);
    }
}
