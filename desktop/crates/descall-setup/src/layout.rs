//! Folder layout and shell identity (technical plan 3.2-3.4). Per-user only, no admin rights:
//!
//! - App:            `%LOCALAPPDATA%\Programs\Descall\Descall.exe` (same path electron-builder used
//!                   for per-user installs, so pins, firewall rules, GPU preference and per-app audio
//!                   devices keep working after the migration; the migrator passes the old folder).
//! - Uninstaller:    `<app>\uninstall.exe` (a copy of this exe), registered under
//!                   `HKCU\...\Uninstall\Descall` for Apps & features.
//! - Setup data:     `%LOCALAPPDATA%\Descall-Setup\{cache\<version>, logs}`.
//! - App data:       `%APPDATA%\com.descall.app\` (Tauri); `setup.json` carries the choices made here.
//! - Electron data:  `%APPDATA%\Descall\` (only caches are cleared; the rest stays for rollback).
//! - Migration:      `%LOCALAPPDATA%\Descall-Migration\` (handoff.bin from the migrator, summary.json).

use std::path::{Path, PathBuf};

pub const PRODUCT: &str = "Descall";
/// AppUserModelID, Run value name, Tauri identifier: identical to the Electron build.
pub const APP_ID: &str = "com.descall.app";
pub const EXE: &str = "Descall.exe";
pub const UNINSTALLER: &str = "uninstall.exe";
pub const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Descall";
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
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
    fn siblings() {
        assert_eq!(sibling(Path::new("/x/Descall"), ".new"), PathBuf::from("/x/Descall.new"));
    }
}
