//! Descall desktop shell (Tauri 2). Replaces frontend/electron/main.cjs.
//!
//! The page (frontend/dist, unchanged) keeps calling `window.electronAPI.*`; the shim in
//! app/shim/electron-api-shim.js maps every method to a command below (see the mapping
//! table in Rust-gecis-teknik-plan.md section 4). `window.descallPremium.invoke('premium:*')`
//! goes to premium::premium_invoke (src/premium, the Descall+ desktop features).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod boot;
mod commands;
mod premium;
#[cfg(windows)]
mod screenshare;
mod secure_store;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Electron main.cjs appendSwitch list, as WebView2 browser arguments. Tauri's own defaults
/// (msWebOOUI,msPdfOOUI,msSmartScreenProtection) must be repeated when overriding.
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
--autoplay-policy=no-user-gesture-required --disable-renderer-backgrounding \
--disable-background-timer-throttling --disable-backgrounding-occluded-windows";

const SHIM: &str = include_str!("../../shim/electron-api-shim.js");
const NATIVE_SHARE: &str = include_str!("../../shim/native-screen-share.js");

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let start_hidden = args.iter().any(|a| a == "--hidden" || a == "--autostart");

    tauri::Builder::default()
        // Second launch (shortcut, taskbar) raises the existing window: Electron second-instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(premium::init())
        .manage(commands::AppState::default())
        .manage(commands::screen::ShareState::default())
        .setup(move |app| {
            // One-time Electron import (handoff file, or the OSCrypt fallback), before the
            // first page load so the boot script already carries the token and settings.
            let imported = boot::import_from_electron_once(app.handle());
            let boot_js = boot::boot_script(app.handle(), imported.as_ref());
            let script = format!("{boot_js}\n{SHIM}\n{NATIVE_SHARE}");

            let state = boot::initial_window_state(app.handle());
            let w = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Descall")
                .inner_size(state.width, state.height)
                .min_inner_size(1200.0, 700.0)
                .decorations(false)
                .visible(false)
                .use_https_scheme(true) // origin https://tauri.localhost: add it to backend CORS
                .additional_browser_args(BROWSER_ARGS)
                .initialization_script(script)
                .on_navigation(|url| boot::is_app_url(url))
                .on_new_window({
                    let app = app.handle().clone();
                    move |url, features| premium::on_new_window(&app, &url, features).unwrap_or(tauri::webview::NewWindowResponse::Allow)
                })
                .build()?;
            if let (Some(x), Some(y)) = (state.x, state.y) {
                let _ = w.set_position(tauri::LogicalPosition::new(x, y));
            }
            if state.maximized {
                let _ = w.maximize();
            }
            if !start_hidden {
                let _ = w.show();
            }
            boot::bind_window_events(&w);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_version,
            commands::app::app_set_locale,
            commands::app::app_boot_retry,
            commands::app::app_boot_state,
            commands::app::app_reduced_transparency,
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
            commands::app::voice_set_busy,
            commands::app::activity_set_busy,
            commands::notify::notification_show,
            commands::notify::notification_close,
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
            commands::overlay::overlay_show,
            commands::overlay::overlay_hide,
            commands::overlay::overlay_update,
            premium::premium_invoke, premium::premium_blob_put, premium::premium_blob_take, premium::premium_hud_action,
        ])
        .run(tauri::generate_context!())
        .expect("Descall failed to start");
}
