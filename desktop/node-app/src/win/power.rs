//! Session end and sleep. A hidden top-level window (message-only windows do not get these
//! broadcasts) on its own thread:
//!
//! * WM_QUERYENDSESSION: the shutdown / sign-out starts. A block reason is set ("Descall Node
//!   moves users to Render") and the supervisor starts draining; the answer is TRUE (never veto).
//! * WM_ENDSESSION (TRUE): Windows kills the process after this returns, so it waits here
//!   until the supervisor reports Exit (drain done, children stopped) or 11 s passed.
//! * PBT_APMSUSPEND: sleep. Windows does not wait for apps here (about 2 s at best), so the
//!   drain is best effort; clients that miss it reconnect to Render within 2-5 s.
//! * PBT_APMRESUMEAUTOMATIC: back from sleep, start again.

use std::sync::mpsc::Sender;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use descall_node::supervisor::Event;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Shutdown::{ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy};
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::runner::{Msg, Signals};

struct Ctx {
    tx: std::sync::Mutex<Sender<Msg>>,
    signals: Arc<Signals>,
}

static CTX: OnceLock<Ctx> = OnceLock::new();

fn send(ev: Event) {
    if let Some(c) = CTX.get() {
        if let Ok(tx) = c.tx.lock() {
            let _ = tx.send(Msg::Event(ev));
        }
    }
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_QUERYENDSESSION => {
            let reason: Vec<u16> = "Descall Node kullanıcıları Render'a aktarıyor".encode_utf16().chain(Some(0)).collect();
            let _ = unsafe { ShutdownBlockReasonCreate(hwnd, PCWSTR(reason.as_ptr())) };
            log::info!("[power] session ending: draining");
            send(Event::Shutdown);
            LRESULT(1)
        }
        WM_ENDSESSION => {
            if wp.0 != 0 {
                if let Some(c) = CTX.get() {
                    c.signals.wait_exit(Duration::from_secs(11));
                }
            }
            let _ = unsafe { ShutdownBlockReasonDestroy(hwnd) };
            LRESULT(0)
        }
        WM_POWERBROADCAST => {
            match wp.0 as u32 {
                PBT_APMSUSPEND => {
                    log::info!("[power] suspend: draining");
                    send(Event::Suspend);
                    if let Some(c) = CTX.get() {
                        c.signals.wait_paused(Duration::from_secs(10));
                    }
                }
                PBT_APMRESUMEAUTOMATIC => {
                    log::info!("[power] resumed");
                    send(Event::PowerResume);
                }
                _ => {}
            }
            LRESULT(1)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wp, lp) },
    }
}

pub fn start(tx: Sender<Msg>, signals: Arc<Signals>) {
    if CTX.set(Ctx { tx: std::sync::Mutex::new(tx), signals }).is_err() {
        return;
    }
    let _ = std::thread::Builder::new().name("descall-node-power".into()).spawn(|| unsafe {
        let Ok(module) = GetModuleHandleW(None) else { return };
        let class = w!("DescallNodePowerWatcher");
        let wc = WNDCLASSW { lpfnWndProc: Some(wndproc), hInstance: module.into(), lpszClassName: class, ..Default::default() };
        if RegisterClassW(&wc) == 0 {
            log::warn!("[power] window class failed");
            return;
        }
        let hwnd = match CreateWindowExW(WINDOW_EX_STYLE(0), class, w!("Descall Node"), WS_OVERLAPPED, 0, 0, 0, 0, None, None, Some(module.into()), None) {
            Ok(h) => h,
            Err(e) => {
                log::warn!("[power] window failed: {e}");
                return;
            }
        };
        let _ = hwnd;
        let mut m = MSG::default();
        while GetMessageW(&mut m, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&m);
            DispatchMessageW(&m);
        }
    });
}
