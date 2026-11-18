//! Fallback reader for Electron safeStorage files on Windows (auth-token.bin,
//! premium/accounts/<id>/auth-token.bin, premium/app-lock.bin).
//!
//! Electron's safeStorage = Chromium OSCrypt. On Windows: a random 256-bit key is stored in
//! `<userData>/Local State` as `os_crypt.encrypted_key` = base64("DPAPI" + CryptProtectData(key)),
//! and each value is "v10" + 12-byte nonce + AES-256-GCM(ciphertext || 16-byte tag).
//! Electron 45's async safeStorage (os_crypt_async, DPAPI key provider) reads the same key and
//! still writes "v10" (electron/tokenCrypto.cjs: sync-written files decrypt with the async API).
//! Chrome's app-bound "v20" scheme is Chrome-branded only (elevation service) and is not used
//! by Electron. P0 acceptance test: decrypt a real 3.9.x token file with this code.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;

use crate::{MigrateError, Result};

pub const V10: &[u8] = b"v10";
const DPAPI_PREFIX: &[u8] = b"DPAPI";

/// `os_crypt.encrypted_key` from Local State, base64-decoded with the "DPAPI" prefix removed:
/// the bytes to hand to CryptUnprotectData.
pub fn wrapped_key_from_local_state(local_state_json: &str) -> Result<Vec<u8>> {
    let v: serde_json::Value = serde_json::from_str(local_state_json)?;
    let b64 = v
        .pointer("/os_crypt/encrypted_key")
        .and_then(|x| x.as_str())
        .ok_or_else(|| MigrateError::OsCrypt("Local State has no os_crypt.encrypted_key".into()))?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| MigrateError::OsCrypt(format!("base64: {e}")))?;
    raw.strip_prefix(DPAPI_PREFIX)
        .map(|r| r.to_vec())
        .ok_or_else(|| MigrateError::OsCrypt("encrypted_key is not DPAPI-wrapped".into()))
}

/// Decrypt one safeStorage blob with the unwrapped 32-byte key.
pub fn decrypt_v10(key: &[u8], blob: &[u8]) -> Result<String> {
    let body = blob
        .strip_prefix(V10)
        .ok_or_else(|| MigrateError::OsCrypt("not a v10 blob (plain text or another scheme)".into()))?;
    if key.len() != 32 || body.len() < 12 + 16 {
        return Err(MigrateError::OsCrypt("bad key or truncated blob".into()));
    }
    let (nonce, ct) = body.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| MigrateError::OsCrypt(e.to_string()))?;
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| MigrateError::OsCrypt("AES-GCM authentication failed".into()))?;
    String::from_utf8(plain).map_err(|_| MigrateError::OsCrypt("not UTF-8".into()))
}

/// Windows: read Local State, unwrap the key with DPAPI, decrypt `blob`.
#[cfg(windows)]
pub fn decrypt_electron_file(user_data_dir: &std::path::Path, blob: &[u8]) -> Result<String> {
    let local_state = std::fs::read_to_string(user_data_dir.join("Local State"))?;
    let wrapped = wrapped_key_from_local_state(&local_state)?;
    let key = zeroize::Zeroizing::new(crate::win::dpapi::unprotect(&wrapped, None)?);
    decrypt_v10(&key, blob)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decrypts_a_chromium_style_v10_blob() {
        let key = [7u8; 32];
        let nonce = [9u8; 12];
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let ct = cipher.encrypt(Nonce::from_slice(&nonce), b"eyJhbGciOi.eyJzdWIiOiIx.c2ln".as_ref()).unwrap();
        let mut blob = V10.to_vec();
        blob.extend_from_slice(&nonce);
        blob.extend_from_slice(&ct);
        assert_eq!(decrypt_v10(&key, &blob).unwrap(), "eyJhbGciOi.eyJzdWIiOiIx.c2ln");
        blob[20] ^= 1;
        assert!(decrypt_v10(&key, &blob).is_err());
    }
    #[test]
    fn parses_local_state() {
        let wrapped = b"DPAPI\x01\x02\x03";
        let json = format!(r#"{{"os_crypt":{{"encrypted_key":"{}"}}}}"#, base64::engine::general_purpose::STANDARD.encode(wrapped));
        assert_eq!(wrapped_key_from_local_state(&json).unwrap(), vec![1, 2, 3]);
    }
}
