//! Windows.Graphics.Capture session for one monitor or one window.
//!
//! - Window capture follows the window by design: the item is the HWND's DWM redirection
//!   surface, so moving it, covering it or dragging it to another monitor keeps the
//!   picture. A resize changes ContentSize; the frame pool is recreated at the new size.
//! - GraphicsCaptureItem.Closed (window closed, monitor unplugged) calls `on_closed`; the
//!   host ends the share like Chromium does when the captured surface goes away.
//! - Cursor on/off: IsCursorCaptureEnabled (Windows 10 2004+), switchable mid-share.
//! - No yellow border: IsBorderRequired = false (Windows 11, after a one-time
//!   GraphicsCaptureAccess::RequestAccessAsync(Borderless)).
//! - Frame pacing: MinUpdateInterval when present, and always a software pacer in the
//!   callback (frames closer than 90 % of the period are dropped), switchable mid-share.
//! - HDR: the pool is created in R16G16B16A16Float (scRGB) and hdr.rs tone-maps.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use windows::core::{factory, IInspectable, HSTRING};
use windows::Foundation::Metadata::ApiInformation;
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

use crate::d3d::{texture_of, D3d};
use crate::stats::ShareStats;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// HMONITOR value.
    Monitor(isize),
    /// HWND value.
    Window(isize),
}

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub cursor: bool,
    /// Capture scRGB (R16G16B16A16Float) instead of BGRA8.
    pub hdr: bool,
    pub max_fps: u32,
    /// Frame pool buffers. 2 = lowest latency (one in our hands, one being rendered).
    pub buffers: i32,
}

impl Default for Options {
    fn default() -> Self {
        Options { cursor: true, hdr: false, max_fps: 30, buffers: 2 }
    }
}

/// A captured GPU frame. The texture is only valid inside the callback.
pub struct Frame<'a> {
    pub texture: &'a ID3D11Texture2D,
    /// Content size (the texture may be larger right after a resize).
    pub width: u32,
    pub height: u32,
    /// SystemRelativeTime: QPC-based, 100 ns units (same clock as clock::now_100ns).
    pub time_100ns: i64,
    /// clock::now_100ns() when the callback started.
    pub arrival_100ns: i64,
    pub hdr: bool,
}

pub struct WgcSession {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    closed: Arc<AtomicBool>,
    interval_100ns: Arc<AtomicI64>,
    /// Set before Close: callbacks that start after it return at once.
    stopping: Arc<AtomicBool>,
    /// Callbacks currently running (FrameArrived and Closed).
    inflight: Arc<AtomicUsize>,
    stopped: bool,
    /// Event registrations, removed before Close so no delegate stays registered.
    closed_token: i64,
    frame_token: i64,
    _item: GraphicsCaptureItem,
}

/// Counts a running callback; the session teardown waits for the count to reach zero so
/// nothing the callbacks capture (ring memory, converter, sink) is used after stop().
struct InFlight(Arc<AtomicUsize>);

impl InFlight {
    fn enter(c: &Arc<AtomicUsize>) -> InFlight {
        c.fetch_add(1, Ordering::AcqRel);
        InFlight(c.clone())
    }
}

impl Drop for InFlight {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

impl WgcSession {
    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }

    pub fn set_cursor(&self, on: bool) -> bool {
        session_property_present("IsCursorCaptureEnabled") && self.session.SetIsCursorCaptureEnabled(on).is_ok()
    }

    pub fn set_max_fps(&self, fps: u32) {
        let i = crate::presets::frame_interval_100ns(fps);
        self.interval_100ns.store(i, Ordering::Release);
        if session_property_present("MinUpdateInterval") {
            let _ = self.session.SetMinUpdateInterval(TimeSpan { Duration: i });
        }
    }

