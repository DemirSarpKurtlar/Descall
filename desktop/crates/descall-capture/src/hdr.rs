//! HDR-safe output.
//!
//! On an HDR monitor (DXGI colour space RGB_FULL_G2084_NONE_P2020) the desktop is composed
//! in scRGB. Capturing it as BGRA8 makes Windows clip it: highlights blow out and SDR
//! content looks washed. We capture R16G16B16A16Float instead and tone-map here to BT.709
//! SDR (sRGB transfer), then the video processor makes NV12. Viewers always get SDR, which
//! every WebRTC receiver can show. The curve and its tests are in tonemap.rs; the shader
//! below is the same maths.
//!
//! The SDR white level is the user's "SDR content brightness" slider
//! (DisplayConfigGetDeviceInfo, DISPLAYCONFIG_SDR_WHITE_LEVEL), so SDR apps come out exactly
//! as on an SDR monitor. The parameters live in a dynamic constant buffer: a followed window
//! that moves between an HDR and an SDR monitor switches curve without a new pipeline.

use windows::core::{s, Interface, PCSTR};
use windows::Win32::Devices::Display::*;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::{ID3DBlob, D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput6};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, HMONITOR, MONITORINFO, MONITORINFOEXW};

use crate::d3d::D3d;
use crate::tonemap::{nits_from_sdr_white_level, ToneParams, DEFAULT_SDR_WHITE_NITS};

#[derive(Debug, Clone, Copy, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HdrInfo {
    pub hdr: bool,
    pub max_nits: f32,
    pub sdr_white_nits: f32,
}

impl HdrInfo {
    pub fn tone_params(&self) -> ToneParams {
        if self.hdr {
            ToneParams::new(self.sdr_white_nits, self.max_nits)
        } else {
            ToneParams::passthrough()
        }
    }
}

/// HDR state of the monitor `hmon` (the HMONITOR value of sources::Source.handle).
pub fn monitor_hdr(hmon: isize) -> HdrInfo {
    let mut info = HdrInfo { hdr: false, max_nits: 0.0, sdr_white_nits: DEFAULT_SDR_WHITE_NITS };
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else { return info };
        let mut a = 0;
        'outer: while let Ok(adapter) = factory.EnumAdapters1(a) {
            let mut o = 0;
            while let Ok(output) = adapter.EnumOutputs(o) {
                if let Ok(desc) = output.cast::<IDXGIOutput6>().and_then(|o6| o6.GetDesc1()) {
                    if desc.Monitor.0 as isize == hmon {
                        info.hdr = desc.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020;
                        info.max_nits = desc.MaxLuminance;
                        break 'outer;
                    }
                }
                o += 1;
            }
            a += 1;
        }
    }
    if info.hdr {
        if let Some(n) = sdr_white_nits(hmon) {
            info.sdr_white_nits = n;
        }
    }
    info
}

/// Any monitor in HDR mode? (decides the frame-pool format for window capture)
pub fn any_monitor_hdr() -> bool {
    crate::sources::list_monitors().iter().any(|m| m.hdr)
}

fn gdi_name(hmon: isize) -> Option<String> {
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    let ok = unsafe { GetMonitorInfoW(HMONITOR(hmon as *mut _), &mut mi as *mut MONITORINFOEXW as *mut MONITORINFO) }.as_bool();
    ok.then(|| utf16_z(&mi.szDevice))
}

fn utf16_z(s: &[u16]) -> String {
    let n = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf16_lossy(&s[..n])
}

