//! Descall desktop shell (Tauri 2). Replaces frontend/electron/main.cjs.
//!
//! The page (frontend/dist, unchanged) keeps calling `window.electronAPI.*`; the shim in
//! app/shim/electron-api-shim.js maps every preload.cjs member to a command below.
//! `window.descallPremium.invoke('premium:*')` goes to premium::premium_invoke (src/premium,
//! the Descall+ desktop features; its page bridge is app/shim/premium-shim.js).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod admin;
mod assets;
mod boot;
mod commands;
mod errors;
mod logging;
mod migration;
mod platform;
mod premium;
mod premium_hooks;
#[cfg(windows)]
mod screenshare;
mod secure_store;
mod state;
mod tray;
mod tray_menu;
mod webview;

use std::sync::OnceLock;

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

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

/// The app commands, behind the per-window policy (descall_shell::ipc_policy): the shell's own pages
/// (capsules, overlay, HUD, launcher, tray panel) reach their bridge's commands only.
fn guarded(inner: impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static) -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    move |invoke| {
        let label = invoke.message.webview_ref().label().to_string();
        if !descall_shell::ipc_policy::allowed(&label, invoke.message.command()) {
            log::warn!("[ipc] {label} may not call {}", invoke.message.command());
            invoke.resolver.reject("forbidden");
            return true;
        }
        inner(invoke)
    }
}

/// Main-process errors reach the page (electronAPI.onMainError, scrubbed of paths) and the
/// log; a fatal panic (release builds abort) is forwarded on the next start (crate::errors).
fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("[main] panic: {info}");
        errors::on_panic(info);
        // A migrated first start that dies tells the migrator now (it rolls back at once).
        migration::fail(descall_migrate::app::codes::START_FAILED);
        default(info);
    }));
}

