//! Running Descall processes inside the install folder: count them, ask them to close, and as a
//! last resort (only after the user pressed "Close Descall and continue") end them.

use std::path::Path;
use std::time::{Duration, Instant};
use windows::core::BOOL;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE};

fn image_path(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        r.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// PIDs of executables running from inside `dir` (any exe, not only Descall.exe: helpers too).
pub fn running_in(dir: &Path) -> Vec<u32> {
    let prefix = format!("{}\\", dir.to_string_lossy().trim_end_matches('\\')).to_lowercase();
    let me = std::process::id();
    let mut out = vec![];
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let pid = e.th32ProcessID;
            if pid != me {
                if let Some(p) = image_path(pid) {
                    if p.to_lowercase().starts_with(&prefix) {
                        out.push(pid);
                    }
                }
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    out
}

unsafe extern "system" fn close_cb(hwnd: HWND, lp: LPARAM) -> BOOL {
    let pids = unsafe { &*(lp.0 as *const Vec<u32>) };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pids.contains(&pid) {
        unsafe {
            let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }
    BOOL(1)
}

/// Asks Descall to quit (its own `--quit` handler, then WM_CLOSE to its windows), waits up to
/// `grace`, then terminates whatever is left. Returns true when nothing is running any more.
pub fn close_all(dir: &Path, grace: Duration) -> bool {
    let pids = running_in(dir);
    if pids.is_empty() {
        return true;
    }
    let exe = dir.join(crate::layout::EXE);
    if exe.exists() {
        let _ = std::process::Command::new(&exe).arg("--quit").spawn();
    }
    unsafe {
        let _ = EnumWindows(Some(close_cb), LPARAM(&pids as *const Vec<u32> as isize));
    }
    let t = Instant::now();
    while t.elapsed() < grace {
        if running_in(dir).is_empty() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    for pid in running_in(dir) {
        unsafe {
            if let Ok(h) = OpenProcess(PROCESS_TERMINATE | PROCESS_SYNCHRONIZE, false, pid) {
                let _ = TerminateProcess(h, 0);
                let _ = WaitForSingleObject(h, 3000);
                let _ = CloseHandle(h);
            }
        }
    }
    running_in(dir).is_empty()
}
