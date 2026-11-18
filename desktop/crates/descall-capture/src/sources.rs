//! Source list for the in-app glass picker: every monitor and every shareable top-level
//! window, with ids in the Electron shape (`screen:<n>:0`, `window:<hwnd>:0`, see
//! bridge::SourceId) so frontend/src/lib/webrtcScreenShare.js keeps its parsing.
//!
//! Monitor order is stable for a given layout: primary first, then left-to-right,
//! top-to-bottom. `screen:<n>` is resolved against the same order when the share starts.

use windows::core::BOOL;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Threading::{GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::bridge::{SourceId, SourceInfo};

#[derive(Debug, Clone)]
pub struct Source {
    pub id: SourceId,
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub left: i32,
    pub top: i32,
    pub primary: bool,
    pub hdr: bool,
    pub process_id: u32,
    pub exe: Option<String>,
    /// HMONITOR or HWND value.
    pub handle: isize,
}

impl Source {
    pub fn is_window(&self) -> bool {
        matches!(self.id, SourceId::Window(_))
    }

    pub fn info(&self) -> SourceInfo {
        SourceInfo {
            id: self.id.format(),
            name: self.name.clone(),
            kind: if self.is_window() { "window" } else { "screen" }.into(),
            width: self.width,
            height: self.height,
            primary: self.primary,
            hdr: self.hdr,
            process_id: self.process_id,
            exe: self.exe.clone(),
            thumbnail_data_url: None,
            app_icon_data_url: None,
        }
    }
}

pub fn list_monitors() -> Vec<Source> {
    unsafe extern "system" fn cb(hmon: HMONITOR, _hdc: HDC, _rc: *mut RECT, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<Source>) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(hmon, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO) }.as_bool() {
            let r = info.monitorInfo.rcMonitor;
            let n = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
            out.push(Source {
                id: SourceId::Screen(0),
                name: String::from_utf16_lossy(&info.szDevice[..n]),
                width: r.right - r.left,
                height: r.bottom - r.top,
                left: r.left,
                top: r.top,
                primary: info.monitorInfo.dwFlags & 1 == 1, // MONITORINFOF_PRIMARY
                hdr: false,
                process_id: 0,
                exe: None,
                handle: hmon.0 as isize,
            });
        }
        true.into()
    }
    let mut out: Vec<Source> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut out as *mut _ as isize));
    }
    out.sort_by_key(|s| (!s.primary, s.left, s.top));
    for (i, s) in out.iter_mut().enumerate() {
        s.id = SourceId::Screen(i);
        s.hdr = crate::hdr::monitor_hdr(s.handle).hdr;
        // "\\.\DISPLAY1" is meaningless to people: "Ekran 1 (2560x1440)" is built by the picker.
        s.name = format!("Screen {}", i + 1);
    }
    out
}

/// Same filter OBS / Chromium use for "shareable window": visible, not minimised, not
/// cloaked (other virtual desktop, suspended UWP), not a tool window, has a title, a root
/// window, not one of ours.
pub fn list_windows() -> Vec<Source> {
    unsafe extern "system" fn cb(hwnd: HWND, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<Source>) };
        if let Some(s) = describe_window(hwnd, true) {
            out.push(s);
        }
        true.into()
    }
    let mut out: Vec<Source> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut out as *mut _ as isize));
    }
    out
}

pub fn list_all() -> Vec<Source> {
    let mut v = list_monitors();
    v.extend(list_windows());
    v
}

/// Describe one window. `shareable_only` applies the picker filter (and hides our own).
pub fn describe_window(hwnd: HWND, shareable_only: bool) -> Option<Source> {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if shareable_only {
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                return None;
            }
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            if ex & WS_EX_TOOLWINDOW.0 != 0 {
                return None;
            }
            if GetAncestor(hwnd, GA_ROOT) != hwnd {
                return None;
            }
            let mut cloaked: u32 = 0;
            let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
            if cloaked != 0 || pid == GetCurrentProcessId() {
                return None;
            }
        }
        let len = GetWindowTextLengthW(hwnd);
        if shareable_only && len <= 0 {
            return None;
        }
        let mut buf = vec![0u16; len.max(0) as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        let name = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        let rc = window_bounds(hwnd);
        let (w, h) = (rc.right - rc.left, rc.bottom - rc.top);
        if shareable_only && (w < 32 || h < 32) {
            return None;
        }
        Some(Source {
            id: SourceId::Window(hwnd.0 as isize),
            name,
            width: w,
            height: h,
            left: rc.left,
            top: rc.top,
            primary: false,
            hdr: false,
            process_id: pid,
            exe: exe_name(pid),
            handle: hwnd.0 as isize,
        })
    }
}

/// Visible frame bounds (what WGC captures), without the invisible resize borders.
pub fn window_bounds(hwnd: HWND) -> RECT {
    let mut rc = RECT::default();
    let ok = unsafe { DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &mut rc as *mut RECT as *mut _, std::mem::size_of::<RECT>() as u32) };
    if ok.is_err() {
        let _ = unsafe { GetWindowRect(hwnd, &mut rc) };
    }
    rc
}

pub fn window_alive(hwnd: isize) -> bool {
    unsafe { IsWindow(Some(HWND(hwnd as *mut _))).as_bool() }
}

/// HMONITOR the window is (mostly) on.
pub fn monitor_of_window(hwnd: isize) -> isize {
    unsafe { MonitorFromWindow(HWND(hwnd as *mut _), MONITOR_DEFAULTTONEAREST).0 as isize }
}

/// Executable file name of a process ("chrome.exe"), if we may ask.
pub fn exe_name(pid: u32) -> Option<String> {
    exe_path(pid).map(|p| p.rsplit(['\\', '/']).next().unwrap_or(&p).to_string())
}

pub fn exe_path(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        r.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// Resolve a picker id to a capture target, re-validating it now.
pub fn resolve(id: SourceId) -> crate::Result<Source> {
    match id {
        SourceId::Screen(n) => list_monitors().into_iter().nth(n).ok_or_else(|| crate::CaptureError::SourceNotFound(id.format())),
        SourceId::Window(h) => describe_window(HWND(h as *mut _), false).ok_or_else(|| crate::CaptureError::SourceNotFound(id.format())),
    }
}
