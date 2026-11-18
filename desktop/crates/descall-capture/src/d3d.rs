//! One D3D11 device per capture session, shared by WGC, the HDR tone-map pass and the
//! video processor (scale + BGRA->NV12). VIDEO_SUPPORT is needed for ID3D11VideoDevice.

use windows::core::Interface;
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};

pub struct D3d {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    /// The WinRT wrapper Direct3D11CaptureFramePool wants.
    pub winrt: IDirect3DDevice,
}

// The immediate context is only used from the capture thread that owns the session.
unsafe impl Send for D3d {}
// ID3D11Multithread::SetMultithreadProtected(true) serialises immediate-context use.
unsafe impl Sync for D3d {}

impl D3d {
    pub fn new() -> crate::Result<Self> {
        let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
        let levels: [D3D_FEATURE_LEVEL; 2] = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
        let mut device = None;
        let mut context = None;
        let hw = unsafe {
            D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, HMODULE::default(), flags, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context))
        };
        if hw.is_err() {
            // WARP: RDP sessions and broken drivers. Slow, but the share still starts.
            unsafe {
                D3D11CreateDevice(None, D3D_DRIVER_TYPE_WARP, HMODULE::default(), D3D11_CREATE_DEVICE_BGRA_SUPPORT, Some(&levels), D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context))?;
            }
        }
        let device: ID3D11Device = device.expect("device");
        let context = context.expect("context");
        // Two capture threads (video + thumbnails) may touch the device.
        if let Ok(mt) = device.cast::<ID3D11Multithread>() {
            unsafe { let _ = mt.SetMultithreadProtected(true); }
        }
        let dxgi: IDXGIDevice = device.cast()?;
        let winrt: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        Ok(D3d { device, context, winrt })
    }
}

/// ID3D11Texture2D behind a WGC frame surface.
pub fn texture_of(surface: &windows::Graphics::DirectX::Direct3D11::IDirect3DSurface) -> crate::Result<ID3D11Texture2D> {
    let access: IDirect3DDxgiInterfaceAccess = surface.cast()?;
    Ok(unsafe { access.GetInterface::<ID3D11Texture2D>()? })
}
