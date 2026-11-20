//! Secrets at rest: DPAPI (CurrentUser) with a per-purpose entropy, in
//! %APPDATA%\com.descall.app\secure\*.bin. Same protection class as Electron's safeStorage on
//! Windows (Chromium OSCrypt wraps its key with DPAPI too), without the Local State key file.
//! Windows Credential Manager was considered: its 2.5 KB blob limit (CRED_MAX_CREDENTIAL_BLOB_SIZE)
//! is too small for the multi-account list and the app-lock record, so it is not used.

use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

pub const TOKEN: &str = "auth-token";
pub const APP_LOCK: &str = "app-lock";
const ENTROPY_PREFIX: &str = "descall/secure-store/v1/";

fn path<R: Runtime>(app: &AppHandle<R>, name: &str) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("secure");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{name}.bin")))
}

#[cfg(windows)]
pub fn get<R: Runtime>(app: &AppHandle<R>, name: &str) -> Option<String> {
    let sealed = std::fs::read(path(app, name)?).ok()?;
    let entropy = format!("{ENTROPY_PREFIX}{name}");
    let plain = descall_migrate::win::dpapi::unprotect(&sealed, Some(entropy.as_bytes())).ok()?;
    String::from_utf8(plain).ok()
}

#[cfg(windows)]
pub fn set<R: Runtime>(app: &AppHandle<R>, name: &str, value: &str) -> bool {
    let Some(p) = path(app, name) else { return false };
    if value.is_empty() {
        return std::fs::remove_file(p).is_ok();
    }
    let entropy = format!("{ENTROPY_PREFIX}{name}");
    match descall_migrate::win::dpapi::protect(value.as_bytes(), Some(entropy.as_bytes())) {
        Ok(sealed) => std::fs::write(p, sealed).is_ok(),
        Err(_) => false,
    }
}

#[cfg(not(windows))]
pub fn get<R: Runtime>(_app: &AppHandle<R>, _name: &str) -> Option<String> {
    None
}
#[cfg(not(windows))]
pub fn set<R: Runtime>(_app: &AppHandle<R>, _name: &str, _value: &str) -> bool {
    false
}
