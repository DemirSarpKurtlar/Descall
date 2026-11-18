//! HDR-safe output.
//!
//! On an HDR monitor (DXGI colour space RGB_FULL_G2084_NONE_P2020) the desktop is composed
//! in scRGB. Capturing it as BGRA8 makes Windows clip it: highlights blow out and SDR
//! content looks washed. We capture R16G16B16A16Float instead and tone-map here to BT.709
//! SDR (sRGB transfer), then the video processor makes NV12. Viewers always get SDR, which
//! is what every WebRTC receiver can show.
//!
//! Tone curve: scale so the user's "SDR content brightness" maps to 1.0 (scRGB 1.0 = 80
//! nits), then extended Reinhard on luminance with the white point at the display peak.

use windows::core::{s, Interface, PCSTR};
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::{ID3DBlob, D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput6};

use crate::d3d::D3d;

#[derive(Debug, Clone, Copy, Default)]
pub struct HdrInfo {
    pub hdr: bool,
    pub max_nits: f32,
}

/// Is the monitor `hmon` (the HMONITOR value of sources::Source.handle) in HDR mode?
pub fn monitor_hdr(hmon: isize) -> HdrInfo {
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else { return HdrInfo::default() };
        let mut a = 0;
        while let Ok(adapter) = factory.EnumAdapters1(a) {
            let mut o = 0;
            while let Ok(output) = adapter.EnumOutputs(o) {
                if let Ok(o6) = output.cast::<IDXGIOutput6>() {
                    if let Ok(desc) = o6.GetDesc1() {
                        if desc.Monitor.0 as isize == hmon {
                            return HdrInfo {
                                hdr: desc.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020,
                                max_nits: desc.MaxLuminance,
                            };
                        }
                    }
                }
                o += 1;
            }
            a += 1;
        }
    }
    HdrInfo::default()
}

pub const TONEMAP_HLSL: &str = r#"
Texture2D<float4> src : register(t0);
SamplerState samp : register(s0);
cbuffer Params : register(b0) { float sdrWhite; float peakWhite; float2 pad; };
struct VSOut { float4 pos : SV_Position; float2 uv : TEXCOORD0; };
VSOut vs_main(uint id : SV_VertexID) {
  VSOut o; float2 uv = float2((id << 1) & 2, id & 2);
  o.uv = uv; o.pos = float4(uv * float2(2, -2) + float2(-1, 1), 0, 1); return o;
}
float3 linear_to_srgb(float3 c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
float4 ps_main(VSOut i) : SV_Target {
  float3 c = max(src.Sample(samp, i.uv).rgb, 0) / sdrWhite;   // scRGB, BT.709 primaries
  float l = dot(c, float3(0.2126, 0.7152, 0.0722));
  float w = max(peakWhite, 1.0);
  float lm = l * (1 + l / (w * w)) / (1 + l);                   // extended Reinhard
  c = l > 0 ? c * (lm / l) : c;
  return float4(linear_to_srgb(saturate(c)), 1);
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
}

fn compile(entry: PCSTR, target: PCSTR) -> crate::Result<ID3DBlob> {
    let mut code: Option<ID3DBlob> = None;
    unsafe {
        D3DCompile(TONEMAP_HLSL.as_ptr() as _, TONEMAP_HLSL.len(), s!("tonemap.hlsl"), None, None, entry, target, 0, 0, &mut code, None)?;
    }
    Ok(code.expect("shader blob"))
}

fn blob_bytes(b: &ID3DBlob) -> &[u8] {
    unsafe { std::slice::from_raw_parts(b.GetBufferPointer() as *const u8, b.GetBufferSize()) }
}

impl ToneMapper {
    pub fn new(d3d: &D3d, w: u32, h: u32, sdr_white_nits: f32, peak_nits: f32) -> crate::Result<Self> {
        let dev = &d3d.device;
        let vsb = compile(s!("vs_main"), s!("vs_5_0"))?;
        let psb = compile(s!("ps_main"), s!("ps_5_0"))?;
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
            let params: [f32; 4] = [sdr_white_nits / 80.0, peak_nits / sdr_white_nits.max(1.0), 0.0, 0.0];
            let bd = D3D11_BUFFER_DESC { ByteWidth: 16, Usage: D3D11_USAGE_IMMUTABLE, BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32, ..Default::default() };
            let init = D3D11_SUBRESOURCE_DATA { pSysMem: params.as_ptr() as _, ..Default::default() };
            dev.CreateBuffer(&bd, Some(&init), Some(&mut cbuf))?;
        }
        let tex = |format, bind: u32| -> crate::Result<ID3D11Texture2D> {
            let d = D3D11_TEXTURE2D_DESC {
                Width: w, Height: h, MipLevels: 1, ArraySize: 1, Format: format,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT, BindFlags: bind, CPUAccessFlags: 0, MiscFlags: 0,
            };
            let mut t = None;
            unsafe { dev.CreateTexture2D(&d, None, Some(&mut t))? };
            Ok(t.expect("texture"))
        };
        let src_copy = tex(DXGI_FORMAT_R16G16B16A16_FLOAT, D3D11_BIND_SHADER_RESOURCE.0 as u32)?;
        let out = tex(DXGI_FORMAT_B8G8R8A8_UNORM, (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32)?;
        let (mut srv, mut rtv) = (None, None);
        unsafe {
            dev.CreateShaderResourceView(&src_copy, None, Some(&mut srv))?;
            dev.CreateRenderTargetView(&out, None, Some(&mut rtv))?;
        }
        Ok(ToneMapper {
            vs: vs.unwrap(), ps: ps.unwrap(), sampler: sampler.unwrap(), cbuf: cbuf.unwrap(),
            src_copy, src_srv: srv.unwrap(), out, out_rtv: rtv.unwrap(), w, h,
        })
    }

    /// scRGB frame in, BGRA8 SDR in `self.out`.
    pub fn run(&self, d3d: &D3d, scrgb: &ID3D11Texture2D) {
        let ctx = &d3d.context;
        unsafe {
            ctx.CopyResource(&self.src_copy, scrgb);
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

unsafe impl Send for ToneMapper {}
