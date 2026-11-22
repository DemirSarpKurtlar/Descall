//! Windows 11 Snap layouts on the page's maximize button (rules and tests in
//! descall_shell::snap).
//!
//! The page reports where its maximize button is (electron-api-shim.js, `[data-snap-layout]`).
//! Over it the shell keeps a small invisible child window of its own, above the webview: it
//! answers WM_NCHITTEST with HTMAXBUTTON, so Windows shows the snap layout flyout on hover
//! (the WebView2 windows of another process answered that hit test before, and never with
//! HTMAXBUTTON). Since the page no longer sees the pointer there, the sink does the button's
//! work: a click maximizes or restores (WM_SYSCOMMAND, like the native caption button),
//! right-click opens the window menu, and hover / press go back to the page as
//! `window:snap-state` for the button's look. Same design as the drag bar input sink of
//! Windows Terminal. Windows 10 (no flyout) and the support kill switch leave the button to
//! the page as before.

use descall_shell::snap::CssRect;
#[cfg(windows)]
use tauri::Manager;
use tauri::WebviewWindow;

/// window_snap_button: where the calling window's maximize button is (None: no button).
#[tauri::command]
pub async fn window_snap_button(window: WebviewWindow, rect: Option<CssRect>) {
    #[cfg(windows)]
    {
        if !win::enabled(window.app_handle()) {
            return;
        }
        let Ok(h) = window.hwnd() else { return };
        let parent = h.0 as isize;
        let scale = window.scale_factor().unwrap_or(1.0);
        let w = window.clone();
        let _ = window.run_on_main_thread(move || win::update(&w, parent, rect, scale));
    }
    #[cfg(not(windows))]
    {
        let _ = (window, rect);
    }
}

#[cfg(windows)]
mod win {
    use std::sync::OnceLock;

