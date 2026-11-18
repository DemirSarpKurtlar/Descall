//! Tier per feature key (port of electron/premium/featureTiers.cjs, mirror of
//! frontend/src/premium/features.js). Only used when /api/premium/me answers without a
//! `features` list.

/// Plan rank: plus < ultra.
pub fn plan_rank(plan: &str) -> u8 {
    match plan {
        "plus" => 1,
        "ultra" => 2,
        _ => 0,
    }
}

pub const TIERS: &[(&str, &str)] = &[
    ("mini_mode", "plus"), ("always_on_top", "plus"), ("pip_call", "plus"), ("multi_window", "plus"),
    ("window_opacity", "plus"), ("session_restore", "plus"), ("tray_controls_plus", "plus"), ("taskbar_plus", "plus"),
    ("global_mute", "plus"), ("global_ptt", "plus"), ("custom_hotkeys", "plus"), ("media_keys", "plus"),
    ("quick_launcher", "plus"), ("notification_history", "plus"), ("focus_mode", "plus"), ("notification_profiles", "plus"),
    ("mic_presets", "plus"), ("noise_gate", "plus"), ("mic_monitor", "plus"), ("voice_activity_monitor", "plus"),
    ("auto_device_switch", "plus"), ("audio_routing", "plus"), ("audio_device_profiles", "plus"), ("game_status", "plus"),
    ("game_session_history", "plus"), ("smart_game_notifications", "plus"), ("clipboard_history", "plus"),
    ("quick_file_drop", "plus"), ("app_lock", "plus"), ("quick_actions", "plus"),
    ("desktop_sidebar", "ultra"), ("screen_edge_actions", "ultra"), ("window_layouts", "ultra"),
    ("advanced_window_mgmt", "ultra"), ("voice_hud", "ultra"), ("gaming_hud", "ultra"), ("instant_clip", "ultra"),
    ("per_user_volume_hotkeys", "ultra"), ("stream_audio_control", "ultra"), ("workspace_profiles", "ultra"),
    ("desktop_automations", "ultra"), ("activity_timeline", "ultra"), ("command_center", "ultra"), ("widgets", "ultra"),
    ("custom_layouts", "ultra"), ("multi_account", "ultra"), ("quick_reply", "plus"),
];

pub fn tier_of(key: &str) -> Option<&'static str> {
    TIERS.iter().find(|(k, _)| *k == key).map(|(_, t)| *t)
}

pub fn is_contract_key(key: &str) -> bool {
    tier_of(key).is_some()
}

/// "Plus" / " ULTRA " -> Some("plus"/"ultra"); anything else -> None.
pub fn normalize_plan(plan: Option<&str>) -> Option<&'static str> {
    match plan.map(|p| p.to_ascii_lowercase()) {
        Some(p) if p == "plus" => Some("plus"),
        Some(p) if p == "ultra" => Some("ultra"),
        _ => None,
    }
}

pub fn tier_allows(plan: Option<&str>, key: &str) -> bool {
    match (normalize_plan(plan), tier_of(key)) {
        (Some(p), Some(t)) => plan_rank(p) >= plan_rank(t),
        _ => false,
    }
}

pub fn features_for_plan(plan: Option<&str>) -> Vec<&'static str> {
    TIERS.iter().map(|(k, _)| *k).filter(|k| tier_allows(plan, k)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_and_plans() {
        assert_eq!(normalize_plan(Some("ULTRA")), Some("ultra"));
        assert_eq!(normalize_plan(Some("free")), None);
        assert!(tier_allows(Some("plus"), "pip_call"));
        assert!(!tier_allows(Some("plus"), "desktop_sidebar"));
        assert!(tier_allows(Some("ultra"), "desktop_sidebar"));
        assert!(!tier_allows(None, "pip_call"));
        assert!(!tier_allows(Some("ultra"), "not_a_key"));
        assert!(features_for_plan(Some("ultra")).len() > features_for_plan(Some("plus")).len());
        assert!(features_for_plan(None).is_empty());
    }

    #[test]
    fn every_desktop_module_is_a_contract_key() {
        for key in crate::premium::logic::DESKTOP_FEATURES {
            assert!(is_contract_key(key), "{key}");
        }
        assert_eq!(crate::premium::logic::DESKTOP_FEATURES.len(), 31);
    }
}
