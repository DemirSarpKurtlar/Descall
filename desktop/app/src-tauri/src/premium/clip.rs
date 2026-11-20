//! instant_clip native recorder: the native capture lane (Windows.Graphics.Capture + the GPU
//! NV12 converter of descall-capture, and process loopback audio that excludes Descall's own
//! process tree, so the call is never in a clip) encoded by Media Foundation (H.264, AAC;
//! hardware encoder when present) into fragmented MP4, kept in memory by logic::fmp4::ClipRing.
//! Saving cuts the ring on keyframes; nothing is re-encoded. The renderer's WebCodecs recorder
//! stays as the fallback when this cannot start.
//!
//! Capture runs in the capture helper process (descall_capture::helper) whenever
//! `descall-capture-host.exe` sits next to Descall.exe, exactly like the screen share: a GPU
//! device loss or a crash inside Windows' capture code then ends or restarts the helper, never
//! Descall. Encoding stays here. Without the helper (dev builds) the capture runs in-process.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::lock;
use super::logic::fmp4::{ClipRing, Snapshot};
use super::logic::rules::clip_bitrate as bitrate_for;

#[derive(Clone, Debug)]
pub struct Opts {
    pub source_id: String,
    pub window_sec: u32,
    pub height: u32,
    pub fps: u32,
    pub audio: bool,
}

#[derive(Default)]
pub struct Stats {
    pub frames: AtomicU64,
    pub dropped: AtomicU64,
    pub width: AtomicU32,
    pub height: AtomicU32,
    pub hardware: AtomicBool,
    pub audio: AtomicBool,
    pub error: Mutex<Option<String>>,
}

pub struct Recorder {
    pub opts: Opts,
    pub ring: Arc<Mutex<ClipRing>>,
    pub stats: Arc<Stats>,
    started: u64,
    #[cfg(windows)]
    inner: Option<win::Running>,
}

/// The capture request of a clip in helper mode: a 32:9 box at the clip height and fps; the
/// helper fixes the output size from the first frame (presets::clip_size), the same size the
/// in-process recorder picks.
pub fn helper_quality(opts: &Opts) -> descall_capture::presets::Quality {
    let (w, h) = descall_capture::presets::clip_box(opts.height.clamp(360, 1440));
    descall_capture::presets::Quality { width: w, height: h, fps: opts.fps.clamp(10, 60), hint: descall_capture::presets::ContentHint::Motion }
}

impl Recorder {
    pub fn start(opts: Opts) -> Result<Recorder, String> {
        let window_ms = opts.window_sec.clamp(10, 120) as f64 * 1000.0;
        // Bitrate x (window + one fragment) x 1.5 headroom, at least 32 MB.
        let max_bytes = ((bitrate_for(opts.height, opts.fps) as f64 / 8.0 * (window_ms / 1000.0 + 2.0) * 1.5) as usize).max(32 << 20);
        let ring = Arc::new(Mutex::new(ClipRing::new(window_ms, max_bytes)));
        let stats = Arc::new(Stats::default());
        #[cfg(windows)]
        {
            let inner = win::start(&opts, ring.clone(), stats.clone())?;
            Ok(Recorder { opts, ring, stats, started: super::now_ms(), inner: Some(inner) })
        }
        #[cfg(not(windows))]
        {
            let _ = (ring, stats);
            Err("platform".into())
        }
    }

    #[cfg(windows)]
    pub fn stop(mut self) {
        if let Some(i) = self.inner.take() {
            i.stop();
        }
    }

    #[cfg(not(windows))]
    pub fn stop(self) {}