    use descall_shell::snap::{self, Action, CssRect, Pointer, PxRect, Visual};
    use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent, Wry};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Controls::WM_MOUSELEAVE;
    use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, FindWindowExW, GetClientRect, GetParent, GetWindowLongPtrW, IsIconic, IsWindow, IsZoomed, PostMessageW, RegisterClassExW, SetWindowLongPtrW, SetWindowPos,
        ShowWindow, CREATESTRUCTW, GWLP_USERDATA, HTMAXBUTTON, HTTRANSPARENT, HWND_TOP, SC_MAXIMIZE, SC_RESTORE, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_SHOWWINDOW, SW_HIDE, WINDOW_EX_STYLE, WM_ERASEBKGND,
        WM_NCCREATE, WM_NCDESTROY, WM_NCHITTEST, WM_NCLBUTTONDBLCLK, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE, WM_NCRBUTTONDOWN, WM_NCRBUTTONUP,
        WM_SYSCOMMAND, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS, WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP,
    };

    const CLASS: PCWSTR = w!("DESCALL_SNAP_SINK");

    struct Sink {
        app: AppHandle<Wry>,
        label: String,
        visual: Visual,
        tracking: bool,
        /// Last rectangle in client pixels and its distance from the right edge (the window
        /// buttons are right-aligned: a resize keeps the sink on the button until the page
        /// reports again).
        rect: Option<PxRect>,
        right: i32,
        /// Top resize border in pixels: left to the window (not over a maximized window).
        border: i32,
    }

    /// Windows 11 and no kill switch (descall_shell::snap::sink_enabled), decided once.
    pub fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
        static ON: OnceLock<bool> = OnceLock::new();
        *ON.get_or_init(|| {
            let build = windows_registry::LOCAL_MACHINE
                .open(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
                .and_then(|k| k.get_string("CurrentBuildNumber"))
                .ok()
                .and_then(|s| snap::parse_build(&s));
            let off = crate::state::data_dir(app).is_some_and(|d| d.join(snap::DISABLE_FILE).exists());
            let on = snap::sink_enabled(build, off);
            log::info!("[snap] layouts sink {} (build {build:?})", if on { "on" } else { "off" });
            on
        })
    }

    fn register_class() -> bool {
        static OK: OnceLock<bool> = OnceLock::new();
        *OK.get_or_init(|| unsafe {
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(sink_proc),
                hInstance: GetModuleHandleW(None).map(|h| HINSTANCE(h.0)).unwrap_or_default(),
                lpszClassName: CLASS,
                ..Default::default()
            };
            RegisterClassExW(&class) != 0
        })
    }

    fn hwnd(v: isize) -> HWND {
        HWND(v as *mut core::ffi::c_void)
    }

    unsafe fn sink_data<'a>(h: HWND) -> Option<&'a mut Sink> {
        let p = unsafe { GetWindowLongPtrW(h, GWLP_USERDATA) } as *mut Sink;
        unsafe { p.as_mut() }
    }

    fn client_size(parent: HWND) -> (i32, i32) {
        let mut rc = RECT::default();
        if unsafe { GetClientRect(parent, &mut rc) }.is_err() {
            return (0, 0);
        }
        (rc.right - rc.left, rc.bottom - rc.top)
    }

    fn place(sink: HWND, r: PxRect) {
        unsafe {
            let _ = SetWindowPos(sink, Some(HWND_TOP), r.x, r.y, r.width, r.height, SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW);
        }
    }

    /// Off the button. `forget`: the page has no button now; otherwise (minimized, does not fit
    /// for the moment) the next resize puts it back where the page last saw its button.
    fn hide(sink: HWND, forget: bool) {
        unsafe {
            let _ = ShowWindow(sink, SW_HIDE);
            if let Some(d) = sink_data(sink) {
                if forget {
                    d.rect = None;
                }
                set_visual(d, Visual::None);
            }
        }
    }

    fn set_visual(d: &mut Sink, v: Visual) {
        if d.visual != v {
            d.visual = v;
            let _ = d.app.emit_to(d.label.as_str(), "window:snap-state", v.as_str());
        }
    }

    /// The sink of this window, created on first use. None when Windows refused it: the
    /// button then simply stays page content.
    fn sink_for(window: &WebviewWindow, parent: HWND) -> Option<HWND> {
        if let Ok(h) = unsafe { FindWindowExW(Some(parent), None, CLASS, PCWSTR::null()) } {
            return Some(h);
        }
        if !register_class() {
            return None;
        }
        let data = Box::into_raw(Box::new(Sink { app: window.app_handle().clone(), label: window.label().to_string(), visual: Visual::None, tracking: false, rect: None, right: 0, border: 0 }));
        let hinst = unsafe { GetModuleHandleW(None) }.ok().map(|h| HINSTANCE(h.0));
        // A layered child without a redirection bitmap draws nothing at all (Windows 8+);
        // a plain child that never paints is the fallback.
        let mut created = None;
        for ex in [WS_EX_LAYERED | WS_EX_NOREDIRECTIONBITMAP, WINDOW_EX_STYLE::default()] {
            if let Ok(h) = unsafe { CreateWindowExW(ex, CLASS, PCWSTR::null(), WS_CHILD | WS_CLIPSIBLINGS, 0, 0, 0, 0, Some(parent), None, hinst, Some(data as *const core::ffi::c_void)) } {
                created = Some(h);
                break;
            }
        }
        let Some(sink) = created else {
            log::warn!("[snap] input sink not created; the maximize button stays page content");
            drop(unsafe { Box::from_raw(data) });
            return None;
        };
        // Follow resizes of the window until the page reports the button again.
        let (p, s) = (parent.0 as isize, sink.0 as isize);
        window.on_window_event(move |e| {
            if matches!(e, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
                follow_resize(hwnd(p), hwnd(s));
            }
        });
        Some(sink)
    }

    fn follow_resize(parent: HWND, sink: HWND) {
        unsafe {
            if !IsWindow(Some(sink)).as_bool() {
                return;
            }
            let Some(d) = sink_data(sink) else { return };
            let Some(r) = d.rect else { return };
            let (cw, ch) = client_size(parent);
            let moved = PxRect { x: cw - d.right, ..r };
            if IsIconic(parent).as_bool() || moved.x < 0 || moved.y + moved.height > ch {
                hide(sink, false);
                return;
            }
            d.rect = Some(moved);
            place(sink, moved);
        }
    }

    pub fn update(window: &WebviewWindow, parent: isize, rect: Option<CssRect>, scale: f64) {
        let parent = hwnd(parent);
        let (cw, ch) = client_size(parent);
        if cw <= 0 || ch <= 0 || unsafe { IsIconic(parent) }.as_bool() {
            // Minimized: keep what the sink knows; the restore puts it back (follow_resize).
            return;
        }
        let px = rect.and_then(|r| snap::to_physical(&r, cw, ch));
        let Some(px) = px else {
            // No button (or none that fits): an existing sink steps aside, none is created.
            if let Ok(sink) = unsafe { FindWindowExW(Some(parent), None, CLASS, PCWSTR::null()) } {
                hide(sink, true);
            }
            return;
        };
        let Some(sink) = sink_for(window, parent) else { return };
        unsafe {
            if let Some(d) = sink_data(sink) {
                d.rect = Some(px);
                d.right = cw - px.x;
                d.border = (4.0 * if scale.is_finite() && scale > 0.0 { scale } else { 1.0 }).round() as i32;
            }
        }
        place(sink, px);
    }

    fn pointer(sink: HWND, ev: Pointer) {
        let Some(d) = (unsafe { sink_data(sink) }) else { return };
        let (v, action) = snap::step(d.visual, ev);
        set_visual(d, v);
        let Ok(parent) = (unsafe { GetParent(sink) }) else { return };
        match action {
            Some(Action::ToggleMaximize) => unsafe {
                // What the native caption button does; Tauri reports the change as usual.
                let cmd = if IsZoomed(parent).as_bool() { SC_RESTORE } else { SC_MAXIMIZE };
                let _ = PostMessageW(Some(parent), WM_SYSCOMMAND, WPARAM(cmd as usize), LPARAM(0));
            },
            Some(Action::SystemMenu) => crate::commands::window::show_system_menu(parent.0 as isize),
            None => {}
        }
    }

    unsafe extern "system" fn sink_proc(h: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        unsafe {
            match msg {
                WM_NCCREATE => {
                    let cs = lp.0 as *const CREATESTRUCTW;
                    if let Some(cs) = cs.as_ref() {
                        SetWindowLongPtrW(h, GWLP_USERDATA, cs.lpCreateParams as isize);
                    }
                    DefWindowProcW(h, msg, wp, lp)
                }
                WM_NCHITTEST => {
                    // The top resize border of a restored window stays the window's.
                    if let (Some(d), Ok(parent)) = (sink_data(h), GetParent(h)) {
                        let y = (lp.0 as u32 >> 16) as i16 as i32;
                        let mut rc = RECT::default();
                        let _ = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(parent, &mut rc);
                        if !IsZoomed(parent).as_bool() && y < rc.top + d.border {
                            return LRESULT(HTTRANSPARENT as isize);
                        }
                    }
                    LRESULT(HTMAXBUTTON as isize)
                }
                WM_NCMOUSEMOVE => {
                    if let Some(d) = sink_data(h) {
                        if !d.tracking {
                            let mut t = TRACKMOUSEEVENT { cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32, dwFlags: TME_LEAVE | TME_NONCLIENT, hwndTrack: h, dwHoverTime: 0 };
                            d.tracking = TrackMouseEvent(&mut t).is_ok();
                        }
                    }
                    pointer(h, Pointer::Move);
                    // Default handling as well: Windows' own hover over HTMAXBUTTON (the flyout).
                    DefWindowProcW(h, msg, wp, lp)
                }
                WM_NCMOUSELEAVE | WM_MOUSELEAVE => {
                    if let Some(d) = sink_data(h) {
                        d.tracking = false;
                    }
                    pointer(h, Pointer::Leave);
                    LRESULT(0)
                }
                // The button's clicks are ours: DefWindowProc would track a classic caption
                // button with the system metrics.
                WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK => {
                    pointer(h, Pointer::Down);
                    LRESULT(0)
                }
                WM_NCLBUTTONUP => {
                    pointer(h, Pointer::Up);
                    LRESULT(0)
                }
                WM_NCRBUTTONDOWN => LRESULT(0),
                WM_NCRBUTTONUP => {
                    pointer(h, Pointer::RightUp);
                    LRESULT(0)
                }
                WM_ERASEBKGND => LRESULT(1),
                WM_NCDESTROY => {
                    let p = GetWindowLongPtrW(h, GWLP_USERDATA) as *mut Sink;
                    SetWindowLongPtrW(h, GWLP_USERDATA, 0);
                    if !p.is_null() {
                        drop(Box::from_raw(p));
                    }
                    DefWindowProcW(h, msg, wp, lp)
                }
                _ => DefWindowProcW(h, msg, wp, lp),
            }
        }
    }
}
