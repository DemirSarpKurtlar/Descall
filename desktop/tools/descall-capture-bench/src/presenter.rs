//! The test window: a D3D11 flip-model swap chain presenting every vsync, with the barcode
//! (Present time + frame counter) in the top rows. `Content::Video` clears to a colour that
//! changes every frame (so every vsync is a new captured frame); `Content::Pattern` shows
//! six grey bands (sRGB 0, 51, 102, 153, 204, 255) for the colour / HDR checks.
//!
//! The window lives on its own thread with its own message loop, so the tests can move,
//! resize, cover and close it from the main thread like a user would.

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Arc, Once};
use std::thread::JoinHandle;

use windows::core::{w, Interface, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Gdi::ValidateRect;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::barcode;

pub const BANDS: [u8; 6] = [0, 51, 102, 153, 204, 255];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Content {
    Video,
    Pattern,
}

#[derive(Debug, Clone)]
pub struct Opts {
    pub x: i32,
    pub y: i32,
    /// Client size.
    pub width: i32,
    pub height: i32,
    /// Borderless popup (exact client size, used for the measured runs) or a normal
    /// captioned window (the follow tests).
    pub popup: bool,
    pub topmost: bool,
    pub title: String,
    pub content: Content,
}

pub struct Presenter {
    hwnd: Arc<AtomicIsize>,
    frames: Arc<AtomicU64>,
    alive: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

const CLASS: PCWSTR = w!("DescallCaptureBenchWindow");

extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_GETMINMAXINFO => {
                // Allow windows larger than the monitor (1440p test window on a 1080p screen).
                let mmi = &mut *(lp.0 as *mut MINMAXINFO);
                mmi.ptMaxTrackSize = POINT { x: 8192, y: 8192 };
                mmi.ptMaxSize = POINT { x: 8192, y: 8192 };
                LRESULT(0)
            }
            WM_PAINT => {
                let _ = ValidateRect(Some(hwnd), None);
                LRESULT(0)
            }
            WM_CLOSE => {
                // Leave the render loop first; the loop releases the swap chain and only then
                // destroys the window (a swap chain must not outlive its HWND).
                PostQuitMessage(0);
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wp, lp),
        }
    }
}

fn register_class() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| unsafe {
        let hinst = GetModuleHandleW(None).unwrap_or_default();
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(wndproc),
            hInstance: hinst.into(),
            lpszClassName: CLASS,
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            ..Default::default()
        };
        RegisterClassExW(&wc);
    });
}

struct Gfx {
    device: ID3D11Device,
    ctx: ID3D11DeviceContext,
    swap: IDXGISwapChain1,
    w: u32,
    h: u32,
    bar_tex: Option<ID3D11Texture2D>,
    pattern_tex: Option<ID3D11Texture2D>,
}

