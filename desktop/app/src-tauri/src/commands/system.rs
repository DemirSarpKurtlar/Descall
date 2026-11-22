use descall_shell::{clipboard, download, processes};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// secureToken.set / clear. get() is synchronous for the page: the shim answers it from the
/// boot snapshot (window.__DESCALL_BOOT__.token) plus its own in-memory cache. Main window
/// and the admin windows only (the same senders main.cjs trusts).
fn trusted<R: Runtime>(w: &WebviewWindow<R>) -> bool {
    matches!(w.label(), "main" | "admin" | "signup-stats")
}

#[tauri::command]
pub fn token_set<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, token: String) -> bool {
    if token.len() > 16 * 1024 {
        return false;
    }
    // A Descall+ extra-account window stores its own session, never the owner's.
    if crate::premium::account_token(window.label(), Some(token.trim())) {
        return true;
    }
    if !trusted(&window) {
        return false;
    }
    crate::secure_store::set(&app, crate::secure_store::TOKEN, token.trim())
}

#[tauri::command]
pub fn token_clear<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> bool {
    if crate::premium::account_token(window.label(), None) {
        return true;
    }
    if !trusted(&window) {
        return false;
    }
    crate::premium::signed_out();
    crate::secure_store::set(&app, crate::secure_store::TOKEN, "")
}

/// clipboard:read-image: PNG bytes (raw IPC body, no base64), empty when there is none.
#[tauri::command]
pub fn clipboard_read_image<R: Runtime>(app: AppHandle<R>) -> tauri::ipc::Response {
    let bytes = match app.clipboard().read_image() {
        Ok(img) => clipboard::encode_png(img.width(), img.height(), img.rgba()),
        Err(_) => Vec::new(),
    };
    tauri::ipc::Response::new(bytes)
}

/// clipboard:write-text -> { ok } (never rejects).
#[tauri::command]
pub fn clipboard_write_text<R: Runtime>(app: AppHandle<R>, text: String) -> clipboard::WriteResult {
    if let Some(refused) = clipboard::check_text(&text) {
        return refused;
    }
    if app.clipboard().write_text(text).is_ok() {
        clipboard::write_ok()
    } else {
        clipboard::write_failed()
    }
}

/// scan-processes: lowercase image names minus processScanner.cjs BLOCKLIST.
#[tauri::command]
pub async fn processes_scan() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| processes::filter_names(crate::platform::process_names())).await.unwrap_or_default()
}

/// download-file: http(s) only; a plain file name directly inside Downloads (safeDownload
/// rules), never overwriting an earlier file; shown in Explorer when done.
#[tauri::command]
pub async fn download_file<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, url: String, filename: String) -> Value {
    if !trusted(&window) && !window.label().starts_with("popout-") {
        return json!({ "success": false, "error": "untrusted window" });
    }
    match fetch_to_downloads(&app, &url, &filename).await {
        Ok(path) => {
            use tauri_plugin_opener::OpenerExt;
            let _ = app.opener().reveal_item_in_dir(&path);
            json!({ "success": true, "path": path.to_string_lossy() })
        }
        Err(e) => {
            log::error!("[download] {e}");
            json!({ "success": false, "error": e })
        }
    }
}

async fn fetch_to_downloads<R: Runtime>(app: &AppHandle<R>, url: &str, filename: &str) -> Result<std::path::PathBuf, String> {
    use futures_util::StreamExt;
    use std::io::Write;
    if !download::is_downloadable_url(url) {
        return Err("download-file: only http(s) URLs".into());
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let (_, safe) = download::resolve_download_path(&dir, filename).map_err(str::to_string)?;
    let target = download::unique_path(&dir, &safe, |p| p.exists());
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder().user_agent(concat!("Descall-Desktop/", env!("CARGO_PKG_VERSION"))).build().map_err(|e| e.to_string())?;
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    if res.content_length().is_some_and(|l| l > download::MAX_DOWNLOAD_BYTES) {
        return Err("file too large".into());
    }
    let part = download::part_path(&target);
    // create_new: never write into a file that is already there (another download of the
    // same name, or anything else that appeared since unique_path looked).
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&part).map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut total: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&part);
                return Err(e.to_string());
            }
        };
        total += chunk.len() as u64;
        if total > download::MAX_DOWNLOAD_BYTES {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err("file too large".into());
        }
        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err(e.to_string());
        }
    }
    drop(file);
    // rename replaces an existing file on Windows: a same-name download that finished first
    // keeps its file, this one takes the next free name.
    let target = if target.exists() { download::unique_path(&dir, &safe, |p| p.exists()) } else { target };
    if let Err(e) = std::fs::rename(&part, &target) {
        let _ = std::fs::remove_file(&part);
        return Err(e.to_string());
    }
    Ok(target)
}
