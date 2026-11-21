//! Win32 pieces of the Descall+ features (stubs elsewhere): system idle time, cursor position,
//! window opacity, taskbar thumbnail buttons, a hidden watcher window for display and
//! session-lock changes, the save dialog and process metrics. No hooks into other processes.

use super::Bus;

pub type Emit = Box<dyn Fn(Bus) + Send + Sync>;

#[cfg(windows)]
pub use win::*;

#[cfg(not(windows))]
pub use other::*;

#[cfg(not(windows))]
mod other {
    use super::Emit;
    use std::path::PathBuf;

    pub fn idle_seconds() -> u64 {
        0
    }
    pub fn cursor_pos() -> Option<(i32, i32)> {
        None
    }
    pub fn mouse_button_down() -> bool {
        false
    }
    pub fn set_opacity(_hwnd: isize, _alpha: f64) {}
    pub fn start_watcher(_emit: Emit) {}
    pub fn save_dialog(_owner: isize, _name: &str, _dir: Option<PathBuf>, _ext: &str) -> Option<PathBuf> {
        None
    }
    pub fn process_tree_usage() -> (u64, u64, u64, usize) {
        (0, 0, 0, 0)
    }
    pub struct ThumbButton {
        pub id: u32,
        pub tip: String,
        pub glyph: &'static str,
    }
    pub fn set_thumb_buttons(_hwnd: isize, _buttons: &[ThumbButton], _on_click: fn(u32)) {}
}