    /// Close the session and the pool, then wait (up to 2 s) until no callback is running.
    /// Must not be called from inside `on_frame` (it would wait for itself).
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        self.stopping.store(true, Ordering::Release);
        let _ = self.pool.RemoveFrameArrived(self.frame_token);
        let _ = self._item.RemoveClosed(self.closed_token);
        let _ = self.session.Close();
        let _ = self.pool.Close();
        let t0 = std::time::Instant::now();
        while self.inflight.load(Ordering::Acquire) > 0 && t0.elapsed() < std::time::Duration::from_secs(2) {
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }
}

impl Drop for WgcSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn session_property_present(name: &str) -> bool {
    ApiInformation::IsPropertyPresent(&HSTRING::from("Windows.Graphics.Capture.GraphicsCaptureSession"), &HSTRING::from(name)).unwrap_or(false)
}

pub fn is_supported() -> bool {
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
}

pub fn create_item(target: Target) -> crate::Result<GraphicsCaptureItem> {
    let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
    let item = unsafe {
        match target {
            Target::Monitor(h) => interop.CreateForMonitor::<GraphicsCaptureItem>(HMONITOR(h as *mut _))?,
            Target::Window(h) => interop.CreateForWindow::<GraphicsCaptureItem>(HWND(h as *mut _))?,
        }
    };
    Ok(item)
}

/// Ask once per process for borderless capture (Windows 11). Unpackaged desktop apps get
/// Allowed without a prompt; the OS caches the answer. Runs on its own MTA thread with a
/// timeout so a caller on an STA can never deadlock on the async join.
pub fn request_borderless() -> bool {
    static ALLOWED: OnceLock<bool> = OnceLock::new();
    *ALLOWED.get_or_init(|| {
        if !session_property_present("IsBorderRequired") {
            return false;
        }
        let (tx, rx) = std::sync::mpsc::channel();
        let _ = std::thread::Builder::new().name("descall-wgc-access".into()).spawn(move || {
            use windows::Graphics::Capture::{GraphicsCaptureAccess, GraphicsCaptureAccessKind};
            use windows::Security::Authorization::AppCapabilityAccess::AppCapabilityAccessStatus;
            let ok = match GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless) {
                Ok(op) => matches!(op.join(), Ok(AppCapabilityAccessStatus::Allowed)),
                Err(_) => false,
            };
            let _ = tx.send(ok);
        });
        rx.recv_timeout(std::time::Duration::from_secs(3)).unwrap_or(false)
    })
}

