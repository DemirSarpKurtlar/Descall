//! One D3D11 device per capture session, shared by WGC, the HDR tone-map pass and the
//! video processor (scale + colour conversion). VIDEO_SUPPORT is needed for
//! ID3D11VideoDevice; BGRA_SUPPORT for WGC surfaces.
//!
//! Every device is multithread-protected (the frame pool uses it on its own threads) and our
//! GPU work runs under its Enter/Leave lock ([`D3d::lock`]). A device per share limits what
//! a removed device (driver update, TDR, GPU switch) takes down. `DESCALL_D3D_DEBUG=1`
//! creates devices with the debug layer (when the Graphics Tools are installed) and keeps
//! its messages, so the call that got a device removed can be found
//! ([`device_lost_events`]).

use serde::Serialize;
use windows::core::Interface;
use windows::Graphics::DirectX::Direct3D11::{IDirect3DDevice, IDirect3DSurface};
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfo {
    pub description: String,
    pub vendor_id: u32,
    pub device_id: u32,
    pub dedicated_video_memory_mb: u64,
    /// WARP / Microsoft Basic Render Driver: no GPU (RDP, hosted CI, broken driver).
    pub software: bool,
}

pub struct D3d {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    /// The WinRT wrapper Direct3D11CaptureFramePool wants.
    pub winrt: IDirect3DDevice,
    pub adapter: AdapterInfo,
    multithread: Option<ID3D11Multithread>,
    info_queue: Option<ID3D11InfoQueue>,
}

pub use crate::helper_proto::DeviceLost;

static LOST: std::sync::Mutex<Vec<DeviceLost>> = std::sync::Mutex::new(Vec::new());

/// Record a device loss (kept for the bench report and telemetry; at most 16).
pub fn record_device_lost(d: DeviceLost) {
    log::error!("capture device lost: {} on {} ({} debug messages)", d.reason, d.adapter, d.messages.len());
    if let Ok(mut v) = LOST.lock() {
        if v.len() < 16 {
            v.push(d);
        }
    }
}

/// Every device loss seen in this process (and reported by capture helpers).
pub fn device_lost_events() -> Vec<DeviceLost> {
    LOST.lock().map(|v| v.clone()).unwrap_or_default()
}

fn debug_layer_wanted() -> bool {
    std::env::var("DESCALL_D3D_DEBUG").map(|v| v == "1").unwrap_or(false)
}

/// Holds the device's multithread lock (ID3D11Multithread::Enter/Leave) for a block of
/// immediate-context work. The frame pool uses the same device (and lock) on its own
/// threads; holding it keeps our video-context calls from interleaving with WGC's copies.
pub struct D3dLock<'a>(Option<&'a ID3D11Multithread>);

impl Drop for D3dLock<'_> {
    fn drop(&mut self) {
        if let Some(m) = self.0 {
            unsafe { m.Leave() };
        }
    }
}

// D3D11 devices are free-threaded; the immediate context is protected by
// ID3D11Multithread::SetMultithreadProtected(true) below.
unsafe impl Send for D3d {}
unsafe impl Sync for D3d {}

