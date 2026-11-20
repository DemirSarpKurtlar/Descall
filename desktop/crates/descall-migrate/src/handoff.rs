//! The handoff document: what the Electron bridge exports and the Tauri app imports.
//! Versioned; unknown fields are kept (forward compatible); expires after 72 h.
//! Secrets are zeroized on drop. Every name that becomes a file name later (account ids,
//! premium file names) is checked here, so a hostile handoff cannot write outside the
//! app's folder.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::MigrateError;

pub const VERSION: u32 = 1;
pub const MAX_AGE_SECS: u64 = 72 * 3600;
/// Clock skew we accept for `created_at_unix` in the future.
pub const MAX_FUTURE_SKEW_SECS: u64 = 10 * 60;
/// stdin cap for `--receive-handoff`.
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_ACCOUNTS: usize = 8;
pub const MAX_LOCAL_STORAGE_KEYS: usize = 4000;
/// An extra account's localStorage (its saved app settings). The bridge keeps each account
/// under 1 MiB (migrationBridge.cjs trimLocalStorage); twice that is a broken bridge.
pub const MAX_ACCOUNT_LOCAL_STORAGE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_PREMIUM_FILES: usize = 64;
pub const MAX_PREMIUM_FILE_BYTES: usize = 1024 * 1024;
/// DPAPI optional entropy: binds the blob to this purpose (another program running as the
/// same user that calls CryptUnprotectData without it gets ERROR_INVALID_DATA).
pub const ENTROPY: &[u8] = b"descall/migration/handoff/v1";
/// localStorage keys that must never travel in clear (the shell keeps the token in DPAPI).
pub const FORBIDDEN_LOCAL_STORAGE_KEYS: &[&str] = &["descall_token", "token", "authToken"];

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop, Default, PartialEq, Eq)]
pub struct Secret(pub String);

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Secret(<{} bytes>)", self.0.len())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// Electron multi_account id: 12 lower-case hex characters.
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub token: Secret,
    /// localStorage of the account's own partition (persist:acct-<id>).
    #[serde(default)]
    pub local_storage: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default)]
    pub maximized: bool,
    /// Electron stores DIP bounds; the importer converts with the monitor's scale factor.
    #[serde(default = "dip")]
    pub unit: String,
}
fn dip() -> String {
    "dip".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Autostart {
    pub enabled: bool,
    /// The user turned it off in Task Manager (StartupApproved\Run first byte 0x03).
    #[serde(default)]
    pub disabled_by_user: bool,
    #[serde(default)]
    pub decided: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Handoff {
    pub version: u32,
    pub created_at_unix: u64,
    #[serde(default)]
    pub electron_version: String,
    #[serde(default)]
    pub install_id: String,
    /// Migration id from the signed plan (also in the job); ties health and reports together.
    #[serde(default)]
    pub migration_id: String,
    #[serde(default)]
    pub install_dir: String,
    #[serde(default)]
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
    /// premium-settings.json and the files of userData/premium: copied verbatim.
    #[serde(default)]
    pub premium_files: BTreeMap<String, String>,
    /// App lock record (salted scrypt hash, not the PIN): still a secret.
    pub app_lock_record: Option<Secret>,
    #[serde(default)]
    pub flags: BTreeMap<String, bool>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

fn bad(msg: impl Into<String>) -> MigrateError {
    MigrateError::Handoff(msg.into())
}

impl Handoff {
    pub fn validate(&self, now_unix: u64) -> crate::Result<()> {
        if self.version == 0 || self.version > VERSION {
            return Err(bad(format!("unsupported version {}", self.version)));
        }
        if now_unix.saturating_sub(self.created_at_unix) > MAX_AGE_SECS {
            return Err(bad("expired"));
        }
        if self.created_at_unix > now_unix + MAX_FUTURE_SKEW_SECS {
            return Err(bad("created in the future"));
        }
        if let Some(t) = &self.token {
            if !looks_like_jwt(&t.0) {
                return Err(bad("token is not a JWT"));
            }
        }
        if self.local_storage.keys().any(|k| FORBIDDEN_LOCAL_STORAGE_KEYS.contains(&k.as_str())) {
            return Err(bad("token found in localStorage export"));
        }
        if self.local_storage.len() > MAX_LOCAL_STORAGE_KEYS {
            return Err(bad("localStorage too large"));
        }
        if self.accounts.len() > MAX_ACCOUNTS {
            return Err(bad("too many accounts"));
        }
        let mut ids = std::collections::BTreeSet::new();
        for a in &self.accounts {
            if !is_account_id(&a.id) || !ids.insert(a.id.as_str()) {
                return Err(bad("bad account id"));
            }
            if !looks_like_jwt(&a.token.0) {
                return Err(bad("account token is not a JWT"));
            }
            if a.local_storage.keys().any(|k| FORBIDDEN_LOCAL_STORAGE_KEYS.contains(&k.as_str())) {
                return Err(bad("token found in account localStorage export"));
            }
            if a.local_storage.len() > MAX_LOCAL_STORAGE_KEYS || local_storage_bytes(&a.local_storage) > MAX_ACCOUNT_LOCAL_STORAGE_BYTES {
                return Err(bad("account localStorage too large"));
            }
        }
        if self.premium_files.len() > MAX_PREMIUM_FILES {
            return Err(bad("too many premium files"));
        }
        for (name, body) in &self.premium_files {
            if !is_safe_file_name(name) {
                return Err(bad("bad premium file name"));
            }
            if body.len() > MAX_PREMIUM_FILE_BYTES {
                return Err(bad("premium file too large"));
            }
        }
        if let Some(r) = &self.app_lock_record {
            if !is_app_lock_record(&r.0) {
                return Err(bad("app lock record is not a JSON object"));
            }
        }
        if let Some(l) = &self.locale {
            if l.len() > 16 || !l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
                return Err(bad("bad locale"));
            }
        }
        if let Some(w) = &self.window_state {
            if w.width <= 0 || w.height <= 0 || w.width > 20_000 || w.height > 20_000 {
                return Err(bad("bad window state"));
            }
        }
        Ok(())
    }

    /// True when there is something to sign in with (main or extra account).
    pub fn has_session(&self) -> bool {
        self.token.is_some() || !self.accounts.is_empty()
    }
}

/// UTF-8 bytes of keys and values (the bridge's `Buffer.byteLength` sum).
pub fn local_storage_bytes(m: &BTreeMap<String, String>) -> usize {
    m.iter().map(|(k, v)| k.len() + v.len()).sum()
}

/// Same check as electron/tokenCrypto.cjs looksLikeJwt.
pub fn looks_like_jwt(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    let ok = |p: &str, min: usize| p.len() >= min && p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    parts.len() == 3 && ok(parts[0], 8) && ok(parts[1], 8) && ok(parts[2], 0)
}

/// Descall+ app lock (premium/app-lock.bin): a JSON object with the salted PIN hash.
/// The new app re-seals it with DPAPI and verifies Electron's record format itself.
pub fn is_app_lock_record(s: &str) -> bool {
    s.len() <= 16 * 1024 && matches!(serde_json::from_str::<serde_json::Value>(s), Ok(serde_json::Value::Object(_)))
}

/// Electron multi_account ids: `^[a-f0-9]{12}$` (premium/features/multi_account.cjs).
pub fn is_account_id(s: &str) -> bool {
    s.len() == 12 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// A plain file name: no separators, no `..`, no drive, no reserved device name, short.
pub fn is_safe_file_name(s: &str) -> bool {
    if s.is_empty() || s.len() > 96 || s.starts_with('.') || s.ends_with('.') || s.ends_with(' ') {
        return false;
    }
    if !s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.')) {
        return false;
    }
    let stem = s.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"];
    !reserved.contains(&stem.as_str())
}

/// What `--receive-handoff` reads from stdin: the non-secret job and the secret handoff.
#[derive(Debug, Deserialize)]
pub struct Envelope {
    pub job: crate::job::MigrationJob,
    pub handoff: Handoff,
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(crate) const JWT: &str = "eyJhbGciOi.eyJzdWIiOiIx.c2ln";

    fn sample() -> Handoff {
        Handoff { version: 1, created_at_unix: 1_000_000, token: Some(Secret(JWT.into())), ..Default::default() }
    }

    #[test]
    fn round_trips_and_keeps_unknown_fields() {
        let mut v: serde_json::Value = serde_json::to_value(sample()).unwrap();
        v["futureField"] = serde_json::json!({"a": 1});
        let h: Handoff = serde_json::from_value(v).unwrap();
        assert!(h.extra.contains_key("futureField"));
        h.validate(1_000_100).unwrap();
        assert!(h.has_session());
        // Debug never prints the secret.
        assert!(!format!("{h:?}").contains("eyJzdWIiOiIx"));
    }

    #[test]
    fn rejects_expired_future_bad_token_and_future_version() {
        assert!(sample().validate(1_000_000 + MAX_AGE_SECS + 1).is_err());
        assert!(sample().validate(1_000_000 - MAX_FUTURE_SKEW_SECS - 1).is_err());
        let mut h = sample();
        h.token = Some(Secret("not a jwt".into()));
        assert!(h.validate(1_000_000).is_err());
        let mut h = sample();
        h.version = 2;
        assert!(h.validate(1_000_000).is_err());
        let mut h = sample();
        h.local_storage.insert("descall_token".into(), JWT.into());
        assert!(h.validate(1_000_000).is_err());
    }

    #[test]
    fn carries_the_descall_plus_app_lock_record() {
        let record = r#"{"v":1,"algo":"scrypt","salt":"c2FsdA==","hash":"aGFzaA==","len":6}"#;
        let mut h = sample();
        h.app_lock_record = Some(Secret(record.into()));
        h.validate(1_000_000).unwrap();
        let back: Handoff = serde_json::from_str(&serde_json::to_string(&h).unwrap()).unwrap();
        assert_eq!(back.app_lock_record, Some(Secret(record.into())), "survives the seal / import round trip");
        for bad in ["1234", "[1]", "{broken", ""] {
            h.app_lock_record = Some(Secret(bad.into()));
            assert!(h.validate(1_000_000).is_err(), "{bad}");
        }
        assert!(!format!("{:?}", Some(Secret(record.into()))).contains("scrypt"), "never printed");
    }

    #[test]
    fn extra_accounts_carry_their_own_settings_within_limits() {
        let mut h = sample();
        let mut a = Account { id: "0123456789ab".into(), token: Secret(JWT.into()), ..Default::default() };
        a.local_storage.insert("theme".into(), "light".into());
        h.accounts.push(a);
        h.validate(1_000_000).unwrap();
        let back: Handoff = serde_json::from_str(&serde_json::to_string(&h).unwrap()).unwrap();
        assert_eq!(back.accounts[0].local_storage.get("theme").map(String::as_str), Some("light"));

        let mut big = h.clone();
        big.accounts[0].local_storage.insert("cache".into(), "x".repeat(MAX_ACCOUNT_LOCAL_STORAGE_BYTES));
        assert!(big.validate(1_000_000).is_err(), "over the byte cap");
        let mut many = h.clone();
        many.accounts[0].local_storage = (0..=MAX_LOCAL_STORAGE_KEYS).map(|i| (format!("k{i}"), String::new())).collect();
        assert!(many.validate(1_000_000).is_err(), "over the key cap");
        let mut tok = h.clone();
        tok.accounts[0].local_storage.insert("authToken".into(), JWT.into());
        assert!(tok.validate(1_000_000).is_err(), "a token never travels in clear");
    }

    #[test]
    fn rejects_names_that_could_escape_the_app_folder() {
        for id in ["../../x", "ABCDEF123456", "abc", "0123456789abz"] {
            let mut h = sample();
            h.accounts.push(Account { id: id.into(), token: Secret(JWT.into()), ..Default::default() });
            assert!(h.validate(1_000_000).is_err(), "{id}");
        }
        let mut h = sample();
        h.accounts.push(Account { id: "0123456789ab".into(), token: Secret(JWT.into()), ..Default::default() });
        h.validate(1_000_000).unwrap();
        h.accounts.push(Account { id: "0123456789ab".into(), token: Secret(JWT.into()), ..Default::default() });
        assert!(h.validate(1_000_000).is_err(), "duplicate id");
        for name in ["..", "../a.json", "a\\b.json", "C:x.json", "CON.json", ".hidden", "ok.json."] {
            assert!(!is_safe_file_name(name), "{name}");
        }
        assert!(is_safe_file_name("premium-settings.json"));
        let mut h = sample();
        h.premium_files.insert("../evil.json".into(), "{}".into());
        assert!(h.validate(1_000_000).is_err());
    }
}
