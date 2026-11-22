//! Native screen share commands: thin wrappers over `descall_capture::host::ShareHost`
//! (wiring contract at the top of desktop/crates/descall-capture/src/host.rs, JSON shapes in
//! its bridge.rs). The page-side half is app/shim/native-screen-share.js; the main shim maps
//! electronAPI.getScreenSources / selectDisplaySource onto it.
//!
//! Every command is async: Tauri runs sync commands on the main (UI) thread, and source
//! enumeration, thumbnails and starting a capture block for tens of milliseconds. The
//! blocking work runs on a worker thread with COM initialised (MTA); only the WebView2 calls
//! (shared buffer, wake-up messages) hop to the UI thread (crate::screenshare).

use serde_json::Value;
use tauri::{AppHandle, Runtime};

#[cfg(windows)]
use descall_capture::bridge::{StartRequest, UpdateRequest};

/// Managed state: the one share host of the app (one share at a time, like Chromium).
#[derive(Default)]
pub struct ShareState {
    #[cfg(windows)]
    host: descall_capture::host::ShareHost,
}

#[cfg(not(windows))]
type StartRequest = Value;
#[cfg(not(windows))]
type UpdateRequest = Value;

#[cfg(not(windows))]
const NOT_SUPPORTED: &str = "native screen share is Windows-only";

/// Run `f` with the share host on a blocking worker thread that has COM.
#[cfg(windows)]
async fn with_host<R: Runtime, T: Send + 'static>(app: &AppHandle<R>, f: impl FnOnce(&descall_capture::host::ShareHost) -> T + Send + 'static) -> Result<T, String> {
    use tauri::Manager;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        descall_capture::imaging::ensure_com();
        f(&app.state::<ShareState>().host)
    })
    .await
    .map_err(|e| e.to_string())
}

/// The shell side of the share events: wake-ups and the end message go to the page through
/// WebView2 (PostWebMessageAsString on the UI thread); `ended` also closes the shared buffer.
#[cfg(windows)]
struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
}

#[cfg(windows)]
impl<R: Runtime> descall_capture::host::HostSink for TauriSink<R> {
    fn wake(&self, id: u32, kind: char, seq: u64) {
        crate::screenshare::wake(&self.app, id, kind, seq);
    }

    fn ended(&self, id: u32, reason: &str) {
        crate::screenshare::close(&self.app, id, reason);
    }
}

/// get-screen-sources: `SourceInfo[]` (Electron id shape, thumbnails and app icons).
#[tauri::command]
pub async fn screen_sources<R: Runtime>(app: AppHandle<R>, thumbnails: Option<bool>) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let with_thumbs = thumbnails.unwrap_or(false);
        let list = with_host(&app, move |h| h.thumbs.sources(with_thumbs)).await?;
        serde_json::to_value(list).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, thumbnails);
        Ok(Value::Array(Vec::new()))
    }
}

/// Live picker tiles: fresh thumbnails (cached for 800 ms per source) and `alive: false`
/// for sources that went away.
#[tauri::command]
pub async fn screen_thumbnails<R: Runtime>(app: AppHandle<R>, ids: Vec<String>) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let list = with_host(&app, move |h| h.thumbs.get(&ids, std::time::Duration::from_millis(800))).await?;
        serde_json::to_value(list).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, ids);
        Ok(Value::Array(Vec::new()))
    }
}

/// What this machine supports (WGC, cursor toggle, borderless, process loopback).
#[tauri::command]
pub async fn screen_share_caps() -> Value {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| serde_json::to_value(descall_capture::caps::current()).unwrap_or_default()).await.unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        Value::Null
    }
}

/// Start (or replace) the share: plan, post the shared buffer to the page, then start the
/// capture into it. Returns `StartInfo`.
#[tauri::command]
pub async fn screen_share_start<R: Runtime>(app: AppHandle<R>, window: tauri::WebviewWindow<R>, req: StartRequest) -> Result<Value, String> {
    #[cfg(windows)]
    {
        if window.label() != crate::state::MAIN {
            return Err("screen share runs in the main window only".into());
        }
        let plan = with_host(&app, move |h| h.plan(&req)).await?.map_err(|e| e.to_string())?;
        let (id, len) = (plan.id, plan.layout.total);
        let meta = descall_capture::bridge::shared_buffer_meta(id, len);
        let base = crate::screenshare::create_and_post(&window, id, len, meta).await?;
        let sink = std::sync::Arc::new(TauriSink { app: app.clone() });
        // SAFETY: the buffer stays mapped until TauriSink::ended closes it, and ShareHost
        // calls `ended` only after the ring is detached (or the start failed).
        let info = with_host(&app, move |h| unsafe { h.start(plan, base as *mut u8, len, sink) }).await?.map_err(|e| e.to_string())?;
        serde_json::to_value(info).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, window, req);
        Err(NOT_SUPPORTED.into())
    }
}

/// Mid-share change (track.applyConstraints, the cursor toggle in the share bar).
#[tauri::command]
pub async fn screen_share_update<R: Runtime>(app: AppHandle<R>, req: UpdateRequest) -> Result<bool, String> {
    #[cfg(windows)]
    {
        with_host(&app, move |h| h.update(&req)).await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, req);
        Ok(false)
    }
}

/// `id`: the session the page ended (native-screen-share.js Session.end); only that share
/// stops, never a newer one. Without it (window.__descallNativeShare.stop) the running one.
#[tauri::command]
pub async fn screen_share_stop<R: Runtime>(app: AppHandle<R>, id: Option<u32>) -> Result<(), String> {
    match id {
        Some(id) => stop_id(&app, id).await,
        None => stop(&app, "stopped").await,
    }
}

async fn stop_id<R: Runtime>(app: &AppHandle<R>, id: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        with_host(app, move |h| {
            h.stop_id(id, "stopped");
        })
        .await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Ok(())
    }
}

/// Live counters for the share bar and telemetry (`null` when no share runs).
#[tauri::command]
pub async fn screen_share_stats<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let s = with_host(&app, |h| h.stats()).await?;
        serde_json::to_value(s).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(Value::Null)
    }
}

async fn stop<R: Runtime>(app: &AppHandle<R>, reason: &'static str) -> Result<(), String> {
    #[cfg(windows)]
    {
        with_host(app, move |h| {
            h.stop(reason);
        })
        .await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, reason);
        Ok(())
    }
}

/// The main page started loading a new document: its MediaStream is gone, so end the
/// capture too (Chromium ends getDisplayMedia on navigation).
pub fn stop_on_navigation<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = stop(&app, "navigated").await;
    });
}
