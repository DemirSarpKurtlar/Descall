//! The whole native-share lifecycle behind a small sink trait, so the Tauri commands are
//! thin wrappers and the bench drives exactly the production code.
//!
//! Tauri wiring (desktop/app/src-tauri, owned by the shell):
//! ```text
//! screen_share_start(req):
//!     let plan = HOST.plan(&req)?;                                   // validates, sizes the ring
//!     let base = screenshare::create_and_post(&window, plan.id, plan.layout.total,
//!                    bridge::shared_buffer_meta(plan.id, plan.layout.total)).await?;
//!     HOST.start(plan, base as *mut u8, len, Arc::new(TauriSink { app }))   // -> StartInfo
//! screen_share_stop()          -> HOST.stop("stopped")
//! screen_share_update(req)     -> HOST.update(&req)
//! screen_sources({thumbnails}) -> HOST.thumbs.sources(thumbnails)
//! screen_thumbnails({ids})     -> HOST.thumbs.get(&ids, 800 ms)
//! screen_share_stats()         -> HOST.stats()
//! TauriSink::wake  -> PostWebMessageAsString(bridge::wake_message(..)) on the UI thread
//! TauriSink::ended -> PostWebMessageAsString(bridge::end_message(..)), then close the buffer
//! ```

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use crate::bridge::{Lane, SourceId, StartInfo, StartRequest, UpdateRequest};
use crate::pipeline::{self, Share, ShareRequest};
use crate::presets::Quality;
use crate::ring::{Layout, RingWriter};
use crate::stats::StatsSnapshot;
use crate::thumbs::ThumbnailHub;
use crate::wgc::Target;

/// What the shell does with share events (runs on capture threads).
pub trait HostSink: Send + Sync + 'static {
    /// Wake the page: `kind` is 'v' (video) or 'a' (audio).
    fn wake(&self, id: u32, kind: char, seq: u64);
    /// The share ended (`stopped`, `replaced`, `source-closed`, `failed`). The ring is
    /// already detached when this runs, so the shell may close the shared buffer.
    fn ended(&self, id: u32, reason: &str);
}

/// A validated request with its ring size, before the shell allocates the buffer.
#[derive(Debug, Clone)]
pub struct Plan {
    pub id: u32,
    pub source: SourceId,
    pub target: Target,
    pub quality: Quality,
    pub layout: Layout,
    pub cursor: bool,
    pub audio: bool,
}

struct Active {
    id: u32,
    share: Share,
    sink: Arc<dyn HostSink>,
}

type Slot = Arc<Mutex<Option<Active>>>;

#[derive(Default)]
pub struct ShareHost {
    active: Slot,
    next_id: AtomicU32,
    pub thumbs: ThumbnailHub,
}

/// Audio wakes every 20 ms (two packets); the page drains all unread packets per wake.
const AUDIO_WAKE_EVERY: u64 = 2;

struct PipelineSink {
    id: u32,
    sink: Arc<dyn HostSink>,
    slot: Slot,
}

impl pipeline::Sink for PipelineSink {
    fn video(&self, seq: u64) {
        self.sink.wake(self.id, 'v', seq);
    }

    fn audio(&self, seq: u64) {
        if seq % AUDIO_WAKE_EVERY == 0 {
            self.sink.wake(self.id, 'a', seq);
        }
    }

    fn source_closed(&self) {
        // Called on a WGC thread: stop from a fresh thread (Close waits for callbacks).
        let (slot, id) = (self.slot.clone(), self.id);
        let _ = std::thread::Builder::new().name("descall-share-end".into()).spawn(move || stop_slot(&slot, Some(id), "source-closed"));
    }
}

fn stop_slot(slot: &Slot, only_id: Option<u32>, reason: &str) -> bool {
    let taken = match slot.lock() {
        Ok(mut g) => match g.as_ref() {
            Some(a) if only_id.is_none_or(|id| id == a.id) => g.take(),
            _ => None,
        },
        Err(_) => None,
    };
    match taken {
        Some(a) => {
            a.share.stop();
            a.sink.ended(a.id, reason);
            true
        }
        None => false,
    }
}

