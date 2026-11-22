//! Folders of Descall Node.
//!
//! `%LOCALAPPDATA%\DescallNode\`
//!   `secure\<field>.bin`  DPAPI-sealed setup values (owner-only ACL)
//!   `logs\node.log`       redacted log, rotated into node.1.log ... node.5.log
//!   `settings.json`       non-secret settings (node id seed, last cfg, game list)
//!   `usage.json`          today's uptime, drops, this month's GB-hours
//!
//! The runtime (node.exe, cloudflared.exe, the backend, runtime-manifest.json) is in the
//! install folder's resources; `DESCALL_NODE_RUNTIME_DIR` points elsewhere in development.

use std::path::PathBuf;

pub const APP_DIR: &str = "DescallNode";

pub fn base() -> PathBuf {
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("XDG_DATA_HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    root.join(APP_DIR)
}

pub fn secure_dir() -> PathBuf {
    base().join("secure")
}

pub fn logs_dir() -> PathBuf {
    base().join("logs")
}

pub fn settings_file() -> PathBuf {
    base().join("settings.json")
}

pub fn usage_file() -> PathBuf {
    base().join("usage.json")
}

/// Root of the bundled runtime (contains `runtime/`, `backend/`, `runtime-manifest.json`).
pub fn runtime_root(resource_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dev) = std::env::var_os("DESCALL_NODE_RUNTIME_DIR") {
        return PathBuf::from(dev);
    }
    resource_dir.unwrap_or_else(|| std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_default())
}

pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}
