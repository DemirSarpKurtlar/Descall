//! WIC encoding of small BGRA images (picker thumbnails as JPEG, app icons as PNG).

use windows::core::GUID;
use windows::Win32::Foundation::HGLOBAL;
use windows::Win32::Graphics::Imaging::*;
use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET};

/// Make sure the calling thread has COM (an already-initialised STA is fine too).
pub fn ensure_com() {
    thread_local! {
        static INIT: () = {
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        };
    }
    INIT.with(|_| {});
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
}

/// Encode a BGRA image (`stride` bytes per row). JPEG drops alpha (24bpp), PNG keeps it.
pub fn encode_bgra(bgra: &[u8], w: u32, h: u32, stride: usize, format: ImageFormat) -> crate::Result<Vec<u8>> {
    ensure_com();
    let (wu, hu) = (w as usize, h as usize);
    if w == 0 || h == 0 || bgra.len() < stride * (hu - 1) + wu * 4 {
        return Err(windows::core::Error::from(windows::Win32::Foundation::E_INVALIDARG).into());
    }
    unsafe {
        let factory: IWICImagingFactory = CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true)?;
        let container = match format {
            ImageFormat::Jpeg => GUID_ContainerFormatJpeg,
            ImageFormat::Png => GUID_ContainerFormatPng,
        };
        let encoder = factory.CreateEncoder(&container, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame = None;
        let mut props = None;
        encoder.CreateNewFrame(&mut frame, &mut props)?;
        let frame = frame.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?;
        frame.Initialize(props.as_ref())?;
        frame.SetSize(w, h)?;
        let (mut pf, pixels, row): (GUID, Vec<u8>, usize) = match format {
            ImageFormat::Jpeg => {
                let mut v = Vec::with_capacity(wu * hu * 3);
                for y in 0..hu {
                    for p in bgra[y * stride..y * stride + wu * 4].chunks_exact(4) {
                        v.extend_from_slice(&p[..3]);
                    }
                }
                (GUID_WICPixelFormat24bppBGR, v, wu * 3)
            }
            ImageFormat::Png => {
                let mut v = Vec::with_capacity(wu * hu * 4);
                for y in 0..hu {
                    v.extend_from_slice(&bgra[y * stride..y * stride + wu * 4]);
                }
                (GUID_WICPixelFormat32bppBGRA, v, wu * 4)
            }
        };
        frame.SetPixelFormat(&mut pf)?;
        frame.WritePixels(h, row as u32, &pixels)?;
        frame.Commit()?;
        encoder.Commit()?;
        let mut st = STATSTG::default();
        stream.Stat(&mut st, STATFLAG_NONAME)?;
        let size = st.cbSize as usize;
        stream.Seek(0, STREAM_SEEK_SET, None)?;
        let mut out = vec![0u8; size];
        let mut read = 0u32;
        stream.Read(out.as_mut_ptr() as *mut _, size as u32, Some(&mut read)).ok()?;
        out.truncate(read as usize);
        Ok(out)
    }
}

pub fn jpeg_data_url(bgra: &[u8], w: u32, h: u32, stride: usize) -> Option<String> {
    encode_bgra(bgra, w, h, stride, ImageFormat::Jpeg).ok().map(|b| crate::encode::data_url("image/jpeg", &b))
}

pub fn png_data_url(bgra: &[u8], w: u32, h: u32, stride: usize) -> Option<String> {
    encode_bgra(bgra, w, h, stride, ImageFormat::Png).ok().map(|b| crate::encode::data_url("image/png", &b))
}