#[cfg(windows)]
mod win {
    use super::Emit;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};

    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, FILETIME, HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::System::Threading::{GetCurrentProcessId, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{
        DefSubclassProc, FileSaveDialog, IFileSaveDialog, IShellItem, ITaskbarList3, SHCreateItemFromParsingName, SetWindowSubclass, TaskbarList, FOS_OVERWRITEPROMPT,
        SIGDN_FILESYSPATH, THBF_ENABLED, THBF_HIDDEN, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON, THUMBBUTTONMASK,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, CreateWindowExW, DefWindowProcW, DestroyIcon, DispatchMessageW, GetCursorPos, GetMessageW, GetWindowLongPtrW, RegisterClassW, SetLayeredWindowAttributes,
        SetWindowLongPtrW, TranslateMessage, GWL_EXSTYLE, HICON, ICONINFO, LWA_ALPHA, MSG, WM_COMMAND, WM_DISPLAYCHANGE, WM_SETTINGCHANGE, WM_WTSSESSION_CHANGE, WNDCLASSW,
        WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
    };

    use crate::premium::logic::badge;
    use crate::premium::Bus;

    pub(crate) fn hwnd(v: isize) -> HWND {
        HWND(v as *mut core::ffi::c_void)
    }

    pub fn idle_seconds() -> u64 {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        unsafe {
            if !GetLastInputInfo(&mut info).as_bool() {
                return 0;
            }
            (GetTickCount().wrapping_sub(info.dwTime) / 1000) as u64
        }
    }

    /// A mouse button is held (a window drag is still going on). Read only, no hook.
    pub fn mouse_button_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 || (GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16 & 0x8000) != 0 }
    }

    pub fn cursor_pos() -> Option<(i32, i32)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok()? };
        Some((p.x, p.y))
    }

    /// WS_EX_LAYERED + SetLayeredWindowAttributes (Electron setOpacity). 1.0 removes the style.
    pub fn set_opacity(h: isize, alpha: f64) {
        let h = hwnd(h);
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            if alpha >= 0.999 {
                if ex & WS_EX_LAYERED.0 as isize != 0 {
                    let _ = SetLayeredWindowAttributes(h, Default::default(), 255, LWA_ALPHA);
                    // Click-through (tao's set_ignore_cursor_events: WS_EX_TRANSPARENT) only
                    // works on a layered window: a HUD at 100 % keeps the style.
                    if ex & WS_EX_TRANSPARENT.0 as isize == 0 {
                        SetWindowLongPtrW(h, GWL_EXSTYLE, ex & !(WS_EX_LAYERED.0 as isize));
                    }
                }
                return;
            }
            if ex & WS_EX_LAYERED.0 as isize == 0 {
                SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_LAYERED.0 as isize);
            }
            let _ = SetLayeredWindowAttributes(h, Default::default(), (alpha.clamp(0.0, 1.0) * 255.0).round() as u8, LWA_ALPHA);
        }
    }

    // -- watcher window: display changes and session lock / unlock --

    static WATCH: OnceLock<Emit> = OnceLock::new();

    unsafe extern "system" fn watch_proc(h: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        if let Some(emit) = WATCH.get() {
            match msg {
                WM_DISPLAYCHANGE => emit(Bus::Displays),
                // SPI_SETWORKAREA: the taskbar moved or changed size.
                WM_SETTINGCHANGE if wp.0 == 0x2F => emit(Bus::Displays),
                // WTS_SESSION_LOCK = 7, WTS_SESSION_UNLOCK = 8.
                WM_WTSSESSION_CHANGE if wp.0 == 7 => emit(Bus::SessionLock(true)),
                WM_WTSSESSION_CHANGE if wp.0 == 8 => emit(Bus::SessionLock(false)),
                _ => {}
            }
        }
        DefWindowProcW(h, msg, wp, lp)
    }

    /// Hidden top-level window (message-only windows miss broadcasts) on its own thread.
    pub fn start_watcher(emit: Emit) {
        if WATCH.set(emit).is_err() {
            return;
        }
        let _ = std::thread::Builder::new().name("premium-watch".into()).spawn(|| unsafe {
            let Ok(inst) = GetModuleHandleW(None) else { return };
            let class = w!("DescallPremiumWatch");
            let wc = WNDCLASSW { lpfnWndProc: Some(watch_proc), hInstance: inst.into(), lpszClassName: class, ..Default::default() };
            RegisterClassW(&wc);
            let Ok(h) = CreateWindowExW(WS_EX_TOOLWINDOW, class, w!(""), WS_POPUP, 0, 0, 0, 0, None, None, Some(inst.into()), None) else { return };
            let _ = WTSRegisterSessionNotification(h, NOTIFY_FOR_THIS_SESSION);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }

    // -- save dialog (instant_clip) --

    /// IFileSaveDialog on its own STA thread; blocks the caller (a blocking-pool thread).
    pub fn save_dialog(owner: isize, name: &str, dir: Option<PathBuf>, ext: &str) -> Option<PathBuf> {
        let name = name.to_string();
        let ext = ext.to_string();
        std::thread::spawn(move || unsafe {
            if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
                return None;
            }
            let r = (|| -> Option<PathBuf> {
                let dlg: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).ok()?;
                let label = HSTRING::from(ext.to_uppercase());
                let spec = HSTRING::from(format!("*.{ext}"));
                let filters = [COMDLG_FILTERSPEC { pszName: PCWSTR(label.as_ptr()), pszSpec: PCWSTR(spec.as_ptr()) }];
                dlg.SetFileTypes(&filters).ok()?;
                dlg.SetDefaultExtension(&HSTRING::from(ext.as_str())).ok()?;
                dlg.SetFileName(&HSTRING::from(name.as_str())).ok()?;
                let opts = dlg.GetOptions().ok()?;
                let _ = dlg.SetOptions(opts | FOS_OVERWRITEPROMPT);
                if let Some(d) = dir {
                    if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(d.as_os_str()), None) {
                        let _ = dlg.SetFolder(&item);
                    }
                }
                let owner = if owner != 0 { Some(hwnd(owner)) } else { None };
                dlg.Show(owner).ok()?;
                let item = dlg.GetResult().ok()?;
                let p = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
                let path = p.to_string().ok().map(PathBuf::from);
                CoTaskMemFree(Some(p.0 as *const core::ffi::c_void));
                path
            })();
            CoUninitialize();
            r
        })
        .join()
        .ok()
        .flatten()
    }

    // -- process metrics (instant_clip) --

    fn ft(t: FILETIME) -> u64 {
        ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64
    }

    /// (cpu time in 100 ns, working set bytes, private bytes, process count) of Descall and
    /// every process it started (the WebView2 browser, renderers, GPU and utility processes).
    pub fn process_tree_usage() -> (u64, u64, u64, usize) {
        let me = unsafe { GetCurrentProcessId() };
        let mut pairs: Vec<(u32, u32)> = Vec::new();
        unsafe {
            if let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
                if Process32FirstW(snap, &mut e).is_ok() {
                    loop {
                        pairs.push((e.th32ProcessID, e.th32ParentProcessID));
                        if Process32NextW(snap, &mut e).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snap);
            }
        }
        let mut tree = vec![me];
        let mut i = 0;
        while i < tree.len() {
            let parent = tree[i];
            for (pid, ppid) in &pairs {
                if *ppid == parent && *pid != parent && !tree.contains(pid) {
                    tree.push(*pid);
                }
            }
            i += 1;
        }
        let (mut cpu, mut ws, mut pv) = (0u64, 0u64, 0u64);
        for pid in &tree {
            unsafe {
                let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, *pid) else { continue };
                let (mut c, mut x, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
                if GetProcessTimes(h, &mut c, &mut x, &mut k, &mut u).is_ok() {
                    cpu += ft(k) + ft(u);
                }
                let mut m = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
                if K32GetProcessMemoryInfo(h, &mut m as *mut _ as *mut PROCESS_MEMORY_COUNTERS, m.cb).as_bool() {
                    ws += m.WorkingSetSize as u64;
                    pv += m.PrivateUsage as u64;
                }
                let _ = CloseHandle(h);
            }
        }
        (cpu, ws, pv, tree.len())
    }

    // -- taskbar thumbnail buttons (taskbar_plus) --

    pub struct ThumbButton {
        pub id: u32,
        pub tip: String,
        pub glyph: &'static str,
    }

    struct ThumbState {
        added: bool,
        icons: Vec<isize>,
    }

    static THUMB: Mutex<Option<ThumbState>> = Mutex::new(None);
    static THUMB_CLICK: OnceLock<fn(u32)> = OnceLock::new();
    const THBN_CLICKED: usize = 0x1800;
    const SUBCLASS_ID: usize = 0xD5C1;

    unsafe extern "system" fn thumb_proc(h: HWND, msg: u32, wp: WPARAM, lp: LPARAM, _id: usize, _data: usize) -> LRESULT {
        if msg == WM_COMMAND && (wp.0 >> 16) & 0xFFFF == THBN_CLICKED {
            if let Some(f) = THUMB_CLICK.get() {
                let id = (wp.0 & 0xFFFF) as u32;
                std::thread::spawn(move || f(id));
            }
        }
        DefSubclassProc(h, msg, wp, lp)
    }

    fn icon_for(glyph: &str) -> Option<HICON> {
        let bmp = badge::glyph(glyph)?;
        unsafe {
            let color: HBITMAP = CreateBitmap(16, 16, 1, 32, Some(bmp.data.as_ptr() as *const _));
            let mask_bits = [0u8; 32];
            let mask: HBITMAP = CreateBitmap(16, 16, 1, 1, Some(mask_bits.as_ptr() as *const _));
            let info = ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color };
            let icon = CreateIconIndirect(&info).ok();
            let _ = DeleteObject(color.into());
            let _ = DeleteObject(mask.into());
            icon
        }
    }

    /// Up to three buttons; an empty list hides them (ThumbBarAddButtons works once per window,
    /// later changes go through ThumbBarUpdateButtons). Call on the UI thread.
    pub fn set_thumb_buttons(h: isize, buttons: &[ThumbButton], on_click: fn(u32)) {
        let _ = THUMB_CLICK.set(on_click);
        let hw = hwnd(h);
        unsafe {
            let Ok(tb) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER) else { return };
            if tb.HrInit().is_err() {
                return;
            }
            let mut guard = THUMB.lock().unwrap_or_else(|e| e.into_inner());
            let state = guard.get_or_insert(ThumbState { added: false, icons: Vec::new() });
            for i in state.icons.drain(..) {
                let _ = DestroyIcon(HICON(i as *mut core::ffi::c_void));
            }
            let mut list: Vec<THUMBBUTTON> = Vec::new();
            for slot in 0..3u32 {
                let mut b = THUMBBUTTON { dwMask: THUMBBUTTONMASK(THB_ICON.0 | THB_TOOLTIP.0 | THB_FLAGS.0), iId: slot + 1, ..Default::default() };
                match buttons.get(slot as usize) {
                    Some(btn) => {
                        b.iId = btn.id;
                        if let Some(icon) = icon_for(btn.glyph) {
                            state.icons.push(icon.0 as isize);
                            b.hIcon = icon;
                        }
                        let tip: Vec<u16> = btn.tip.encode_utf16().take(259).collect();
                        b.szTip[..tip.len()].copy_from_slice(&tip);
                        b.dwFlags = THBF_ENABLED;
                    }
                    None => b.dwFlags = THBF_HIDDEN,
                }
                list.push(b);
            }
            if !state.added {
                let _ = SetWindowSubclass(hw, Some(thumb_proc), SUBCLASS_ID, 0);
                state.added = tb.ThumbBarAddButtons(hw, &list).is_ok();
            } else {
                let _ = tb.ThumbBarUpdateButtons(hw, &list);
            }
        }
    }
}
