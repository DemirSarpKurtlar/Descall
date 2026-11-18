//! The 31 Descall+ desktop features (plan section 5), one module each, ported from
//! frontend/electron/premium/features/*.cjs with the same channels, payloads and limits.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::Value;

use super::{Feature, Host};

pub mod advanced_window_mgmt;
pub mod always_on_top;
pub mod app_lock;
pub mod audio_device_profiles;
pub mod command_center;
pub mod custom_hotkeys;
pub mod custom_layouts;
pub mod desktop_automations;
pub mod desktop_sidebar;
pub mod focus_mode;
pub mod gaming_hud;
pub mod global_mute;
pub mod global_ptt;
mod hud;
pub mod instant_clip;
pub mod media_keys;
pub mod multi_account;
pub mod multi_window;
pub mod per_user_volume_hotkeys;
pub mod pip_call;
pub mod quick_file_drop;
pub mod quick_launcher;
pub mod quick_reply;
pub mod screen_edge_actions;
pub mod session_restore;
pub mod taskbar_plus;
pub mod tray_controls_plus;
pub mod voice_hud;
pub mod widgets;
pub mod window_layouts;
pub mod window_opacity;
pub mod workspace_profiles;

pub(crate) fn all() -> Vec<Arc<dyn Feature>> {
    vec![
        Arc::new(advanced_window_mgmt::F::default()),
        Arc::new(always_on_top::F),
        Arc::new(app_lock::F::default()),
        Arc::new(audio_device_profiles::F::default()),
        Arc::new(command_center::F),
        Arc::new(custom_hotkeys::F),
        Arc::new(custom_layouts::F),
        Arc::new(desktop_automations::F::default()),
        Arc::new(desktop_sidebar::F::default()),
        Arc::new(focus_mode::F::default()),
        Arc::new(gaming_hud::feature()),
        Arc::new(global_mute::F),
        Arc::new(global_ptt::F::default()),
        Arc::new(instant_clip::F),
        Arc::new(media_keys::F::default()),
        Arc::new(multi_account::F::default()),
        Arc::new(multi_window::F),
        Arc::new(per_user_volume_hotkeys::F::default()),
        Arc::new(pip_call::F),
        Arc::new(quick_file_drop::F::default()),
        Arc::new(quick_launcher::F::default()),
        Arc::new(quick_reply::F),
        Arc::new(screen_edge_actions::F::default()),
        Arc::new(session_restore::F::default()),
        Arc::new(taskbar_plus::F::default()),
        Arc::new(tray_controls_plus::F::default()),
        Arc::new(voice_hud::feature()),
        Arc::new(widgets::F::default()),
        Arc::new(window_layouts::F),
        Arc::new(window_opacity::F),
        Arc::new(workspace_profiles::F::default()),
    ]
}

/// An overlay page action, routed to the feature that opened the overlay.
pub(crate) fn on_overlay(h: &Host, owner: &str, id: &str, kind: &str, payload: &Value) {
    match owner {
        "voice_hud" | "gaming_hud" => {
            if let Some(f) = h.features.iter().find(|f| f.key() == owner) {
                if h.is_running(owner) {
                    if let Some(hf) = hud_of(f.as_ref()) {
                        hf.on_action(h, kind, payload);
                    }
                }
            }
        }
        "quick_file_drop" if h.is_running(owner) => quick_file_drop::on_action(h, kind, payload),
        "widgets" if h.is_running(owner) => widgets::on_action(h, id, kind, payload),
        _ => {}
    }
}

fn hud_of(f: &dyn Feature) -> Option<&hud::HudFeature> {
    match f.key() {
        "voice_hud" => voice_hud::get(),
        "gaming_hud" => gaming_hud::get(),
        _ => None,
    }
}

/// Stop flag of a repeating tick, replaced on restart.
#[derive(Default)]
pub(crate) struct Poll(std::sync::Mutex<Option<Arc<AtomicBool>>>);

impl Poll {
    pub fn start(&self, h: &Host, key: &'static str, tag: &'static str, ms: u64) {
        self.stop();
        *super::lock(&self.0) = Some(h.every(key, tag, ms));
    }
    pub fn stop(&self) {
        if let Some(f) = super::lock(&self.0).take() {
            f.store(true, Ordering::Relaxed);
        }
    }
    pub fn on(&self) -> bool {
        super::lock(&self.0).is_some()
    }
}

/// Generation counter for one-shot ticks (debounces).
#[derive(Default)]
pub(crate) struct Gen(AtomicU64);

impl Gen {
    pub fn bump(&self) -> u64 {
        self.0.fetch_add(1, Ordering::Relaxed) + 1
    }
    pub fn is(&self, g: u64) -> bool {
        self.0.load(Ordering::Relaxed) == g
    }
}

/// Call start / end edges (mute changes do not count).
#[derive(Default)]
pub(crate) struct CallEdge(AtomicBool);

impl CallEdge {
    pub fn reset(&self, h: &Host) {
        self.0.store(h.in_call(), Ordering::Relaxed);
    }
    /// Some(active) when the call started or ended since the last look.
    pub fn changed(&self, h: &Host) -> Option<bool> {
        let now = h.in_call();
        (self.0.swap(now, Ordering::Relaxed) != now).then_some(now)
    }
}
