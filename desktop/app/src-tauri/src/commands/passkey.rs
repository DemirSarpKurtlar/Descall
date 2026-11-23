//! Passkeys inside the Tauri app (electronAPI.passkeyAvailable / passkeyCreate / passkeyGet /
//! passkeyCancel, shim extras; frontend/src/lib/passkeys/index.js path "tauri").
//!
//! The page origin (https://tauri.localhost) may not use rp id descall.com, so the shell runs
//! the ceremony through webauthn.dll (crates/descall-passkey) with a clientDataJSON whose origin
//! is https://descall.com; Windows Hello, phones and security keys appear over the app window.
//! Only the main window and the Descall+ extra-account windows may ask (sign-in screens live
//! there). Where webauthn.dll is missing (Windows 10 before 1903) passkey_available says so and
//! the page falls back to the browser handoff.

use serde_json::{json, Value};
use tauri::{Runtime, WebviewWindow};

fn allowed<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    let label = window.label();
    label == crate::state::MAIN || label.strip_prefix("acct-").is_some_and(|rest| !rest.is_empty())
}

#[tauri::command]
pub fn passkey_available() -> Value {
    #[cfg(windows)]
    {
        let version = descall_passkey::win::api_version();
        if version >= 1 {
            return json!({ "available": true, "apiVersion": version, "platformAuthenticator": descall_passkey::win::platform_authenticator_available() });
        }
        json!({ "available": false, "apiVersion": 0, "reason": "webauthn_dll_missing" })
    }
    #[cfg(not(windows))]
    {
        json!({ "available": false, "apiVersion": 0, "reason": "not_windows" })
    }
}

#[cfg(windows)]
async fn run_blocking<R: Runtime, T: Send + 'static>(window: WebviewWindow<R>, f: impl FnOnce(isize) -> Result<T, descall_passkey::win::CallError> + Send + 'static) -> Result<T, String> {
    let hwnd = window.hwnd().map(|h| h.0 as isize).map_err(|_| "failed".to_string())?;
    tauri::async_runtime::spawn_blocking(move || f(hwnd))
        .await
        .map_err(|_| "failed".to_string())?
        .map_err(|e| {
            log::info!("[passkey] ceremony ended: {} (0x{:08X})", e.code, e.hresult as u32);
            e.code.to_string()
        })
}

/// options: PublicKeyCredentialCreationOptionsJSON. Returns RegistrationResponseJSON.
#[tauri::command]
pub async fn passkey_create<R: Runtime>(window: WebviewWindow<R>, options: String) -> Result<String, String> {
    if !allowed(&window) {
        return Err("forbidden".into());
    }
    let parsed = descall_passkey::parse_creation_options(&options).map_err(|e| e.code().to_string())?;
    #[cfg(windows)]
    {
        run_blocking(window, move |hwnd| descall_passkey::win::make_credential(hwnd, &parsed)).await
    }
    #[cfg(not(windows))]
    {
        let _ = parsed;
        Err("unsupported".into())
    }
}

/// options: PublicKeyCredentialRequestOptionsJSON. Returns AuthenticationResponseJSON.
#[tauri::command]
pub async fn passkey_get<R: Runtime>(window: WebviewWindow<R>, options: String) -> Result<String, String> {
    if !allowed(&window) {
        return Err("forbidden".into());
    }
    let parsed = descall_passkey::parse_request_options(&options).map_err(|e| e.code().to_string())?;
    #[cfg(windows)]
    {
        run_blocking(window, move |hwnd| descall_passkey::win::get_assertion(hwnd, &parsed)).await
    }
    #[cfg(not(windows))]
    {
        let _ = parsed;
        Err("unsupported".into())
    }
}

/// Closes the open Windows Security dialog (the page's Cancel / a new ceremony).
#[tauri::command]
pub fn passkey_cancel<R: Runtime>(window: WebviewWindow<R>) {
    if !allowed(&window) {
        return;
    }
    #[cfg(windows)]
    descall_passkey::win::cancel();
}