/// The "SDR content brightness" of the monitor, in nits.
pub fn sdr_white_nits(hmon: isize) -> Option<f32> {
    let want = gdi_name(hmon)?;
    unsafe {
        let (mut np, mut nm) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut np, &mut nm) != ERROR_SUCCESS {
            return None;
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); np as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); nm as usize];
        if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut np, paths.as_mut_ptr(), &mut nm, modes.as_mut_ptr(), None) != ERROR_SUCCESS {
            return None;
        }
        for p in &paths[..np as usize] {
            let mut src = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            src.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
            src.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
            src.header.adapterId = p.sourceInfo.adapterId;
            src.header.id = p.sourceInfo.id;
            if DisplayConfigGetDeviceInfo(&mut src.header) != 0 || utf16_z(&src.viewGdiDeviceName) != want {
                continue;
            }
            let mut white = DISPLAYCONFIG_SDR_WHITE_LEVEL::default();
            white.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
            white.header.size = std::mem::size_of::<DISPLAYCONFIG_SDR_WHITE_LEVEL>() as u32;
            white.header.adapterId = p.targetInfo.adapterId;
            white.header.id = p.targetInfo.id;
            if DisplayConfigGetDeviceInfo(&mut white.header) == 0 && white.SDRWhiteLevel > 0 {
                return Some(nits_from_sdr_white_level(white.SDRWhiteLevel));
            }
        }
    }
    None
}

/// Same curve as tonemap.rs (KNEE, extended Reinhard on the excess, hue-preserving).
pub const TONEMAP_HLSL: &str = r#"
Texture2D<float4> src : register(t0);
SamplerState samp : register(s0);
cbuffer Params : register(b0) { float sdrWhite; float peak; float knee; float enabled; };
struct VSOut { float4 pos : SV_Position; float2 uv : TEXCOORD0; };
VSOut vs_main(uint id : SV_VertexID) {
  VSOut o; float2 uv = float2((id << 1) & 2, id & 2);
  o.uv = uv; o.pos = float4(uv * float2(2, -2) + float2(-1, 1), 0, 1); return o;
}
float3 linear_to_srgb(float3 c) {
  c = saturate(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
float curve(float l) {
  if (enabled < 0.5) return saturate(l);
  if (l <= knee) return max(l, 0);
  float x = (l - knee) / (1 - knee);
  float xw = max((peak - knee) / (1 - knee), 1e-3);
  float y = x * (1 + x / (xw * xw)) / (1 + x);
  return min(knee + (1 - knee) * y, 1);
}
float4 ps_main(VSOut i) : SV_Target {
  float3 c = max(src.Sample(samp, i.uv).rgb, 0) / sdrWhite;
  float l = dot(c, float3(0.2126, 0.7152, 0.0722));
  float s = l > 0 ? curve(l) / l : 0;
  return float4(linear_to_srgb(c * s), 1);
}
"#;

pub struct ToneMapper {
    vs: ID3D11VertexShader,
    ps: ID3D11PixelShader,
    sampler: ID3D11SamplerState,
    cbuf: ID3D11Buffer,
    src_copy: ID3D11Texture2D,
    src_srv: ID3D11ShaderResourceView,
    pub out: ID3D11Texture2D,
    out_rtv: ID3D11RenderTargetView,
    w: u32,
    h: u32,
    params: ToneParams,
}

// Owned by one share, used under its mutex.
unsafe impl Send for ToneMapper {}

fn compile(entry: PCSTR, target: PCSTR) -> crate::Result<ID3DBlob> {
    let mut code: Option<ID3DBlob> = None;
    let mut errors: Option<ID3DBlob> = None;
    let r = unsafe { D3DCompile(TONEMAP_HLSL.as_ptr() as _, TONEMAP_HLSL.len(), s!("tonemap.hlsl"), None, None, entry, target, 0, 0, &mut code, Some(&mut errors)) };
    if let Err(e) = r {
        if let Some(err) = errors {
            log::error!("tone-map shader: {}", String::from_utf8_lossy(blob_bytes(&err)));
        }
        return Err(e.into());
    }
    code.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL).into())
}

fn blob_bytes(b: &ID3DBlob) -> &[u8] {
    unsafe { std::slice::from_raw_parts(b.GetBufferPointer() as *const u8, b.GetBufferSize()) }
}

