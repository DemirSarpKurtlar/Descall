//! The handoff document: what the Electron bridge exports and the Tauri app imports.
//! Versioned; unknown fields are kept (forward compatible); expires after 72 h.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use zeroize::{Zeroize, ZeroizeOnDrop};

pub const VERSION: u32 = 1;
pub const MAX_AGE_SECS: u64 = 72 * 3600;
/// DPAPI optional entropy: binds the blob to this purpose (another app running as the same
/// user that calls CryptUnprotectData without it gets ERROR_INVALID_DATA).
pub const ENTROPY: &[u8] = b"descall/migration/handoff/v1";

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop, Default)]
pub struct Secret(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub label: String,
    pub token: Secret,
    /// localStorage of the account's own partition (persist:acct-<id>).
    #[serde(default)]
    pub local_storage: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub maximized: bool,
    /// Electron stores DIP bounds; the importer converts with the monitor's scale factor.
    #[serde(default = "dip")]
    pub unit: String,
}
fn dip() -> String {
    "dip".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Autostart {
    pub enabled: bool,
    /// The user turned it off in Task Manager (StartupApproved\Run first byte 0x03).
    pub disabled_by_user: bool,
    pub decided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Handoff {
    pub version: u32,
    pub created_at_unix: u64,
    pub electron_version: String,
    pub install_id: String,
    pub install_dir: String,
    pub per_machine: bool,
    pub token: Option<Secret>,
    #[serde(default)]
    pub accounts: Vec<Account>,
    /// localStorage of descall://app (theme, sound settings, quality presets, drafts...).
    #[serde(default)]
    pub local_storage: BTreeMap<String, String>,
    pub window_state: Option<WindowState>,
    #[serde(default)]
    pub autostart: Autostart,
    pub locale: Option<String>,
    /// premium-settings.json, custom layouts, widget layouts: copied verbatim.
    #[serde(default)]
    pub premium_files: BTreeMap<String, String>,
    /// App lock record (salted scrypt hash, not the PIN), still a secret.
    pub app_lock_record: Option<Secret>,
    #[serde(default)]
    pub flags: BTreeMap<String, bool>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl Handoff {
    pub fn validate(&self, now_unix: u64) -> crate::Result<()> {
        if self.version == 0 || self.version > VERSION {
            return Err(crate::MigrateError::Handoff(format!("unsupported version {}", self.version)));
        }
        if now_unix.saturating_sub(self.created_at_unix) > MAX_AGE_SECS {
            return Err(crate::MigrateError::Handoff("expired".into()));
        }
        if let Some(t) = &self.token {
            if !looks_like_jwt(&t.0) {
                return Err(crate::MigrateError::Handoff("token is not a JWT".into()));
            }
        }
        // localStorage keys holding the token must never be imported in clear (the shell
        // keeps it in DPAPI; electron/tokenCrypto.cjs never put it in localStorage either).
        if self.local_storage.keys().any(|k| k == "descall_token") {
            return Err(crate::MigrateError::Handoff("token found in localStorage export".into()));
        }
        Ok(())
    }
}

/// Same check as electron/tokenCrypto.cjs looksLikeJwt.
pub fn looks_like_jwt(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    let ok = |p: &str, min: usize| p.len() >= min && p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    parts.len() == 3 && ok(parts[0], 8) && ok(parts[1], 8) && ok(parts[2], 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Handoff {
        Handoff {
            version: 1,
            created_at_unix: 1_000_000,
            token: Some(Secret("eyJhbGciOi.eyJzdWIiOiIx.c2ln".into())),
            ..Default::default()
        }
    }
    #[test]
    fn round_trips_and_keeps_unknown_fields() {
        let mut v: serde_json::Value = serde_json::to_value(sample()).unwrap();
        v["futureField"] = serde_json::json!({"a": 1});
        let h: Handoff = serde_json::from_value(v).unwrap();
        assert!(h.extra.contains_key("futureField"));
        h.validate(1_000_100).unwrap();
    }
    #[test]
    fn rejects_expired_bad_token_and_future_version() {
        assert!(sample().validate(1_000_000 + MAX_AGE_SECS + 1).is_err());
        let mut h = sample();
        h.token = Some(Secret("not a jwt".into()));
        assert!(h.validate(1_000_000).is_err());
        let mut h = sample();
        h.version = 2;
        assert!(h.validate(1_000_000).is_err());
    }
}
