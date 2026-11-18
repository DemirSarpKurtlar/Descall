//! GPU scale + colour conversion with the fixed-function video processor
//! (ID3D11VideoProcessor, the same block hardware decoders/encoders use), then a single
//! staging readback of the NV12 result.
//!
//! Why NV12 on the GPU: 1440p60 BGRA would be 885 MB/s of readback + copies; NV12 is
//! 332 MB/s and is what WebRTC encoders (and VideoFrame) consume without another
//! CPU conversion. Chromium's own desktop capturer reads BGRA back and converts on the
//! CPU (libyuv), so this lane does strictly less CPU work per frame than today's Electron.

use windows::core::Interface;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;

use crate::d3d::D3d;

pub struct Nv12Converter {
    vdev: ID3D11VideoDevice,
    vctx: ID3D11VideoContext,
    vctx1: Option<ID3D11VideoContext1>,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    out_tex: ID3D11Texture2D,
    out_view: ID3D11VideoProcessorOutputView,
    staging: ID3D11Texture2D,
    pub in_w: u32,
    pub in_h: u32,
    pub out_w: u32,
    pub out_h: u32,
    in_format: DXGI_FORMAT,
}

impl Nv12Converter {
    pub fn new(d3d: &D3d, in_w: u32, in_h: u32, out_w: u32, out_h: u32, fps: u32, in_format: DXGI_FORMAT) -> crate::Result<Self> {
        let vdev: ID3D11VideoDevice = d3d.device.cast()?;
        let vctx: ID3D11VideoContext = d3d.context.cast()?;
        let vctx1 = vctx.cast::<ID3D11VideoContext1>().ok();
        let rate = DXGI_RATIONAL { Numerator: fps, Denominator: 1 };
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
        let processor = unsafe { vdev.CreateVideoProcessor(&enumerator, 0)? };

        let mut tex_desc = D3D11_TEXTURE2D_DESC {
            Width: out_w,
            Height: out_h,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut out_tex = None;
        unsafe { d3d.device.CreateTexture2D(&tex_desc, None, Some(&mut out_tex))? };
        let out_tex = out_tex.expect("nv12 texture");

        tex_desc.Usage = D3D11_USAGE_STAGING;
        tex_desc.BindFlags = 0;
        tex_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        let mut staging = None;
        unsafe { d3d.device.CreateTexture2D(&tex_desc, None, Some(&mut staging))? };
        let staging = staging.expect("staging texture");

        let ov_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
        };
        let mut out_view = None;
        unsafe { vdev.CreateVideoProcessorOutputView(&out_tex, &enumerator, &ov_desc, Some(&mut out_view))? };
        let out_view = out_view.expect("output view");

        let conv = Nv12Converter { vdev, vctx, vctx1, enumerator, processor, out_tex, out_view, staging, in_w, in_h, out_w, out_h, in_format };
        conv.configure();
        Ok(conv)
    }

    fn configure(&self) {
        unsafe {
            let src = RECT { left: 0, top: 0, right: self.in_w as i32, bottom: self.in_h as i32 };
            let dst = RECT { left: 0, top: 0, right: self.out_w as i32, bottom: self.out_h as i32 };
            self.vctx.VideoProcessorSetStreamSourceRect(&self.processor, 0, true, Some(&src));
            self.vctx.VideoProcessorSetStreamDestRect(&self.processor, 0, true, Some(&dst));
            self.vctx.VideoProcessorSetOutputTargetRect(&self.processor, true, Some(&dst));
            // sRGB full-range in, BT.709 limited-range NV12 out. The page tags the VideoFrame
            // with { primaries/transfer/matrix: "bt709", fullRange: false }.
            if let Some(v1) = &self.vctx1 {
                v1.VideoProcessorSetStreamColorSpace1(&self.processor, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
                v1.VideoProcessorSetOutputColorSpace1(&self.processor, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
            }
        }
    }

    /// Scale + convert `input` (BGRA8, or the tone-mapped HDR result) and read the NV12
    /// result back. `sink(bytes, row_pitch)` gets the mapped staging memory: Y rows, then
    /// the UV plane at `row_pitch * out_h`.
    pub fn convert_and_read<F: FnOnce(&[u8], usize)>(&self, d3d: &D3d, input: &ID3D11Texture2D, sink: F) -> crate::Result<()> {
        let iv_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: 0 } },
        };
        let mut in_view = None;
        unsafe { self.vdev.CreateVideoProcessorInputView(input, &self.enumerator, &iv_desc, Some(&mut in_view))? };
        let stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            pInputSurface: std::mem::ManuallyDrop::new(in_view),
            ..Default::default()
        };
        let streams = [stream];
        let blt = unsafe { self.vctx.VideoProcessorBlt(&self.processor, &self.out_view, 0, &streams) };
        // Release the input view we put into the ManuallyDrop.
        let [mut stream] = streams;
        unsafe { std::mem::ManuallyDrop::drop(&mut stream.pInputSurface) };
        blt?;

        unsafe {
            d3d.context.CopyResource(&self.staging, &self.out_tex);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            // Blocking map right after the copy: ~1-2 ms at 1440p on a discrete GPU. A
            // two-staging ping-pong (map frame N-1 with DO_NOT_WAIT) trades +1 frame of
            // latency for zero stall; P0 measures both.
            d3d.context.Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            let pitch = mapped.RowPitch as usize;
            let len = pitch * self.out_h as usize * 3 / 2;
            let bytes = std::slice::from_raw_parts(mapped.pData as *const u8, len);
            sink(bytes, pitch);
            d3d.context.Unmap(&self.staging, 0);
        }
        Ok(())
    }

    pub fn input_format(&self) -> DXGI_FORMAT {
        self.in_format
    }
}

// Owned by one share, used under its mutex.
unsafe impl Send for Nv12Converter {}