fn main() {
    logging::init();
    errors::init_early();
    install_panic_hook();
    let argv: Vec<String> = std::env::args().collect();
    // Started by DescallMigrator (--migrated --migration-id <id>): health "started".
    migration::begin(&argv);

    let app = tauri::Builder::default()
        // Second launch (shortcut, taskbar) raises the existing window: Electron second-instance.
        // A descall:// link in its argv goes to the running page (deep_link_take).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = descall_shell::deep_link::from_args(&argv) {
                state::deliver_deep_link(app, url);
            }
            state::show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        // Descall+ (src/premium): after the import plugin, so its settings store opens on the
        // files the one-time Electron import just wrote.
        .plugin(boot::import_plugin())
        .plugin(premium::init())
        .manage(state::Shell::default())
        .manage(commands::notify::Notifications::default())
        .manage(commands::overlay::Overlay::default())
        .manage(commands::updates::Updates::default())
        .manage(commands::screen::ShareState::default())
        .manage(tray_menu::TrayMenu::default())
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
            errors::init(&handle);
            if let Some(url) = descall_shell::deep_link::from_args(&argv) {
                *state::shell(&handle).deep_link.lock().unwrap() = Some(url);
            }
            state::init_locale(&handle);
            tray_menu::load_snooze(&handle);

            // The one-time Electron import already ran in boot::import_plugin (before the
            // first page load, so the boot script carries the token and settings).
            let imported = boot::take_imported(&handle);
            let boot_js = boot::boot_script(&handle, imported.as_ref());
            let script = format!("{boot_js}\n{SHIM}\n{NATIVE_SHARE}");
            let launch = boot::cold_start(&handle, &argv);
            if launch.action == descall_shell::launch::StartAction::Show {
                state::shell(&handle).show_on_load.store(true, std::sync::atomic::Ordering::Release);
            }
            let ws = boot::initial_window_state(&handle);

            let nav_app = handle.clone();
            let load_app = handle.clone();
            let w = WebviewWindowBuilder::new(app, state::MAIN, WebviewUrl::App("index.html".into()))
                .devtools(crate::webview::devtools_allowed(&handle)) // support opt-in only (webview.rs)
                .title("Descall")
                .inner_size(ws.width, ws.height)
                .min_inner_size(ws.min_width, ws.min_height)
                .decorations(false)
                .visible(false)
                .background_color(tauri::window::Color(11, 12, 18, 255))
                .use_https_scheme(true) // origin https://tauri.localhost: in the backend CORS list
                // HTML5 drag and drop (files into a chat, avatar / banner pickers, server and
                // folder reordering) like Electron. Tauri's own handler swallows every drop
                // on Windows and the page got no dragenter / drop at all.
                .disable_drag_drop_handler()
                // No browser autofill dropdown under the app's fields (search, username,
                // message composer); Electron never had one.
                .general_autofill_enabled(false)
                // <a download> / blob: exports: Downloads + Explorer, no Edge download bubble.
                .on_download(webview::on_download)
                .additional_browser_args(BROWSER_ARGS)
                .initialization_script(script)
                .on_navigation({
                    let app = handle.clone();
                    move |url| boot::main_navigation(&app, url)
                })
                .on_new_window(move |url, features| {
                    // Descall+ portal windows (call, sidebar: about:blank#descall-premium-<kind>).
                    if let Some(r) = premium::on_new_window(&nav_app, &url, features) {
                        return r;
                    }
                    // Admin routes get their own window; web and mail links open in the default
                    // browser; nothing else opens (setWindowOpenHandler: no in-app popups).
                    if admin::is_admin_url(&url) {
                        let h = nav_app.clone();
                        let _ = nav_app.run_on_main_thread(move || admin::open(&h, &url));
                        return NewWindowResponse::Deny;
                    }
                    if descall_shell::trust::main_window_open(url.as_str()) == descall_shell::trust::WindowOpen::External {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                })
                .on_page_load(move |w, p| match p.event() {
                    PageLoadEvent::Started => {
                        // A reload drops any live call; the update deferral treats it as "call ended".
                        commands::updates::reset_voice(&load_app);
                        // The mini call card goes with the call (Electron resetVoiceBusyFromLifecycle);
                        // a stale visible card also kept the update deferral "busy" for good.
                        commands::overlay::hide(&load_app);
                        commands::screen::stop_on_navigation(&load_app);
                        errors::detach();
                        boot::arm_paint_watchdog(&w);
                    }
                    PageLoadEvent::Finished => {
                        if !state::shell(&load_app).boot.lock().unwrap().mounted && launch.action == descall_shell::launch::StartAction::Show && !w.is_visible().unwrap_or(false) {
                            state::show_main(&load_app);
                        }
                    }
                })
                .build()?;
            if let Some((x, y)) = ws.physical {
                let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            } else if let (Some(x), Some(y)) = (ws.x, ws.y) {
                let _ = w.set_position(tauri::LogicalPosition::new(x, y));
            }
            if ws.maximized {
                let _ = w.maximize();
            }
            boot::bind_window_events(&w);
            webview::install_permission_handler(&w);
            webview::install_browser_guards(&w);
            webview::install_process_failed_handler(&w);
            tray::create(&handle);
            premium_hooks::install(&handle);

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

            if !state::is_dev() {
                // descall:// opens this exe (HKCU\Software\Classes\descall), also after a
                // migration into another folder or a portable copy; the installer writes the same.
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    if let Err(e) = handle.deep_link().register_all() {
                        log::warn!("[deep-link] scheme registration failed: {e}");
                    }
                }
                if let Some(dir) = state::data_dir(&handle) {
                    let electron = handle.path().data_dir().ok().map(|d| d.join(descall_migrate::paths::ELECTRON_USER_DATA));
                    platform::ensure_autostart(&dir, electron.as_deref(), migration::migration_id().is_some());
                }
            }
            migration::cleanup_on_start(&handle);
            boot::watch_reduced_transparency(&handle);
            commands::updates::schedule_background_checks(&handle);
            Ok(())
        })
        .invoke_handler(guarded(tauri::generate_handler![
            commands::app::app_version,
            commands::app::app_set_locale,
            commands::app::app_boot_retry,
            commands::app::app_boot_state,
            commands::app::app_reduced_transparency,
            commands::app::app_log,
            commands::app::voice_set_busy,
            commands::app::activity_set_busy,
            commands::app::deep_link_take,
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_toggle_devtools,
            commands::window::window_close,
            commands::window::window_content_box,
            commands::window::window_is_focused,
            commands::window::window_focus,
            commands::window::window_set_zoom,
            commands::window::window_system_menu,
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
            commands::screen::screen_thumbnails,
            commands::screen::screen_share_start,
            commands::screen::screen_share_stop,
            commands::screen::screen_share_update,
            commands::screen::screen_share_caps,
            commands::screen::screen_share_stats,
            commands::system::token_set,
            commands::system::token_clear,
            commands::system::clipboard_read_image,
            commands::system::clipboard_write_text,
            commands::system::processes_scan,
            commands::system::download_file,
            premium::premium_invoke,
            premium::premium_blob_put,
            premium::premium_blob_take,
            premium::premium_hud_action,
            tray_menu::tray_set_state,
            tray_menu::tray_menu_state,
            tray_menu::tray_menu_act,
        ]))
        .build(assets::with_nested_routes(tauri::generate_context!()))
        .expect("Descall failed to start");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // autoInstallOnAppQuit: a staged update installs when the app really quits.
            state::set_quitting(app);
            commands::updates::install_on_quit(app);
        }
    });
}

