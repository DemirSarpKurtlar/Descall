//! taskbar_plus (Plus): unread badge on the taskbar button (overlay icon, generated raster)
//! and, during a call, mute / deafen / leave buttons in the taskbar thumbnail
//! (ITaskbarList3::ThumbBarAddButtons). Settings: badge, buttons (both default on). Updates
//! only when the unread count or the call state changes.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::Manager;

use crate::premium::logic::badge;
use crate::premium::platform::ThumbButton;
use crate::premium::{host, lock, platform, wins, Bus, Caller, Feature, From, Host};

pub struct F {
    last_badge: AtomicI64,
    last_buttons: Mutex<Option<String>>,
}

impl Default for F {
    fn default() -> Self {
        Self { last_badge: AtomicI64::new(-1), last_buttons: Mutex::new(None) }
    }
}

fn opt(h: &Host, name: &str) -> bool {
    h.setting_bool(&format!("features.taskbar_plus.{name}"), true)
}

fn on_click(id: u32) {
    let action = match id {
        1 => "mute",
        2 => "deafen",
        _ => "leave",
    };
    if let Some(h) = host() {
        h.send("premium:action", json!({ "action": action }));
    }
}

fn apply_buttons(h: &Host, buttons: Vec<ThumbButton>) {
    let Some(w) = h.app.get_webview_window("main") else { return };
    let Some(hw) = wins::hwnd(&w) else { return };
    // COM taskbar calls and the window subclass belong on the UI thread.
    let _ = h.app.run_on_main_thread(move || platform::set_thumb_buttons(hw, &buttons, on_click));
}

impl F {
    fn set_badge(&self, h: &Host) {
        let unread = lock(&h.app_state).get("unread").and_then(Value::as_f64).unwrap_or(0.0) as i64;
        let n = if opt(h, "badge") { unread.max(0) } else { 0 };
        if self.last_badge.swap(n, Ordering::Relaxed) == n {
            return;
        }
        let Some(w) = h.app.get_webview_window("main") else { return };
        let icon = badge::unread_badge(n, 16).map(|b| {
            let mut rgba = b.data;
            for px in rgba.chunks_exact_mut(4) {
                px.swap(0, 2); // BGRA -> RGBA
            }
            Image::new_owned(rgba, b.width, b.height)
        });
        if let Err(e) = w.set_overlay_icon(icon) {
            log::warn!("[premium] taskbar badge failed: {e}");
        }
    }

    fn set_buttons(&self, h: &Host, force: bool) {
        let c = lock(&h.call_state).clone();
        let flag = |k: &str| c.get(k).and_then(Value::as_bool).unwrap_or(false);
        let on = opt(h, "buttons") && flag("active");
        // The language is part of the key: the tooltips follow a language change live
        // (Electron kept the old language until the next mute / deafen change).
        let key = if on { format!("{}|{}|{}", flag("muted"), flag("deafened"), h.locale()) } else { String::new() };
        {
            let mut last = lock(&self.last_buttons);
            if !force && last.as_deref() == Some(key.as_str()) {
                return;
            }
            *last = Some(key);
        }
        let buttons = if on {
            vec![
                ThumbButton { id: 1, tip: h.et(if flag("muted") { "tray.unmute" } else { "tray.mute" }, &[]), glyph: if flag("muted") { "micOff" } else { "mic" } },
                ThumbButton { id: 2, tip: h.et(if flag("deafened") { "tray.undeafen" } else { "tray.deafen" }, &[]), glyph: if flag("deafened") { "headphonesOff" } else { "headphones" } },
                ThumbButton { id: 3, tip: h.et("tray.hangup", &[]), glyph: "hangup" },
            ]
        } else {
            Vec::new()
        };
        apply_buttons(h, buttons);
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "taskbar_plus"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[]
    }
    fn start(&self, h: &Host) {
        self.last_badge.store(-1, Ordering::Relaxed);
        self.set_badge(h);
        self.set_buttons(h, true);
    }
    fn stop(&self, h: &Host) {
        self.last_badge.store(-1, Ordering::Relaxed);
        *lock(&self.last_buttons) = None;
        if let Some(w) = h.app.get_webview_window("main") {
            let _ = w.set_overlay_icon(None);
        }
        apply_buttons(h, Vec::new());
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            Bus::App => {
                self.set_badge(h);
                self.set_buttons(h, false);
            }
            Bus::Call => self.set_buttons(h, false),
            // Shown again from the tray: the window has a new taskbar button without the
            // overlay icon (the thumbnail buttons come back through TaskbarButtonCreated,
            // premium/platform.rs).
            Bus::Focus(l, true) if l == "main" => {
                self.last_badge.store(-1, Ordering::Relaxed);
                self.set_badge(h);
            }
            Bus::Settings(k) if k == "taskbar_plus" => {
                self.last_badge.store(-1, Ordering::Relaxed);
                self.set_badge(h);
                self.set_buttons(h, true);
            }
            _ => {}
        }
    }
}