fn tex(device: &ID3D11Device, w: u32, h: u32, init: Option<&[u8]>) -> Option<ID3D11Texture2D> {
    let d = D3D11_TEXTURE2D_DESC {
        Width: w,
        Height: h,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: 0,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let data = init.map(|b| D3D11_SUBRESOURCE_DATA { pSysMem: b.as_ptr() as _, SysMemPitch: w * 4, SysMemSlicePitch: 0 });
    let mut t = None;
    unsafe { device.CreateTexture2D(&d, data.as_ref().map(|d| d as *const _), Some(&mut t)).ok()? };
    t
}

fn pattern_pixels(w: usize, h: usize) -> Vec<u8> {
    let mut v = vec![0u8; w * h * 4];
    for y in 0..h {
        for x in 0..w {
            let g = BANDS[(x * BANDS.len() / w.max(1)).min(BANDS.len() - 1)];
            v[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&[g, g, g, 255]);
        }
    }
    v
}

impl Gfx {
    fn new(hwnd: HWND, content: Content) -> windows::core::Result<Gfx> {
        let mut device = None;
        let mut ctx = None;
        unsafe {
            D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, Default::default(), D3D11_CREATE_DEVICE_BGRA_SUPPORT, None, D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut ctx))
                .or_else(|_| D3D11CreateDevice(None, windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_WARP, Default::default(), D3D11_CREATE_DEVICE_BGRA_SUPPORT, None, D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut ctx)))?;
        }
        let device: ID3D11Device = device.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?;
        let ctx = ctx.ok_or_else(|| windows::core::Error::from(windows::Win32::Foundation::E_FAIL))?;
        let factory: IDXGIFactory2 = unsafe { device.cast::<IDXGIDevice>()?.GetAdapter()?.GetParent()? };
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: 0,
            Height: 0,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
            AlphaMode: DXGI_ALPHA_MODE_IGNORE,
            Flags: 0,
            Stereo: false.into(),
        };
        let swap = unsafe { factory.CreateSwapChainForHwnd(&device, hwnd, &desc, None, None)? };
        let _ = unsafe { factory.MakeWindowAssociation(hwnd, DXGI_MWA_NO_ALT_ENTER) };
        let mut g = Gfx { device, ctx, swap, w: 0, h: 0, bar_tex: None, pattern_tex: None };
        g.sync_size(hwnd, content)?;
        Ok(g)
    }

    fn sync_size(&mut self, hwnd: HWND, content: Content) -> windows::core::Result<bool> {
        let mut rc = RECT::default();
        unsafe { GetClientRect(hwnd, &mut rc)? };
        let (w, h) = ((rc.right - rc.left).max(0) as u32, (rc.bottom - rc.top).max(0) as u32);
        if w == 0 || h == 0 {
            return Ok(false);
        }
        if (w, h) != (self.w, self.h) {
            unsafe {
                self.ctx.ClearState();
                self.swap.ResizeBuffers(0, w, h, DXGI_FORMAT_UNKNOWN, DXGI_SWAP_CHAIN_FLAG(0))?;
            }
            self.w = w;
            self.h = h;
            self.bar_tex = tex(&self.device, w, barcode::BAR_H as u32, None);
            self.pattern_tex = if content == Content::Pattern { tex(&self.device, w, h, Some(&pattern_pixels(w as usize, h as usize))) } else { None };
        }
        Ok(true)
    }

    fn frame(&mut self, content: Content, counter: u32, bar: &mut Vec<u8>) -> windows::core::Result<()> {
        unsafe {
            let bb: ID3D11Texture2D = self.swap.GetBuffer(0)?;
            match (&self.pattern_tex, content) {
                (Some(p), Content::Pattern) => self.ctx.CopyResource(&bb, p),
                _ => {
                    let mut rtv = None;
                    self.device.CreateRenderTargetView(&bb, None, Some(&mut rtv))?;
                    if let Some(rtv) = rtv {
                        let k = (counter % 120) as f32 / 120.0;
                        self.ctx.ClearRenderTargetView(&rtv, &[0.15 + 0.6 * k, 0.35, 0.85 - 0.6 * k, 1.0]);
                    }
                }
            }
            if let Some(bt) = &self.bar_tex {
                let now = descall_capture::clock::now_us();
                barcode::encode(self.w as usize, now, counter, bar);
                self.ctx.UpdateSubresource(bt, 0, None, bar.as_ptr() as _, self.w * 4, 0);
                let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: self.w, bottom: (barcode::BAR_H as u32).min(self.h), back: 1 };
                self.ctx.CopySubresourceRegion(&bb, 0, 0, 0, 0, bt, 0, Some(&bx));
            }
            let _ = self.swap.Present(1, DXGI_PRESENT(0));
        }
        Ok(())
    }
}

