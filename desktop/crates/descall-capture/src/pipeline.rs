//! One screen share = one WGC session + (optional) one process-loopback capture, both
//! writing into the same shared ring. A [`Sink`] is told about every frame / audio packet
//! (to wake the page) and about the source going away.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::bridge::UpdateRequest;
use crate::convert::{Converter, OutFormat};
use crate::d3d::D3d;
use crate::hdr::{monitor_hdr, ToneMapper};
use crate::loopback::{self, LoopbackCapture};
use crate::presets::{clamp_request, clip_size, fit, Quality};
use crate::ring::{FrameTimes, RingWriter, FLAG_AUDIO, FLAG_CURSOR, FLAG_HDR};
use crate::stats::{looks_black, ShareStats, StatsSnapshot};
use crate::tonemap::ToneParams;
use crate::wgc::{self, Options, Target, WgcSession};

pub trait Sink: Send + Sync + 'static {
    /// Video frame `seq` is in the ring. Called on the capture thread right after the write.
    fn video(&self, seq: u64);
    /// Audio packet `seq` is in the ring (every 10 ms).
    fn audio(&self, seq: u64);
    /// The window closed or the monitor went away. Must not stop the share synchronously.
    fn source_closed(&self);
}

#[derive(Debug, Clone, Copy)]
pub struct ShareRequest {
    pub target: Target,
    pub quality: Quality,
    pub cursor: bool,
    pub system_audio: bool,
    /// Whose process tree the loopback leaves out: None = this process (in-process mode);
    /// the capture helper passes the app's PID (the helper is a child of the app).
    pub exclude_pid: Option<u32>,
    /// Clip recording: the output size is fixed by the first frame (presets::clip_size within
    /// the quality box) and every later frame is scaled to it. Screen share: false (fit).
    pub fixed_output: bool,
}

pub struct Share {
    video: Option<WgcSession>,
    audio: Option<LoopbackCapture>,
    ring: Arc<Mutex<RingWriter>>,
    quality: Arc<Mutex<Quality>>,
    cursor: AtomicBool,
    stats: Arc<ShareStats>,
    pub hdr: bool,
    pub audio_error: Option<String>,
    pub adapter: crate::d3d::AdapterInfo,
    pub target: Target,
}

impl Share {
    /// Detach the ring first (no write may land in a closed shared buffer), then stop the
    /// capture threads. Never call while holding the ring lock.
    pub fn stop(mut self) {
        self.detach_ring();
        if let Some(v) = self.video.take() {
            v.stop();
        }
        if let Some(a) = self.audio.take() {
            a.stop();
        }
    }

    /// Stop writing to the shared buffer (waits for a write in progress). After this the
    /// shell may close the buffer, even while the capture threads are still winding down.
    pub fn detach_ring(&self) {
        if let Ok(mut r) = self.ring.lock() {
            r.detach();
        }
    }

    pub fn source_closed(&self) -> bool {
        self.video.as_ref().map(|v| v.is_closed()).unwrap_or(true)
    }

    /// The capture device was removed (the end reason is then "device-lost").
    pub fn device_lost(&self) -> bool {
        self.video.as_ref().map(|v| v.device_lost()).unwrap_or(false)
    }

    pub fn has_audio(&self) -> bool {
        self.audio.is_some()
    }

    pub fn stats(&self) -> StatsSnapshot {
        self.stats.snapshot()
    }

    pub fn stats_handle(&self) -> Arc<ShareStats> {
        self.stats.clone()
    }

    pub fn quality(&self) -> Quality {
        self.quality.lock().map(|q| *q).unwrap_or(crate::presets::preset("high"))
    }