impl ShareHost {
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate the request and size the ring. Cheap; no capture starts.
    pub fn plan(&self, req: &StartRequest) -> crate::Result<Plan> {
        let source = req.source().ok_or_else(|| crate::CaptureError::BadSourceId(req.source_id.clone()))?;
        let src = crate::sources::resolve(source)?;
        let target = match source {
            SourceId::Screen(_) => Target::Monitor(src.handle),
            SourceId::Window(h) => Target::Window(h),
        };
        let quality = req.quality();
        Ok(Plan {
            id: self.next_id.fetch_add(1, Ordering::Relaxed) + 1,
            source,
            target,
            quality,
            layout: Layout::new(quality.width, quality.height),
            cursor: req.cursor(),
            audio: req.audio(),
        })
    }

    /// Start the share into `base..base+len` (the shared buffer), replacing any running one.
    ///
    /// # Safety
    /// The memory must stay valid until `sink.ended(plan.id, ..)` has been called.
    pub unsafe fn start(&self, plan: Plan, base: *mut u8, len: usize, sink: Arc<dyn HostSink>) -> crate::Result<StartInfo> {
        stop_slot(&self.active, None, "replaced");
        if base.is_null() || len < plan.layout.total {
            return Err(crate::CaptureError::NotRunning);
        }
        let ring = Arc::new(Mutex::new(unsafe { RingWriter::new(base, len, plan.layout, crate::audio::SAMPLE_RATE, crate::audio::CHANNELS as u32) }));
        let echo = if plan.audio { crate::echo_guard::audit().ok() } else { None };
        let echo_risk = echo.as_ref().map(|a| !a.safe()).unwrap_or(false);
        if echo_risk {
            log::warn!("echo guard: WebView2 audio outside our process tree: {:?}", echo.as_ref().map(|a| &a.webview_outside_tree));
        }
        let psink = Arc::new(PipelineSink { id: plan.id, sink: sink.clone(), slot: self.active.clone() });
        let req = ShareRequest { target: plan.target, quality: plan.quality, cursor: plan.cursor, system_audio: plan.audio };
        let share = match pipeline::start(req, ring.clone(), psink) {
            Ok(s) => s,
            Err(e) => {
                if let Ok(mut r) = ring.lock() {
                    r.detach();
                }
                sink.ended(plan.id, "failed");
                return Err(e);
            }
        };
        let audio = share.has_audio();
        let info = StartInfo {
            id: plan.id,
            bytes: plan.layout.total,
            width: plan.quality.width,
            height: plan.quality.height,
            fps: plan.quality.fps,
            display_surface: plan.source.display_surface(),
            hdr: share.hdr,
            cursor: plan.cursor,
            audio,
            audio_error: share.audio_error.clone(),
            echo_risk,
            lane: if audio { Lane::L1 } else { Lane::L2 },
        };
        let closed_already = share.source_closed();
        if let Ok(mut g) = self.active.lock() {
            *g = Some(Active { id: plan.id, share, sink });
        }
        if closed_already {
            stop_slot(&self.active, Some(plan.id), "source-closed");
        }
        Ok(info)
    }

    pub fn stop(&self, reason: &str) -> bool {
        stop_slot(&self.active, None, reason)
    }

    pub fn update(&self, u: &UpdateRequest) -> bool {
        self.active.lock().ok().and_then(|g| g.as_ref().map(|a| a.share.update(u))).unwrap_or(false)
    }

    pub fn stats(&self) -> Option<StatsSnapshot> {
        self.active.lock().ok().and_then(|g| g.as_ref().map(|a| a.share.stats()))
    }

    pub fn active_id(&self) -> Option<u32> {
        self.active.lock().ok().and_then(|g| g.as_ref().map(|a| a.id))
    }
}

impl Drop for ShareHost {
    fn drop(&mut self) {
        stop_slot(&self.active, None, "stopped");
    }
}
