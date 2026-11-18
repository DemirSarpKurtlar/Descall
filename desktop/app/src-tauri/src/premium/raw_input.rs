//! Global push-to-talk input with Windows Raw Input (replaces uiohook-napi).
//!
//! A hidden window on its own thread registers for raw keyboard OR mouse input with
//! RIDEV_INPUTSINK, so it receives input while a fullscreen game has the focus. Raw Input only
//! observes: the key still reaches the game, nothing is blocked or injected, no hook DLL is
//! loaded into other processes (anti-cheat friendly).
//!
//! Not a keylogger: only the device class of the binding is registered (a mouse-button binding
//! never sees the keyboard), each WM_INPUT is compared with the one bound key or button inside
//! the window procedure and dropped at once; nothing else is stored, logged or forwarded. Only
//! the down / up edges of the binding leave this module. It runs only during a call.

use crate::premium::logic::ptt_logic::{Edge, HookSpec};

pub type OnEdge = Box<dyn Fn(Edge) + Send + 'static>;

pub struct Listener {
    #[cfg(windows)]
    hwnd: std::sync::Arc<std::sync::atomic::AtomicIsize>,
    #[cfg(windows)]
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Listener {
    #[cfg(not(windows))]
    pub fn start(_spec: HookSpec, _on_edge: OnEdge) -> Result<Listener, String> {
        Err("raw input needs Windows".into())
    }

    #[cfg(windows)]
    pub fn start(spec: HookSpec, on_edge: OnEdge) -> Result<Listener, String> {
        win::start(spec, on_edge)
    }

    pub fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        #[cfg(windows)]
        win::stop(self);
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

#[cfg(windows)]
mod win {
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::sync::mpsc;
    use std::sync::Arc;

    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT};
    use windows::Win32::UI::Input::{GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK, RIDEV_REMOVE, RID_INPUT, RIM_TYPEKEYBOARD, RIM_TYPEMOUSE};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW, PostQuitMessage, RegisterClassW, TranslateMessage, MSG, WINDOW_EX_STYLE, WM_CLOSE, WM_DESTROY,
        WM_INPUT, WNDCLASSW, WS_POPUP,
    };

    use super::{Listener, OnEdge};
    use crate::premium::logic::ptt_logic::{match_event, HookSpec, InputEvent};

    const RI_KEY_BREAK: u16 = 1;
    // RAWMOUSE usButtonFlags.
    const MIDDLE_DOWN: u16 = 0x0010;
    const MIDDLE_UP: u16 = 0x0020;
    const X1_DOWN: u16 = 0x0040;
    const X1_UP: u16 = 0x0080;
    const X2_DOWN: u16 = 0x0100;
    const X2_UP: u16 = 0x0200;

    struct Ctx {
        spec: HookSpec,
        on_edge: OnEdge,
    }

    thread_local! {
        static CTX: RefCell<Option<Ctx>> = const { RefCell::new(None) };
    }

    fn held(vk: u16) -> bool {
        unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
    }

    /// Turns one raw record into an event, but only when it concerns the bound key / button;
    /// everything else returns None without being looked at further.
    fn event_for(spec: &HookSpec, raw: &RAWINPUT) -> Option<InputEvent> {
        unsafe {
            match spec {
                HookSpec::Key { vk, alt_vk, .. } if raw.header.dwType == RIM_TYPEKEYBOARD.0 => {
                    let k = raw.data.keyboard;
                    if k.VKey != *vk && Some(k.VKey) != *alt_vk {
                        return None;
                    }
                    if k.Flags & RI_KEY_BREAK != 0 {
                        return Some(InputEvent::KeyUp { vk: k.VKey });
                    }
                    Some(InputEvent::KeyDown {
                        vk: k.VKey,
                        ctrl: held(VK_CONTROL.0),
                        alt: held(VK_MENU.0),
                        shift: held(VK_SHIFT.0),
                        meta: held(VK_LWIN.0) || held(VK_RWIN.0),
                    })
                }
                HookSpec::Mouse { button } if raw.header.dwType == RIM_TYPEMOUSE.0 => {
                    let f = raw.data.mouse.Anonymous.Anonymous.usButtonFlags;
                    let (down, up) = match button {
                        3 => (MIDDLE_DOWN, MIDDLE_UP),
                        4 => (X1_DOWN, X1_UP),
                        5 => (X2_DOWN, X2_UP),
                        _ => return None,
                    };
                    if f & down != 0 {
                        Some(InputEvent::MouseDown { button: *button })
                    } else if f & up != 0 {
                        Some(InputEvent::MouseUp { button: *button })
                    } else {
                        None
                    }
                }
                _ => None,
            }
        }
    }

