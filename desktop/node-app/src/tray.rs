//! The tray icon: its colour is the node's state (purple active, yellow game mode, grey
//! paused, blue busy, red error; descall_node::tray_icon). Left click toggles the popover;
//! right click shows a two-item native menu (open the panel, quit after moving users).

use descall_node::tray_icon::{self, Tone};
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub const ID: &str = "descall-node";

fn icon(t: Tone) -> tauri::image::Image<'static> {
    let px = crate::sys::small_icon_px().clamp(16, 64);
    tauri::image::Image::new_owned(tray_icon::rgba(t, px), px, px)
}

fn rect(r: &tauri::Rect) -> descall_node::placement::Rect {
    let p = r.position.to_physical::<f64>(1.0);
    let s = r.size.to_physical::<f64>(1.0);
    descall_node::placement::Rect::new(p.x, p.y, s.width, s.height)
}

pub fn create(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", descall_node::i18n::t(lang, "tray.open"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", descall_node::i18n::t(lang, "tray.quit"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id(ID)
        .icon(icon(Tone::Paused))
        .tooltip("Descall Node")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app: &AppHandle, e: MenuEvent| match e.id().as_ref() {
            "open" => crate::popover::show_async(app, None),
            "quit" => {
                if let Some(s) = tauri::Manager::try_state::<std::sync::Arc<crate::runner::Shared>>(app) {
                    s.send(crate::runner::Msg::Act("quit".into()));
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect: r, .. } = e {
                crate::popover::toggle_async(tray.app_handle(), Some(rect(&r)));
            }
        })
        .build(app)?;
    Ok(())
}

pub fn update(app: &AppHandle, t: Tone, tooltip: &str) {
    if let Some(tray) = app.tray_by_id(ID) {
        let _ = tray.set_icon(Some(icon(t)));
        let _ = tray.set_tooltip(Some(tooltip));
    }
}
