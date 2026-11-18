//! getScreenSources / selectDisplaySource replacement and the native share lifecycle.
//! The page-side half is app/shim/native-screen-share.js.

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, WebviewWindow};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub width: i32,
    pub height: i32,
    /// P0: live thumbnails = low-rate WGC sessions per visible tile, scaled by the video
    /// processor and JPEG-encoded with WIC (~15 KB per tile), refreshed every second while
    /// the picker is open. The spike returns null and the picker shows the name + size.
    pub thumbnail_data_url: Option<String>,
    pub app_icon_data_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartReq {
    pub source_id: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub cursor: Option<bool>,
    pub audio: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInfo {
    pub id: u32,
    pub bytes: usize,
    pub hdr: bool,
    pub audio: bool,
    pub audio_error: Option<String>,
}

#[derive(Default)]
pub struct ShareState {
    #[cfg(windows)]
    active: Mutex<Option<Active>>,
    next_id: std::sync::atomic::AtomicU32,
}

#[cfg(windows)]
struct Active {
    id: u32,
    share: descall_capture::pipeline::Share,
    ring: Arc<Mutex<descall_capture::ring::RingWriter>>,
}

#[tauri::command]
pub fn screen_sources() -> Vec<SourceDto> {
    #[cfg(windows)]
    {
        descall_capture::sources::list_all()
            .into_iter()
            .map(|s| SourceDto {
                id: s.id,
                name: s.name,
                kind: s.kind.into(),
                width: s.width,
                height: s.height,
                thumbnail_data_url: None,
                app_icon_data_url: None,
            })
            .collect()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub fn screen_share_caps() -> serde_json::Value {
    #[cfg(windows)]
    {
        serde_json::to_value(descall_capture::caps::current()).unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        serde_json::Value::Null
    }
}

#[tauri::command]
pub async fn screen_share_start(app: AppHandle, window: WebviewWindow, state: State<'_, ShareState>, req: StartReq) -> Result<StartInfo, String> {
    #[cfg(windows)]
    {
        use descall_capture::presets::{ContentHint, Quality};
        use descall_capture::ring::{Layout, RingWriter};
        stop_active(&app, &state, "replaced");
        let target = resolve_target(&req.source_id)?;
        let quality = Quality {
            width: req.width.unwrap_or(1920).clamp(320, 3840),
            height: req.height.unwrap_or(1080).clamp(240, 2160),
            fps: req.fps.unwrap_or(30).clamp(5, 60),
            hint: ContentHint::Motion,
        };
        let id = state.next_id.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        let layout = Layout::new(quality.width, quality.height);
        let meta = serde_json::json!({ "descallShare": id, "bytes": layout.total }).to_string();
        let base = crate::screenshare::create_and_post(&window, id, layout.total, meta).await?;
        let ring = unsafe { RingWriter::new(base as *mut u8, layout.total, layout, descall_capture::loopback::SAMPLE_RATE, 2) };
        let ring = Arc::new(Mutex::new(ring));

        let app_n = app.clone();
        let notify = move |kind: descall_capture::pipeline::Kind, seq: u64| {
            use descall_capture::pipeline::Kind;
            match kind {
                Kind::Video => crate::screenshare::wake(&app_n, id, 'v', seq),
                // Every other 10 ms packet: the page drains all unread audio slots per wake.
                Kind::Audio if seq % 2 == 0 => crate::screenshare::wake(&app_n, id, 'a', seq),
                Kind::Audio => {}
            }
        };
        let request = descall_capture::pipeline::ShareRequest {
            target,
            quality,
            cursor: req.cursor.unwrap_or(true),
            system_audio: req.audio.unwrap_or(true),
            sdr_white_nits: 200.0,
        };
        let share = descall_capture::pipeline::start(request, ring.clone(), notify).map_err(|e| {
            crate::screenshare::close(&app, id, "failed");
            e.to_string()
        })?;
        let info = StartInfo { id, bytes: layout.total, hdr: share.hdr, audio: share.audio_error.is_none() && req.audio.unwrap_or(true), audio_error: share.audio_error.clone() };
        *state.active.lock().unwrap() = Some(Active { id, share, ring });
        watch_source(app.clone(), id);
        Ok(info)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, window, state, req);
        Err("native screen share is Windows-only".into())
    }
}

#[tauri::command]
pub fn screen_share_stop(app: AppHandle, state: State<'_, ShareState>) {
    stop_active(&app, &state, "stopped");
}

/// Mid-share quality change (track.applyConstraints from the page): P0 restarts the WGC
/// session with the new pacing and resizes the converter; the ring keeps its size (the
/// layout is allocated for the preset box).
#[tauri::command]
pub fn screen_share_update(fps: Option<u32>) -> bool {
    let _ = fps;
    false
}

/// The shared window was closed or the monitor unplugged (GraphicsCaptureItem.Closed):
/// end the share like Chromium does when the captured surface goes away.
#[cfg(windows)]
fn watch_source(app: AppHandle, id: u32) {
    use tauri::Manager;
    tauri::async_runtime::spawn(async move {
        loop {
            tokio_sleep_ms(500).await;
            let state = app.state::<ShareState>();
            let closed = match state.active.lock().unwrap().as_ref() {
                Some(a) if a.id == id => a.share.source_closed(),
                _ => return,
            };
            if closed {
                stop_active(&app, &state, "source-closed");
                return;
            }
        }
    });
}

#[cfg(windows)]
async fn tokio_sleep_ms(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}

fn stop_active(app: &AppHandle, state: &ShareState, reason: &'static str) {
    #[cfg(windows)]
    {
        if let Some(a) = state.active.lock().unwrap().take() {
            a.ring.lock().unwrap().detach();
            a.share.stop();
            crate::screenshare::close(app, a.id, reason);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, state, reason);
    }
}

#[cfg(windows)]
fn resolve_target(id: &str) -> Result<descall_capture::wgc::Target, String> {
    use descall_capture::wgc::Target;
    let mut parts = id.split(':');
    match (parts.next(), parts.next()) {
        (Some("screen"), Some(n)) => {
            let n: usize = n.parse().map_err(|_| "bad screen id")?;
            let mons = descall_capture::sources::list_monitors();
            mons.get(n).map(|m| Target::Monitor(m.handle)).ok_or_else(|| format!("screen {n} not found"))
        }
        (Some("window"), Some(h)) => Ok(Target::Window(h.parse::<isize>().map_err(|_| "bad window id")?)),
        _ => Err("source id must be screen:<n>:0 or window:<hwnd>:0".into()),
    }
}
