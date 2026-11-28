//! Unread badge on the taskbar button, for every user (electron/taskbarBadge.cjs
//! createTaskbarBadge): the overlay icon from descall_shell::taskbar_badge, drawn at the main
//! window's scale factor. The count is the page's badgeCount from the tray state
//! (tray_menu::tray_set_state; 0 when the user turned the badge off or is signed out). This is
//! the one owner of the overlay icon: Descall+ taskbar_plus only adds the thumbnail buttons.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use descall_shell::taskbar_badge;
use tauri::{AppHandle, Runtime};

static COUNT: AtomicI64 = AtomicI64::new(0);
/// "<count>|<size>" last put on the button; None before the first one (or after a failure).
static LAST: Mutex<Option<String>> = Mutex::new(None);

/// New count from the page.
pub fn set_badge<R: Runtime>(app: &AppHandle<R>, count: u64) {
    let n = count.min(99_999) as i64;
    if COUNT.swap(n, Ordering::AcqRel) == n && LAST.lock().unwrap().is_some() {
        return;
    }
    apply(app, false);
}

/// Again on the current button: shown from the tray or a new taskbar button (the overlay goes
/// with the old one), or the window moved to a display with another scale factor (`force`
/// false: only redrawn when the size changes).
pub fn refresh<R: Runtime>(app: &AppHandle<R>, force: bool) {
    if COUNT.load(Ordering::Acquire) > 0 || force {
        apply(app, force);
    }
}

fn apply<R: Runtime>(app: &AppHandle<R>, force: bool) {
    let Some(w) = crate::state::main_window(app) else { return };
    let n = COUNT.load(Ordering::Acquire);
    let size = if n > 0 { taskbar_badge::badge_size(w.scale_factor().unwrap_or(1.0)) } else { 0 };
    let key = format!("{n}|{size}");
    {
        let mut last = LAST.lock().unwrap();
        if !force && last.as_deref() == Some(key.as_str()) {
            return;
        }
        *last = Some(key);
    }
    #[cfg(windows)]
    let result = w.set_overlay_icon(taskbar_badge::render_rgba(n, size).map(|px| tauri::image::Image::new_owned(px, size, size)));
    #[cfg(not(windows))]
    let result = w.set_badge_count(if n > 0 { Some(n) } else { None });
    if let Err(e) = result {
        *LAST.lock().unwrap() = None;
        log::warn!("[taskbar] badge failed: {e}");
    }
}
