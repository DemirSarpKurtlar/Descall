//! Descall's own notification capsules (notificationWindow.cjs / notificationStack.cjs):
//! transparent, frameless, always-on-top, non-activating windows stacked bottom-right.
//! Native toasts (tauri-plugin-notification) only for quick_reply DMs, as today.

use serde::Deserialize;
use tauri::AppHandle;

#[derive(Deserialize)]
pub struct ShowPayload {
    pub title: String,
    #[serde(default)]
    pub options: serde_json::Value,
}

#[tauri::command]
pub fn notification_show(app: AppHandle, payload: ShowPayload) {
    let _ = (app, payload.title, payload.options);
    // TODO(P1): notif window pool: WebviewWindowBuilder("notif-N").transparent(true)
    // .decorations(false).always_on_top(true).focused(false).skip_taskbar(true); the
    // notifAPI preload becomes a second tiny shim (click/close/accept/decline/pause/resume).
}

#[tauri::command]
pub fn notification_close(app: AppHandle, payload: serde_json::Value) {
    let _ = (app, payload);
}