    /// Mid-share change: fps (pacing), size (within the ring's box) and cursor.
    pub fn update(&self, u: &UpdateRequest) -> bool {
        let mut changed = false;
        if u.width.is_some() || u.height.is_some() || u.fps.is_some() {
            if let Ok(mut q) = self.quality.lock() {
                let next = clamp_request(u.width.or(Some(q.width)), u.height.or(Some(q.height)), u.fps.or(Some(q.fps)), q.hint);
                if next != *q {
                    *q = next;
                    if let Some(v) = &self.video {
                        v.set_max_fps(next.fps);
                    }
                    changed = true;
                }
            }
        }
        if let Some(c) = u.cursor {
            if let Some(v) = &self.video {
                if v.set_cursor(c) {
                    self.cursor.store(c, Ordering::Release);
                    changed = true;
                }
            }
            if let Ok(r) = self.ring.lock() {
                r.set_flags(self.flags());
            }
        }
        changed
    }

    fn flags(&self) -> u32 {
        (if self.audio.is_some() { FLAG_AUDIO } else { 0 }) | (if self.hdr { FLAG_HDR } else { 0 }) | (if self.cursor.load(Ordering::Acquire) { FLAG_CURSOR } else { 0 })
    }
}

struct Gpu {
    conv: Option<Converter>,
    tone: Option<ToneMapper>,
    tone_params: ToneParams,
    tone_checked: Instant,
    fixed: Option<(u32, u32)>,
}

