//! What this machine can run: interactive desktop (WGC needs one), GPU, audio device,
//! OS capabilities. Hosted CI runners usually have no interactive desktop and no audio
//! device; the tests that need them report "skipped (...)" instead of failing.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use descall_capture::caps::{self, Caps};
use descall_capture::d3d::{AdapterInfo, D3d};
use descall_capture::sources;
use descall_capture::wgc;
use serde_json::{json, Value};
use windows::Win32::System::RemoteDesktop::ProcessIdToSessionId;
use windows::Win32::System::StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_REMOTESESSION};

pub struct Env {
    pub caps: Caps,
    pub session_id: u32,
    pub remote: bool,
    pub input_desktop: bool,
    /// A WGC monitor capture delivered a frame within 3 s.
    pub wgc_frames: bool,
    pub desktop_reason: Option<String>,
    pub adapter: AdapterInfo,
    pub audio_device: bool,
    pub monitors: Vec<sources::Source>,
}

impl Env {
    pub fn software_gpu(&self) -> bool {
        self.adapter.software
    }

    pub fn json(&self) -> Value {
        json!({
            "windowsBuild": self.caps.build,
            "caps": self.caps,
            "sessionId": self.session_id,
            "remoteSession": self.remote,
            "inputDesktop": self.input_desktop,
            "wgcDeliversFrames": self.wgc_frames,
            "desktopSkipReason": self.desktop_reason,
            "adapter": self.adapter,
            "audioOutputDevice": self.audio_device,
            "logicalCpus": crate::harness::logical_cpus(),
            "monitors": self.monitors.iter().map(|m| json!({
                "id": m.id.format(), "width": m.width, "height": m.height, "left": m.left, "top": m.top,
                "primary": m.primary, "hdr": m.hdr,
                "hdrInfo": descall_capture::hdr::monitor_hdr(m.handle),
            })).collect::<Vec<_>>(),
        })
    }
}

fn probe_wgc(monitor: isize) -> bool {
    let Ok(d3d) = D3d::shared() else { return false };
    let got = Arc::new(AtomicBool::new(false));
    let g = got.clone();
    let opts = wgc::Options { cursor: false, hdr: false, max_fps: 30, buffers: 1 };
    let Ok(s) = wgc::start(&d3d, wgc::Target::Monitor(monitor), opts, None, move |_f| g.store(true, Ordering::Release), || {}) else { return false };
    let ok = crate::harness::wait_until(Duration::from_secs(3), || got.load(Ordering::Acquire));
    s.stop();
    ok
}

pub fn detect() -> Env {
    let caps = caps::current();
    let mut session_id = 0u32;
    unsafe {
        let _ = ProcessIdToSessionId(GetCurrentProcessId(), &mut session_id);
    }
    let remote = unsafe { GetSystemMetrics(SM_REMOTESESSION) } != 0;
    let input_desktop = match unsafe { OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) } {
        Ok(h) => {
            unsafe {
                let _ = CloseDesktop(h);
            }
            true
        }
        Err(_) => false,
    };
    let monitors = sources::list_monitors();
    let adapter = D3d::shared().map(|d| d.adapter.clone()).unwrap_or_default();
    let primary = monitors.first().map(|m| m.handle);
    let wgc_frames = caps.wgc && input_desktop && primary.map(probe_wgc).unwrap_or(false);
    let desktop_reason = if !caps.wgc {
        Some("skipped (Windows.Graphics.Capture unsupported)".to_string())
    } else if session_id == 0 || !input_desktop || monitors.is_empty() || !wgc_frames {
        Some("skipped (no desktop session)".to_string())
    } else {
        None
    };
    Env { caps, session_id, remote, input_desktop, wgc_frames, desktop_reason, adapter, audio_device: descall_capture::loopback::default_render_device_present(), monitors }
}