impl Presenter {
    pub fn spawn(opts: Opts) -> Result<Presenter, String> {
        register_class();
        let hwnd = Arc::new(AtomicIsize::new(0));
        let frames = Arc::new(AtomicU64::new(0));
        let alive = Arc::new(AtomicBool::new(true));
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let (h2, f2, a2) = (hwnd.clone(), frames.clone(), alive.clone());
        let thread = std::thread::Builder::new()
            .name("bench-presenter".into())
            .spawn(move || {
                // No WS_EX_NOACTIVATE: Windows.Graphics.Capture only captures windows a user
                // could pick, and a never-activating popup is not one of them.
                let (style, ex) = if opts.popup { (WS_POPUP | WS_VISIBLE, WINDOW_EX_STYLE(0)) } else { (WS_OVERLAPPEDWINDOW | WS_VISIBLE, WINDOW_EX_STYLE(0)) };
                let ex = if opts.topmost { ex | WS_EX_TOPMOST } else { ex };
                let mut rc = RECT { left: 0, top: 0, right: opts.width, bottom: opts.height };
                unsafe {
                    let _ = AdjustWindowRectEx(&mut rc, style, false, ex);
                }
                let title: Vec<u16> = opts.title.encode_utf16().chain([0]).collect();
                let created = unsafe {
                    CreateWindowExW(ex, CLASS, PCWSTR(title.as_ptr()), style, opts.x, opts.y, rc.right - rc.left, rc.bottom - rc.top, None, None, GetModuleHandleW(None).ok().map(|h| h.into()), None)
                };
                let hw = match created {
                    Ok(h) => h,
                    Err(e) => {
                        let _ = tx.send(Err(format!("CreateWindowEx: {e}")));
                        a2.store(false, Ordering::Release);
                        return;
                    }
                };
                h2.store(hw.0 as isize, Ordering::Release);
                let mut gfx = match Gfx::new(hw, opts.content) {
                    Ok(g) => g,
                    Err(e) => {
                        let _ = tx.send(Err(format!("swap chain: {e}")));
                        unsafe {
                            let _ = DestroyWindow(hw);
                        }
                        a2.store(false, Ordering::Release);
                        return;
                    }
                };
                let _ = tx.send(Ok(()));
                let mut bar = Vec::new();
                let mut counter: u32 = 0;
                let mut msg = MSG::default();
                'run: loop {
                    unsafe {
                        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                            if msg.message == WM_QUIT {
                                break 'run;
                            }
                            let _ = TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }
                    }
                    match gfx.sync_size(hw, opts.content) {
                        Ok(true) => {
                            counter = counter.wrapping_add(1);
                            if gfx.frame(opts.content, counter, &mut bar).is_ok() {
                                f2.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                        _ => std::thread::sleep(std::time::Duration::from_millis(10)),
                    }
                }
                drop(gfx);
                unsafe {
                    let _ = DestroyWindow(hw);
                }
                a2.store(false, Ordering::Release);
            })
            .map_err(|e| e.to_string())?;
        match rx.recv() {
            Ok(Ok(())) => Ok(Presenter { hwnd, frames, alive, thread: Some(thread) }),
            Ok(Err(e)) => {
                let _ = thread.join();
                Err(e)
            }
            Err(_) => Err("presenter thread died".into()),
        }
    }

    pub fn hwnd(&self) -> isize {
        self.hwnd.load(Ordering::Acquire)
    }

    pub fn frames(&self) -> u64 {
        self.frames.load(Ordering::Relaxed)
    }

    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }

    fn h(&self) -> HWND {
        HWND(self.hwnd() as *mut _)
    }

    pub fn move_to(&self, x: i32, y: i32) {
        unsafe {
            let _ = SetWindowPos(self.h(), None, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }

    /// Resize the outer window so the client area is `w` x `h`.
    pub fn resize_client(&self, w: i32, h: i32) {
        unsafe {
            let style = WINDOW_STYLE(GetWindowLongW(self.h(), GWL_STYLE) as u32);
            let ex = WINDOW_EX_STYLE(GetWindowLongW(self.h(), GWL_EXSTYLE) as u32);
            let mut rc = RECT { left: 0, top: 0, right: w, bottom: h };
            let _ = AdjustWindowRectEx(&mut rc, style, false, ex);
            let _ = SetWindowPos(self.h(), None, 0, 0, rc.right - rc.left, rc.bottom - rc.top, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }

    pub fn window_rect(&self) -> RECT {
        let mut rc = RECT::default();
        unsafe {
            let _ = GetWindowRect(self.h(), &mut rc);
        }
        rc
    }

    /// Ask the window to close (like the user clicking X) without waiting.
    pub fn request_close(&self) {
        unsafe {
            let _ = PostMessageW(Some(self.h()), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }

    pub fn close(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        if self.alive() {
            self.request_close();
        }
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Presenter {
    fn drop(&mut self) {
        self.shutdown();
    }
}
