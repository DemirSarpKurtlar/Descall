//! GPU scale + colour conversion with the fixed-function video processor
//! (ID3D11VideoProcessor, the block hardware decoders/encoders use), then one staging
//! readback of the result.
//!
//! Why NV12 on the GPU: 1440p60 BGRA would be 885 MB/s of readback + copies; NV12 is
//! 332 MB/s and is what WebRTC encoders (and VideoFrame) consume without another CPU
//! conversion. Chromium's desktop capturer reads BGRA back and converts on the CPU
//! (libyuv), so this lane does strictly less CPU work per frame than the Electron app.
//!
//! The same converter makes BGRA thumbnails (`OutFormat::Bgra`). When the device has no
//! video processor (WARP created without VIDEO_SUPPORT) a CPU path does the same job
//! (box downscale + `encode::bgra_to_nv12`): slow, but the share still works.

use windows::core::Interface;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;

use crate::d3d::{texture_desc, D3d};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutFormat {
    Nv12,
    Bgra,
}

impl OutFormat {
    fn dxgi(self) -> DXGI_FORMAT {
        match self {
            OutFormat::Nv12 => DXGI_FORMAT_NV12,
            OutFormat::Bgra => DXGI_FORMAT_B8G8R8A8_UNORM,
        }
    }
}

struct Gpu {
    vdev: ID3D11VideoDevice,
    vctx: ID3D11VideoContext,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    out_tex: ID3D11Texture2D,
    out_view: ID3D11VideoProcessorOutputView,
    /// Input views of the last few WGC surfaces. A view holds a reference to its texture,
    /// so a cached pointer can never be reused by a different texture while it is cached.
    views: Vec<(usize, ID3D11VideoProcessorInputView)>,
}

struct Cpu {
    staging_in: Option<ID3D11Texture2D>,
    scaled: Vec<u8>,
    out: Vec<u8>,
}

enum Path {
    Gpu(Box<Gpu>),
    Cpu(Box<Cpu>),
}

pub struct Converter {
    path: Path,
    staging: Option<ID3D11Texture2D>,
    pub in_w: u32,
    pub in_h: u32,
    pub out_w: u32,
    pub out_h: u32,
    pub out_format: OutFormat,
}

// Owned by one share (or the thumbnail hub) and used under its mutex.
unsafe impl Send for Converter {}

const VIEW_CACHE: usize = 4;

impl Converter {
    /// `in_w` x `in_h`: the content size (the source texture may be larger after a resize;
    /// only the top-left content rectangle is read).
    pub fn new(d3d: &D3d, in_w: u32, in_h: u32, out_w: u32, out_h: u32, fps: u32, out_format: OutFormat) -> crate::Result<Self> {
        let path = match Self::gpu(d3d, in_w, in_h, out_w, out_h, fps, out_format) {
            Ok(g) => Path::Gpu(Box::new(g)),
            Err(e) => {
                log::warn!("video processor unavailable ({e}), using the CPU converter");
                Path::Cpu(Box::new(Cpu { staging_in: None, scaled: Vec::new(), out: Vec::new() }))
            }
        };
        let staging = match &path {
            Path::Gpu(_) => Some(d3d.texture(&D3D11_TEXTURE2D_DESC {
                Width: out_w,
                Height: out_h,
                MipLevels: 1,
                ArraySize: 1,
                Format: out_format.dxgi(),
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                MiscFlags: 0,
            })?),
            Path::Cpu(_) => None,
        };
        Ok(Converter { path, staging, in_w, in_h, out_w, out_h, out_format })
    }

    pub fn is_gpu(&self) -> bool {
        matches!(self.path, Path::Gpu(_))
    }

