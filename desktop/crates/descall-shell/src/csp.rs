//! The page CSP of the Tauri shell (app/src-tauri/tauri.conf.json, app.security.csp) must
//! allow exactly what electron/cspPolicy.cjs allows for the packaged app, so the same
//! frontend/dist works in both shells. Tauri adds the sha256 of every inline <script> of
//! index.html itself (Electron computed them at start-up), so only the source lists are
//! compared. The Electron-only `descall:` scheme and the dev server are left out on purpose.

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
        script.extend(["'self'".to_string(), "'unsafe-eval'".to_string()]);
        let mut tauri_script = tauri_directive("script-src");
        tauri_script.remove("'wasm-unsafe-eval'");
        assert_eq!(tauri_script, script, "script-src (hashes are added by Tauri)");
        assert!(!tauri_directive("script-src").contains("'unsafe-inline'"), "no unsafe-inline for page scripts");
    }
}
