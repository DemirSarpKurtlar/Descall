//! One screen share = one WGC session + (optional) one loopback capture, both writing
//! into the same shared ring. `notify(kind, seq)` wakes the page (a tiny web message).

use std::sync::{Arc, Mutex};

use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT};

use crate::convert::Nv12Converter;
use crate::d3d::D3d;
use crate::hdr::{monitor_hdr, ToneMapper};
use crate::loopback::{self, LoopbackCapture};
use crate::presets::{fit, Quality};
use crate::ring::RingWriter;
use crate::wgc::{self, Options, Target, WgcSession};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Video,
    Audio,
}

pub struct ShareRequest {
    pub target: Target,
    pub quality: Quality,
    pub cursor: bool,
    pub system_audio: bool,
    /// User's "SDR content brightness" in nits (DISPLAYCONFIG_SDR_WHITE_LEVEL), default 200.
    pub sdr_white_nits: f32,
}

pub struct Share {
    video: Option<WgcSession>,
    audio: Option<LoopbackCapture>,
    pub hdr: bool,
    pub audio_error: Option<String>,
}

impl Share {
    pub fn stop(mut self) {
        if let Some(v) = self.video.take() {
            v.stop();
        }
        if let Some(a) = self.audio.take() {
            a.stop();
        }
    }
    pub fn source_closed(&self) -> bool {
        self.video.as_ref().map(|v| v.is_closed()).unwrap_or(true)
    }
}

pub fn start<N>(req: ShareRequest, ring: Arc<Mutex<RingWriter>>, notify: N) -> crate::Result<Share>
where
    N: Fn(Kind, u64) + Send + Sync + Clone + 'static,
{
    let hdr = match req.target {
        Target::Monitor(h) => monitor_hdr(h),
        Target::Window(_) => Default::default(), // window capture is composed SDR by DWM
    };
    let d3d = Arc::new(D3d::new()?);
    let q = req.quality;
    let sdr_white = req.sdr_white_nits;
    let peak = if hdr.max_nits > 0.0 { hdr.max_nits } else { 1000.0 };

    // Lazily (re)built per input size: WGC tells us the size with the first frame and on resize.
    struct Gpu {
        conv: Option<Nv12Converter>,
        tone: Option<ToneMapper>,
    }
    let gpu = Mutex::new(Gpu { conv: None, tone: None });
    let ring_v = ring.clone();
    let notify_v = notify.clone();
    let d3d_cb = d3d.clone();
    let video = wgc::start(&d3d, req.target, Options { cursor: req.cursor, hdr: hdr.hdr, max_fps: q.fps }, move |frame| {
        let mut g = gpu.lock().unwrap();
        let (ow, oh) = fit(frame.width, frame.height, &q);
        let rebuild = g.conv.as_ref().map(|c| c.in_w != frame.width || c.in_h != frame.height).unwrap_or(true);
        if rebuild {
            let in_fmt = DXGI_FORMAT_B8G8R8A8_UNORM; // tone-mapped HDR is BGRA8 too
            g.conv = Nv12Converter::new(&d3d_cb, frame.width, frame.height, ow, oh, q.fps, in_fmt).ok();
            g.tone = if hdr.hdr { ToneMapper::new(&d3d_cb, frame.width, frame.height, sdr_white, peak).ok() } else { None };
            let _ = DXGI_FORMAT_R16G16B16A16_FLOAT;
        }
        let input = match (&g.tone, hdr.hdr) {
            (Some(t), true) => {
                t.run(&d3d_cb, frame.texture);
                t.out.clone()
            }
            _ => frame.texture.clone(),
        };
        if let Some(conv) = &g.conv {
            let _ = conv.convert_and_read(&d3d_cb, &input, |bytes, pitch| {
                let seq = ring_v.lock().unwrap().write_nv12(conv.out_w, conv.out_h, bytes, pitch, frame.timestamp_us);
                if seq != 0 {
                    notify_v(Kind::Video, seq);
                }
            });
        }
    })?;

    let (audio, audio_error) = if req.system_audio {
        let ring_a = ring.clone();
        let notify_a = notify.clone();
        match loopback::start_excluding_self(move |samples, frames, ts, silent| {
            let seq = ring_a.lock().unwrap().write_audio(samples, frames, ts, silent);
            if seq != 0 {
                notify_a(Kind::Audio, seq);
            }
        }) {
            Ok(a) => (Some(a), None),
            // Never fall back to whole-system loopback: that is the echo (3.7.33).
            Err(e) => (None, Some(e.to_string())),
        }
    } else {
        (None, None)
    };

    Ok(Share { video: Some(video), audio, hdr: hdr.hdr, audio_error })
}
