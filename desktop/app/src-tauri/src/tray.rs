//! Tray icon (main.cjs createTray): Open Descall, Start with Windows, Quit or
//! "Update and quit (vX)". Left click and double click restore the window. Labels follow
//! the shell language and are rebuilt when it or the update state changes.

use std::any::Any;
use std::sync::atomic::Ordering;

use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

use crate::state::{self, et, shell};

pub const ID: &str = "descall-tray";

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

fn on_menu<R: Runtime>(app: &AppHandle<R>, e: MenuEvent) {
    match e.id().as_ref() {
        "open" => state::show_main(app),
        "autostart" => {
            let next = !crate::platform::autostart_enabled();
            crate::platform::set_autostart(next);
            rebuild(app);
        }
        "quit" => {
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
        id => {
            crate::premium::tray::on_menu_event(id);
        }
    }
}

pub fn create<R: Runtime>(app: &AppHandle<R>) {
    let Ok(menu) = build_menu(app) else { return };
    let mut b = TrayIconBuilder::with_id(ID).tooltip("Descall").menu(&menu).show_menu_on_left_click(false).on_menu_event(on_menu).on_tray_icon_event(|tray, e| {
        let app = tray.app_handle();
        match e {
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => state::show_main(app),
            _ => {}
        }
    });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    match b.build(app) {
        Ok(_) => shell(app).has_tray.store(true, Ordering::Release),
        Err(e) => log::error!("[tray] could not create the tray icon: {e}"),
    }
}

pub fn rebuild<R: Runtime>(app: &AppHandle<R>) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(ID), build_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}
