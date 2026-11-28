//! Admin windows (electron/adminStatsWindow.cjs): Yönetici › Kayıt İstatistikleri
//! (/admin/signup-stats) and Yönetici Paneli (/admin/panel). The page opens them with
//! window.open; the shell gives each its own frameless window, one at a time, with the
//! admin variant of the shim (adminPreload.cjs: no capture, clipboard image, process list,
//! downloads, overlay or update install).

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const STATS_PATH: &str = "/admin/signup-stats";
pub const PANEL_PATH: &str = "/admin/panel";

/// (label, path, width, height, min width, min height, title key)
fn spec(path: &str) -> Option<(&'static str, &'static str, f64, f64, f64, f64, &'static str)> {
    match path.trim_end_matches('/') {
        STATS_PATH => Some(("signup-stats", STATS_PATH, 1240.0, 856.0, 900.0, 620.0, "window.signupStats")),
        PANEL_PATH => Some(("admin", PANEL_PATH, 1440.0, 900.0, 960.0, 640.0, "window.adminPanel")),
        _ => None,
    }
}

/// True when `url` is one of the admin routes of the app origin (isSignupStatsUrl / isAdminPanelUrl).
pub fn is_admin_url(url: &tauri::Url) -> bool {
    crate::boot::is_app_url(url) && spec(url.path()).is_some()
}

/// Size (logical) and top-left corner (physical) of a new admin window.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Placement {
    width: f64,
    height: f64,
    x: i32,
    y: i32,
}

/// Fit `w` x `h` into the work area of the main window's monitor (else the primary one) and
/// centre it there.
fn placement<R: Runtime>(app: &AppHandle<R>, w: f64, h: f64) -> Option<Placement> {
    let monitor = crate::state::main_window(app).and_then(|m| m.current_monitor().ok().flatten()).or_else(|| app.primary_monitor().ok().flatten())?;
    let wa = monitor.work_area();
    Some(fit_centered(w, h, (wa.position.x, wa.position.y, wa.size.width, wa.size.height), monitor.scale_factor()))
}

/// Pure part of [`placement`]: `area` is the work area in physical pixels, `scale` its DPI scale.
fn fit_centered(w: f64, h: f64, area: (i32, i32, u32, u32), scale: f64) -> Placement {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let (ax, ay, aw, ah) = (area.0, area.1, area.2 as f64 / s, area.3 as f64 / s);
    let width = w.min(aw).max(1.0).floor();
    let height = h.min(ah).max(1.0).floor();
    let x = ax + (((aw - width) / 2.0) * s).round() as i32;
    let y = ay + (((ah - height) / 2.0) * s).round() as i32;
    Placement { width, height, x, y }
}

/// Labels whose window is being built right now: a second click (or the other admin window's
/// link) while the first build runs focuses nothing and builds nothing, instead of a second
/// build of the same label (Tauri refuses it).
static OPENING: std::sync::Mutex<Vec<&'static str>> = std::sync::Mutex::new(Vec::new());

/// Claims `label` for one build; false while another build of it runs.
fn claim(list: &mut Vec<&'static str>, label: &'static str) -> bool {
    if list.contains(&label) {
        return false;
    }
    list.push(label);
    true
}

fn release(list: &mut Vec<&'static str>, label: &'static str) {
    list.retain(|l| *l != label);
}

/// Releases the claim when the build is done, also on an early return.
struct Opening(&'static str);

impl Drop for Opening {
    fn drop(&mut self) {
        release(&mut OPENING.lock().unwrap_or_else(|e| e.into_inner()), self.0);
    }
}

/// From a page's `on_new_window` (main window, or the other admin window): open or focus the
/// admin window for `url`, never inside that handler. tauri-runtime-wry runs
/// `run_on_main_thread` synchronously when it is called on the main thread, which is where wry
/// calls `on_new_window` (inside the main window's message handler, while WebView2 still holds
/// the window.open request open with a deferral). The old `run_on_main_thread(open)` therefore
/// built the admin WebView2 re-entrantly inside that request, the case Tauri documents as
/// deadlocking / crashing on Windows ("WebviewWindowBuilder::build ... in event handlers").
/// A blocking-pool thread lets the handler return first; `build()` from there hands the window
/// to the event loop and waits for it, as an async command would.
pub fn request_open<R: Runtime>(app: &AppHandle<R>, url: tauri::Url) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || open(&app, &url));
}

