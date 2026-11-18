//! Descall desktop shell (Tauri 2). Replaces frontend/electron/main.cjs.
//!
//! The page (frontend/dist, unchanged) keeps calling `window.electronAPI.*`; the shim in
//! app/shim/electron-api-shim.js maps every preload.cjs member to a command below.
//! `window.descallPremium.invoke('premium:*')` goes to commands::premium::premium_invoke.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod admin;
mod boot;
mod commands;
mod platform;
#[cfg(windows)]
mod screenshare;
mod secure_store;
mod state;
mod tray;
mod webview;

use std::sync::OnceLock;

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Electron main.cjs appendSwitch list, as WebView2 browser arguments. Tauri's own defaults
/// (msWebOOUI,msPdfOOUI,msSmartScreenProtection) must be repeated when overriding, and every
/// window must pass the same string (one WebView2 environment).
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
--autoplay-policy=no-user-gesture-required --disable-renderer-backgrounding \
--disable-background-timer-throttling --disable-backgrounding-occluded-windows";

pub const SHIM: &str = include_str!("../../shim/electron-api-shim.js");
const NATIVE_SHARE: &str = include_str!("../../shim/native-screen-share.js");

/// URL of a descall-shell:// page (served as https://descall-shell.localhost on Windows).
pub fn shell_url(page: &str) -> tauri::Url {
    tauri::Url::parse(&format!("{}://localhost/{page}", descall_shell::trust::SHELL_SCHEME)).expect("static shell url")
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Main-process errors reach the page (electronAPI.onMainError) and the log.
fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("[main] panic: {info}");
        if let Some(app) = APP.get() {
            state::to_main(app, "app:main-error", serde_json::json!({ "message": info.to_string() }));
        }
        default(info);
    }));
}

fn main() {
    install_panic_hook();
    let argv: Vec<String> = std::env::args().collect();

    let app = tauri::Builder::default()
        // Second launch (shortcut, taskbar) raises the existing window: Electron second-instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| state::show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(state::Shell::default())
        .manage(commands::notify::Notifications::default())
        .manage(commands::overlay::Overlay::default())
        .manage(commands::updates::Updates::default())
        .manage(commands::screen::ShareState::default())
        .register_uri_scheme_protocol(descall_shell::trust::SHELL_SCHEME, |_ctx, req| {
            use tauri::http::{header, Response, StatusCode};
            let (status, mime, body) = match descall_shell::pages::serve(req.uri().path()) {
                Some((mime, body)) => (StatusCode::OK, mime, body),
                None => (StatusCode::NOT_FOUND, "text/plain", b"not found".to_vec()),
            };
            Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, mime)
                .header("Content-Security-Policy", descall_shell::pages::CSP)
                .header(header::CACHE_CONTROL, "no-store")
                .body(body)
                .unwrap_or_default()
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let _ = APP.set(handle.clone());
            state::init_locale(&handle);

            // One-time Electron import (handoff file, or the OSCrypt fallback), before the
            // first page load so the boot script already carries the token and settings.
            let imported = boot::import_from_electron_once(&handle);
            let boot_js = boot::boot_script(&handle, imported.as_ref());
            let script = format!("{boot_js}\n{SHIM}\n{NATIVE_SHARE}");
            let launch = boot::cold_start(&handle, &argv);
            let ws = boot::initial_window_state(&handle);

            let nav_app = handle.clone();
            let load_app = handle.clone();
            let w = WebviewWindowBuilder::new(app, state::MAIN, WebviewUrl::App("index.html".into()))
                .title("Descall")
                .inner_size(ws.width, ws.height)
                .min_inner_size(ws.min_width, ws.min_height)
                .decorations(false)
                .visible(false)
                .background_color(tauri::window::Color(11, 12, 18, 255))
                .use_https_scheme(true) // origin https://tauri.localhost: in the backend CORS list
                .additional_browser_args(BROWSER_ARGS)
                .initialization_script(script)
                .on_navigation(boot::is_app_url)
                .on_new_window(move |url, _features| {
                    // Descall+ portal windows (window.open("about:blank")) keep their opener;
                    // any other http(s) link opens in the default browser (setWindowOpenHandler).
                    if admin::is_admin_url(&url) {
                        let h = nav_app.clone();
                        let _ = nav_app.run_on_main_thread(move || admin::open(&h, &url));
                        return NewWindowResponse::Deny;
                    }
                    if url.as_str() == "about:blank" || boot::is_app_url(&url) {
                        return NewWindowResponse::Allow;
                    }
                    if descall_shell::trust::is_safe_external_url(url.as_str()) {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                })
                .on_page_load(move |w, p| match p.event() {
                    PageLoadEvent::Started => {
                        // A reload drops any live call; the update deferral treats it as "call ended".
                        commands::updates::reset_voice(&load_app);
                        boot::arm_paint_watchdog(&w);
                    }
                    PageLoadEvent::Finished => {
                        if !state::shell(&load_app).boot.lock().unwrap().mounted && launch.action == descall_shell::launch::StartAction::Show && !w.is_visible().unwrap_or(false) {
                            state::show_main(&load_app);
                        }
                    }
                })
                .build()?;
            if let (Some(x), Some(y)) = (ws.x, ws.y) {
                let _ = w.set_position(tauri::LogicalPosition::new(x, y));
            }
            if ws.maximized {
                let _ = w.maximize();
            }
            boot::bind_window_events(&w);
            webview::install_permission_handler(&w);
            tray::create(&handle);

            use descall_shell::launch::StartAction;
            match launch.action {
                StartAction::Show => {
                    // ready-to-show fallback: show even if the page never finishes loading.
                    let h = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(descall_shell::watchdog::READY_FALLBACK_MS)).await;
                        if state::main_window(&h).is_some_and(|w| !w.is_visible().unwrap_or(true)) {
                            state::show_main(&h);
                        }
                    });
                }
                StartAction::Minimize => {
                    let _ = w.show();
                    let _ = w.minimize();
                }
                StartAction::Hide => {
                    log::info!("[boot] {:?}: window stays in the tray", launch.reason);
                }
            }

            boot::watch_reduced_transparency(&handle);
            commands::updates::schedule_background_checks(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_version,
            commands::app::app_set_locale,
            commands::app::app_boot_retry,
            commands::app::app_boot_state,
            commands::app::app_reduced_transparency,
            commands::app::voice_set_busy,
            commands::app::activity_set_busy,
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_close,
            commands::window::window_content_box,
            commands::window::window_is_focused,
            commands::window::window_focus,
            commands::window::window_set_zoom,
            commands::updates::updates_check,
            commands::updates::updates_restart,
            commands::updates::updates_status,
            commands::notify::notification_show,
            commands::notify::notification_close,
            commands::notify::notif_action,
            commands::overlay::overlay_show,
            commands::overlay::overlay_hide,
            commands::overlay::overlay_update,
            commands::overlay::overlay_action,
            commands::screen::screen_sources,
            commands::screen::screen_share_start,
            commands::screen::screen_share_stop,
            commands::screen::screen_share_update,
            commands::screen::screen_share_caps,
            commands::system::token_set,
            commands::system::token_clear,
            commands::system::clipboard_read_image,
            commands::system::clipboard_write_text,
            commands::system::processes_scan,
            commands::system::download_file,
            commands::premium::premium_invoke,
        ])
        .build(tauri::generate_context!())
        .expect("Descall failed to start");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // autoInstallOnAppQuit: a staged update installs when the app really quits.
            state::set_quitting(app);
            commands::updates::install_on_quit(app);
        }
    });
}
