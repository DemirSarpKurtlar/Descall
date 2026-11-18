//! `window.descallPremium.invoke('premium:<feature>:<verb>', ...)` dispatcher. Same contract
//! as electron/premium/index.cjs: channel allow-list regex, sender check (only app windows
//! reach commands through the capability file), entitlement gate on every call.

use tauri::AppHandle;

#[tauri::command]
pub async fn premium_invoke(app: AppHandle, channel: String, args: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let ok = channel.len() <= 72
        && channel.starts_with("premium:")
        && channel[8..].bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'_' | b'-'));
    if !ok {
        return Err("premium channel expected".into());
    }
    let _ = (app, args);
    // TODO(P2): route to the 31 feature modules (src/premium/*.rs), gate = entitlements
    // fetched from /api/premium/entitlements and cached (premium/gate.cjs port).
    Err(format!("{channel}: not ported yet"))
}