/// Start capturing. `on_frame` runs on a frame-pool worker thread (free-threaded pool), one
/// call at a time. `on_closed` runs once when the item goes away; it must not call
/// [`WgcSession::stop`] synchronously (hand it to another thread).
pub fn start<F, C>(d3d: &D3d, target: Target, opts: Options, stats: Option<Arc<ShareStats>>, on_frame: F, on_closed: C) -> crate::Result<WgcSession>
where
    F: FnMut(Frame<'_>) + Send + 'static,
    C: Fn() + Send + Sync + 'static,
{
    if !is_supported() {
        return Err(crate::CaptureError::WgcUnsupported);
    }
    let item = create_item(target)?;
    let format = if opts.hdr { DirectXPixelFormat::R16G16B16A16Float } else { DirectXPixelFormat::B8G8R8A8UIntNormalized };
    let size = item.Size()?;
    let buffers = opts.buffers.clamp(1, 3);
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d.winrt, format, buffers, size)?;
    let session = pool.CreateCaptureSession(&item)?;

    if session_property_present("IsCursorCaptureEnabled") {
        session.SetIsCursorCaptureEnabled(opts.cursor)?;
    }
    if request_borderless() {
        let _ = session.SetIsBorderRequired(false);
    }
    let interval = Arc::new(AtomicI64::new(crate::presets::frame_interval_100ns(opts.max_fps)));
    if session_property_present("MinUpdateInterval") {
        let _ = session.SetMinUpdateInterval(TimeSpan { Duration: interval.load(Ordering::Relaxed) });
    }

    let closed = Arc::new(AtomicBool::new(false));
    let stopping = Arc::new(AtomicBool::new(false));
    let inflight = Arc::new(AtomicUsize::new(0));
    let closed_token;
    {
        let (closed, stopping, inflight) = (closed.clone(), stopping.clone(), inflight.clone());
        closed_token = item.Closed(&TypedEventHandler::<GraphicsCaptureItem, IInspectable>::new(move |_, _| {
            let _guard = InFlight::enter(&inflight);
            // A panic must never unwind into the OS (that aborts the process).
            let _ = catch_unwind(AssertUnwindSafe(|| {
                if !closed.swap(true, Ordering::AcqRel) && !stopping.load(Ordering::Acquire) {
                    on_closed();
                }
            }));
            Ok(())
        }))?;
    }

    // The D3D device is agile; hand the free-threaded callback an AgileReference.
    let device = windows::core::AgileReference::new(&d3d.winrt)?;
    struct State<F> {
        pool_size: SizeInt32,
        last_ts: i64,
        on_frame: F,
    }
    let state = Mutex::new(State { pool_size: size, last_ts: i64::MIN, on_frame });
    let interval_cb = interval.clone();
    let hdr = opts.hdr;
    let (stopping_cb, inflight_cb) = (stopping.clone(), inflight.clone());
    let on_arrived = move |sender: Option<&Direct3D11CaptureFramePool>| -> windows::core::Result<()> {
        let arrival = crate::clock::now_100ns();
        let Some(pool) = sender else { return Ok(()) };
        let Ok(mut st) = state.lock() else { return Ok(()) };
        let st = &mut *st;
        let Ok(frame) = pool.TryGetNextFrame() else { return Ok(()) };
        let content = frame.ContentSize()?;
        let ts = frame.SystemRelativeTime()?.Duration;
        if let Some(s) = &stats {
            ShareStats::add(&s.frames_arrived, 1);
        }
        let (cw, ch) = (content.Width.max(1), content.Height.max(1));
        // Window resized or display mode changed: recreate the pool at the content size and
        // drop this frame (the next one arrives at the new size).
        if cw != st.pool_size.Width || ch != st.pool_size.Height {
            st.pool_size = SizeInt32 { Width: cw, Height: ch };
            let _ = frame.Close();
            pool.Recreate(&device.resolve()?, format, buffers, st.pool_size)?;
            if let Some(s) = &stats {
                ShareStats::add(&s.resizes, 1);
            }
            return Ok(());
        }
        let min = interval_cb.load(Ordering::Acquire);
        if st.last_ts != i64::MIN && ts - st.last_ts < min * 9 / 10 {
            if let Some(s) = &stats {
                ShareStats::add(&s.frames_paced_out, 1);
            }
            let _ = frame.Close();
            return Ok(());
        }
        st.last_ts = ts;
        if let Ok(texture) = frame.Surface().map_err(crate::CaptureError::from).and_then(|s| texture_of(&s)) {
            (st.on_frame)(Frame { texture: &texture, width: cw as u32, height: ch as u32, time_100ns: ts, arrival_100ns: arrival, hdr });
        }
        let _ = frame.Close();
        Ok(())
    };
    let frame_token = pool.FrameArrived(&TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(move |sender, _| {
        let _guard = InFlight::enter(&inflight_cb);
        if stopping_cb.load(Ordering::Acquire) {
            return Ok(());
        }
        match catch_unwind(AssertUnwindSafe(|| on_arrived(sender.as_ref()))) {
            Ok(r) => r,
            Err(_) => {
                log::error!("capture frame callback panicked; frame dropped");
                Ok(())
            }
        }
    }))?;

    let s = WgcSession { session, pool, closed, interval_100ns: interval, stopping, inflight, stopped: false, closed_token, frame_token, _item: item };
    s.session.StartCapture()?;
    Ok(s)
}
