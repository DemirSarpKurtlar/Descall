//! Windows-only pieces (Job Object, power / session messages, game probe, registry).

pub mod game;
pub mod job;
pub mod power;

use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

pub fn total_memory_mb() -> u32 {
    let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_ok() {
        (m.ullTotalPhys / (1024 * 1024)) as u32
    } else {
        8192
    }
}

pub fn process_private_mb(child: &std::process::Child) -> Option<f64> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    let mut c = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
    let h = HANDLE(child.as_raw_handle());
    let ok = unsafe { GetProcessMemoryInfo(h, &mut c as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS, c.cb) };
    ok.is_ok().then(|| c.PrivateUsage as f64 / (1024.0 * 1024.0))
}

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_APPROVED_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

pub fn autostart_enabled() -> bool {
    let present = windows_registry::CURRENT_USER.open(RUN).and_then(|k| k.get_string(crate::sys::RUN_VALUE)).is_ok();
    let disabled = windows_registry::CURRENT_USER
        .open(STARTUP_APPROVED_RUN)
        .and_then(|k| k.get_value(crate::sys::RUN_VALUE))
        .map(|v| v.first().copied() == Some(0x03))
        .unwrap_or(false);
    present && !disabled
}

pub fn set_autostart(on: bool) -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let Ok(run) = windows_registry::CURRENT_USER.create(RUN) else { return false };
    if on {
        if let Ok(k) = windows_registry::CURRENT_USER.create(STARTUP_APPROVED_RUN) {
            if k.get_value(crate::sys::RUN_VALUE).map(|v| v.first().copied() == Some(0x03)).unwrap_or(false) {
                let _ = k.set_bytes(crate::sys::RUN_VALUE, windows_registry::Type::Bytes, &[0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
            }
        }
        run.set_string(crate::sys::RUN_VALUE, format!("\"{}\" --autostart", exe.to_string_lossy())).is_ok()
    } else {
        let _ = run.remove_value(crate::sys::RUN_VALUE);
        true
    }
}

pub fn small_icon_px() -> u32 {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSMICON};
    match unsafe { GetSystemMetrics(SM_CXSMICON) } {
        n if n > 0 => n as u32,
        _ => 16,
    }
}

pub fn round_corners(w: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE};
    if let Ok(hwnd) = w.hwnd() {
        let pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
        let _ = unsafe { DwmSetWindowAttribute(windows::Win32::Foundation::HWND(hwnd.0 as _), DWMWA_WINDOW_CORNER_PREFERENCE, &pref as *const _ as *const _, std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32) };
    }
}
