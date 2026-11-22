//! windowKeys.cjs devToolsAllowed: DevTools in a packaged build only with the support opt-in
//! file in the app data folder. The console runs in the trusted app origin, where the session
//! token is reachable over IPC, so "paste this into the console" self-XSS must not work for
//! ordinary users.

use std::path::Path;

/// Same name as Electron's userData/devtools-enabled.
pub const DEVTOOLS_OPT_IN_FILE: &str = "devtools-enabled";

/// Always in a dev run; in a release build only when `<data_dir>/devtools-enabled` exists.
pub fn devtools_allowed(dev_build: bool, data_dir: Option<&Path>, exists: impl Fn(&Path) -> bool) -> bool {
    if dev_build {
        return true;
    }
    match data_dir {
        Some(d) if !d.as_os_str().is_empty() => exists(&d.join(DEVTOOLS_OPT_IN_FILE)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn dev_build_always() {
        assert!(devtools_allowed(true, None, |_| false));
    }

    #[test]
    fn release_needs_the_opt_in_file() {
        let dir = PathBuf::from("C:/Users/u/AppData/Roaming/app.descall");
        assert!(!devtools_allowed(false, Some(&dir), |_| false));
        assert!(devtools_allowed(false, Some(&dir), |p| p == dir.join("devtools-enabled")));
        assert!(!devtools_allowed(false, Some(&dir), |p| p == dir.join("other")));
    }

    #[test]
    fn release_without_a_data_dir_is_off() {
        assert!(!devtools_allowed(false, None, |_| true));
        assert!(!devtools_allowed(false, Some(Path::new("")), |_| true));
    }
}
