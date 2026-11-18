//! Frameless transparent window (tao) hosting the WebView2 UI (wry). The UI files are compiled
//! in and served from `https://setup.localhost/` with a strict CSP; nothing is fetched remotely.
//!
//! Threads: this module owns the UI thread (event loop). The engine runs on a worker thread,
//! talks to the page through `Ui` (an event-loop proxy) and receives page intent as `Cmd`.

use serde_json::Value;
use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::platform::windows::{IconExtWindows, WindowBuilderExtWindows, WindowExtWindows};
use tao::window::{Icon, WindowBuilder};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETWORKAREA, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};
use wry::http::{header, Request, Response, StatusCode};
use wry::{WebContext, WebViewBuilder, WebViewBuilderExtWindows};

use super::shell;

const ASSETS: &[(&str, &str, &[u8])] = &[
    ("index.html", "text/html; charset=utf-8", include_bytes!("../../ui/index.html")),
    ("draft.css", "text/css; charset=utf-8", include_bytes!("../../ui/draft.css")),
    ("app.css", "text/css; charset=utf-8", include_bytes!("../../ui/app.css")),
    ("i18n.js", "text/javascript; charset=utf-8", include_bytes!("../../ui/i18n.js")),
    ("icons.js", "text/javascript; charset=utf-8", include_bytes!("../../ui/icons.js")),
    ("app.js", "text/javascript; charset=utf-8", include_bytes!("../../ui/app.js")),
    ("fonts/inter-400.woff2", "font/woff2", include_bytes!("../../ui/fonts/inter-400.woff2")),
    ("fonts/inter-500.woff2", "font/woff2", include_bytes!("../../ui/fonts/inter-500.woff2")),
    ("fonts/inter-600.woff2", "font/woff2", include_bytes!("../../ui/fonts/inter-600.woff2")),
    ("fonts/inter-700.woff2", "font/woff2", include_bytes!("../../ui/fonts/inter-700.woff2")),
    ("fonts/inter-display-700.woff2", "font/woff2", include_bytes!("../../ui/fonts/inter-display-700.woff2")),
    ("fonts/mono-400.woff2", "font/woff2", include_bytes!("../../ui/fonts/mono-400.woff2")),
];
const CSP: &str = "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
const ORIGIN: &str = "https://setup.localhost/";

#[derive(Debug)]
pub enum UserEvent {
    Eval(String),
    Exit(i32),
    Minimize,
    Drag,
    Resize(f64, f64),
    Copy(String),
    Browse(PathBuf),
}

/// Messages from the page (and the folder picker, and background jobs) to the engine.
pub enum Cmd {
    Ready,
    Page(String, Value),
    Browsed(PathBuf),
    /// Window closed by the system (Alt+F4, taskbar "Close window").
    SystemClose,
    Job(Box<super::JobOutcome>),
}

#[derive(Clone)]
pub struct Ui {
    proxy: EventLoopProxy<UserEvent>,
}