/// Open (or focus) the admin window for `url`. Call off the event-loop thread
/// ([`request_open`]); nothing here panics, a failure is logged and the main window stays.
fn open<R: Runtime>(app: &AppHandle<R>, url: &tauri::Url) {
    let Some((label, path, w, h, min_w, min_h, title_key)) = spec(url.path()) else { return };
    if let Some(win) = app.get_webview_window(label) {
        // Already open: bring it back. A window that is being closed answers with errors here;
        // logged, and the next click builds a fresh one.
        if let Err(e) = win.unminimize().and_then(|_| win.show()) {
            log::warn!("[admin] {label} could not be shown: {e}");
            return;
        }
        crate::commands::window::focus_soon(&win);
        return;
    }
    if !claim(&mut OPENING.lock().unwrap_or_else(|e| e.into_inner()), label) {
        log::info!("[admin] {label} is already opening");
        return;
    }
    let _opening = Opening(label);
    log::info!("[admin] opening {label}");
    let boot = crate::boot::boot_script_for(app, "admin");
    let script = format!("{boot}\n{}", crate::SHIM);
    let target = format!("{}{}", path.trim_start_matches('/'), url.query().map(|q| format!("?{q}")).unwrap_or_default());
    // 1440x900 does not fit a 1366x768 laptop or a 125 % 1080p screen: fit the work area of
    // the monitor the main window is on and centre the window there (Electron let it hang off).
    let place = placement(app, w, h);
    let (w, h) = place.map(|p| (p.width, p.height)).unwrap_or((w, h));
    let nav_app = app.clone();
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::App(target.into()))
        .devtools(crate::webview::devtools_allowed(app)) // support opt-in only (webview.rs)
        .title(crate::state::et(app, title_key, &[]))
        .inner_size(w, h)
        // Never above the fitted size: a 960 x 640 minimum on a 1366 x 768 laptop at 125 %
        // (614 px of work area) kept the bottom of the window under the taskbar.
        .min_inner_size(min_w.min(w), min_h.min(h))
        .decorations(false)
        // Shown once it sits where placement() put it (no flash at the default spot).
        .visible(false)
        .background_color(tauri::window::Color(0x14, 0x15, 0x1e, 255))
        .use_https_scheme(true)
        .disable_drag_drop_handler() // HTML5 drops (announcement images, set builder)
        .general_autofill_enabled(false) // no browser autofill dropdown, as in Electron
        .on_download(crate::webview::on_download) // CSV / JSON exports: Downloads + Explorer
        .additional_browser_args(crate::BROWSER_ARGS)
        .initialization_script(script)
        .on_navigation(move |next| crate::boot::is_app_url(next) && spec(next.path()).map(|s| s.0) == Some(label))
        // adminStatsWindow.cjs: links open in the default browser (openExternalSafely); the
        // other admin window opens as its own window, as from the main window.
        .on_new_window(move |next, _| {
            if is_admin_url(&next) {
                request_open(&nav_app, next);
            } else if !crate::boot::is_app_url(&next) && descall_shell::trust::is_safe_external_url(next.as_str()) {
                use tauri_plugin_opener::OpenerExt;
                let _ = nav_app.opener().open_url(next.as_str(), None::<&str>);
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build();
    match built {
        Ok(win) => {
            if let Some(p) = place {
                let _ = win.set_position(tauri::PhysicalPosition::new(p.x, p.y));
            }
            let _ = win.show();
            // From this thread tao queues show(); a set_focus() right after it saw the window
            // still hidden and did nothing (commands::window::focus_soon).
            crate::commands::window::focus_soon(&win);
            crate::webview::install_permission_handler(&win);
            // No browser menu / Reload / Back / Print in the admin windows either (main.rs).
            crate::webview::install_browser_guards(&win);
            let w2 = win.clone();
            win.on_window_event(move |e| {
                if let tauri::WindowEvent::Resized(_) = e {
                    use tauri::Emitter;
                    let _ = w2.emit_to(w2.label(), "window:maximized", w2.is_maximized().unwrap_or(false));
                }
            });
        }
        Err(e) => log::error!("[admin] could not open {label}: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_routes_have_their_own_window() {
        assert_eq!(spec("/admin/panel").map(|s| s.0), Some("admin"));
        assert_eq!(spec("/admin/panel/").map(|s| s.0), Some("admin"));
        assert_eq!(spec("/admin/signup-stats").map(|s| s.0), Some("signup-stats"));
        assert_eq!(spec("/admin").map(|s| s.0), None);
        assert_eq!(spec("/").map(|s| s.0), None);
    }

    #[test]
    fn one_build_per_label_at_a_time() {
        let mut list = Vec::new();
        assert!(claim(&mut list, "admin"));
        assert!(!claim(&mut list, "admin"), "a second click while the first build runs");
        assert!(claim(&mut list, "signup-stats"), "the other admin window is independent");
        release(&mut list, "admin");
        assert!(claim(&mut list, "admin"), "free again once the build is done");
    }

    /// The window is never built inside a page's `on_new_window`: tauri-runtime-wry runs
    /// `run_on_main_thread` at once when called on the main thread (where wry calls that
    /// handler), so `run_on_main_thread(open)` built the WebView2 inside the window.open request.
    #[test]
    fn admin_windows_are_built_after_the_new_window_handler() {
        let main = include_str!("main.rs");
        let admin = include_str!("admin.rs");
        let shipped = |s: &'static str| &s[..s.find("#[cfg(test)]").unwrap()];
        assert!(shipped(main).contains("admin::request_open(&nav_app, url);"));
        assert!(!shipped(main).contains("admin::open("));
        assert!(shipped(admin).contains("request_open(&nav_app, next);"));
        assert!(!shipped(admin).contains("run_on_main_thread(move || open("));
        let req = &admin[admin.find("pub fn request_open").unwrap()..];
        assert!(req[..200].contains("spawn_blocking(move || open(&app, &url))"));
        assert!(shipped(admin).contains("\nfn open<R: Runtime>"), "open stays private");
    }

    #[test]
    fn a_big_admin_window_fits_a_small_screen() {
        // 1366x768 at 100 %, taskbar 40 px: 1440x900 becomes the whole work area.
        let p = fit_centered(1440.0, 900.0, (0, 0, 1366, 728), 1.0);
        assert_eq!((p.width, p.height, p.x, p.y), (1366.0, 728.0, 0, 0));
        // 1920x1080 at 125 % (1536x832 logical work area): 1440 wide, 832 high, centred.
        let p = fit_centered(1440.0, 900.0, (0, 0, 1920, 1040), 1.25);
        assert_eq!((p.width, p.height), (1440.0, 832.0));
        assert_eq!((p.x, p.y), (60, 0));
    }

    #[test]
    fn it_is_centred_on_the_main_window_monitor() {
        // Second monitor to the right at 150 %: physical coordinates of that monitor.
        let p = fit_centered(1240.0, 856.0, (1920, 0, 3840, 2100), 1.5);
        assert_eq!((p.width, p.height), (1240.0, 856.0));
        assert_eq!((p.x, p.y), (1920 + 990, 408));
        // A bad scale never divides by zero.
        let p = fit_centered(800.0, 600.0, (0, 0, 1000, 700), 0.0);
        assert_eq!((p.width, p.height, p.x, p.y), (800.0, 600.0, 100, 50));
    }
}
