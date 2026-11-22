//! Folder layout and shell identity (technical plan 3.2-3.4). Per-user only, no admin rights:
//!
//! - App: `%LOCALAPPDATA%\Programs\Descall\Descall.exe` (same path electron-builder used for
//!   per-user installs, so pins, firewall rules, GPU preference and per-app audio devices keep
//!   working after the migration; the migrator passes the old folder).
//! - Uninstaller: `<app>\uninstall.exe` (shipped in the payload, else a copy of this exe),
//!   registered under `HKCU\...\Uninstall\Descall` for Apps & features.
//! - Setup data:     `%LOCALAPPDATA%\Descall-Setup\{cache\<version>, logs}`.
//! - App data:       `%APPDATA%\com.descall.app\` (Tauri); `setup.json` carries the choices made here.
//! - Electron data:  `%APPDATA%\Descall\` (only caches are cleared; the rest stays for rollback).
//! - Migration:      `%LOCALAPPDATA%\Descall-Migration\` (handoff.bin from the migrator, summary.json).

use std::path::{Path, PathBuf};

pub const PRODUCT: &str = "Descall";
/// AppUserModelID, Run value name, Tauri identifier: identical to the Electron build.
pub const APP_ID: &str = "com.descall.app";
pub const EXE: &str = "Descall.exe";
/// Screen-share / instant-clip capture helper (desktop/crates/descall-capture). Descall falls
/// back to in-process capture without it, which a GPU device loss can crash, so the setup
/// refuses a payload that lacks it.
pub const CAPTURE_HOST: &str = "descall-capture-host.exe";
/// Files every payload must contain, with the error code reported when one is missing.
pub const REQUIRED_FILES: &[(&str, &str)] = &[(EXE, "PKG-0EXE"), (CAPTURE_HOST, "PKG-0CAP")];
pub const UNINSTALLER: &str = "uninstall.exe";
pub const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall";
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// Task Manager's "Startup apps" on/off state for the Run value (same value name).
pub const STARTUP_APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// `descall://`, registered by the app itself at run time (tauri-plugin-deep-link), so this
/// installer never wrote it and its uninstaller left it behind, pointing at a deleted exe.
pub const DEEP_LINK_KEY: &str = r"Software\Classes\descall";
pub const DEEP_LINK_COMMAND_KEY: &str = r"Software\Classes\descall\shell\open\command";
pub const TOAST_CLSID: &str = "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}";
/// Same arguments Electron's login item used, so the app starts hidden in the tray.
pub const AUTOSTART_ARGS: &str = "--autostart --hidden";
pub const LNK: &str = "Descall.lnk";
pub const MIN_WINDOWS_BUILD: u32 = 19041;

pub fn manifest_url() -> &'static str {
    option_env!("DESCALL_SETUP_MANIFEST_URL").unwrap_or("https://api.descall.com/api/desktop/setup/win-x64/manifest.json")
}

pub fn publisher() -> &'static str {
    option_env!("DESCALL_PUBLISHER").unwrap_or("Descall")
}

/// Electron cache folders under `%APPDATA%\Descall` that can go right away. Local Storage,
/// IndexedDB, cookies and the token files stay until the 14-day cleanup, so a rollback is lossless.
pub const ELECTRON_CACHE_DIRS: &[&str] = &[
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GrShaderCache",
    "ShaderCache",
    "Crashpad\\reports",
    "Service Worker\\CacheStorage",
    "Service Worker\\ScriptCache",
];

/// Shell properties stamped on every Descall shortcut (Start Menu above all): the AppUserModelID
/// groups windows and toasts under the app, the ToastActivatorCLSID lets Windows start Descall
/// from a toast (Descall+ quick reply) even when it is not running.
pub const SHORTCUT_AUMID: &str = APP_ID;
pub const SHORTCUT_TOAST_ACTIVATOR: &str = TOAST_CLSID;

/// One registry string value under HKCU (`name` empty = the key's default value).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegValue {
    pub key: String,
    pub name: &'static str,
    pub value: String,
}

pub fn toast_clsid_key() -> String {
    format!(r"Software\Classes\CLSID\{TOAST_CLSID}")
}

/// `"<INSTDIR>\Descall.exe"` with Windows separators whatever the host OS.
pub fn quoted_exe(dir: &str) -> String {
    format!("\"{}\\{}\"", dir.trim_end_matches(['\\', '/']), EXE)
}

/// COM local server for toast activation (written on install, the whole key removed on uninstall).
pub fn toast_registry(dir: &str) -> Vec<RegValue> {
    vec![
        RegValue { key: toast_clsid_key(), name: "", value: PRODUCT.to_string() },
        RegValue { key: format!(r"{}\LocalServer32", toast_clsid_key()), name: "", value: quoted_exe(dir) },
    ]
}

/// HKCU keys and values the uninstaller deletes: (key, Some(value name)) or (key, None) for a whole key.
pub fn uninstall_registry() -> Vec<(String, Option<&'static str>)> {
    vec![
        (UNINSTALL_KEY.to_string(), None),
        (toast_clsid_key(), None),
        (RUN_KEY.to_string(), Some(APP_ID)),
        (STARTUP_APPROVED_KEY.to_string(), Some(APP_ID)),
    ]
}

/// The `descall://` open command belongs to the install in `dir` (`"<dir>\Descall.exe" "%1"`,
/// what tauri-plugin-deep-link writes); another copy of Descall keeps its own registration.
pub fn deep_link_is_ours(command: &str, dir: &str) -> bool {
    let want = format!("{} \"%1\"", quoted_exe(dir));
    // Windows paths compare case-insensitively, also outside ASCII (user names like Şükrü).
    command.trim().to_lowercase() == want.to_lowercase()
}