impl Ui {
    pub fn patch(&self, v: Value) {
        let _ = self.proxy.send_event(UserEvent::Eval(format!("window.__setup.patch({v})")));
    }
    pub fn log(&self, entry: Value) {
        let _ = self.proxy.send_event(UserEvent::Eval(format!("window.__setup.log({entry})")));
    }
    pub fn exit(&self, code: i32) {
        let _ = self.proxy.send_event(UserEvent::Exit(code));
    }
    pub fn copy(&self, text: String) {
        let _ = self.proxy.send_event(UserEvent::Copy(text));
    }
    pub fn browse(&self, start: PathBuf) {
        let _ = self.proxy.send_event(UserEvent::Browse(start));
    }
    pub fn minimize(&self) {
        let _ = self.proxy.send_event(UserEvent::Minimize);
    }
    pub fn drag(&self) {
        let _ = self.proxy.send_event(UserEvent::Drag);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// 900 x 560 draft B window, centered.
    Main,
    /// 452 px update toast, bottom right, always on top.
    Toast,
}

fn work_area() -> RECT {
    let mut r = RECT::default();
    unsafe {
        let _ = SystemParametersInfoW(SPI_GETWORKAREA, 0, Some(&mut r as *mut RECT as *mut _), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
    }
    r
}

/// Runs the UI on this thread until the engine calls `Ui::exit`. `start` gets the `Ui` handle
/// and spawns the engine; `cmds` receives page intent.
pub fn run(kind: Kind, title: &str, data_dir: PathBuf, reduced_motion: bool, cmds: Sender<Cmd>, start: impl FnOnce(Ui)) -> ! {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let ui = Ui { proxy: event_loop.create_proxy() };
    let (w, h) = match kind {
        Kind::Main => (900.0, 560.0),
        Kind::Toast => (452.0, 150.0),
    };
    let mut wb = WindowBuilder::new()
        .with_title(title)
        .with_inner_size(LogicalSize::new(w, h))
        .with_resizable(false)
        .with_maximizable(false)
        .with_decorations(false)
        .with_transparent(true)
        .with_visible(false)
        .with_undecorated_shadow(false)
        .with_window_icon(Icon::from_resource(1, None).ok());
    if kind == Kind::Toast {
        wb = wb.with_always_on_top(true);
    }
    let window = wb.build(&event_loop).expect("window");
    let hwnd = HWND(window.hwnd() as *mut _);
    let scale = window.scale_factor();
    let place = move |window: &tao::window::Window, w: f64, h: f64| {
        let wa = work_area();
        let (pw, ph) = (w * scale, h * scale);
        let (x, y) = match kind {
            Kind::Main => (wa.left as f64 + ((wa.right - wa.left) as f64 - pw) / 2.0, wa.top as f64 + ((wa.bottom - wa.top) as f64 - ph) / 2.0),
            Kind::Toast => (wa.right as f64 - pw - 16.0 * scale, wa.bottom as f64 - ph - 16.0 * scale),
        };
        window.set_outer_position(PhysicalPosition::new(x.max(0.0), y.max(0.0)));
    };
    place(&window, w, h);

    let mut ctx = WebContext::new(Some(data_dir));
    let ipc_tx = cmds.clone();
    let ipc_ui = ui.clone();
    let init = format!(
        "document.documentElement.classList.add('exe'{});",
        if reduced_motion { ",'rm'" } else { "" }
    );
    let webview = WebViewBuilder::new_with_web_context(&mut ctx)
        .with_https_scheme(true)
        .with_transparent(true)
        .with_background_color((0, 0, 0, 0))
        .with_devtools(cfg!(debug_assertions))
        .with_hotkeys_zoom(false)
        .with_browser_accelerator_keys(false)
        .with_default_context_menus(false)
        .with_clipboard(false)
        .with_initialization_script(init)
        .with_custom_protocol("setup".into(), |_id, req: Request<Vec<u8>>| {
            let path = req.uri().path().trim_start_matches('/');
            let path = if path.is_empty() { "index.html" } else { path };
            match ASSETS.iter().find(|(p, _, _)| *p == path) {
                Some((_, mime, body)) => Response::builder()
                    .header(header::CONTENT_TYPE, *mime)
                    .header("Content-Security-Policy", CSP)
                    .header(header::CACHE_CONTROL, "no-store")
                    .body(Cow::Borrowed(*body))
                    .unwrap_or_else(|_| Response::new(Cow::Borrowed(&b""[..]))),
                None => Response::builder().status(StatusCode::NOT_FOUND).body(Cow::Borrowed(&b""[..])).unwrap_or_else(|_| Response::new(Cow::Borrowed(&b""[..]))),
            }
        })
        .with_navigation_handler(|url| url.starts_with(ORIGIN))
        .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
        .with_ipc_handler(move |req: Request<String>| {
            let Ok(v) = serde_json::from_str::<Value>(req.body()) else { return };
            let cmd = v.get("cmd").and_then(Value::as_str).unwrap_or("").to_string();
            match cmd.as_str() {
                "ready" => {
                    let _ = ipc_tx.send(Cmd::Ready);
                }
                "drag" => ipc_ui.drag(),
                "minimize" => ipc_ui.minimize(),
                "resize" => {
                    let w = v.get("w").and_then(Value::as_f64).unwrap_or(452.0);
                    let h = v.get("h").and_then(Value::as_f64).unwrap_or(150.0);
                    let _ = ipc_ui.proxy.send_event(UserEvent::Resize(w, h));
                }
                _ => {
                    let _ = ipc_tx.send(Cmd::Page(cmd, v));
                }
            }
        })
        .with_url(format!("{ORIGIN}index.html"))
        .build(&window)
        .expect("webview");

    start(ui.clone());

    let mut ready = false;
    let mut pending: Vec<String> = vec![];
    let close_tx = cmds;
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        let _keep = &ctx;
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                let _ = close_tx.send(Cmd::SystemClose);
            }
            Event::UserEvent(ev) => match ev {
                UserEvent::Eval(js) => {
                    if ready {
                        let _ = webview.evaluate_script(&js);
                    } else {
                        pending.push(js);
                    }
                }
                UserEvent::Exit(code) => *flow = ControlFlow::ExitWithCode(code),
                UserEvent::Minimize => window.set_minimized(true),
                UserEvent::Drag => {
                    let _ = window.drag_window();
                }
                UserEvent::Resize(w, h) => {
                    window.set_inner_size(LogicalSize::new(w, h));
                    let _ = webview.set_bounds(wry::Rect { position: tao::dpi::LogicalPosition::new(0.0, 0.0).into(), size: LogicalSize::new(w, h).into() });
                    place(&window, w, h);
                }
                UserEvent::Copy(text) => {
                    shell::copy_text(hwnd, &text);
                }
                UserEvent::Browse(start) => {
                    if let Some(p) = shell::pick_folder(hwnd, &start) {
                        let _ = close_tx.send(Cmd::Browsed(p));
                    }
                }
            },
            _ => {}
        }
        if !ready {
            // The engine flips READY (Ui::mark_ready) once the page reported in.
            if let Ok(flag) = READY.lock() {
                if *flag {
                    ready = true;
                    for js in pending.drain(..) {
                        let _ = webview.evaluate_script(&js);
                    }
                    window.set_visible(true);
                    window.set_focus();
                }
            }
        }
    })
}

static READY: std::sync::Mutex<bool> = std::sync::Mutex::new(false);

impl Ui {
    /// Called by the engine when the page said "ready": flush queued patches and show the window.
    pub fn mark_ready(&self) {
        if let Ok(mut f) = READY.lock() {
            *f = true;
        }
        let _ = self.proxy.send_event(UserEvent::Eval(String::from("void 0")));
    }
}
