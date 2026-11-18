//! WebView2 side of the native screen-share lane: the shared buffer and the per-frame wake-up.
//!
//! - ICoreWebView2Environment12::CreateSharedBuffer(size) -> host maps it read/write.
//! - ICoreWebView2_17::PostSharedBufferToScript(buf, READ_ONLY, additionalData JSON) -> the
//!   page gets a `sharedbufferreceived` event on window.chrome.webview, getBuffer() -> ArrayBuffer.
//!   (WebView2 SDK 1.0.1661+ / runtime 109+; the runtime is evergreen.)
//! - Per frame: ICoreWebView2::PostWebMessageAsString("descall-share:<id>:v:<seq>") on the UI
//!   thread (WebView2 objects are STA). ~60 video + 50 audio wake-ups per second. Message
//!   formats: descall_capture::bridge::{wake_message, end_message, shared_buffer_meta}.
//!
//! Docs: learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2sharedbuffer

use std::cell::RefCell;
use std::collections::HashMap;

use descall_capture::bridge;
use tauri::{AppHandle, Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2Environment12, ICoreWebView2SharedBuffer, ICoreWebView2_17, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
};
use windows_core::{Interface, HSTRING};

thread_local! {
    /// UI-thread only: the buffers we posted and the CoreWebView2 to wake.
    static UI: RefCell<HashMap<u32, (ICoreWebView2SharedBuffer, ICoreWebView2)>> = RefCell::new(HashMap::new());
}

/// Create a shared buffer of `size` bytes, post it to the page with `meta` as additional
/// data, and return the host-side base address (as usize so it can cross threads).
pub async fn create_and_post<R: Runtime>(window: &WebviewWindow<R>, id: u32, size: usize, meta: String) -> Result<usize, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<usize, String>>();
    window
        .with_webview(move |pw| {
            let r = (|| -> windows_core::Result<usize> {
                unsafe {
                    let env12: ICoreWebView2Environment12 = pw.environment().cast()?;
                    let buf = env12.CreateSharedBuffer(size as u64)?;
                    let mut ptr: *mut u8 = std::ptr::null_mut();
                    buf.Buffer(&mut ptr)?;
                    let core = pw.controller().CoreWebView2()?;
                    let core17: ICoreWebView2_17 = core.cast()?;
                    core17.PostSharedBufferToScript(&buf, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY, &HSTRING::from(meta))?;
                    UI.with(|m| m.borrow_mut().insert(id, (buf, core)));
                    Ok(ptr as usize)
                }
            })();
            let _ = tx.send(r.map_err(|e| e.to_string()));
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?
}

/// Wake the page: called from capture threads, hops to the UI thread.
pub fn wake<R: Runtime>(app: &AppHandle<R>, id: u32, kind: char, seq: u64) {
    let _ = app.run_on_main_thread(move || {
        UI.with(|m| {
            if let Some((_, core)) = m.borrow().get(&id) {
                let msg = HSTRING::from(bridge::wake_message(id, kind, seq));
                unsafe {
                    let _ = core.PostWebMessageAsString(&msg);
                }
            }
        })
    });
}

/// Tell the page the share ended, then close the buffer (the ring is detached before this).
pub fn close<R: Runtime>(app: &AppHandle<R>, id: u32, reason: &str) {
    let msg = bridge::end_message(id, reason);
    let _ = app.run_on_main_thread(move || {
        UI.with(|m| {
            if let Some((buf, core)) = m.borrow_mut().remove(&id) {
                unsafe {
                    let _ = core.PostWebMessageAsString(&HSTRING::from(msg));
                    let _ = buf.Close();
                }
            }
        })
    });
}
