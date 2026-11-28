//! taskbar_plus (Plus): during a call, mute / deafen / leave buttons in the taskbar thumbnail
//! (ITaskbarList3::ThumbBarAddButtons). Setting: buttons (default on). Updates only when the
//! call state changes. The unread badge on the taskbar button is free for every user now and
//! has one owner, crate::taskbar (descall_shell::taskbar_badge); this feature no longer sets it.

use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::Manager;

use crate::premium::platform::ThumbButton;
use crate::premium::{host, lock, platform, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    last_buttons: Mutex<Option<String>>,
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

/// A new taskbar button (shown again from the tray without the focus, Explorer restarted) has
/// no overlay icon: the free unread badge goes on again (the thumbnail buttons come back in
/// platform.rs).
fn on_button_created() {
    if let Some(h) = host() {
        crate::taskbar::refresh(&h.app, true);
    }
}

fn apply_buttons(h: &Host, buttons: Vec<ThumbButton>) {
    let Some(w) = h.app.get_webview_window("main") else { return };
    let Some(hw) = wins::hwnd(&w) else { return };
    // COM taskbar calls and the window subclass belong on the UI thread.
    let _ = h.app.run_on_main_thread(move || platform::set_thumb_buttons(hw, &buttons, on_click));
}

impl F {
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
        platform::on_taskbar_button_created(on_button_created);
        self.set_buttons(h, true);
    }
    fn stop(&self, h: &Host) {
        *lock(&self.last_buttons) = None;
        apply_buttons(h, Vec::new());
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        match ev {
            // App: the tooltips follow a language change (the locale is part of the key).
            Bus::App | Bus::Call => self.set_buttons(h, false),
            Bus::Settings(k) if k == "taskbar_plus" => self.set_buttons(h, true),
            _ => {}
        }
    }
}
