//! Descall+ entries in the shell's tray menu (Electron trayMenuItems()). The shell owns the
//! tray icon; when it builds its menu it calls [`append`], routes clicks with
//! [`on_menu_event`], and registers its rebuild function with `premium::set_tray_rebuilder`
//! so focus / call / profile changes refresh the menu.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

pub use super::logic::tray::TrayItem;
use super::{host, Host};

/// Items of every running feature, followed by a separator (empty when none).
pub fn items() -> Vec<TrayItem> {
    let Some(h) = host() else { return Vec::new() };
    collect(h)
}

pub(crate) fn collect(h: &Host) -> Vec<TrayItem> {
    let mut out = Vec::new();
    for f in &h.features {
        if h.is_running(f.key()) {
            out.extend(f.tray(h));
        }
    }
    if !out.is_empty() {
        out.push(TrayItem::Separator);
    }
    out
}

fn build_into(app: &AppHandle, items: &[TrayItem], add: &mut dyn FnMut(&dyn tauri::menu::IsMenuItem<Wry>) -> tauri::Result<()>) -> tauri::Result<()> {
    for it in items {
        match it {
            TrayItem::Item { id, label, enabled } => add(&MenuItem::with_id(app, id, label, *enabled, None::<&str>)?)?,
            TrayItem::Radio { id, label, checked } => add(&CheckMenuItem::with_id(app, id, label, true, *checked, None::<&str>)?)?,
            TrayItem::Separator => add(&PredefinedMenuItem::separator(app)?)?,
            TrayItem::Submenu { label, items } => {
                let sub = Submenu::new(app, label, true)?;
                build_into(app, items, &mut |i| sub.append(i))?;
                add(&sub)?;
            }
        }
    }
    Ok(())
}

/// Append the Descall+ items to the shell's tray menu.
pub fn append(app: &AppHandle, menu: &Menu<Wry>) -> tauri::Result<()> {
    build_into(app, &items(), &mut |i| menu.append(i))
}

/// A tray menu click: true when it was a Descall+ item.
pub fn on_menu_event(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("premium|") else { return false };
    let Some(h) = host().cloned() else { return true };
    let rest = rest.to_string();
    std::thread::spawn(move || {
        for f in &h.features {
            if h.is_running(f.key()) && f.on_tray(&h, &rest) {
                break;
            }
        }
    });
    true
}
