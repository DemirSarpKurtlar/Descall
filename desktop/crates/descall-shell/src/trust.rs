//! Which pages the shell trusts. Port of electron/appTrust.cjs for the Tauri origin.
//!
//! App origin: `https://tauri.localhost` (the packaged frontend/dist, `use_https_scheme`),
//! plus the Vite server `http://localhost:5173` in a dev build only. Shell pages
//! (notification capsules, voice overlay) live on `https://descall-shell.localhost`.
//! Origins are compared exactly after parsing, never by substring. URLs with credentials
//! never match. The backend CORS allowlist must contain APP_ORIGIN.

use url::Url;

pub const APP_ORIGIN: &str = "https://tauri.localhost";
pub const DEV_ORIGIN: &str = "http://localhost:5173";
/// Custom URI scheme of the shell pages; on Windows WebView2 serves it as https://<scheme>.localhost.
pub const SHELL_SCHEME: &str = "descall-shell";
pub const SHELL_ORIGIN: &str = "https://descall-shell.localhost";
/// The Electron origin, for reference in the migration (its localStorage is imported once).
pub const ELECTRON_ORIGIN: &str = "descall://app";

/// Normalized origin of an http(s) URL, or None (other schemes, credentials, bad URLs).
pub fn origin_of(url: &str) -> Option<String> {
    let u = Url::parse(url).ok()?;
    if !u.username().is_empty() || u.password().is_some() {
        return None;
    }
    match u.scheme() {
        "http" | "https" => {
            let origin = u.origin();
            origin.is_tuple().then(|| origin.ascii_serialization())
        }
        _ => None,
    }
}

/// True when `url` is a page of the app itself (exact origin match).
pub fn is_app_url(url: &str, is_dev: bool) -> bool {
    match origin_of(url) {
        Some(o) => o == APP_ORIGIN || (is_dev && o == DEV_ORIGIN),
        None => false,
    }
}

pub fn is_shell_url(url: &str) -> bool {
    origin_of(url).as_deref() == Some(SHELL_ORIGIN)
}

/// Schemes the shell may hand to the OS (default browser / mail client). Never file:,
/// never custom schemes.
pub fn is_safe_external_url(url: &str) -> bool {
    let Ok(u) = Url::parse(url) else { return false };
    match u.scheme() {
        "mailto" => true,
        "http" | "https" => u.host_str().is_some_and(|h| !h.is_empty()),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    //! appTrust.selftest.mjs, with the Tauri origin in place of descall://app.
    use super::*;

    #[test]
    fn origins() {
        assert_eq!(origin_of("https://tauri.localhost/index.html").as_deref(), Some(APP_ORIGIN));
        assert_eq!(origin_of("https://TAURI.localhost/settings/shop").as_deref(), Some(APP_ORIGIN));
        assert_eq!(origin_of("http://localhost:5173/settings").as_deref(), Some(DEV_ORIGIN));
        assert_eq!(origin_of("https://descall.com/x").as_deref(), Some("https://descall.com"));
        assert_eq!(origin_of("file:///C:/x.html"), None);
        assert_eq!(origin_of("https://user@tauri.localhost/x"), None, "credentials never match");
        assert_eq!(origin_of("not a url"), None);
        assert_eq!(origin_of(""), None);
    }

    #[test]
    fn packaged_app_only_trusts_its_origin() {
        for u in ["https://tauri.localhost/index.html", "https://tauri.localhost/", "https://tauri.localhost/settings/shop?x=1#y", "https://tauri.localhost/admin/panel"] {
            assert!(is_app_url(u, false), "{u} is the app");
        }
        for u in [
            "https://evil.example/?tauri.localhost",
            "https://tauri.localhost.evil.example/",
            "http://evil.example/tauri.localhost",
            "http://tauri.localhost/",
            "http://localhost:5173/",
            "http://localhost/",
            "file:///C:/Users/x/AppData/Local/Temp/a.html",
            "file://localhost/etc/passwd",
            "https://tauri.localhost:8443/",
            "https://x@tauri.localhost/",
            "descall://app/index.html",
            "https://descall.com/",
            "javascript:alert(1)",
            "data:text/html,<b>x</b>",
            "about:blank",
            "",
        ] {
            assert!(!is_app_url(u, false), "{u} is not the app");
        }
    }

    #[test]
    fn dev_run_adds_the_vite_origin_exactly() {
        assert!(is_app_url("http://localhost:5173/", true));
        assert!(is_app_url("http://localhost:5173/settings/shop", true));
        assert!(is_app_url("https://tauri.localhost/index.html", true));
        for u in ["http://localhost:5174/", "https://localhost:5173/", "http://127.0.0.1:5173/", "http://localhost:5173.evil.example/", "http://localhost:5173@evil.example/", "https://evil.example/?localhost"] {
            assert!(!is_app_url(u, true), "{u} is not the dev origin");
        }
    }

    #[test]
    fn shell_pages() {
        assert!(is_shell_url("https://descall-shell.localhost/notif.html?id=3"));
        assert!(!is_shell_url("https://descall-shell.localhost.evil/notif.html"));
        assert!(!is_app_url("https://descall-shell.localhost/notif.html", false), "shell pages are not the app");
    }

    #[test]
    fn what_may_go_to_the_os() {
        for u in ["https://github.com/DemirSarpKurtlar/Descall", "http://example.com", "mailto:contact@descall.com"] {
            assert!(is_safe_external_url(u), "{u} opens externally");
        }
        for u in ["file:///C:/Windows/System32/calc.exe", "descall://app/x", "javascript:alert(1)", "ms-settings:privacy", "smb://host/share", "vbscript:x", "", "https://"] {
            assert!(!is_safe_external_url(u), "{u} never opens externally");
        }
    }
}
