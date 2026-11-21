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
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::App(target.into()))
        .title(crate::state::et(app, title_key, &[]))
        .inner_size(w, h)
        .min_inner_size(min_w, min_h)
        .decorations(false)
        .background_color(tauri::window::Color(0x14, 0x15, 0x1e, 255))
        .use_https_scheme(true)
        .disable_drag_drop_handler() // HTML5 drops (announcement images, set builder)
        .general_autofill_enabled(false) // no browser autofill dropdown, as in Electron
        .on_download(crate::webview::on_download) // CSV / JSON exports: Downloads + Explorer
        .additional_browser_args(crate::BROWSER_ARGS)
        .initialization_script(script)
        .on_navigation(move |next| crate::boot::is_app_url(next) && spec(next.path()).map(|s| s.0) == Some(label))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build();
    match built {
        Ok(win) => {
            crate::webview::install_permission_handler(&win);
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
