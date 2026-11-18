//! Tray icon (main.cjs createTray): Open Descall, Start with Windows, Quit or
//! "Update and quit (vX)". Left click and double click restore the window. Labels follow
//! the shell language and are rebuilt when it or the update state changes.

use std::sync::atomic::Ordering;

use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

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
    Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &autostart, &PredefinedMenuItem::separator(app)?, &quit])
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
        _ => {}
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
