//! Which app commands each window may invoke (least privilege for the shell's own pages).
//!
//! Tauri allows every registered app command from every local window unless the app ships an
//! ACL manifest, so a notification capsule could have called `screen_share_start`,
//! `clipboard_read_image` or `updates_restart`. Electron gave each of those windows its own
//! small preload (notifPreload, overlayPreload, hudPreload, launcherPreload, trayMenuPreload)
//! and nothing else. The invoke handler in app/src-tauri/src/main.rs asks [`allowed`] first: the shell's pages
//! get exactly the calls of their bridge, admin windows the adminPreload set, app windows
//! (main, Descall+ pop-outs and account windows) everything they had before (each command
//! still checks the caller where it matters). Plugin commands are limited in
//! app/src-tauri/capabilities/ (tests below).
//! Remote origins never reach app commands at all (Tauri rejects them before this check).

/// Window classes by label (the labels the shell creates).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowClass {
    /// main, popout-*, acct-* and any other app-origin window: the full electronAPI.
    App,
    /// admin, signup-stats (adminPreload.cjs).
    Admin,
    /// notif-* capsules (shell-notif.js).
    Notification,
    /// The voice overlay (shell-overlay.js).
    VoiceOverlay,
    /// Descall+ HUD, widget and quick drop windows (premium-hud-shim.js).
    Hud,
    /// The Descall+ quick launcher (premium-launcher-shim.js).
    Launcher,
    /// The tray panel (tray-menu-shim.js).
    TrayMenu,
}

pub fn class_of(label: &str) -> WindowClass {
    match label {
        "admin" | "signup-stats" => WindowClass::Admin,
        "overlay" => WindowClass::VoiceOverlay,
        "launcher" => WindowClass::Launcher,
        "tray-menu" => WindowClass::TrayMenu,
        l if l.starts_with("notif-") => WindowClass::Notification,
        l if l.starts_with("hud-") || l.starts_with("widget-") => WindowClass::Hud,
        _ => WindowClass::App,
    }
}

/// adminPreload.cjs: no capture, clipboard image, process list, downloads, overlay, tray,
/// Descall+ or update install.
const ADMIN: &[&str] = &[
    "app_version",
    "app_set_locale",
    "app_boot_retry",
    "app_boot_state",
    "app_reduced_transparency",
    "app_log",
    "voice_set_busy",
    "activity_set_busy",
    "window_minimize",
    "window_toggle_maximize",
    "window_close",
    "window_content_box",
    "window_is_focused",
    "window_focus",
    "window_set_zoom",
    "updates_status",
    "notification_show",
    "notification_close",
    "clipboard_write_text",
    "token_set",
    "token_clear",
];
const NOTIFICATION: &[&str] = &["notif_action"];
const VOICE_OVERLAY: &[&str] = &["overlay_action"];
const HUD: &[&str] = &["premium_hud_action", "premium_blob_put"];
const LAUNCHER: &[&str] = &["premium_invoke"];
const TRAY_MENU: &[&str] = &["tray_menu_state", "tray_menu_act"];

/// The commands a window class may call; `None` means every registered command.
pub fn commands_for(class: WindowClass) -> Option<&'static [&'static str]> {
    match class {
        WindowClass::App => None,
        WindowClass::Admin => Some(ADMIN),
        WindowClass::Notification => Some(NOTIFICATION),
        WindowClass::VoiceOverlay => Some(VOICE_OVERLAY),
        WindowClass::Hud => Some(HUD),
        WindowClass::Launcher => Some(LAUNCHER),
        WindowClass::TrayMenu => Some(TRAY_MENU),
    }
}

pub fn allowed(label: &str, command: &str) -> bool {
    commands_for(class_of(label)).is_none_or(|list| list.contains(&command))
}

