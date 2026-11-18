//! Source list for the in-app glass picker: every monitor and every shareable top-level
//! window, with ids in the same shape the Electron picker used ("screen:<n>:0",
//! "window:<hwnd>:0") so frontend/src/lib/webrtcScreenShare.js keeps its parsing.

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub kind: &'static str,
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
    /// Executable name for window tiles (icon lookup happens in the shell).
    pub process_id: u32,
    #[serde(skip)]
    pub handle: isize,
}

pub fn list_monitors() -> Vec<Source> {
    unsafe extern "system" fn cb(hmon: HMONITOR, _hdc: HDC, _rc: *mut RECT, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<Source>) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(hmon, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO) }.as_bool() {
            let r = info.monitorInfo.rcMonitor;
            let n = out.len();
            let dev = String::from_utf16_lossy(&info.szDevice).trim_end_matches('\0').to_string();
            out.push(Source {
                id: format!("screen:{n}:0"),
                kind: "screen",
                name: dev,
                width: r.right - r.left,
                height: r.bottom - r.top,
                primary: info.monitorInfo.dwFlags & 1 == 1, // MONITORINFOF_PRIMARY
                process_id: 0,
                handle: hmon.0 as isize,
            });
        }
        true.into()
    }
    let mut out: Vec<Source> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut out as *mut _ as isize));
    }
    out
}

/// Same filter OBS / Chromium use for "shareable window": visible, not cloaked (other
/// virtual desktop, suspended UWP), not a tool window, has a title, not one of ours.
pub fn list_windows() -> Vec<Source> {
    unsafe extern "system" fn cb(hwnd: HWND, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<Source>) };
        if let Some(s) = unsafe { describe_window(hwnd) } {
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

unsafe fn describe_window(hwnd: HWND) -> Option<Source> {
    unsafe {
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
        if cloaked != 0 {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == GetCurrentProcessId() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        let name = String::from_utf16_lossy(&buf[..n as usize]);
        let mut rc = RECT::default();
        let _ = GetClientRect(hwnd, &mut rc);
        Some(Source {
            id: format!("window:{}:0", hwnd.0 as isize),
            kind: "window",
            name,
            width: rc.right - rc.left,
            height: rc.bottom - rc.top,
            primary: false,
            process_id: pid,
            handle: hwnd.0 as isize,
        })
    }
}

pub fn list_all() -> Vec<Source> {
    let mut v = list_monitors();
    v.extend(list_windows());
    v
}
