//! Live picker thumbnails and app icons.
//!
//! The picker asks for the visible tiles about once a second while it is open
//! (`screen_thumbnails`); each call re-captures every tile older than `max_age`, so the
//! tiles are live without a capture session per tile. Capture is GDI, like Chromium's
//! desktopCapturer thumbnails: monitors with StretchBlt from the screen DC, windows with
//! PrintWindow(PW_RENDERFULLCONTENT) (works for DirectComposition / GPU windows on
//! Windows 8.1+). GDI never draws the yellow WGC border, which matters on Windows 10 where a
//! dozen tiles would otherwise flash a dozen borders. Output: 320x180 box JPEG (~10-20 KB).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::bridge::{SourceId, ThumbnailInfo};
use crate::presets::fit_box;

pub const THUMB_W: u32 = 320;
pub const THUMB_H: u32 = 180;
pub const ICON_SIZE: i32 = 32;
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

/// A top-down 32-bit DIB selected into a memory DC.
struct Dib {
    dc: HDC,
    bmp: HBITMAP,
    old: HGDIOBJ,
    bits: *mut u8,
    w: i32,
    h: i32,
}

impl Dib {
    fn new(w: i32, h: i32) -> Option<Dib> {
        if w <= 0 || h <= 0 {
            return None;
        }
        unsafe {
            let dc = CreateCompatibleDC(None);
            if dc.is_invalid() {
                return None;
            }
            let bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() },
                ..Default::default()
            };
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let Ok(bmp) = CreateDIBSection(Some(dc), &bi, DIB_RGB_COLORS, &mut bits, None, 0) else {
                let _ = DeleteDC(dc);
                return None;
            };
            let old = SelectObject(dc, bmp.into());
            Some(Dib { dc, bmp, old, bits: bits as *mut u8, w, h })
        }
    }

    fn bytes(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.bits, (self.w * self.h * 4) as usize) }
    }

    fn bytes_opaque(&self) -> Vec<u8> {
        let _ = unsafe { GdiFlush() };
        let mut v = self.bytes().to_vec();
        v.chunks_exact_mut(4).for_each(|p| p[3] = 255);
        v
    }
}

impl Drop for Dib {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.old);
            let _ = DeleteObject(self.bmp.into());
            let _ = DeleteDC(self.dc);
        }
    }
}

fn stretch_into(dst: &Dib, src_dc: HDC, sx: i32, sy: i32, sw: i32, sh: i32) -> bool {
    unsafe {
        SetStretchBltMode(dst.dc, HALFTONE);
        let _ = SetBrushOrgEx(dst.dc, 0, 0, None);
        StretchBlt(dst.dc, 0, 0, dst.w, dst.h, Some(src_dc), sx, sy, sw, sh, SRCCOPY | CAPTUREBLT).as_bool()
    }
}

/// Monitor area in virtual-screen coordinates -> BGRA thumbnail (w, h, bytes).
pub fn capture_rect(rc: RECT, box_w: u32, box_h: u32) -> Option<(u32, u32, Vec<u8>)> {
    let (sw, sh) = (rc.right - rc.left, rc.bottom - rc.top);
    let (tw, th) = fit_box(sw.max(0) as u32, sh.max(0) as u32, box_w, box_h);
    let dib = Dib::new(tw as i32, th as i32)?;
    unsafe {
        let screen = GetDC(None);
        let ok = stretch_into(&dib, screen, rc.left, rc.top, sw, sh);
        ReleaseDC(None, screen);
        ok.then(|| (tw, th, dib.bytes_opaque()))
    }
}

/// Window -> BGRA thumbnail, rendered by the window itself (works when covered/offscreen).
pub fn capture_window(hwnd: isize, box_w: u32, box_h: u32) -> Option<(u32, u32, Vec<u8>)> {
    let h = HWND(hwnd as *mut _);
    let mut wr = RECT::default();
    unsafe { GetWindowRect(h, &mut wr).ok()? };
    let frame = crate::sources::window_bounds(h);
    let (ww, wh) = (wr.right - wr.left, wr.bottom - wr.top);
    let full = Dib::new(ww, wh)?;
    if !unsafe { PrintWindow(h, full.dc, PW_RENDERFULLCONTENT) }.as_bool() {
        return None;
    }
    // Crop the invisible resize borders: the frame bounds inside the window rect.
    let (cx, cy) = ((frame.left - wr.left).max(0), (frame.top - wr.top).max(0));
    let (cw, ch) = ((frame.right - frame.left).min(ww - cx), (frame.bottom - frame.top).min(wh - cy));
    let (tw, th) = fit_box(cw.max(0) as u32, ch.max(0) as u32, box_w, box_h);
    let dib = Dib::new(tw as i32, th as i32)?;
    stretch_into(&dib, full.dc, cx, cy, cw, ch).then(|| (tw, th, dib.bytes_opaque()))
}