/// Navigation guard of the shell's own pages (notification capsules, voice overlay): they
/// never leave descall-shell (a link in a notification must not load a web page in an
/// always-on-top, frameless window).
pub fn is_shell_page(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    match u.scheme() {
        s if s == crate::trust::SHELL_SCHEME => true,
        "http" | "https" => crate::trust::is_shell_url(url) || (u.host_str() == Some("descall-shell.localhost") && u.username().is_empty() && u.password().is_none() && u.port().is_none()),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN_RS: &str = include_str!("../../../app/src-tauri/src/main.rs");

    /// Command names an app shim can invoke: `invoke("x"`, `invoke('x'`, `call("premium:...")` aside.
    fn invoked(src: &str) -> Vec<String> {
        let mut out = Vec::new();
        for pat in ["invoke(\"", "invoke('", "winCmd(\"", "fire(\""] {
            let mut rest = src;
            while let Some(i) = rest.find(pat) {
                rest = &rest[i + pat.len()..];
                let end = rest.find(['"', '\'']).unwrap_or(0);
                let name = &rest[..end];
                if !name.is_empty() && !name.starts_with("plugin:") && name.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
                    out.push(name.to_string());
                }
            }
        }
        out.sort();
        out.dedup();
        out
    }

    fn registered() -> Vec<String> {
        let start = MAIN_RS.find("generate_handler![").expect("generate_handler! in main.rs");
        let body = &MAIN_RS[start..start + MAIN_RS[start..].find(']').unwrap()];
        body.split(',').filter_map(|p| p.trim().rsplit("::").next()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && !s.contains('[')).collect()
    }

    #[test]
    fn labels_map_to_classes() {
        assert_eq!(class_of("main"), WindowClass::App);
        assert_eq!(class_of("popout-3"), WindowClass::App);
        assert_eq!(class_of("acct-u1"), WindowClass::App);
        assert_eq!(class_of("admin"), WindowClass::Admin);
        assert_eq!(class_of("signup-stats"), WindowClass::Admin);
        assert_eq!(class_of("notif-12"), WindowClass::Notification);
        assert_eq!(class_of("overlay"), WindowClass::VoiceOverlay);
        assert_eq!(class_of("hud-voice_hud"), WindowClass::Hud);
        assert_eq!(class_of("widget-cpu"), WindowClass::Hud);
        assert_eq!(class_of("launcher"), WindowClass::Launcher);
        assert_eq!(class_of("tray-menu"), WindowClass::TrayMenu);
    }

    #[test]
    fn shell_pages_get_only_their_bridge() {
        for cmd in ["screen_share_start", "screen_sources", "clipboard_read_image", "processes_scan", "download_file", "updates_restart", "token_set", "premium_invoke", "premium_blob_take", "overlay_show", "tray_set_state"] {
            for label in ["notif-1", "overlay", "hud-voice_hud", "widget-x", "tray-menu"] {
                assert!(!allowed(label, cmd), "{label} must not call {cmd}");
            }
        }
        assert!(allowed("notif-1", "notif_action"));
        assert!(!allowed("notif-1", "overlay_action"));
        assert!(allowed("overlay", "overlay_action"));
        assert!(allowed("hud-x", "premium_hud_action") && allowed("widget-x", "premium_blob_put"));
        assert!(allowed("launcher", "premium_invoke") && !allowed("launcher", "screen_share_start"));
        assert!(allowed("tray-menu", "tray_menu_act") && !allowed("tray-menu", "tray_set_state"));
    }

    #[test]
    fn admin_windows_get_the_admin_preload_set() {
        for cmd in ["screen_share_start", "screen_sources", "screen_thumbnails", "clipboard_read_image", "processes_scan", "download_file", "updates_restart", "updates_check", "overlay_show", "premium_invoke", "tray_set_state"] {
            assert!(!allowed("admin", cmd), "admin must not call {cmd}");
        }
        for cmd in ADMIN {
            assert!(allowed("signup-stats", cmd));
        }
    }

    #[test]
    fn app_windows_keep_every_command() {
        for cmd in registered() {
            assert!(allowed("main", &cmd), "main calls {cmd}");
            assert!(allowed("popout-1", &cmd));
        }
    }

    /// Every list names registered commands only, and each shell bridge can reach every
    /// command it invokes (a missing entry would break that window in the field).
    #[test]
    fn lists_match_main_rs_and_the_shims() {
        let reg = registered();
        assert!(reg.len() > 30, "generate_handler! parsed: {reg:?}");
        for class in [WindowClass::Admin, WindowClass::Notification, WindowClass::VoiceOverlay, WindowClass::Hud, WindowClass::Launcher, WindowClass::TrayMenu] {
            for cmd in commands_for(class).unwrap() {
                assert!(reg.iter().any(|r| r == cmd), "{class:?}: {cmd} is not registered in main.rs");
            }
        }
        let shims: [(&str, &str); 5] = [
            ("notif-1", include_str!("../../../app/shim/shell-notif.js")),
            ("overlay", include_str!("../../../app/shim/shell-overlay.js")),
            ("hud-x", include_str!("../../../app/shim/premium-hud-shim.js")),
            ("launcher", include_str!("../../../app/shim/premium-launcher-shim.js")),
            ("tray-menu", include_str!("../../../app/shim/tray-menu-shim.js")),
        ];
        for (label, src) in shims {
            let calls = invoked(src);
            assert!(!calls.is_empty(), "{label}: no invoke found in its shim");
            for cmd in calls {
                assert!(allowed(label, &cmd), "{label} shim calls {cmd}, which the policy refuses");
            }
        }
        // Admin mode of electron-api-shim.js: every command it can still reach is allowed.
        let shim = include_str!("../../../app/shim/electron-api-shim.js");
        for cmd in invoked(shim) {
            if !["clipboard_read_image", "updates_check", "updates_restart", "download_file", "screen_sources", "processes_scan", "overlay_show", "overlay_hide", "overlay_update", "tray_set_state", "screen_share_stop"].contains(&cmd.as_str()) {
                assert!(allowed("admin", &cmd), "admin shim calls {cmd}");
            }
        }
    }

    #[test]
    fn shell_page_navigation_stays_on_the_shell() {
        let ok = is_shell_page;
        assert!(ok("descall-shell://localhost/notif.html"));
        assert!(ok("https://descall-shell.localhost/notif.html"));
        assert!(ok("http://descall-shell.localhost/overlay.html"));
        for u in ["https://descall.com/", "https://descall-shell.localhost.evil.example/x", "https://evil.example/?descall-shell.localhost", "file:///C:/x.html", "https://tauri.localhost/", "javascript:alert(1)", "https://u@descall-shell.localhost/x"] {
            assert!(!ok(u), "{u} is not a shell page");
        }
    }
}

