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

/// Open (or focus) the admin window for `url`. Runs on the main thread.
pub fn open<R: Runtime>(app: &AppHandle<R>, url: &tauri::Url) {
    let Some((label, path, w, h, min_w, min_h, title_key)) = spec(url.path()) else { return };
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
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
                let h = nav_app.clone();
                let _ = nav_app.run_on_main_thread(move || open(&h, &next));
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
            let _ = win.set_focus();
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
