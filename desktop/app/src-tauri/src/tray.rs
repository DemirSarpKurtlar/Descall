//! Tray icon (main.cjs createTray). Right click opens the tray panel (owner pick, draft B,
//! src/tray_menu.rs); the native menu (Open Descall, Start with Windows, Descall+ items,
//! Quit or "Update and quit (vX)") stays as its fallback when the panel cannot load, and is
//! the only menu off Windows. Left click and double click restore the window. Labels follow
//! the shell language and are rebuilt when it or the update state changes.

use std::any::Any;
use std::sync::atomic::Ordering;

use tauri::menu::{CheckMenuItem, ContextMenu, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

use crate::state::{self, et, shell};

pub const ID: &str = "descall-tray";

/// The panel handles right click on Windows; elsewhere the menu stays attached to the icon.
const PANEL: bool = cfg!(windows);

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open = MenuItem::with_id(app, "open", et(app, "tray.open", &[]), true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", et(app, "tray.startWithWindows", &[]), true, crate::platform::autostart_enabled(), None::<&str>)?;
    let quit_label = match crate::commands::updates::ready_version(app) {
        Some(v) => et(app, "tray.updateAndQuit", &[("version", &v)]),
        None => et(app, "tray.quit", &[]),
    };
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &autostart, &PredefinedMenuItem::separator(app)?])?;
    // Descall+ items of the running features (they end with their own separator). The
    // premium module is written for the Wry runtime, the only one this app runs on.
    let any_app: &dyn Any = app;
    let any_menu: &dyn Any = &menu;
    if let (Some(a), Some(m)) = (any_app.downcast_ref::<AppHandle<tauri::Wry>>(), any_menu.downcast_ref::<Menu<tauri::Wry>>()) {
        if let Err(e) = crate::premium::tray::append(a, m) {
            log::warn!("[tray] Descall+ items: {e}");
        }
    }
    menu.append(&quit)?;
    Ok(menu)
}

/// Tray Quit / "Update and quit": in a call the update asks first (request_explicit_install).
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    if crate::commands::updates::is_ready(app) {
        // In a call this asks before cutting it; otherwise it installs and exits.
        let r = crate::commands::updates::request_explicit_install(app, "tray");
        if r.get("needsConfirm").and_then(|v| v.as_bool()) == Some(true) || r.get("installing").and_then(|v| v.as_bool()) == Some(true) {
            return;
        }
    }
    state::set_quitting(app);
    app.exit(0);
}

fn on_menu<R: Runtime>(app: &AppHandle<R>, e: MenuEvent) {
    match e.id().as_ref() {
        "open" => state::show_main(app),
        "autostart" => {
            let next = !crate::platform::autostart_enabled();
            crate::platform::set_autostart(next);
            rebuild(app);
        }
        "quit" => quit(app),
        id => {
            crate::premium::tray::on_menu_event(id);
        }
    }
}

/// The native menu at the cursor: the panel's fallback (UI thread).
pub fn popup_native<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = state::main_window(app) else { return };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = menu.popup(w.as_ref().window()) {
                log::warn!("[tray] native menu: {e}");
            }
        }
        Err(e) => log::warn!("[tray] native menu: {e}"),
    }
}

fn icon_rect(rect: &tauri::Rect) -> descall_shell::tray_panel::Rect {
    let p = rect.position.to_physical::<f64>(1.0);
    let s = rect.size.to_physical::<f64>(1.0);
    descall_shell::tray_panel::Rect::new(p.x, p.y, s.width, s.height)
}

/// The tray draws the small icon size (16 px at 100 %, 20 / 24 / 32 px when scaled). Tauri's
/// default window icon is the 32 px large one, which the shell shrinks into the tray without
/// filtering (a jagged, lopsided logo); Electron gave the tray icon.ico, from which Windows
/// takes the entry of the right size. Same here: the embedded app icon at the small size.
#[cfg(windows)]
fn small_icon() -> Option<tauri::image::Image<'static>> {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSMICON};
    let size = match unsafe { GetSystemMetrics(SM_CXSMICON) } {
        n if n > 0 => n as u32,
        _ => 16,
    };
    tauri::image::Image::from_app_icon_resource(size).ok()
}

#[cfg(not(windows))]
fn small_icon() -> Option<tauri::image::Image<'static>> {
    None
}

pub fn create<R: Runtime>(app: &AppHandle<R>) {
    let Ok(menu) = build_menu(app) else { return };
    let mut b = TrayIconBuilder::with_id(ID).tooltip("Descall").show_menu_on_left_click(false).on_menu_event(on_menu).on_tray_icon_event(|tray, e| {
        let app = tray.app_handle();
        match e {
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => {
                state::show_main(app);
                if PANEL {
                    crate::tray_menu::close(app);
                }
            }
            TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Up, rect, position, .. } if PANEL => {
                // Off the UI thread: the first open creates the panel's webview.
                let app = app.clone();
                let icon = icon_rect(&rect);
                tauri::async_runtime::spawn(async move {
                    if !crate::tray_menu::open(&app, Some(icon), (position.x, position.y)) {
                        let h = app.clone();
                        let _ = app.run_on_main_thread(move || popup_native(&h));
                    }
                });
            }
            TrayIconEvent::Enter { .. } if PANEL => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move { crate::tray_menu::warm(&app) });
            }
            _ => {}
        }
    });
    if !PANEL {
        b = b.menu(&menu);
    }
    if let Some(icon) = small_icon().or_else(|| app.default_window_icon().map(|i| i.clone().to_owned())) {
        b = b.icon(icon);
    }
    match b.build(app) {
        Ok(_) => shell(app).has_tray.store(true, Ordering::Release),
        Err(e) => log::error!("[tray] could not create the tray icon: {e}"),
    }
}

/// Labels, update state or Descall+ items changed: native menu (off Windows) and panel.
pub fn rebuild<R: Runtime>(app: &AppHandle<R>) {
    if !PANEL {
        if let (Some(tray), Ok(menu)) = (app.tray_by_id(ID), build_menu(app)) {
            let _ = tray.set_menu(Some(menu));
        }
    }
    crate::tray_menu::refresh(app);
}
