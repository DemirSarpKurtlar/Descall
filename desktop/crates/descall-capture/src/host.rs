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
use crate::helper::{HelperShare, HelperSpawn};
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
    /// already detached when this runs (no further writes or wakes), so the shell may close
    /// the shared buffer; the capture threads finish stopping right after.
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

/// Where the capture runs.
#[derive(Debug, Clone, PartialEq)]
pub enum CaptureMode {
    /// In this process (Windows' frame pool thread can take the process down if the GPU
    /// device is removed).
    InProcess,
    /// In a helper process (helper.rs): a device loss or crash restarts the helper.
    Helper(HelperSpawn),
}

/// A running share, whichever mode.
enum Running {
    InProcess(Share),
    Helper(HelperShare),
}

impl Running {
    fn detach_ring(&self) {
        match self {
            Running::InProcess(s) => s.detach_ring(),
            Running::Helper(h) => h.detach_ring(),
        }
    }

    fn stop(self) {
        match self {
            Running::InProcess(s) => s.stop(),
            Running::Helper(h) => h.stop(),
        }
    }

    fn update(&self, u: &UpdateRequest) -> bool {
        match self {
            Running::InProcess(s) => s.update(u),
            Running::Helper(h) => h.update(u),
        }
    }

    fn stats(&self) -> StatsSnapshot {
        match self {
            Running::InProcess(s) => s.stats(),
            Running::Helper(h) => h.stats(),
        }
    }

    fn source_closed(&self) -> bool {
        match self {
            Running::InProcess(s) => s.source_closed(),
            Running::Helper(h) => h.source_closed(),
        }
    }

    /// The reason a "source went away" signal really means.
    fn end_reason<'a>(&self, reason: &'a str) -> &'a str {
        if reason != "source-closed" {
            return reason;
        }
        match self {
            Running::InProcess(s) if s.device_lost() => "device-lost",
            Running::Helper(h) if h.device_lost() => "device-lost",
            Running::Helper(h) if h.failed() => "capture-failed",
            _ => reason,
        }
    }
}

struct Active {
    id: u32,
    share: Running,
    sink: Arc<dyn HostSink>,
}

type Slot = Arc<Mutex<Option<Active>>>;

/// One share at a time. `ShareHost::default()` runs the capture in the helper process when
/// `descall-capture-host.exe` sits next to the app (installed builds), else in-process.
pub struct ShareHost {
    active: Slot,
    next_id: AtomicU32,
    mode: CaptureMode,
    pub thumbs: ThumbnailHub,
}

impl Default for ShareHost {
    fn default() -> Self {
        Self::with_mode(crate::helper::default_spawn().map(CaptureMode::Helper).unwrap_or(CaptureMode::InProcess))
    }
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
            // Tell the page right away (the ring is detached, so the shell may close the
            // buffer), then wind the capture down; closing WGC and joining the loopback
            // thread can take a moment and must not delay "source-closed".
            a.share.detach_ring();
            a.sink.ended(a.id, a.share.end_reason(reason));
            a.share.stop();
            true
        }
        None => false,
    }
}

impl ShareHost {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_mode(mode: CaptureMode) -> Self {
        ShareHost { active: Arc::new(Mutex::new(None)), next_id: AtomicU32::new(0), mode, thumbs: ThumbnailHub::new() }
    }

    pub fn in_process() -> Self {
        Self::with_mode(CaptureMode::InProcess)
    }

    pub fn with_helper(spawn: HelperSpawn) -> Self {
        Self::with_mode(CaptureMode::Helper(spawn))
    }

    pub fn mode(&self) -> &CaptureMode {
        &self.mode
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
        let req = ShareRequest { target: plan.target, quality: plan.quality, cursor: plan.cursor, system_audio: plan.audio, exclude_pid: None, fixed_output: false };
        let started = match &self.mode {
            CaptureMode::InProcess => pipeline::start(req, ring.clone(), psink).map(Running::InProcess),
            CaptureMode::Helper(spawn) => HelperShare::start(spawn.clone(), &req, plan.layout, ring.clone(), psink).map(Running::Helper),
        };
        let share = match started {
            Ok(s) => s,
            Err(e) => {
                if let Ok(mut r) = ring.lock() {
                    r.detach();
                }
                sink.ended(plan.id, "failed");
                return Err(e);
            }
        };
        let (hdr, audio, audio_error) = match &share {
            Running::InProcess(s) => (s.hdr, s.has_audio(), s.audio_error.clone()),
            Running::Helper(h) => (h.ready.hdr, h.ready.audio, h.ready.audio_error.clone()),
        };
        let info = StartInfo {
            id: plan.id,
            bytes: plan.layout.total,
            width: plan.quality.width,
            height: plan.quality.height,
            fps: plan.quality.fps,
            display_surface: plan.source.display_surface(),
            hdr,
            cursor: plan.cursor,
            audio,
            audio_error,
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

    /// Stop share `id` only. The page's stop for a session that already ended must not end
    /// a newer share: Tauri runs async commands concurrently, so a late stop of the old
    /// session could land after the next screen_share_start (quality change = stop + start).
    pub fn stop_id(&self, id: u32, reason: &str) -> bool {
        stop_slot(&self.active, Some(id), reason)
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