#[cfg(test)]
mod capability_tests {
    //! Least privilege for plugin commands (capabilities/*.json). App commands: the policy above.
    use serde_json::Value;

    const CAPS: [&str; 3] = [include_str!("../../../app/src-tauri/capabilities/default.json"), include_str!("../../../app/src-tauri/capabilities/shell.json"), include_str!("../../../app/src-tauri/capabilities/tray-menu.json")];
    const SHELL_ONLY: [&str; 3] = ["core:event:allow-listen", "core:event:allow-unlisten", "core:window:allow-start-dragging"];

    fn caps() -> Vec<Value> {
        CAPS.iter().map(|c| serde_json::from_str(c).expect("capability json")).collect()
    }
    fn matches(pattern: &str, label: &str) -> bool {
        match pattern.strip_suffix('*') {
            Some(prefix) => label.starts_with(prefix),
            None => pattern == label,
        }
    }
    /// Every permission any capability grants to window `label`.
    fn granted(label: &str) -> Vec<String> {
        let mut out = Vec::new();
        for c in caps() {
            let windows = c["windows"].as_array().cloned().unwrap_or_default();
            if windows.iter().filter_map(Value::as_str).any(|p| matches(p, label)) {
                out.extend(c["permissions"].as_array().cloned().unwrap_or_default().iter().filter_map(|p| p.as_str().map(str::to_string)));
            }
        }
        out
    }
    /// `plugin:<p>|<cmd>` -> the permission that allows it.
    fn permission_for(plugin: &str, cmd: &str) -> String {
        let cmd = cmd.replace('_', "-");
        if ["window", "event", "webview", "app"].contains(&plugin) {
            format!("core:{plugin}:allow-{cmd}")
        } else {
            format!("{plugin}:allow-{cmd}")
        }
    }

    #[test]
    fn no_remote_origin_and_no_broad_sets() {
        for c in caps() {
            assert!(c.get("remote").is_none(), "{}: remote origins never get IPC", c["identifier"]);
            for p in c["permissions"].as_array().unwrap().iter().filter_map(Value::as_str) {
                let banned = p == "core:default"
                    || p.ends_with(":allow-emit")
                    || p.ends_with(":allow-emit-to")
                    || p == "core:event:default"
                    || p.starts_with("core:menu")
                    || p.starts_with("core:tray")
                    || p.starts_with("core:path")
                    || p.starts_with("core:resources")
                    || p.contains("devtools")
                    || p.starts_with("updater:")
                    || p.starts_with("global-shortcut:")
                    || p.starts_with("clipboard-manager:")
                    || p.starts_with("deep-link:")
                    || p == "opener:default"
                    || p == "opener:allow-open-path"
                    || p == "opener:allow-reveal-item-in-dir";
                assert!(!banned, "{}: {p} is broader than any page needs", c["identifier"]);
            }
        }
    }

