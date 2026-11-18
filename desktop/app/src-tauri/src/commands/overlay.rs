//! Voice overlay (overlayWindow.cjs): click-through, always-on-top HUD.
//! Tauri: transparent undecorated window + set_ignore_cursor_events(true).

#[tauri::command]
pub fn overlay_show(payload: serde_json::Value) {
    let _ = payload;
}
#[tauri::command]
pub fn overlay_hide() {}
#[tauri::command]
pub fn overlay_update(payload: serde_json::Value) {
    let _ = payload;
}
