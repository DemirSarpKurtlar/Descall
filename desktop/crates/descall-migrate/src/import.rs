//! For the new app's first start: take the sealed handoff (once), or fall back to reading
//! Electron's own files with OSCrypt when there is no handoff (manual install from the
//! website, or a handoff older than 72 h).
//!
//! `take` always shreds the file after reading it, valid or not: a secret must not wait
//! on disk for a second reader.

use std::path::{Path, PathBuf};

use crate::handoff::Handoff;

pub fn handoff_path(work_dir: &Path) -> PathBuf {
    work_dir.join("handoff.bin")
}

/// Parse and validate decrypted handoff bytes. `expected_migration_id`: when the app was
/// started by the migrator (`--migrated`), the id from state.json must match.
pub fn parse(plain: &[u8], now_unix: u64, expected_migration_id: Option<&str>) -> crate::Result<Handoff> {
    let h: Handoff = serde_json::from_slice(plain)?;
    h.validate(now_unix)?;
    if let Some(id) = expected_migration_id {
        if !h.migration_id.is_empty() && h.migration_id != id {
            return Err(crate::MigrateError::Handoff("handoff belongs to another migration".into()));
        }
    }
    Ok(h)
}

/// Electron secret files to try with the OSCrypt fallback: (purpose, path).
pub fn electron_secret_files(user_data: &Path, account_ids: &[String]) -> Vec<(String, PathBuf)> {
    let mut v = vec![("token".to_string(), user_data.join("auth-token.bin")), ("appLock".to_string(), user_data.join("premium").join("app-lock.bin"))];
    for id in account_ids.iter().filter(|id| crate::handoff::is_account_id(id)) {
        v.push((format!("account:{id}"), user_data.join("premium").join("accounts").join(id).join("auth-token.bin")));
    }
    v
}

/// Windows: DPAPI-seal and store the handoff (owner-only, CREATE_NEW).
#[cfg(windows)]
pub fn seal_to(work_dir: &Path, h: &Handoff) -> crate::Result<()> {
    let plain = zeroize::Zeroizing::new(serde_json::to_vec(h)?);
    let sealed = crate::win::dpapi::protect(&plain, Some(crate::handoff::ENTROPY))?;
    crate::win::secure_file::create_owner_only_dir(work_dir)?;
    let path = handoff_path(work_dir);
    if path.exists() {
        crate::win::secure_file::shred(&path);
    }
    crate::win::secure_file::write_owner_only(&path, &sealed)?;
    Ok(())
}

/// Windows: read, unseal, validate and shred the handoff. `Ok(None)` when there is none.
#[cfg(windows)]
pub fn take(work_dir: &Path, now_unix: u64, expected_migration_id: Option<&str>) -> crate::Result<Option<Handoff>> {
    let path = handoff_path(work_dir);
    let sealed = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let result = crate::win::dpapi::unprotect(&sealed, Some(crate::handoff::ENTROPY)).map(zeroize::Zeroizing::new);
    crate::win::secure_file::shred(&path);
    let plain = result?;
    parse(&plain, now_unix, expected_migration_id).map(Some)
}

/// Windows: the token from Electron's files directly (no handoff). None when absent or
/// not decryptable (another user, a reinstalled Windows, a v20 blob).
#[cfg(windows)]
pub fn electron_token_fallback(user_data: &Path) -> Option<crate::handoff::Secret> {
    let blob = std::fs::read(user_data.join("auth-token.bin")).ok()?;
    let text = crate::oscrypt::decrypt_electron_file(user_data, &blob).ok()?;
    crate::handoff::looks_like_jwt(&text).then(|| crate::handoff::Secret(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_checks_the_migration_id() {
        let h = serde_json::json!({ "version": 1, "createdAtUnix": 1000, "migrationId": "mig-1234-x", "token": "eyJhbGciOi.eyJzdWIiOiIx.c2ln" });
        let b = serde_json::to_vec(&h).unwrap();
        assert!(parse(&b, 1001, Some("mig-1234-x")).is_ok());
        assert!(parse(&b, 1001, None).is_ok());
        assert!(parse(&b, 1001, Some("mig-other-1")).is_err());
        assert!(parse(b"garbage", 1001, None).is_err());
    }

    #[test]
    fn fallback_file_list_skips_bad_ids() {
        let files = electron_secret_files(Path::new("/u"), &["0123456789ab".into(), "../x".into()]);
        assert_eq!(files.len(), 3);
        assert!(files[2].1.ends_with("premium/accounts/0123456789ab/auth-token.bin"));
    }
}