pub fn thumbnail_jpeg(id: SourceId, box_w: u32, box_h: u32) -> Option<String> {
    let (w, h, px) = match id {
        SourceId::Screen(_) => {
            let s = crate::sources::resolve(id).ok()?;
            capture_rect(RECT { left: s.left, top: s.top, right: s.left + s.width, bottom: s.top + s.height }, box_w, box_h)?
        }
        SourceId::Window(hwnd) => capture_window(hwnd, box_w, box_h)?,
    };
    crate::imaging::jpeg_data_url(&px, w, h, w as usize * 4)
}

/// The window's icon as a PNG data URL (alpha kept).
pub fn app_icon_png(hwnd: isize) -> Option<String> {
    let h = HWND(hwnd as *mut _);
    unsafe {
        let mut res: usize = 0;
        let _ = SendMessageTimeoutW(h, WM_GETICON, WPARAM(ICON_BIG as usize), LPARAM(0), SMTO_ABORTIFHUNG | SMTO_BLOCK, 50, Some(&mut res));
        if res == 0 {
            res = GetClassLongPtrW(h, GCLP_HICON);
        }
        if res == 0 {
            let _ = SendMessageTimeoutW(h, WM_GETICON, WPARAM(ICON_SMALL2 as usize), LPARAM(0), SMTO_ABORTIFHUNG | SMTO_BLOCK, 50, Some(&mut res));
        }
        if res == 0 {
            return None;
        }
        let dib = Dib::new(ICON_SIZE, ICON_SIZE)?;
        DrawIconEx(dib.dc, 0, 0, HICON(res as *mut _), ICON_SIZE, ICON_SIZE, 0, None, DI_NORMAL).ok()?;
        let _ = GdiFlush();
        let px = dib.bytes().to_vec();
        // Icons without an alpha channel come out fully transparent: make them opaque.
        let px = if px.chunks_exact(4).all(|p| p[3] == 0) { px.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2], 255]).collect() } else { px };
        crate::imaging::png_data_url(&px, ICON_SIZE as u32, ICON_SIZE as u32, ICON_SIZE as usize * 4)
    }
}

/// Per-source cache so a picker polling every second never captures a tile twice within
/// `max_age`, and icons are fetched once per window.
#[derive(Default)]
pub struct ThumbnailHub {
    thumbs: Mutex<HashMap<String, (Instant, Option<String>)>>,
    icons: Mutex<HashMap<isize, Option<String>>>,
}

impl ThumbnailHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, ids: &[String], max_age: Duration) -> Vec<ThumbnailInfo> {
        let now = Instant::now();
        let mut out = Vec::with_capacity(ids.len());
        for raw in ids.iter().take(64) {
            let Some(id) = SourceId::parse(raw) else {
                out.push(ThumbnailInfo { id: raw.clone(), thumbnail_data_url: None, alive: false });
                continue;
            };
            let alive = match id {
                SourceId::Window(h) => crate::sources::window_alive(h),
                SourceId::Screen(n) => n < crate::sources::list_monitors().len(),
            };
            if !alive {
                if let Ok(mut m) = self.thumbs.lock() {
                    m.remove(raw);
                }
                out.push(ThumbnailInfo { id: raw.clone(), thumbnail_data_url: None, alive: false });
                continue;
            }
            let cached = self.thumbs.lock().ok().and_then(|m| m.get(raw).filter(|(t, _)| now.duration_since(*t) < max_age).map(|(_, u)| u.clone()));
            let url = match cached {
                Some(u) => u,
                None => {
                    let u = thumbnail_jpeg(id, THUMB_W, THUMB_H);
                    if let Ok(mut m) = self.thumbs.lock() {
                        m.insert(raw.clone(), (now, u.clone()));
                    }
                    u
                }
            };
            out.push(ThumbnailInfo { id: raw.clone(), thumbnail_data_url: url, alive: true });
        }
        out
    }

    pub fn icon(&self, hwnd: isize) -> Option<String> {
        if let Some(v) = self.icons.lock().ok().and_then(|m| m.get(&hwnd).cloned()) {
            return v;
        }
        let v = app_icon_png(hwnd);
        if let Ok(mut m) = self.icons.lock() {
            m.insert(hwnd, v.clone());
        }
        v
    }

    /// The full picker list: sources with a first thumbnail and app icons.
    pub fn sources(&self, with_thumbnails: bool) -> Vec<crate::bridge::SourceInfo> {
        crate::sources::list_all()
            .into_iter()
            .map(|s| {
                let mut info = s.info();
                if with_thumbnails {
                    info.thumbnail_data_url = self.get(std::slice::from_ref(&info.id), Duration::from_millis(500)).pop().and_then(|t| t.thumbnail_data_url);
                }
                if s.is_window() {
                    info.app_icon_data_url = self.icon(s.handle);
                }
                info
            })
            .collect()
    }
}