impl ToneMapper {
    pub fn new(d3d: &D3d, w: u32, h: u32, params: ToneParams) -> crate::Result<Self> {
        let dev = &d3d.device;
        let vsb = compile(s!("vs_main"), s!("vs_4_0"))?;
        let psb = compile(s!("ps_main"), s!("ps_4_0"))?;
        let (mut vs, mut ps, mut sampler, mut cbuf) = (None, None, None, None);
        unsafe {
            dev.CreateVertexShader(blob_bytes(&vsb), None, Some(&mut vs))?;
            dev.CreatePixelShader(blob_bytes(&psb), None, Some(&mut ps))?;
            let sd = D3D11_SAMPLER_DESC {
                Filter: D3D11_FILTER_MIN_MAG_MIP_POINT,
                AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                MaxLOD: f32::MAX,
                ..Default::default()
            };
            dev.CreateSamplerState(&sd, Some(&mut sampler))?;
            let init_vals = params.cbuffer();
            let bd = D3D11_BUFFER_DESC { ByteWidth: 16, Usage: D3D11_USAGE_DEFAULT, BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32, ..Default::default() };
            let init = D3D11_SUBRESOURCE_DATA { pSysMem: init_vals.as_ptr() as _, ..Default::default() };
            dev.CreateBuffer(&bd, Some(&init), Some(&mut cbuf))?;
        }
        let tex = |format, bind: u32| {
            d3d.texture(&D3D11_TEXTURE2D_DESC {
                Width: w,
                Height: h,
                MipLevels: 1,
                ArraySize: 1,
                Format: format,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: bind,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            })
        };
        let src_copy = tex(DXGI_FORMAT_R16G16B16A16_FLOAT, D3D11_BIND_SHADER_RESOURCE.0 as u32)?;
        let out = tex(DXGI_FORMAT_B8G8R8A8_UNORM, (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32)?;
        let (mut srv, mut rtv) = (None, None);
        unsafe {
            dev.CreateShaderResourceView(&src_copy, None, Some(&mut srv))?;
            dev.CreateRenderTargetView(&out, None, Some(&mut rtv))?;
        }
        let missing = || crate::CaptureError::from(windows::core::Error::from(windows::Win32::Foundation::E_FAIL));
        Ok(ToneMapper {
            vs: vs.ok_or_else(missing)?,
            ps: ps.ok_or_else(missing)?,
            sampler: sampler.ok_or_else(missing)?,
            cbuf: cbuf.ok_or_else(missing)?,
            src_copy,
            src_srv: srv.ok_or_else(missing)?,
            out,
            out_rtv: rtv.ok_or_else(missing)?,
            w,
            h,
            params,
        })
    }

    pub fn params(&self) -> ToneParams {
        self.params
    }

    /// Change the curve (a followed window moved to another monitor).
    pub fn set_params(&mut self, d3d: &D3d, params: ToneParams) {
        if params != self.params {
            let v = params.cbuffer();
            unsafe { d3d.context.UpdateSubresource(&self.cbuf, 0, None, v.as_ptr() as _, 0, 0) };
            self.params = params;
        }
    }

    /// scRGB frame in (content rectangle `w` x `h` at the top-left), BGRA8 SDR in `self.out`.
    pub fn run(&self, d3d: &D3d, scrgb: &ID3D11Texture2D) {
        let ctx = &d3d.context;
        unsafe {
            let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: self.w, bottom: self.h, back: 1 };
            ctx.CopySubresourceRegion(&self.src_copy, 0, 0, 0, 0, scrgb, 0, Some(&bx));
            ctx.OMSetRenderTargets(Some(&[Some(self.out_rtv.clone())]), None);
            let vp = D3D11_VIEWPORT { TopLeftX: 0.0, TopLeftY: 0.0, Width: self.w as f32, Height: self.h as f32, MinDepth: 0.0, MaxDepth: 1.0 };
            ctx.RSSetViewports(Some(&[vp]));
            ctx.IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            ctx.IASetInputLayout(None);
            ctx.VSSetShader(&self.vs, None);
            ctx.PSSetShader(&self.ps, None);
            ctx.PSSetShaderResources(0, Some(&[Some(self.src_srv.clone())]));
            ctx.PSSetSamplers(0, Some(&[Some(self.sampler.clone())]));
            ctx.PSSetConstantBuffers(0, Some(&[Some(self.cbuf.clone())]));
            ctx.Draw(3, 0);
            ctx.PSSetShaderResources(0, Some(&[None]));
            ctx.OMSetRenderTargets(None, None);
        }
    }
}