    #[test]
    fn shell_windows_only_listen_and_drag() {
        for label in ["notif-1", "overlay", "hud-voice_hud", "widget-cpu", "launcher", "tray-menu"] {
            let g = granted(label);
            assert!(!g.is_empty(), "{label} is in a capability (it listens for its state)");
            for p in g {
                assert!(SHELL_ONLY.contains(&p.as_str()), "{label} must not get {p}");
            }
        }
    }

    #[test]
    fn app_windows_get_every_plugin_call_their_shims_make() {
        let shim = include_str!("../../../app/shim/electron-api-shim.js");
        let premium = include_str!("../../../app/shim/premium-shim.js");
        let mut needed: Vec<(String, String)> = Vec::new();
        for src in [shim, premium] {
            let mut rest = src;
            while let Some(i) = rest.find("plugin:") {
                rest = &rest[i + 7..];
                let end = rest.find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '|')).unwrap_or(rest.len());
                if let Some((p, c)) = rest[..end].split_once('|') {
                    if !c.is_empty() {
                        needed.push((p.to_string(), c.to_string()));
                    }
                }
            }
        }
        // winCmd("window_x", "<core command>"): the plugin:window fallbacks.
        let mut rest = shim;
        while let Some(i) = rest.find("winCmd(\"") {
            rest = &rest[i + 8..];
            let second = rest.split(',').nth(1).unwrap_or_default().trim().trim_end_matches(')').trim_matches('"').to_string();
            if !second.is_empty() && !second.contains('(') {
                needed.push(("window".into(), second));
            }
        }
        // Tauri's own data-tauri-drag-region script.
        needed.push(("window".into(), "start_dragging".into()));
        needed.push(("window".into(), "internal_toggle_maximize".into()));
        assert!(needed.iter().any(|(p, c)| p == "opener" && c == "open_url"), "parsed: {needed:?}");
        assert!(needed.iter().any(|(p, c)| p == "window" && c == "toggle_maximize"), "parsed: {needed:?}");
        for label in ["main", "popout-1", "acct-u1", "admin", "signup-stats"] {
            let g = granted(label);
            for (p, c) in &needed {
                let perm = permission_for(p, c);
                assert!(g.contains(&perm), "{label} needs {perm} (plugin:{p}|{c})");
            }
        }
    }

    /// Every window that runs the app (main, admin, pop-outs, account windows) gets the native
    /// browser guards (no WebView2 menu, no Reload / Back / Print / Save accelerators).
    #[test]
    fn app_windows_get_the_browser_guards() {
        for (file, src) in [
            ("main.rs", include_str!("../../../app/src-tauri/src/main.rs")),
            ("admin.rs", include_str!("../../../app/src-tauri/src/admin.rs")),
            ("multi_window.rs", include_str!("../../../app/src-tauri/src/premium/features/multi_window.rs")),
            ("multi_account.rs", include_str!("../../../app/src-tauri/src/premium/features/multi_account.rs")),
        ] {
            assert!(src.contains("install_browser_guards(&"), "{file} creates an app window without the browser guards");
        }
    }

    /// Windows that take HTML5 drops (chat files, server reordering, the quick drop zone) keep
    /// WebView2's own drag and drop: Tauri's handler swallows every drop on Windows.
    #[test]
    fn drop_targets_keep_html5_drag_and_drop() {
        for (file, src) in [
            ("main.rs", include_str!("../../../app/src-tauri/src/main.rs")),
            ("admin.rs", include_str!("../../../app/src-tauri/src/admin.rs")),
            ("multi_window.rs", include_str!("../../../app/src-tauri/src/premium/features/multi_window.rs")),
            ("multi_account.rs", include_str!("../../../app/src-tauri/src/premium/features/multi_account.rs")),
            ("premium/overlay.rs", include_str!("../../../app/src-tauri/src/premium/overlay.rs")),
        ] {
            assert!(src.contains(".disable_drag_drop_handler()"), "{file}: HTML5 drops would never reach the page");
        }
    }

    #[test]
    fn devtools_stay_off_in_release() {
        let cargo = include_str!("../../../app/src-tauri/Cargo.toml");
        let tauri_line = cargo.lines().find(|l| l.starts_with("tauri =")).expect("tauri dependency");
        assert!(!tauri_line.contains("devtools"), "the devtools feature would open the inspector in release builds");
    }
}