    unsafe extern "system" fn proc(h: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        match msg {
            WM_INPUT => {
                let mut raw = RAWINPUT::default();
                let mut size = std::mem::size_of::<RAWINPUT>() as u32;
                let got = GetRawInputData(HRAWINPUT(lp.0 as *mut core::ffi::c_void), RID_INPUT, Some(&mut raw as *mut _ as *mut core::ffi::c_void), &mut size, std::mem::size_of::<RAWINPUTHEADER>() as u32);
                if got != u32::MAX && got > 0 {
                    CTX.with(|c| {
                        if let Some(ctx) = c.borrow().as_ref() {
                            if let Some(ev) = event_for(&ctx.spec, &raw) {
                                if let Some(edge) = match_event(&ctx.spec, &ev) {
                                    (ctx.on_edge)(edge);
                                }
                            }
                        }
                    });
                }
                // Raw Input in the background: DefWindowProc does the cleanup.
                DefWindowProcW(h, msg, wp, lp)
            }
            WM_CLOSE => {
                let _ = DestroyWindow(h);
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(h, msg, wp, lp),
        }
    }

    fn device(spec: &HookSpec, h: Option<HWND>, flags: windows::Win32::UI::Input::RAWINPUTDEVICE_FLAGS) -> RAWINPUTDEVICE {
        let usage = match spec {
            HookSpec::Key { .. } => 0x06,   // generic desktop: keyboard
            HookSpec::Mouse { .. } => 0x02, // generic desktop: mouse
        };
        RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: usage, dwFlags: flags, hwndTarget: h.unwrap_or_default() }
    }

    pub(super) fn start(spec: HookSpec, on_edge: OnEdge) -> Result<Listener, String> {
        let hwnd = Arc::new(AtomicIsize::new(0));
        let slot = hwnd.clone();
        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let thread = std::thread::Builder::new()
            .name("premium-ptt".into())
            .spawn(move || unsafe {
                let fail = |e: String| {
                    let _ = tx.send(Err(e));
                };
                let Ok(inst) = GetModuleHandleW(None) else { return fail("module handle".into()) };
                let class = w!("DescallPremiumPtt");
                let wc = WNDCLASSW { lpfnWndProc: Some(proc), hInstance: inst.into(), lpszClassName: class, ..Default::default() };
                RegisterClassW(&wc);
                // A plain hidden top-level window (never shown) is the INPUTSINK target.
                let h = match CreateWindowExW(WINDOW_EX_STYLE(0), class, w!(""), WS_POPUP, 0, 0, 0, 0, None, None, Some(inst.into()), None) {
                    Ok(h) => h,
                    Err(e) => return fail(e.to_string()),
                };
                CTX.with(|c| *c.borrow_mut() = Some(Ctx { spec, on_edge }));
                let dev = [device(&spec, Some(h), RIDEV_INPUTSINK)];
                if let Err(e) = RegisterRawInputDevices(&dev, std::mem::size_of::<RAWINPUTDEVICE>() as u32) {
                    let _ = DestroyWindow(h);
                    return fail(e.to_string());
                }
                slot.store(h.0 as isize, Ordering::SeqCst);
                let _ = tx.send(Ok(()));
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let gone = [device(&spec, None, RIDEV_REMOVE)];
                let _ = RegisterRawInputDevices(&gone, std::mem::size_of::<RAWINPUTDEVICE>() as u32);
                CTX.with(|c| *c.borrow_mut() = None);
            })
            .map_err(|e| e.to_string())?;
        match rx.recv() {
            Ok(Ok(())) => Ok(Listener { hwnd, thread: Some(thread) }),
            Ok(Err(e)) => {
                let _ = thread.join();
                Err(e)
            }
            Err(_) => Err("raw input thread ended".into()),
        }
    }

    pub(super) fn stop(l: &mut Listener) {
        let h = l.hwnd.swap(0, Ordering::SeqCst);
        if h != 0 {
            unsafe {
                let _ = PostMessageW(Some(HWND(h as *mut core::ffi::c_void)), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
        }
        if let Some(t) = l.thread.take() {
            let _ = t.join();
        }
    }
}