#[cfg(test)]
mod config_tests {
    /// Tauri updates run the old uninstaller with /UPDATE before installing: the uninstall
    /// hook must not delete the login auto-start (Run value) or the toast activator then,
    /// or every update turns "Start with Windows" off.
    #[test]
    fn update_keeps_autostart_and_toast_activator() {
        let hooks = include_str!("../nsis/hooks.nsh");
        let at = hooks.find("!macro NSIS_HOOK_POSTUNINSTALL").expect("post-uninstall hook");
        let body = &hooks[at..at + hooks[at..].find("!macroend").expect("macro end")];
        let guard = body.find("${If} $UpdateMode <> 1").expect("deletions guarded by $UpdateMode");
        for line in body.lines().filter(|l| l.trim_start().starts_with("Delete")) {
            let pos = body.find(line).unwrap();
            assert!(pos > guard && pos < body.find("${EndIf}").unwrap(), "unguarded: {line}");
        }
        assert!(body.contains(r#"CurrentVersion\Run" "${DESCALL_AUMID}""#), "a real uninstall still removes auto-start");
    }

    /// Single instance before every other plugin (Tauri requires it first so a second launch
    /// exits before touching anything), and its argv reaches the deep-link handoff.
    #[test]
    fn second_launch_focuses_and_forwards_links() {
        let main = include_str!("main.rs");
        let builder = &main[main.find("tauri::Builder::default()").unwrap()..];
        let first_plugin = builder.find(".plugin(").unwrap();
        assert!(builder[first_plugin..].starts_with(".plugin(tauri_plugin_single_instance::init("), "single instance is the first plugin");
        let cb = &builder[first_plugin..first_plugin + 400];
        assert!(cb.contains("deep_link::from_args(&argv)") && cb.contains("state::show_main(app)"));
        assert!(main.contains("commands::app::deep_link_take,"));
    }
    /// The web build (ELECTRON_BUILD=1, IIFE) ships no .css file: every stylesheet is a
    /// <style> element its JS adds at start-up. If Tauri adds hashes/nonces to style-src,
    /// 'unsafe-inline' stops counting and all of those are blocked: the app opens as bare,
    /// unstyled HTML (owner's PC, desktop-v4.0.0). style-src must stay unmodified.
    #[test]
    fn style_src_is_not_modified_by_tauri() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let sec = &conf["app"]["security"];
        let style = sec["csp"]["style-src"].as_str().unwrap_or_default();
        assert!(style.contains("'unsafe-inline'"), "style-src needs 'unsafe-inline' for the runtime <style> elements");
        let off = &sec["dangerousDisableAssetCspModification"];
        let disabled = off.as_bool() == Some(true) || off.as_array().is_some_and(|a| a.iter().any(|v| v == "style-src"));
        assert!(disabled, "dangerousDisableAssetCspModification must include style-src");
    }
}
