//! Platform-independent half of the Descall+ desktop features: everything here is plain data
//! in, plain data out, so it is unit-tested on Linux by `desktop/premium-logic` (which compiles
//! these same files) as well as inside the app.

pub mod badge;
pub mod gate;
pub mod geom;
pub mod hotkey_logic;
pub mod i18n;
pub mod pin;
pub mod ptt_logic;
pub mod rules;
pub mod store;
pub mod tiers;
pub mod tray;

/// The 31 desktop features of plan section 5, one module each under premium/features/.
pub const DESKTOP_FEATURES: &[&str] = &[
    "advanced_window_mgmt", "always_on_top", "app_lock", "audio_device_profiles", "command_center",
    "custom_hotkeys", "custom_layouts", "desktop_automations", "desktop_sidebar", "focus_mode",
    "gaming_hud", "global_mute", "global_ptt", "instant_clip", "media_keys", "multi_account",
    "multi_window", "per_user_volume_hotkeys", "pip_call", "quick_file_drop", "quick_launcher",
    "quick_reply", "screen_edge_actions", "session_restore", "taskbar_plus", "tray_controls_plus",
    "voice_hud", "widgets", "window_layouts", "window_opacity", "workspace_profiles",
];

/// Features that stay off until the user switches them on (Electron `defaultEnabled: false`).
pub const OFF_BY_DEFAULT: &[&str] = &["global_mute", "global_ptt", "media_keys", "per_user_volume_hotkeys", "quick_launcher", "screen_edge_actions"];
