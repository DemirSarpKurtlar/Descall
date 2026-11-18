use serde::Serialize;
use tauri::WebviewWindow;

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// window:close = hide to tray for the main window (CloseRequested handler in boot.rs).
#[tauri::command]
pub fn window_close(window: WebviewWindow) {
    let _ = window.close();
}

#[derive(Serialize)]
pub struct ContentBox {
    width: f64,
    height: f64,
    occluded: bool,
}

/// window:content-box (windowOcclusion.cjs): client size in CSS px.
#[tauri::command]
pub fn window_content_box(window: WebviewWindow) -> ContentBox {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().unwrap_or_default();
    ContentBox { width: size.width as f64 / scale, height: size.height as f64 / scale, occluded: false }
}

#[tauri::command]
pub fn window_is_focused(window: WebviewWindow) -> bool {
    window.is_focused().unwrap_or(false)
}

#[tauri::command]
pub fn window_focus(window: WebviewWindow) -> bool {
    let _ = window.show();
    let _ = window.unminimize();
    window.set_focus().is_ok()
}

/// zoom.set (smoothZoom.js): 0.5 .. 2.
#[tauri::command]
pub fn window_set_zoom(window: WebviewWindow, factor: f64) {
    if (0.5..=2.0).contains(&factor) {
        let _ = window.set_zoom(factor);
    }
}
