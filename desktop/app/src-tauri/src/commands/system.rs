use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// secureToken.set / clear. get() is synchronous for the page: the shim answers it from the
/// boot snapshot (window.__DESCALL_BOOT__.token) plus its own in-memory cache.
#[tauri::command]
pub fn token_set(app: AppHandle, token: String) -> bool {
    crate::secure_store::set(&app, crate::secure_store::TOKEN, &token)
}

#[tauri::command]
pub fn token_clear(app: AppHandle) -> bool {
    crate::secure_store::set(&app, crate::secure_store::TOKEN, "")
}

/// clipboard:read-image: PNG bytes (raw IPC body, no base64), or empty.
#[tauri::command]
pub fn clipboard_read_image(app: AppHandle) -> tauri::ipc::Response {
    let bytes = match app.clipboard().read_image() {
        Ok(img) => encode_png_rgba(img.width(), img.height(), img.rgba()),
        Err(_) => Vec::new(),
    };
    tauri::ipc::Response::new(bytes)
}

#[tauri::command]
pub fn clipboard_write_text(app: AppHandle, text: String) -> serde_json::Value {
    let ok = text.len() <= 1_000_000 && app.clipboard().write_text(text).is_ok();
    serde_json::json!({ "ok": ok })
}

/// scan-processes: lowercase exe names minus processScanner.cjs BLOCKLIST.
/// Toolhelp32 snapshot in-process (no tasklist.exe child, no console flash).
#[tauri::command]
pub fn processes_scan() -> Vec<String> {
    Vec::new() // TODO(P1): CreateToolhelp32Snapshot + Process32NextW, BLOCKLIST from processScanner.cjs.
}

/// download-file: http(s) only, plain file name in Downloads (safeDownload.cjs rules).
#[tauri::command]
pub async fn download_file(url: String, filename: String) -> serde_json::Value {
    let _ = (url, filename);
    serde_json::json!({ "success": false, "error": "TODO(P1)" })
}

/// Minimal stored-deflate PNG writer would go here; P1 uses the `png` crate.
fn encode_png_rgba(_w: u32, _h: u32, _rgba: &[u8]) -> Vec<u8> {
    Vec::new()
}
