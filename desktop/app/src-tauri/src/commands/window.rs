//! Window controls. Each command acts on the window that called it (main, admin, stats,
//! Descall+ pop-outs), like main.cjs controlledWindow().

use descall_shell::occlusion::{self, Insets, Rect};
use tauri::{Manager, Runtime, WebviewWindow};

#[tauri::command]
pub fn window_minimize<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_toggle_maximize<R: Runtime>(window: WebviewWindow<R>) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// window:close: the main window hides to the tray (CloseRequested in boot.rs); other
/// windows close.
#[tauri::command]
pub fn window_close<R: Runtime>(window: WebviewWindow<R>) {
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

/// zoom.set (smoothZoom.js): 0.5 .. 2.
#[tauri::command]
pub fn window_set_zoom<R: Runtime>(window: WebviewWindow<R>, factor: f64) {
    if (0.5..=2.0).contains(&factor) {
        let _ = window.set_zoom(factor);
    }
}