    pub fn info(&self) -> Value {
        let r = lock(&self.ring);
        json!({
            "running": true,
            "native": true,
            "codec": "avc",
            "hardware": self.stats.hardware.load(Ordering::Relaxed),
            "audio": self.stats.audio.load(Ordering::Relaxed),
            "width": self.stats.width.load(Ordering::Relaxed),
            "height": self.stats.height.load(Ordering::Relaxed),
            "fps": self.opts.fps,
            "windowSec": self.opts.window_sec,
            "bufferedSec": (r.buffered_ms() / 100.0).round() / 10.0,
            "bytes": r.bytes(),
            "maxBytes": r.max_bytes,
            "frames": self.stats.frames.load(Ordering::Relaxed),
            "dropped": self.stats.dropped.load(Ordering::Relaxed),
            "startedAt": self.started,
            "error": *lock(&self.stats.error),
        })
    }

    pub fn snapshot(&self) -> Snapshot {
        lock(&self.ring).snapshot()
    }
}

#[cfg(windows)]
mod win {
    use std::mem::ManuallyDrop;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};

    use descall_capture::audio::{CHANNELS, SAMPLE_RATE};
    use descall_capture::bridge::SourceId;
    use descall_capture::convert::{Converter, OutFormat};
    use descall_capture::d3d::D3d;
    use descall_capture::hdr::{any_monitor_hdr, monitor_hdr, ToneMapper};
    use descall_capture::loopback::{self, LoopbackCapture};
    use descall_capture::helper::{FrameSink, HelperShare, HelperSpawn, Output};
    use descall_capture::pipeline::ShareRequest;
    use descall_capture::ring::{Layout, VideoMeta};
    use descall_capture::wgc::{self, Options, Target, WgcSession};
    use windows::core::{implement, Interface, IUnknown, Ref, BOOL, GUID, PCWSTR};
    use windows::Win32::Foundation::E_NOTIMPL;
    use windows::Win32::Media::MediaFoundation::*;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_UI4};

    use super::{bitrate_for, Opts, Stats};
    use crate::premium::lock;
    use crate::premium::logic::fmp4::ClipRing;

    // ---- byte stream into the ring ---------------------------------------------------------

    #[implement(IMFByteStream)]
    struct RingStream {
        ring: Arc<Mutex<ClipRing>>,
        st: Mutex<(u64, u64, u32)>, // position, length, bytes of the last BeginWrite
    }

    impl RingStream {
        fn write(&self, pb: *const u8, cb: u32) -> u32 {
            if pb.is_null() || cb == 0 {
                return 0;
            }
            let bytes = unsafe { std::slice::from_raw_parts(pb, cb as usize) };
            let mut st = lock(&self.st);
            let (pos, len) = (st.0, st.1);
            let mut ring = lock(&self.ring);
            if pos >= len {
                ring.push(bytes);
            } else {
                let overlap = ((len - pos) as usize).min(bytes.len());
                ring.patch(pos, &bytes[..overlap]);
                if overlap < bytes.len() {
                    ring.push(&bytes[overlap..]);
                }
            }
            st.0 = pos + cb as u64;
            st.1 = st.1.max(st.0);
            cb
        }
    }

    impl IMFByteStream_Impl for RingStream_Impl {
        fn GetCapabilities(&self) -> windows::core::Result<u32> {
            Ok(MFBYTESTREAM_IS_WRITABLE | MFBYTESTREAM_IS_SEEKABLE)
        }
        fn GetLength(&self) -> windows::core::Result<u64> {
            Ok(lock(&self.st).1)
        }
        fn SetLength(&self, _len: u64) -> windows::core::Result<()> {
            Ok(())
        }
        fn GetCurrentPosition(&self) -> windows::core::Result<u64> {
            Ok(lock(&self.st).0)
        }
        fn SetCurrentPosition(&self, pos: u64) -> windows::core::Result<()> {
            lock(&self.st).0 = pos;
            Ok(())
        }
        fn IsEndOfStream(&self) -> windows::core::Result<BOOL> {
            let st = lock(&self.st);
            Ok((st.0 >= st.1).into())
        }
        fn Read(&self, _pb: *mut u8, _cb: u32, _read: *mut u32) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }
        fn BeginRead(&self, _pb: *mut u8, _cb: u32, _cbk: Ref<IMFAsyncCallback>, _st: Ref<IUnknown>) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }
        fn EndRead(&self, _r: Ref<IMFAsyncResult>) -> windows::core::Result<u32> {
            Err(E_NOTIMPL.into())
        }
        fn Write(&self, pb: *const u8, cb: u32) -> windows::core::Result<u32> {
            Ok(self.write(pb, cb))
        }
        fn BeginWrite(&self, pb: *const u8, cb: u32, cbk: Ref<IMFAsyncCallback>, state: Ref<IUnknown>) -> windows::core::Result<()> {
            let n = self.write(pb, cb);
            lock(&self.st).2 = n;
            unsafe {
                let result = MFCreateAsyncResult(None, cbk.as_ref(), state.as_ref())?;
                MFInvokeCallback(&result)
            }
        }
        fn EndWrite(&self, r: Ref<IMFAsyncResult>) -> windows::core::Result<u32> {
            if let Some(r) = r.as_ref() {
                unsafe { r.GetStatus()? };
            }
            Ok(lock(&self.st).2)
        }
        fn Seek(&self, origin: MFBYTESTREAM_SEEK_ORIGIN, offset: i64, _flags: u32) -> windows::core::Result<u64> {
            let mut st = lock(&self.st);
            let base = if origin == msoCurrent { st.0 as i64 } else { 0 };
            st.0 = (base + offset).max(0) as u64;
            Ok(st.0)
        }
        fn Flush(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn Close(&self) -> windows::core::Result<()> {
            Ok(())
        }
    }

    // ---- sink writer --------------------------------------------------------------------------

    /// Media Foundation objects are free-threaded; the writer is used under a mutex.
    struct Writer {
        sw: IMFSinkWriter,
        video: u32,
        audio: Option<u32>,
        t0_us: u64,
        fps: u32,
        w: u32,
        h: u32,
        buf: Vec<u8>,
    }
    unsafe impl Send for Writer {}

    fn mf_started() -> bool {
        static S: OnceLock<bool> = OnceLock::new();
        *S.get_or_init(|| unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            MFStartup(MF_VERSION, MFSTARTUP_LITE).is_ok()
        })
    }

    fn pack(hi: u32, lo: u32) -> u64 {
        ((hi as u64) << 32) | lo as u64
    }

    fn video_type(sub: &GUID, w: u32, h: u32, fps: u32, bitrate: Option<u32>) -> windows::core::Result<IMFMediaType> {
        unsafe {
            let t = MFCreateMediaType()?;
            t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            t.SetGUID(&MF_MT_SUBTYPE, sub)?;
            if let Some(b) = bitrate {
                t.SetUINT32(&MF_MT_AVG_BITRATE, b)?;
            }
            t.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            t.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h))?;
            t.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
            t.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
            Ok(t)
        }
    }

    fn audio_type(sub: &GUID, avg_bytes: u32) -> windows::core::Result<IMFMediaType> {
        unsafe {
            let t = MFCreateMediaType()?;
            t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            t.SetGUID(&MF_MT_SUBTYPE, sub)?;
            t.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            t.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, SAMPLE_RATE)?;
            t.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, CHANNELS as u32)?;
            t.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, avg_bytes)?;
            if *sub == MFAudioFormat_PCM {
                t.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, CHANNELS as u32 * 2)?;
            }
            Ok(t)
        }
    }

    fn u4(v: u32) -> VARIANT {
        VARIANT { Anonymous: VARIANT_0 { Anonymous: ManuallyDrop::new(VARIANT_0_0 { vt: VT_UI4, wReserved1: 0, wReserved2: 0, wReserved3: 0, Anonymous: VARIANT_0_0_0 { ulVal: v } }) } }
    }

    impl Writer {
        fn new(stream: &IMFByteStream, w: u32, h: u32, fps: u32, audio: bool, stats: &Stats) -> windows::core::Result<Writer> {
            unsafe {
                let mut attrs = None;
                MFCreateAttributes(&mut attrs, 4)?;
                let attrs = attrs.ok_or_else(|| windows::core::Error::from(E_NOTIMPL))?;
                attrs.SetGUID(&MF_TRANSCODE_CONTAINERTYPE, &MFTranscodeContainerType_FMPEG4)?;
                attrs.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1)?;
                attrs.SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1)?;
                attrs.SetUINT32(&MF_LOW_LATENCY, 1)?;
                let sw = MFCreateSinkWriterFromURL(PCWSTR::null(), stream, &attrs)?;
                let video = sw.AddStream(&video_type(&MFVideoFormat_H264, w, h, fps, Some(bitrate_for(h, fps)))?)?;
                sw.SetInputMediaType(video, &video_type(&MFVideoFormat_NV12, w, h, fps, None)?, None)?;
                // One keyframe a second: fragments (and cut points) of one second.
                let mut codec: *mut core::ffi::c_void = std::ptr::null_mut();
                if sw.GetServiceForStream(video, &GUID::zeroed(), &ICodecAPI::IID, &mut codec).is_ok() && !codec.is_null() {
                    let api = ICodecAPI::from_raw(codec);
                    let _ = api.SetValue(&CODECAPI_AVEncMPVGOPSize, &u4(fps));
                }
                let audio = if audio {
                    let a = sw.AddStream(&audio_type(&MFAudioFormat_AAC, 24_000)?)?;
                    sw.SetInputMediaType(a, &audio_type(&MFAudioFormat_PCM, SAMPLE_RATE * CHANNELS as u32 * 2)?, None)?;
                    Some(a)
                } else {
                    None
                };
                sw.BeginWriting()?;
                // Hardware encoder? (an MFT in the video chain with a hardware URL)
                if let Ok(ex) = sw.cast::<IMFSinkWriterEx>() {
                    for i in 0..4 {
                        let mut t: Option<IMFTransform> = None;
                        if ex.GetTransformForStream(video, i, None, &mut t).is_err() {
                            break;
                        }
                        if let Some(a) = t.and_then(|t| t.GetAttributes().ok()) {
                            if a.GetStringLength(&MFT_ENUM_HARDWARE_URL_Attribute).is_ok() {
                                stats.hardware.store(true, Ordering::Relaxed);
                            }
                        }
                    }
                }
                Ok(Writer { sw, video, audio, t0_us: 0, fps, w, h, buf: Vec::new() })
            }
        }

        fn sample(&self, data: &[u8], time_100ns: i64, dur_100ns: i64) -> windows::core::Result<IMFSample> {
            unsafe {
                let buffer = MFCreateMemoryBuffer(data.len() as u32)?;
                let mut ptr = std::ptr::null_mut();
                buffer.Lock(&mut ptr, None, None)?;
                std::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
                buffer.Unlock()?;
                buffer.SetCurrentLength(data.len() as u32)?;
                let s = MFCreateSample()?;
                s.AddBuffer(&buffer)?;
                s.SetSampleTime(time_100ns)?;
                s.SetSampleDuration(dur_100ns)?;
                Ok(s)
            }
        }

        /// NV12 from the converter (row pitch may be wider than the image).
        fn video(&mut self, bytes: &[u8], pitch: usize, ts_us: u64) -> windows::core::Result<()> {
            if self.t0_us == 0 {
                self.t0_us = ts_us.max(1);
            }
            let (w, h) = (self.w as usize, self.h as usize);
            self.buf.clear();
            for row in 0..h {
                self.buf.extend_from_slice(&bytes[row * pitch..row * pitch + w]);
            }
            let uv = pitch * h;
            for row in 0..h / 2 {
                self.buf.extend_from_slice(&bytes[uv + row * pitch..uv + row * pitch + w]);
            }
            let t = (ts_us.saturating_sub(self.t0_us) * 10) as i64;
            let s = self.sample(&self.buf, t, 10_000_000 / self.fps as i64)?;
            unsafe { self.sw.WriteSample(self.video, &s) }
        }

        fn audio(&mut self, samples: &[f32], frames: u32, ts_us: u64) -> windows::core::Result<()> {
            let Some(a) = self.audio else { return Ok(()) };
            if self.t0_us == 0 || ts_us < self.t0_us {
                return Ok(()); // nothing before the first video frame
            }
            let pcm: Vec<u8> = samples.iter().flat_map(|s| (((s.clamp(-1.0, 1.0)) * 32767.0).round() as i16).to_le_bytes()).collect();
            let t = ((ts_us - self.t0_us) * 10) as i64;
            let s = self.sample(&pcm, t, frames as i64 * 10_000_000 / SAMPLE_RATE as i64)?;
            unsafe { self.sw.WriteSample(a, &s) }
        }
    }

    // ---- capture -> writer --------------------------------------------------------------------

    pub struct Running {
        video: Option<WgcSession>,
        audio: Option<LoopbackCapture>,
        helper: Option<HelperShare>,
        writer: Arc<Mutex<Option<Writer>>>,
    }

    impl Running {
        pub fn stop(mut self) {
            if let Some(h) = self.helper.take() {
                h.detach_ring();
                h.stop();
            }
            if let Some(v) = self.video.take() {
                v.stop();
            }
            if let Some(a) = self.audio.take() {
                a.stop();
            }
            if let Some(w) = lock(&self.writer).take() {
                unsafe {
                    let _ = w.sw.Finalize();
                }
            }
        }
    }

    // ---- helper mode ------------------------------------------------------------------------

    /// The byte stream travels into capture callbacks; MF objects are free-threaded.
    struct SendStream(IMFByteStream);
    unsafe impl Send for SendStream {}

    /// Frames from the capture helper into the encoder (same writer as the in-process lane).
    struct ClipFrames {
        writer: Arc<Mutex<Option<Writer>>>,
        stream: Mutex<SendStream>,
        stats: Arc<Stats>,
        fps: u32,
        /// 0 = not known yet (frames wait), 1 = with audio, 2 = video only.
        audio: AtomicU8,
    }

    impl FrameSink for ClipFrames {
        fn video(&self, meta: &VideoMeta, nv12: &[u8]) {
            let want_audio = match self.audio.load(Ordering::Acquire) {
                0 => return,
                a => a == 1,
            };
            let mut w = lock(&self.writer);
            if w.is_none() {
                match Writer::new(&lock(&self.stream).0, meta.width, meta.height, self.fps, want_audio, &self.stats) {
                    Ok(nw) => {
                        self.stats.width.store(meta.width, Ordering::Relaxed);
                        self.stats.height.store(meta.height, Ordering::Relaxed);
                        *w = Some(nw);
                    }
                    Err(e) => {
                        *lock(&self.stats.error) = Some(format!("encoder: {e}"));
                        self.stats.dropped.fetch_add(1, Ordering::Relaxed);
                        return;
                    }
                }
            }
            // The encoder's size is fixed; a restarted helper normally picks the same size.
            let ok = w.as_mut().is_some_and(|w| w.w == meta.width && w.h == meta.height && w.video(nv12, meta.width as usize, meta.timestamp_us).is_ok());
            if ok {
                self.stats.frames.fetch_add(1, Ordering::Relaxed);
            } else {
                self.stats.dropped.fetch_add(1, Ordering::Relaxed);
            }
        }

        fn audio(&self, samples: &[f32], frames: u32, timestamp_us: u64, _flags: u32) {
            if let Some(w) = lock(&self.writer).as_mut() {
                let _ = w.audio(samples, frames, timestamp_us);
            }
        }
    }

    /// The helper reports the end of the source; the recorder keeps its clip ring, as before.
    struct ClipEnd(Arc<Stats>);

    impl descall_capture::pipeline::Sink for ClipEnd {
        fn video(&self, _seq: u64) {}
        fn audio(&self, _seq: u64) {}
        fn source_closed(&self) {
            *lock(&self.0.error) = Some("source-closed".into());
        }
    }

    fn start_helper(spawn: HelperSpawn, opts: &Opts, target: Target, ring: Arc<Mutex<ClipRing>>, stats: Arc<Stats>) -> Result<Running, String> {
        let stream: IMFByteStream = RingStream { ring, st: Mutex::new((0, 0, 0)) }.into();
        let writer: Arc<Mutex<Option<Writer>>> = Arc::new(Mutex::new(None));
        let quality = super::helper_quality(opts);
        let frames = Arc::new(ClipFrames { writer: writer.clone(), stream: Mutex::new(SendStream(stream)), stats: stats.clone(), fps: quality.fps, audio: AtomicU8::new(0) });
        let req = ShareRequest { target, quality, cursor: true, system_audio: opts.audio, exclude_pid: None, fixed_output: true };
        let layout = Layout::new(quality.width, quality.height);
        let share = HelperShare::start_with(spawn, &req, layout, Output::Frames(frames.clone()), Arc::new(ClipEnd(stats.clone()))).map_err(|e| e.to_string())?;
        // Game audio only when the helper's loopback started (an audio stream without samples
        // would hold the fragments back); never whole-system loopback.
        stats.audio.store(share.ready.audio, Ordering::Relaxed);
        if let Some(e) = &share.ready.audio_error {
            log::warn!("[premium:clip] game audio unavailable: {e}");
        }
        frames.audio.store(if share.ready.audio { 1 } else { 2 }, Ordering::Release);
        Ok(Running { video: None, audio: None, helper: Some(share), writer })
    }

    fn even(v: u32) -> u32 {
        (v / 2 * 2).max(2)
    }

    pub fn start(opts: &Opts, ring: Arc<Mutex<ClipRing>>, stats: Arc<Stats>) -> Result<Running, String> {
        if !mf_started() {
            return Err("media-foundation".into());
        }
        if !wgc::is_supported() {
            return Err("capture-unsupported".into());
        }
        // Same source ids and HDR rules as the screen share (descall_capture::pipeline).
        let id = SourceId::parse(&opts.source_id).ok_or("source-gone")?;
        let src = descall_capture::sources::resolve(id).map_err(|_| "source-gone")?;
        let (target, hdr_capture, tone_params) = match id {
            SourceId::Screen(_) => {
                let i = monitor_hdr(src.handle);
                (Target::Monitor(src.handle), i.hdr, i.tone_params())
            }
            SourceId::Window(h) => (Target::Window(h), any_monitor_hdr(), monitor_hdr(descall_capture::sources::monitor_of_window(h)).tone_params()),
        };
        if let Some(spawn) = descall_capture::helper::default_spawn() {
            return start_helper(spawn, opts, target, ring, stats);
        }
        let d3d = Arc::new(D3d::new().map_err(|e| e.to_string())?);
        let stream: IMFByteStream = RingStream { ring, st: Mutex::new((0, 0, 0)) }.into();
        let stream = SendStream(stream);
        let writer: Arc<Mutex<Option<Writer>>> = Arc::new(Mutex::new(None));
        let (fps, max_h) = (opts.fps.clamp(10, 60), opts.height.clamp(360, 1440));
        // Game audio first: the writer gets an audio stream only when there is a source (a
        // stream without samples would hold the fragments back).
        let audio = if opts.audio {
            let w_audio = writer.clone();
            match loopback::start_excluding_self(move |samples, frames, ts, _silent| {
                if let Some(w) = lock(&w_audio).as_mut() {
                    let _ = w.audio(samples, frames, ts);
                }
            }) {
                Ok(a) => {
                    stats.audio.store(true, Ordering::Relaxed);
                    Some(a)
                }
                // Never whole-system loopback: that would put the call into the clip.
                Err(e) => {
                    log::warn!("[premium:clip] game audio unavailable: {e}");
                    None
                }
            }
        } else {
            None
        };
        let want_audio = audio.is_some();
        let w_video = writer.clone();
        let stats_v = stats.clone();
        let d3d_cb = d3d.clone();
        struct Gpu {
            conv: Option<Converter>,
            tone: Option<ToneMapper>,
            out: Option<(u32, u32)>,
        }
        let mut gpu = Gpu { conv: None, tone: None, out: None };
        let stats_c = stats.clone();
        let on_closed = move || *lock(&stats_c.error) = Some("source-closed".into());
        let video = wgc::start(&d3d, target, Options { cursor: true, hdr: hdr_capture, max_fps: fps, ..Default::default() }, None, move |frame| {
            let stream = &stream;
            // Output size is fixed by the first frame (the encoder cannot change size).
            let (ow, oh) = *gpu.out.get_or_insert_with(|| {
                let oh = even(max_h.min(frame.height));
                (even((frame.width as u64 * oh as u64 / frame.height.max(1) as u64) as u32), oh)
            });
            if gpu.conv.as_ref().is_none_or(|c| c.in_w != frame.width || c.in_h != frame.height) {
                gpu.conv = Converter::new(&d3d_cb, frame.width, frame.height, ow, oh, fps, OutFormat::Nv12).ok();
                gpu.tone = if frame.hdr { ToneMapper::new(&d3d_cb, frame.width, frame.height, tone_params).ok() } else { None };
            }
            let input = match (&gpu.tone, frame.hdr) {
                (Some(t), true) => {
                    t.run(&d3d_cb, frame.texture);
                    t.out.clone()
                }
                (None, true) => {
                    stats_v.dropped.fetch_add(1, Ordering::Relaxed);
                    return;
                }
                _ => frame.texture.clone(),
            };
            let Some(conv) = gpu.conv.as_mut() else { return };
            // QPC microseconds, the clock of the loopback packets too.
            let ts = (frame.time_100ns / 10).max(0) as u64;
            let r = conv.convert_and_read(&d3d_cb, &input, |bytes, pitch| {
                let mut w = lock(&w_video);
                if w.is_none() {
                    match Writer::new(&stream.0, ow, oh, fps, want_audio, &stats_v) {
                        Ok(nw) => {
                            stats_v.width.store(ow, Ordering::Relaxed);
                            stats_v.height.store(oh, Ordering::Relaxed);
                            *w = Some(nw);
                        }
                        Err(e) => {
                            *lock(&stats_v.error) = Some(format!("encoder: {e}"));
                            stats_v.dropped.fetch_add(1, Ordering::Relaxed);
                            return;
                        }
                    }
                }
                let ok = w.as_mut().is_some_and(|w| w.video(bytes, pitch, ts).is_ok());
                if ok {
                    stats_v.frames.fetch_add(1, Ordering::Relaxed);
                } else {
                    stats_v.dropped.fetch_add(1, Ordering::Relaxed);
                }
            });
            if r.is_err() {
                stats_v.dropped.fetch_add(1, Ordering::Relaxed);
            }
        }, on_closed);
        let video = match video {
            Ok(v) => v,
            Err(e) => {
                if let Some(a) = audio {
                    a.stop();
                }
                return Err(e.to_string());
            }
        };
        Ok(Running { video: Some(video), audio, helper: None, writer })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(height: u32, fps: u32) -> Opts {
        Opts { source_id: "screen:0:0".into(), window_sec: 30, height, fps, audio: true }
    }

    #[test]
    fn helper_capture_matches_the_in_process_clip_size() {
        // The in-process recorder: oh = even(min(height, src_h)), ow from the aspect.
        let q = helper_quality(&opts(1080, 60));
        assert_eq!((q.width, q.height, q.fps), (3840, 1080, 60));
        assert_eq!(descall_capture::presets::clip_size(2560, 1440, q.width, q.height), (1920, 1080));
        assert_eq!(descall_capture::presets::clip_size(1280, 720, q.width, q.height), (1280, 720));
        // Same clamps as before: height 360..1440, fps 10..60.
        let q = helper_quality(&opts(4000, 500));
        assert_eq!((q.height, q.fps), (1440, 60));
        let q = helper_quality(&opts(100, 1));
        assert_eq!((q.height, q.fps), (360, 10));
    }
}
