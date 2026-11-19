//! One D3D11 device per capture session, shared by WGC, the HDR tone-map pass and the
//! video processor (scale + colour conversion). VIDEO_SUPPORT is needed for
//! ID3D11VideoDevice; BGRA_SUPPORT for WGC surfaces.

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
        let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
        let levels: [D3D_FEATURE_LEVEL; 3] = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1];
        let mut device = None;
        let mut context = None;
        let hw = unsafe { D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, HMODULE::default(), flags, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context)) };
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
        Ok(D3d { device, context, winrt, adapter: adapter.unwrap_or_default(), multithread })
    }

    /// The process-wide capture device. Shares reuse it instead of creating and destroying
    /// a device each time (teardown races with the OS capture threads are gone with it); a
    /// removed device (driver reset, TDR) is replaced on the next call.
    pub fn shared() -> crate::Result<std::sync::Arc<D3d>> {
        use std::sync::{Arc, Mutex};
        static SHARED: Mutex<Option<Arc<D3d>>> = Mutex::new(None);
        let mut g = SHARED.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(d) = g.as_ref() {
            if unsafe { d.device.GetDeviceRemovedReason() }.is_ok() {
                return Ok(d.clone());
            }
        }
        let d = Arc::new(D3d::new()?);
        *g = Some(d.clone());
        Ok(d)
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
