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

/// Focus a window from any thread. tao queues show / unminimize from a thread other than the
/// event loop's and its set_focus checks the visible / minimized flags at once: called on the
/// Descall+ bus thread right after those, the focus was skipped. Queued behind them instead.
pub fn focus_soon<R: Runtime>(window: &WebviewWindow<R>) {
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = w.set_focus();
    });
}

/// window:maximized for a window other than main (main has boot::bind_window_events): the
/// page's title bar shows Restore while maximized. Electron's multi_window.cjs sent it on
/// maximize / unmaximize; the Descall+ pop-out and account windows here never got it, so their
/// button kept the state it read at start-up. Sent only when the state changes.
pub fn forward_maximized<R: Runtime>(window: &WebviewWindow<R>) {
    use std::sync::atomic::{AtomicU8, Ordering};
    use tauri::Emitter;
    let w = window.clone();
    let last = std::sync::Arc::new(AtomicU8::new(u8::from(window.is_maximized().unwrap_or(false))));
    window.on_window_event(move |e| {
        if let tauri::WindowEvent::Resized(_) = e {
            let now = u8::from(w.is_maximized().unwrap_or(false));
            if last.swap(now, Ordering::AcqRel) != now {
                let _ = w.emit_to(w.label(), "window:maximized", now == 1);
            }
        }
    });
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
///
/// `keyboard`: Alt+Space (electron-api-shim.js). Focus is in WebView2's own window there, so
/// the key never reached the window's default handling; the menu opens under the title bar at
/// the window's left edge, as a captioned window's does, unless Windows already opened it.
#[tauri::command]
pub async fn window_system_menu<R: Runtime>(window: WebviewWindow<R>, keyboard: Option<bool>) {
    #[cfg(windows)]
    {
        let Some(h) = window.hwnd().ok().map(|h| h.0 as isize) else { return };
        let keyboard = keyboard.unwrap_or(false);
        let title_bar = (descall_shell::snap::TITLE_BAR_CSS_PX * window.scale_factor().unwrap_or(1.0)).round() as i32;
        let _ = window.run_on_main_thread(move || {
            if keyboard {
                show_system_menu_for_keyboard(h, title_bar);
            } else {
                show_system_menu(h);
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (window, keyboard);
    }
}

#[cfg(windows)]
fn show_system_menu_for_keyboard(h: isize, title_bar: i32) {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::{GetGUIThreadInfo, GetWindowRect, IsIconic, GUITHREADINFO, GUI_INMENUMODE, GUI_SYSTEMMENUMODE};
    unsafe {
        let hwnd = HWND(h as *mut core::ffi::c_void);
        // Windows (or WebView2) may have opened the menu for the key already: never a second one.
        let mut info = GUITHREADINFO { cbSize: std::mem::size_of::<GUITHREADINFO>() as u32, ..Default::default() };
        if GetGUIThreadInfo(GetCurrentThreadId(), &mut info).is_ok() && (info.flags.0 & (GUI_INMENUMODE.0 | GUI_SYSTEMMENUMODE.0)) != 0 {
            return;
        }
        if IsIconic(hwnd).as_bool() {
            return;
        }
        let mut rc = RECT::default();
        if GetWindowRect(hwnd, &mut rc).is_err() {
            return;
        }
        let (x, y) = descall_shell::snap::keyboard_menu_point((rc.left, rc.top), title_bar);
        track_system_menu(hwnd, x, y);
    }
}

#[cfg(windows)]
pub(crate) fn show_system_menu(h: isize) {
    use windows::Win32::Foundation::{HWND, POINT};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_err() {
            return;
        }
        track_system_menu(HWND(h as *mut core::ffi::c_void), pt.x, pt.y);
    }
}

/// The window menu at a screen point, with the items a captioned window enables in its state;
/// the chosen command goes to the window as WM_SYSCOMMAND.
#[cfg(windows)]
fn track_system_menu(hwnd: windows::Win32::Foundation::HWND, x: i32, y: i32) {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetSystemMenu, IsZoomed, PostMessageW, SetForegroundWindow, TrackPopupMenu, MENU_ITEM_FLAGS, MF_BYCOMMAND, MF_ENABLED, MF_GRAYED, SC_MAXIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE,
        TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_SYSCOMMAND,
    };
    unsafe {
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
        let _ = SetForegroundWindow(hwnd);
        let cmd = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, x, y, None, hwnd, None);
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