/// Start a share. `ring`'s box must be at least the request's quality box.
pub fn start(req: ShareRequest, ring: Arc<Mutex<RingWriter>>, sink: Arc<dyn Sink>) -> crate::Result<Share> {
    let d3d = Arc::new(D3d::new()?);
    let adapter = d3d.adapter.clone();
    // Monitor: HDR if that monitor is. Window: FP16 whenever any monitor is HDR, with the
    // curve following the monitor the window is on (passthrough on SDR monitors).
    let (hdr_capture, initial_params) = match req.target {
        Target::Monitor(h) => {
            let i = monitor_hdr(h);
            (i.hdr, i.tone_params())
        }
        Target::Window(hwnd) => (crate::hdr::any_monitor_hdr(), monitor_hdr(crate::sources::monitor_of_window(hwnd)).tone_params()),
    };
    let stats = Arc::new(ShareStats::default());
    let quality = Arc::new(Mutex::new(req.quality));
    let (box_w, box_h) = ring.lock().map(|r| (r.layout().max_w, r.layout().max_h)).unwrap_or((req.quality.width, req.quality.height));

    let gpu = Mutex::new(Gpu { conv: None, tone: None, tone_params: initial_params, tone_checked: Instant::now(), fixed: None });
    let ring_v = ring.clone();
    let sink_v = sink.clone();
    let stats_v = stats.clone();
    let quality_v = quality.clone();
    let d3d_cb = d3d.clone();
    let target = req.target;
    let fixed_output = req.fixed_output;
    let on_frame = move |frame: wgc::Frame<'_>| {
        let Ok(mut g) = gpu.lock() else { return };
        let g = &mut *g;
        // All our immediate-context work (converter rebuild, tone-map, blit, readback) runs
        // under the device lock the frame pool also takes on its threads.
        let gpu_lock = d3d_cb.lock();
        let q = quality_v.lock().map(|q| *q).unwrap_or(req.quality);
        let qb = Quality { width: q.width.min(box_w), height: q.height.min(box_h), ..q };
        let (ow, oh) = if fixed_output { *g.fixed.get_or_insert_with(|| clip_size(frame.width, frame.height, qb.width, qb.height)) } else { fit(frame.width, frame.height, &qb) };
        let rebuild = g.conv.as_ref().map(|c| c.in_w != frame.width || c.in_h != frame.height || c.out_w != ow || c.out_h != oh).unwrap_or(true);
        if rebuild {
            g.conv = Converter::new(&d3d_cb, frame.width, frame.height, ow, oh, q.fps, OutFormat::Nv12).ok();
            g.tone = if frame.hdr { ToneMapper::new(&d3d_cb, frame.width, frame.height, g.tone_params).ok() } else { None };
        }
        // A followed window may move between HDR and SDR monitors: re-check once a second.
        if let (Target::Window(hwnd), true) = (target, frame.hdr) {
            if g.tone_checked.elapsed() > Duration::from_secs(1) {
                g.tone_checked = Instant::now();
                g.tone_params = monitor_hdr(crate::sources::monitor_of_window(hwnd)).tone_params();
                let p = g.tone_params;
                if let Some(t) = g.tone.as_mut() {
                    t.set_params(&d3d_cb, p);
                }
            }
        }
        let input = match (&g.tone, frame.hdr) {
            (Some(t), true) => {
                t.run(&d3d_cb, frame.texture);
                t.out.clone()
            }
            (None, true) => {
                ShareStats::add(&stats_v.frames_failed, 1);
                return;
            }
            _ => frame.texture.clone(),
        };
        let Some(conv) = g.conv.as_mut() else {
            ShareStats::add(&stats_v.frames_failed, 1);
            return;
        };
        let (cw, ch) = (conv.out_w, conv.out_h);
        let mut seq = None;
        let r = conv.convert_and_read(&d3d_cb, &input, |bytes, pitch| {
            let black = looks_black(bytes, cw as usize, ch as usize, pitch);
            if black {
                ShareStats::add(&stats_v.black_streak, 1);
            } else {
                stats_v.black_streak.store(0, Ordering::Relaxed);
            }
            let written = crate::clock::now_100ns();
            if let Ok(mut ring) = ring_v.lock() {
                let t = FrameTimes { timestamp_us: (frame.time_100ns / 10) as u64, arrival_us: (frame.arrival_100ns / 10) as u64, written_us: (written / 10) as u64 };
                seq = ring.write_nv12(cw, ch, bytes, pitch, t).ok();
            }
            stats_v.record_convert(((written - frame.arrival_100ns) / 10).max(0) as u64);
        });
        drop(gpu_lock);
        match (r, seq) {
            (Ok(()), Some(s)) => {
                ShareStats::add(&stats_v.frames_written, 1);
                sink_v.video(s);
            }
            _ => ShareStats::add(&stats_v.frames_failed, 1),
        }
    };
    let sink_c = sink.clone();
    let video = wgc::start(&d3d, req.target, Options { cursor: req.cursor, hdr: hdr_capture, max_fps: req.quality.fps, buffers: 2 }, Some(stats.clone()), on_frame, move || sink_c.source_closed())?;

    let (audio, audio_error) = if req.system_audio {
        let ring_a = ring.clone();
        let sink_a = sink.clone();
        let stats_a = stats.clone();
        let exclude = req.exclude_pid.unwrap_or_else(std::process::id);
        match loopback::start(loopback::Mode::ExcludeTree(exclude), move |samples, frames, ts, flags| {
            let seq = ring_a.lock().ok().and_then(|mut r| r.write_audio(samples, frames, ts, flags).ok());
            ShareStats::add(&stats_a.audio_packets, 1);
            if flags & crate::ring::AUDIO_SILENT != 0 {
                ShareStats::add(&stats_a.audio_silent_packets, 1);
            }
            if flags & crate::ring::AUDIO_DISCONTINUITY != 0 {
                ShareStats::add(&stats_a.audio_discontinuities, 1);
            }
            if let Some(s) = seq {
                sink_a.audio(s);
            }
        }) {
            Ok(a) => (Some(a), None),
            // Never fall back to whole-system loopback: that is the echo (3.7.33).
            Err(e) => (None, Some(e.to_string())),
        }
    } else {
        (None, None)
    };

    let share = Share { video: Some(video), audio, ring, quality, cursor: AtomicBool::new(req.cursor), stats, hdr: hdr_capture, audio_error, adapter, target: req.target };
    if let Ok(r) = share.ring.lock() {
        r.set_flags(share.flags());
    }
    Ok(share)
}
