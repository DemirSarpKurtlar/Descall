//! The page CSP of the Tauri shell (app/src-tauri/tauri.conf.json, app.security.csp) must
//! allow exactly what electron/cspPolicy.cjs allows for the packaged app, so the same
//! frontend/dist works in both shells. Tauri adds the sha256 of every inline <script> of
//! index.html itself (Electron computed them at start-up), so only the source lists are
//! compared. The Electron-only `descall:` scheme and the dev server are left out on purpose.
//!
//! One deliberate difference: no 'unsafe-eval'. Electron carried it since 2.9 with no user;
//! the built bundle has no eval, new Function or string timers (the only `Function("return
//! this")` is socket.io's global lookup, reached only when neither self nor window exists),
//! and gtag.js, Google Ads and PostHog do not need it (only GTM custom JavaScript variables
//! do, and the app loads gtag.js, not a GTM container). WebAssembly keeps 'wasm-unsafe-eval'.

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    const ELECTRON: &str = include_str!("../../../../frontend/electron/cspPolicy.cjs");
    const TAURI_CONF: &str = include_str!("../../../app/src-tauri/tauri.conf.json");

    fn electron_const(name: &str) -> String {
        let start = ELECTRON.find(&format!("const {name} = \"")).unwrap_or_else(|| panic!("{name} in cspPolicy.cjs")) + name.len() + 10;
        let end = start + ELECTRON[start..].find('"').unwrap();
        ELECTRON[start..end].to_string()
    }
    fn sources(directive_value: &str) -> BTreeSet<String> {
        directive_value.split_whitespace().map(|s| s.trim_end_matches(';').to_string()).filter(|s| !s.is_empty()).collect()
    }
    fn electron_directive(name: &str, directive: &str) -> BTreeSet<String> {
        let v = electron_const(name);
        let body = v.trim().strip_prefix(directive).unwrap_or(&v).to_string();
        let mut s = sources(&body);
        s.remove("descall:");
        s.remove("http://localhost:5173");
        s
    }
    fn tauri_directive(directive: &str) -> BTreeSet<String> {
        let conf: serde_json::Value = serde_json::from_str(TAURI_CONF).unwrap();
        let v = conf["app"]["security"]["csp"][directive].as_str().unwrap_or_else(|| panic!("{directive} in tauri.conf.json"));
        let mut s = sources(v);
        // Tauri's own IPC and asset protocol.
        for own in ["ipc:", "http://ipc.localhost", "https://ipc.localhost", "asset:", "http://asset.localhost", "https://asset.localhost"] {
            s.remove(own);
        }
        s
    }

    #[test]
    fn source_lists_match_electron() {
        assert_eq!(tauri_directive("connect-src"), electron_directive("CONNECT", "connect-src"), "connect-src");
        assert_eq!(tauri_directive("img-src"), electron_directive("IMG", "img-src"), "img-src");
        assert_eq!(tauri_directive("media-src"), electron_directive("MEDIA", "media-src"), "media-src");
        let mut script = sources(&electron_const("SCRIPT_REMOTE"));
        script.insert("'self'".to_string());
        let mut tauri_script = tauri_directive("script-src");
        tauri_script.remove("'wasm-unsafe-eval'");
        assert_eq!(tauri_script, script, "script-src (hashes are added by Tauri)");
        assert!(!tauri_directive("script-src").contains("'unsafe-inline'"), "no unsafe-inline for page scripts");
    }

    #[test]
    fn no_eval_for_page_scripts() {
        let conf: serde_json::Value = serde_json::from_str(TAURI_CONF).unwrap();
        for (directive, v) in conf["app"]["security"]["csp"].as_object().unwrap() {
            let v = v.as_str().unwrap_or_default();
            assert!(!sources(v).contains("'unsafe-eval'"), "{directive} must not allow 'unsafe-eval'");
        }
        // Electron adds it next to SCRIPT_REMOTE (cspPolicy.cjs), so the parity check above
        // compares the remote list without it.
        assert!(electron_const("SCRIPT_REMOTE").split_whitespace().all(|s| s != "'unsafe-eval'"));
    }

    /// Every window has a CSP: app pages (main, admin, pop-outs, account windows, launcher,
    /// tray panel) get tauri.conf.json's; the call / sidebar portals are about:blank documents
    /// of the main page and inherit it; the shell pages and the HUD send their own header.
    #[test]
    fn every_window_has_a_csp() {
        let conf: serde_json::Value = serde_json::from_str(TAURI_CONF).unwrap();
        let csp = &conf["app"]["security"]["csp"];
        assert!(csp.is_object(), "app CSP on");
        assert_eq!(csp["object-src"], "'none'");
        assert_eq!(csp["base-uri"], "'self'");
        assert_eq!(csp["default-src"], "'self'", "frames and anything unlisted: the app origin only");
        for (directive, v) in csp.as_object().unwrap() {
            for src in sources(v.as_str().unwrap_or_default()) {
                assert!(src != "*" && src != "http:" && src != "https:" && src != "file:", "{directive} allows {src}");
            }
        }
        assert!(conf["app"]["security"].get("dangerousRemoteDomainIpcAccess").is_none());
        assert!(conf["app"]["security"].get("assetProtocol").is_none_or(|a| a["enable"] != true), "no asset protocol file access");
        for (name, header) in [("shell pages", crate::pages::CSP), ("HUD", crate::pages::HUD_CSP)] {
            assert!(header.contains("default-src 'none'"), "{name}");
        }
        let main = include_str!("../../../app/src-tauri/src/main.rs");
        assert!(main.contains(".header(\"Content-Security-Policy\", descall_shell::pages::CSP)"), "the shell scheme sends its CSP");
        assert!(!crate::pages::CSP.contains("'unsafe-eval'"));
    }

    /// Updates are minisign-verified over https. The committed config carries a placeholder
    /// key (the updater stays off: commands/updates.rs configured()), the release workflow
    /// puts the committed desktop/keys/tauri-updater.pub in at build time.
    #[test]
    fn updater_is_signed_and_https() {
        let conf: serde_json::Value = serde_json::from_str(TAURI_CONF).unwrap();
        let up = &conf["plugins"]["updater"];
        let endpoints = up["endpoints"].as_array().expect("endpoints");
        assert!(!endpoints.is_empty());
        for e in endpoints {
            assert!(e.as_str().unwrap().starts_with("https://"), "{e}");
        }
        assert!(up.get("dangerousInsecureTransportProtocol").is_none_or(|v| v != true));
        assert!(up.get("dangerousAcceptInvalidCerts").is_none_or(|v| v != true));
        let key = up["pubkey"].as_str().unwrap_or_default();
        let updates = include_str!("../../../app/src-tauri/src/commands/updates.rs");
        assert!(key.starts_with("REPLACE") && updates.contains("!key.is_empty() && !key.starts_with(\"REPLACE\")"), "placeholder key keeps the updater off");
        let wf = include_str!("../../../../.github/workflows/tauri-release.yml");
        assert!(wf.contains("updater = @{ pubkey = $env:UPDATER_PUB }") && wf.contains("desktop/keys/tauri-updater.pub"));
        assert!(!updates.contains("version_comparator"), "no custom comparator (downgrades stay refused)");
    }
}