    fn gpu(d3d: &D3d, in_w: u32, in_h: u32, out_w: u32, out_h: u32, fps: u32, out_format: OutFormat) -> crate::Result<Gpu> {
        let vdev: ID3D11VideoDevice = d3d.device.cast()?;
        let vctx: ID3D11VideoContext = d3d.context.cast()?;
        let rate = DXGI_RATIONAL { Numerator: fps.max(1), Denominator: 1 };
        let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: rate,
            InputWidth: in_w,
            InputHeight: in_h,
            OutputFrameRate: rate,
            OutputWidth: out_w,
            OutputHeight: out_h,
            Usage: D3D11_VIDEO_USAGE_OPTIMAL_SPEED,
        };
        let enumerator = unsafe { vdev.CreateVideoProcessorEnumerator(&desc)? };
        let out_support = unsafe { enumerator.CheckVideoProcessorFormat(out_format.dxgi())? };
        if out_support & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT.0 as u32 == 0 {
            return Err(windows::core::Error::from(windows::Win32::Foundation::E_NOTIMPL).into());
        }
        let processor = unsafe { vdev.CreateVideoProcessor(&enumerator, 0)? };
        let out_tex = d3d.texture(&D3D11_TEXTURE2D_DESC {
            Width: out_w,
            Height: out_h,
            MipLevels: 1,
            ArraySize: 1,
            Format: out_format.dxgi(),
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        })?;
        let ov_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
        };
        let mut out_view = None;
        unsafe { vdev.CreateVideoProcessorOutputView(&out_tex, &enumerator, &ov_desc, Some(&mut out_view))? };
        let out_view = out_view.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?;
        let g = Gpu { vdev, vctx, enumerator, processor, out_tex, out_view, views: Vec::new() };
        unsafe {
            let src = RECT { left: 0, top: 0, right: in_w as i32, bottom: in_h as i32 };
            let dst = RECT { left: 0, top: 0, right: out_w as i32, bottom: out_h as i32 };
            g.vctx.VideoProcessorSetStreamSourceRect(&g.processor, 0, true, Some(&src));
            g.vctx.VideoProcessorSetStreamDestRect(&g.processor, 0, true, Some(&dst));
            g.vctx.VideoProcessorSetOutputTargetRect(&g.processor, true, Some(&dst));
            g.vctx.VideoProcessorSetStreamFrameFormat(&g.processor, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
            g.vctx.VideoProcessorSetStreamAutoProcessingMode(&g.processor, 0, false);
            // sRGB full-range in; BT.709 limited-range NV12 (or sRGB BGRA) out. The page tags
            // the VideoFrame { primaries/transfer/matrix: "bt709", fullRange: false }.
            let out_cs = if out_format == OutFormat::Nv12 { DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709 } else { DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709 };
            if let Ok(v1) = g.vctx.cast::<ID3D11VideoContext1>() {
                v1.VideoProcessorSetStreamColorSpace1(&g.processor, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
                v1.VideoProcessorSetOutputColorSpace1(&g.processor, out_cs);
            } else {
                // Legacy bitfield: Usage:1 RGB_Range:1 YCbCr_Matrix:1 xvYCC:1 Nominal_Range:2.
                let stream = D3D11_VIDEO_PROCESSOR_COLOR_SPACE { _bitfield: 0 };
                let out = D3D11_VIDEO_PROCESSOR_COLOR_SPACE { _bitfield: if out_format == OutFormat::Nv12 { (1 << 2) | (1 << 4) } else { 0 } };
                g.vctx.VideoProcessorSetStreamColorSpace(&g.processor, 0, &stream);
                g.vctx.VideoProcessorSetOutputColorSpace(&g.processor, &out);
            }
        }
        Ok(g)
    }

    /// Scale + convert `input` (BGRA8, or the tone-mapped HDR result) and read the result
    /// back. `sink(bytes, row_pitch)` gets the mapped memory: for NV12, `out_h` Y rows then
    /// the UV plane at `row_pitch * out_h`; for BGRA, `out_h` rows of 4-byte pixels.
    pub fn convert_and_read<F: FnOnce(&[u8], usize)>(&mut self, d3d: &D3d, input: &ID3D11Texture2D, sink: F) -> crate::Result<()> {
        match &mut self.path {
            Path::Gpu(g) => {
                let key = input.as_raw() as usize;
                let view = match g.views.iter().position(|(k, _)| *k == key) {
                    Some(i) => g.views[i].1.clone(),
                    None => {
                        let iv_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                            FourCC: 0,
                            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: 0 } },
                        };
                        let mut v = None;
                        unsafe { g.vdev.CreateVideoProcessorInputView(input, &g.enumerator, &iv_desc, Some(&mut v))? };
                        let v = v.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?;
                        if g.views.len() >= VIEW_CACHE {
                            g.views.remove(0);
                        }
                        g.views.push((key, v.clone()));
                        v
                    }
                };
                let stream = D3D11_VIDEO_PROCESSOR_STREAM { Enable: true.into(), pInputSurface: std::mem::ManuallyDrop::new(Some(view)), ..Default::default() };
                let streams = [stream];
                let blt = unsafe { g.vctx.VideoProcessorBlt(&g.processor, &g.out_view, 0, &streams) };
                let [mut stream] = streams;
                unsafe { std::mem::ManuallyDrop::drop(&mut stream.pInputSurface) };
                blt?;
                let staging = self.staging.as_ref().expect("gpu path has a staging texture");
                unsafe { d3d.context.CopyResource(staging, &g.out_tex) };
                let rows = if self.out_format == OutFormat::Nv12 { self.out_h as usize * 3 / 2 } else { self.out_h as usize };
                map_read(d3d, staging, rows, sink)
            }
            Path::Cpu(c) => {
                // Read the BGRA content rectangle back, then scale + convert on the CPU.
                let need_new = match &c.staging_in {
                    Some(t) => {
                        let d = texture_desc(t);
                        d.Width != self.in_w || d.Height != self.in_h
                    }
                    None => true,
                };
                if need_new {
                    c.staging_in = Some(d3d.texture(&D3D11_TEXTURE2D_DESC {
                        Width: self.in_w,
                        Height: self.in_h,
                        MipLevels: 1,
                        ArraySize: 1,
                        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                        Usage: D3D11_USAGE_STAGING,
                        BindFlags: 0,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        MiscFlags: 0,
                    })?);
                }
                let staging = c.staging_in.as_ref().expect("staging");
                let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: self.in_w, bottom: self.in_h, back: 1 };
                unsafe { d3d.context.CopySubresourceRegion(staging, 0, 0, 0, 0, input, 0, Some(&bx)) };
                let (in_w, in_h, out_w, out_h) = (self.in_w as usize, self.in_h as usize, self.out_w as usize, self.out_h as usize);
                let (scaled, out) = (&mut c.scaled, &mut c.out);
                map_read(d3d, staging, in_h, |bytes, pitch| {
                    *scaled = crate::encode::downscale_bgra(bytes, in_w, in_h, pitch, out_w, out_h);
                })?;
                match self.out_format {
                    OutFormat::Nv12 => {
                        crate::encode::bgra_to_nv12(scaled, out_w, out_h, out_w * 4, out);
                        sink(out, out_w);
                    }
                    OutFormat::Bgra => sink(scaled, out_w * 4),
                }
                Ok(())
            }
        }
    }
}

/// Map a staging texture, hand `rows * RowPitch` bytes to `sink`, unmap.
/// A blocking map right after the copy costs ~1-2 ms at 1440p on a discrete GPU; the bench
/// measures it (convert time in the stats).
fn map_read<F: FnOnce(&[u8], usize)>(d3d: &D3d, staging: &ID3D11Texture2D, rows: usize, sink: F) -> crate::Result<()> {
    unsafe {
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        d3d.context.Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        let pitch = mapped.RowPitch as usize;
        let bytes = std::slice::from_raw_parts(mapped.pData as *const u8, pitch * rows);
        sink(bytes, pitch);
        d3d.context.Unmap(staging, 0);
    }
    Ok(())
}