#[derive(Debug, Clone)]
pub struct Layout {
    pub local: PathBuf,
    pub roaming: PathBuf,
}

impl Layout {
    pub fn default_install_dir(&self) -> PathBuf {
        self.local.join("Programs").join(PRODUCT)
    }
    pub fn setup_root(&self) -> PathBuf {
        self.local.join("Descall-Setup")
    }
    pub fn cache_root(&self) -> PathBuf {
        self.setup_root().join("cache")
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.setup_root().join("logs")
    }
    pub fn app_data(&self) -> PathBuf {
        self.roaming.join(APP_ID)
    }
    pub fn electron_data(&self) -> PathBuf {
        self.roaming.join(PRODUCT)
    }
    pub fn migration_dir(&self) -> PathBuf {
        self.local.join("Descall-Migration")
    }
}

/// Folder picked in "Browse": installing straight into `D:\Games` would mix our files with others,
/// so a `Descall` subfolder is added unless the user already picked one.
pub fn normalize_choice(picked: &Path) -> PathBuf {
    match picked.file_name().and_then(|n| n.to_str()) {
        Some(n) if n.eq_ignore_ascii_case(PRODUCT) => picked.to_path_buf(),
        _ => picked.join(PRODUCT),
    }
}

/// `<dir>.new` (staging) and `<dir>.old` (previous files during the swap).
/// The error code of the first required file missing from an unpacked payload in `dir`.
pub fn missing_required(dir: &Path) -> Option<&'static str> {
    REQUIRED_FILES.iter().find(|(name, _)| !dir.join(name).is_file()).map(|(_, code)| *code)
}

pub fn sibling(dir: &Path, suffix: &str) -> PathBuf {
    let mut s = dir.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_layout() {
        let l = Layout { local: PathBuf::from("/L"), roaming: PathBuf::from("/R") };
        assert_eq!(l.default_install_dir(), PathBuf::from("/L/Programs/Descall"));
        assert_eq!(l.cache_root(), PathBuf::from("/L/Descall-Setup/cache"));
        assert_eq!(l.app_data(), PathBuf::from("/R/com.descall.app"));
        assert_eq!(l.electron_data(), PathBuf::from("/R/Descall"));
    }

    #[test]
    fn browse_adds_subfolder_once() {
        assert_eq!(normalize_choice(Path::new("/d/Games")), PathBuf::from("/d/Games/Descall"));
        assert_eq!(normalize_choice(Path::new("/d/Games/descall")), PathBuf::from("/d/Games/descall"));
    }

    #[test]
    fn toast_activation_registry_plan() {
        let v = toast_registry(r"C:\Users\Ada\AppData\Local\Programs\Descall\");
        assert_eq!(v[0], RegValue { key: r"Software\Classes\CLSID\{BCF5A315-F914-4A7E-95BD-313CBE4B661B}".into(), name: "", value: "Descall".into() });
        assert_eq!(v[1].key, r"Software\Classes\CLSID\{BCF5A315-F914-4A7E-95BD-313CBE4B661B}\LocalServer32");
        assert_eq!(v[1].name, "");
        assert_eq!(v[1].value, r#""C:\Users\Ada\AppData\Local\Programs\Descall\Descall.exe""#);
        assert_eq!(SHORTCUT_AUMID, "com.descall.app");
        assert_eq!(SHORTCUT_TOAST_ACTIVATOR, "{BCF5A315-F914-4A7E-95BD-313CBE4B661B}");
        assert_eq!(LNK, "Descall.lnk");
    }

    #[test]
    fn uninstall_removes_clsid_key_and_run_value() {
        let u = uninstall_registry();
        assert!(u.contains(&(toast_clsid_key(), None)));
        assert!(u.contains(&(UNINSTALL_KEY.to_string(), None)));
        assert!(u.contains(&(RUN_KEY.to_string(), Some("com.descall.app"))));
        assert!(u.contains(&(STARTUP_APPROVED_KEY.to_string(), Some("com.descall.app"))), "Task Manager entry goes too");
    }

    #[test]
    fn deep_link_removed_only_when_it_points_here() {
        let dir = r"C:\Users\Şükrü Çelik\AppData\Local\Programs\Descall";
        assert!(deep_link_is_ours(r#""C:\Users\Şükrü Çelik\AppData\Local\Programs\Descall\Descall.exe" "%1""#, dir));
        assert!(deep_link_is_ours(r#""c:\users\şükrü çelik\appdata\local\programs\descall\descall.exe" "%1""#, &format!("{dir}\\")));
        assert!(!deep_link_is_ours(r#""D:\Other\Descall.exe" "%1""#, dir), "another copy keeps its link");
        assert!(!deep_link_is_ours("", dir));
        assert_eq!(DEEP_LINK_COMMAND_KEY, format!(r"{DEEP_LINK_KEY}\shell\open\command"));
    }

    #[test]
    fn payload_needs_the_app_and_the_capture_helper() {
        let d = std::env::temp_dir().join(format!("descall-setup-req-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        assert_eq!(missing_required(&d), Some("PKG-0EXE"));
        std::fs::write(d.join(EXE), b"MZ").unwrap();
        assert_eq!(missing_required(&d), Some("PKG-0CAP"));
        std::fs::write(d.join(CAPTURE_HOST), b"MZ").unwrap();
        assert_eq!(missing_required(&d), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn siblings() {
        assert_eq!(sibling(Path::new("/x/Descall"), ".new"), PathBuf::from("/x/Descall.new"));
    }
}
