//! Windows.Graphics.Capture session for one monitor or one window.
//!
//! - Window capture follows the window by design: the item is the HWND's DWM redirection
//!   surface, so moving it, covering it with other windows or dragging it to another
//!   monitor keeps the picture. A resize changes ContentSize; the pool is recreated.
//! - Cursor on/off: IsCursorCaptureEnabled (Windows 10 2004+).
//! - No yellow border: IsBorderRequired = false (20348+, after a one-time
//!   GraphicsCaptureAccess::RequestAccessAsync(Borderless) on Windows 11).
//! - Frame pacing: MinUpdateInterval when present (Windows 11 24H2 era API, detected with
//!   ApiInformation), otherwise frames are dropped in the callback above the preset fps.
//! - HDR monitor: the pool is created in R16G16B16A16Float (scRGB) and hdr.rs tone-maps.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::core::{factory, Interface, HSTRING};
use windows::Foundation::Metadata::ApiInformation;
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

use crate::d3d::{texture_of, D3d};

#[derive(Debug, Clone, Copy)]
pub enum Target {
    Monitor(isize),
    Window(isize),
}

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub cursor: bool,
    pub hdr: bool,
    pub max_fps: u32,
}

/// A captured GPU frame. The texture is only valid inside the callback.
pub struct Frame<'a> {
    pub texture: &'a ID3D11Texture2D,
    pub width: u32,
    pub height: u32,
    /// QPC-based SystemRelativeTime in microseconds (same clock as WASAPI QPC positions,
    /// so the page can align audio and video timestamps).
    pub timestamp_us: u64,
}

pub struct WgcSession {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    closed: Arc<AtomicBool>,
    _item: GraphicsCaptureItem,
}

impl WgcSession {
    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }
    pub fn stop(self) {
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

fn prop_present(name: &str) -> bool {
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

/// Start capturing. `on_frame` runs on the frame pool's worker thread (free-threaded pool).
pub fn start<F>(d3d: &D3d, target: Target, opts: Options, on_frame: F) -> crate::Result<WgcSession>
where
    F: FnMut(Frame<'_>) + Send + 'static,
{
    if !is_supported() {
        return Err(crate::CaptureError::WgcUnsupported);
    }
    let item = create_item(target)?;
    let format = if opts.hdr { DirectXPixelFormat::R16G16B16A16Float } else { DirectXPixelFormat::B8G8R8A8UIntNormalized };
    let size = item.Size()?;
    // 2 buffers: one in our hands, one being rendered. More adds latency.
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d.winrt, format, 2, size)?;
    let session = pool.CreateCaptureSession(&item)?;

    if prop_present("IsCursorCaptureEnabled") {
        session.SetIsCursorCaptureEnabled(opts.cursor)?;
    }
    if prop_present("IsBorderRequired") {
        // Needs GraphicsCaptureAccess.RequestAccessAsync(Borderless) once (the shell does
        // it on first share); ignored by the OS if access was not granted.
        let _ = session.SetIsBorderRequired(false);
    }
    let min_interval_100ns = 10_000_000i64 / opts.max_fps.max(1) as i64;
    if prop_present("MinUpdateInterval") {
        let _ = session.SetMinUpdateInterval(windows::Foundation::TimeSpan { Duration: min_interval_100ns });
    }

    let closed = Arc::new(AtomicBool::new(false));
    {
        let closed = closed.clone();
        item.Closed(&TypedEventHandler::<GraphicsCaptureItem, windows::core::IInspectable>::new(move |_, _| {
            closed.store(true, Ordering::Release);
            Ok(())
        }))?;
    }

    // WinRT objects are not Send in windows-rs; the D3D device is agile, so hand the
    // free-threaded callback an AgileReference and resolve it on resize only.
    let device = windows::core::AgileReference::new(&d3d.winrt)?;
    // The handler is Fn (it may be invoked from any pool thread, one at a time): keep the
    // mutable state behind a mutex.
    struct State<F> { last_size: SizeInt32, last_ts: i64, on_frame: F }
    let state = std::sync::Mutex::new(State { last_size: size, last_ts: i64::MIN, on_frame });
    pool.FrameArrived(&TypedEventHandler::<Direct3D11CaptureFramePool, windows::core::IInspectable>::new(move |sender, _| {
        let Some(pool) = sender.as_ref() else { return Ok(()) };
        let mut st = state.lock().unwrap();
        let st = &mut *st;
        let frame = pool.TryGetNextFrame()?;
        let content = frame.ContentSize()?;
        let ts = frame.SystemRelativeTime()?.Duration; // 100 ns units, QPC based
        // Window resized: recreate the pool at the new size, drop this frame.
        if content.Width != st.last_size.Width || content.Height != st.last_size.Height {
            st.last_size = content;
            pool.Recreate(&device.resolve()?, format, 2, SizeInt32 { Width: content.Width.max(1), Height: content.Height.max(1) })?;
            return Ok(());
        }
        // Software pacing when MinUpdateInterval is not available (Windows 10).
        if st.last_ts != i64::MIN && ts - st.last_ts < min_interval_100ns * 9 / 10 {
            return Ok(());
        }
        st.last_ts = ts;
        let surface = frame.Surface()?;
        if let Ok(texture) = texture_of(&surface) {
            (st.on_frame)(Frame { texture: &texture, width: content.Width as u32, height: content.Height as u32, timestamp_us: (ts / 10) as u64 });
        }
        frame.Close()?;
        Ok(())
    }))?;

    session.StartCapture()?;
    Ok(WgcSession { session, pool, closed, _item: item })
}

/// Ask once for borderless capture (Windows 11). Resolves to Allowed on most systems
/// without a prompt for unpackaged desktop apps; the result is cached by the OS.
pub fn request_borderless() -> bool {
    use windows::Graphics::Capture::{GraphicsCaptureAccess, GraphicsCaptureAccessKind};
    use windows::Security::Authorization::AppCapabilityAccess::AppCapabilityAccessStatus;
    match GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless) {
        Ok(op) => matches!(op.join(), Ok(AppCapabilityAccessStatus::Allowed)),
        Err(_) => false,
    }
}

#[allow(dead_code)]
fn _assert_interface(t: &ID3D11Texture2D) -> windows::core::Result<()> {
    let _ = t.cast::<windows::Win32::Graphics::Dxgi::IDXGIResource>()?;
    Ok(())
}
