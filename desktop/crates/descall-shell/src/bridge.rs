//! Which window may do what through the page bridge (app/shim/electron-api-shim.js), the rules
//! main.cjs applied per sender, plus a build-time check that every command a shim calls is
//! registered in the app's invoke handler.

/// Windows that run on the owner's session (the token in the secret store): the main window,
/// the two admin windows (adminPreload.cjs read the same token file) and the Descall+ pop-outs.
/// Extra-account windows (`acct-*`) keep their own session; shell pages never get a token.
pub fn is_owner_session(label: &str) -> bool {
    matches!(label, "main" | "admin" | "signup-stats") || label.starts_with("popout-")
}

/// main.cjs `app:locale`: the main window and the two admin windows set the UI language.
pub fn sets_ui_locale(label: &str) -> bool {
    matches!(label, "main" | "admin" | "signup-stats")
}

/// App command names a shim calls: every plain string literal in the first argument of
/// `invoke(...)`, `fire(...)` and `winCmd(...)`, so `fire(v ? "token_set" : "token_clear")`
/// counts both. Plugin commands (`"plugin:window|minimize"`) are left to the capability test
/// in electron-api-shim.test.mjs.
pub fn invoked_commands(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    for call in ["invoke(", "fire(", "winCmd("] {
        for (at, _) in src.match_indices(call) {
            let rest = &src[at + call.len()..];
            let first = rest.find([',', ')', '\n']).map_or(rest, |end| &rest[..end]);
            for (i, lit) in first.split('"').enumerate() {
                if i % 2 == 1 && !lit.is_empty() && lit.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    out.push(lit.to_string());
                }
            }
        }
    }
    out
}

/// The command names in a `tauri::generate_handler![...]` list (last path segment of each entry).
pub fn handler_commands(main_rs: &str) -> Vec<String> {
    let Some(start) = main_rs.find(concat!("generate_handler", "![")) else { return Vec::new() };
    let body_start = start + "generate_handler![".len();
    let Some(len) = main_rs[body_start..].find(']') else { return Vec::new() };
    main_rs[body_start..body_start + len]
        .split(',')
        .filter_map(|e| e.trim().rsplit("::").next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN_RS: &str = include_str!("../../../app/src-tauri/src/main.rs");
    /// Every page bridge the shell injects (app/shim/*.js).
    const SHIMS: &[(&str, &str)] = &[
        ("electron-api-shim.js", include_str!("../../../app/shim/electron-api-shim.js")),
        ("native-screen-share.js", include_str!("../../../app/shim/native-screen-share.js")),
        ("premium-shim.js", include_str!("../../../app/shim/premium-shim.js")),
        ("premium-hud-shim.js", include_str!("../../../app/shim/premium-hud-shim.js")),
        ("premium-launcher-shim.js", include_str!("../../../app/shim/premium-launcher-shim.js")),
        ("tray-menu-shim.js", include_str!("../../../app/shim/tray-menu-shim.js")),
        ("shell-notif.js", include_str!("../../../app/shim/shell-notif.js")),
        ("shell-overlay.js", include_str!("../../../app/shim/shell-overlay.js")),
    ];

    /// A shim calling a command missing from generate_handler! only fails at run time
    /// ("command not found", Electron: an ipcMain channel nobody handles). Catch it here.
    #[test]
    fn every_command_a_shim_invokes_is_registered() {
        let reg = handler_commands(MAIN_RS);
        assert!(reg.len() > 30, "handler list parsed: {reg:?}");
        assert!(reg.iter().any(|c| c == "app_version") && reg.iter().any(|c| c == "tray_menu_act"));
        let mut seen = 0;
        for (file, src) in SHIMS {
            for cmd in invoked_commands(src) {
                assert!(reg.contains(&cmd), "{file} invokes {cmd}, which is not in main.rs generate_handler!");
                seen += 1;
            }
        }
        assert!(seen > 40, "commands found in the shims: {seen}");
        let all: String = SHIMS.iter().map(|s| s.1).collect();
        let found = invoked_commands(&all);
        for cmd in ["window_minimize", "token_set", "token_clear", "app_reduced_transparency", "notif_action", "overlay_action", "tray_menu_act", "premium_hud_action", "premium_invoke"] {
            assert!(found.iter().any(|c| c == cmd), "{cmd} is found in a shim (parser check)");
        }
    }

    #[test]
    fn parser_ignores_plugin_and_dynamic_calls() {
        let src = r#"invoke("plugin:window|minimize"); invoke(cmd); fire("a_b"); winCmd("window_close", "close"); T.core.invoke("x1", {}); fire(v ? "t_set" : "t_clear", v)"#;
        assert_eq!(invoked_commands(src), vec!["x1", "a_b", "t_set", "t_clear", "window_close"]);
        let rs = "tauri::generate_handler![\n  a::b::one,\n  two,\n  c::three\n]";
        assert_eq!(handler_commands(rs), vec!["one", "two", "three"]);
    }

    #[test]
    fn token_and_locale_senders() {
        for l in ["main", "admin", "signup-stats", "popout-3"] {
            assert!(is_owner_session(l), "{l}");
        }
        for l in ["acct-12", "notif-1", "overlay", "hud-2", "widget-x", "launcher", "tray-menu", "pip", "sidebar", ""] {
            assert!(!is_owner_session(l), "{l}");
        }
        assert!(sets_ui_locale("main") && sets_ui_locale("admin") && sets_ui_locale("signup-stats"));
        assert!(!sets_ui_locale("popout-1") && !sets_ui_locale("acct-1") && !sets_ui_locale("notif-1"));
    }

    /// The token change event the shell sends is the one the shim listens for.
    #[test]
    fn token_event_name_matches_the_shim() {
        let system = include_str!("../../../app/src-tauri/src/commands/system.rs");
        assert!(system.contains("pub const TOKEN_EVENT: &str = \"secure-token:changed\";"));
        assert!(SHIMS[0].1.contains("on(\"secure-token:changed\""));
        // token_set / token_clear accept every owner-session window (pop-outs included), the
        // same set that hears the change; extra-account windows go to their own store first.
        for f in ["pub fn token_set", "pub fn token_clear"] {
            let body = &system[system.find(f).unwrap()..];
            let body = &body[..body.find("\n}\n").unwrap()];
            assert!(body.contains("crate::premium::account_token(") && body.contains("descall_shell::bridge::is_owner_session(window.label())"), "{f}");
            assert!(body.find("account_token").unwrap() < body.find("is_owner_session").unwrap(), "{f}: account windows first");
        }
    }
}