impl D3d {
    pub fn new() -> crate::Result<Self> {
        let debug = if debug_layer_wanted() { D3D11_CREATE_DEVICE_DEBUG } else { D3D11_CREATE_DEVICE_FLAG(0) };
        let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT | debug;
        let levels: [D3D_FEATURE_LEVEL; 3] = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1];
        let mut device = None;
        let mut context = None;
        let mut hw = unsafe { D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, HMODULE::default(), flags, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context)) };
        if (hw.is_err() || device.is_none()) && debug.0 != 0 {
            // Debug layer requested but the SDK layers are not installed: go on without it.
            let f = D3D11_CREATE_DEVICE_FLAG(flags.0 & !debug.0);
            hw = unsafe { D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, HMODULE::default(), f, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context)) };
        }
        if hw.is_err() || device.is_none() {
            // WARP: RDP sessions, hosted CI and broken drivers. Slow, but the share still starts.
            // Without VIDEO_SUPPORT the converter falls back to the CPU path (convert.rs).
            for f in [flags, D3D11_CREATE_DEVICE_BGRA_SUPPORT] {
                device = None;
                context = None;
                let r = unsafe { D3D11CreateDevice(None, D3D_DRIVER_TYPE_WARP, HMODULE::default(), f, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context)) };
                if r.is_ok() && device.is_some() {
                    break;
                }
            }
        }
        let (Some(device), Some(context)) = (device, context) else {
            return Err(windows::core::Error::from(windows::Win32::Foundation::E_FAIL).into());
        };
        // Video, thumbnails and the bench may touch the device from different threads.
        let multithread = device.cast::<ID3D11Multithread>().ok();
        if let Some(mt) = &multithread {
            unsafe {
                let _ = mt.SetMultithreadProtected(true);
            }
        }
        let dxgi: IDXGIDevice = device.cast()?;
        let adapter = unsafe { dxgi.GetAdapter() }.and_then(|a| unsafe { a.GetDesc() }).map(|d| {
            let n = d.Description.iter().position(|&c| c == 0).unwrap_or(d.Description.len());
            AdapterInfo {
                description: String::from_utf16_lossy(&d.Description[..n]),
                vendor_id: d.VendorId,
                device_id: d.DeviceId,
                dedicated_video_memory_mb: (d.DedicatedVideoMemory / (1024 * 1024)) as u64,
                // 0x1414:0x8c is the Microsoft Basic Render Driver (WARP).
                software: d.VendorId == 0x1414 && d.DeviceId == 0x8c,
            }
        });
        let winrt: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let info_queue = device.cast::<ID3D11InfoQueue>().ok();
        Ok(D3d { device, context, winrt, adapter: adapter.unwrap_or_default(), multithread, info_queue })
    }

    /// None while the device is fine, else the GetDeviceRemovedReason HRESULT.
    pub fn removed_reason(&self) -> Option<windows::core::HRESULT> {
        unsafe { self.device.GetDeviceRemovedReason() }.err().map(|e| e.code())
    }

    pub fn debug_layer(&self) -> bool {
        self.info_queue.is_some()
    }

    /// Drain the debug layer's stored messages (empty without the debug layer).
    pub fn drain_messages(&self) -> Vec<String> {
        let Some(q) = &self.info_queue else { return Vec::new() };
        let mut out = Vec::new();
        unsafe {
            let n = q.GetNumStoredMessages();
            for i in 0..n.min(200) {
                let mut len = 0usize;
                if q.GetMessage(i, None, &mut len).is_err() || len == 0 {
                    continue;
                }
                // D3D11_MESSAGE is followed by its description in the same allocation.
                let mut buf = vec![0u64; len.div_ceil(8)];
                let m = buf.as_mut_ptr() as *mut D3D11_MESSAGE;
                if q.GetMessage(i, Some(m), &mut len).is_ok() {
                    let msg = &*m;
                    if !msg.pDescription.is_null() {
                        let d = std::slice::from_raw_parts(msg.pDescription, msg.DescriptionByteLength.saturating_sub(1));
                        out.push(format!("[sev {}] {}", msg.Severity.0, String::from_utf8_lossy(d)));
                    }
                }
            }
            q.ClearStoredMessages();
        }
        out
    }

    /// If the device is removed, record it (with the debug messages) and say so.
    pub fn check_lost(&self, seen_in: &str) -> bool {
        self.probe().check_lost(seen_in)
    }

    /// A Send handle for watching the device from another thread.
    pub fn probe(&self) -> DeviceProbe {
        DeviceProbe { device: self.device.clone(), info_queue: self.info_queue.clone(), adapter: self.adapter.description.clone() }
    }

    /// Take the immediate-context lock for a block of GPU work.
    pub fn lock(&self) -> D3dLock<'_> {
        if let Some(m) = &self.multithread {
            unsafe { m.Enter() };
        }
        D3dLock(self.multithread.as_ref())
    }

    pub fn texture(&self, desc: &D3D11_TEXTURE2D_DESC) -> crate::Result<ID3D11Texture2D> {
        let mut t = None;
        unsafe { self.device.CreateTexture2D(desc, None, Some(&mut t))? };
        t.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_OUTOFMEMORY).into())
    }
}

/// Watches one device for removal (the capture watchdog polls it every 100 ms).
pub struct DeviceProbe {
    device: ID3D11Device,
    info_queue: Option<ID3D11InfoQueue>,
    adapter: String,
}

// ID3D11Device and ID3D11InfoQueue are free-threaded.
unsafe impl Send for DeviceProbe {}

impl DeviceProbe {
    pub fn check_lost(&self, seen_in: &str) -> bool {
        let Err(e) = (unsafe { self.device.GetDeviceRemovedReason() }) else { return false };
        let mut messages = Vec::new();
        if let Some(q) = &self.info_queue {
            unsafe {
                for i in 0..q.GetNumStoredMessages().min(200) {
                    let mut len = 0usize;
                    if q.GetMessage(i, None, &mut len).is_err() || len == 0 {
                        continue;
                    }
                    let mut buf = vec![0u64; len.div_ceil(8)];
                    let m = buf.as_mut_ptr() as *mut D3D11_MESSAGE;
                    if q.GetMessage(i, Some(m), &mut len).is_ok() && !(*m).pDescription.is_null() {
                        let d = std::slice::from_raw_parts((*m).pDescription, (*m).DescriptionByteLength.saturating_sub(1));
                        messages.push(format!("[sev {}] {}", (*m).Severity.0, String::from_utf8_lossy(d)));
                    }
                }
            }
        }
        record_device_lost(DeviceLost { reason: format!("0x{:08X}", e.code().0 as u32), adapter: self.adapter.clone(), debug_layer: self.info_queue.is_some(), messages, seen_in: seen_in.into() });
        true
    }
}

/// ID3D11Texture2D behind a WGC frame surface.
pub fn texture_of(surface: &IDirect3DSurface) -> crate::Result<ID3D11Texture2D> {
    let access: IDirect3DDxgiInterfaceAccess = surface.cast()?;
    Ok(unsafe { access.GetInterface::<ID3D11Texture2D>()? })
}

pub fn texture_desc(t: &ID3D11Texture2D) -> D3D11_TEXTURE2D_DESC {
    let mut d = D3D11_TEXTURE2D_DESC::default();
    unsafe { t.GetDesc(&mut d) };
    d
}
