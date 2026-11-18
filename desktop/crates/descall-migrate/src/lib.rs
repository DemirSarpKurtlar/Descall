//! descall-migrate: everything the one-time Electron -> Tauri move needs. Shared by the
//! signed bootstrapper (DescallMigrator.exe) and the new app (import on first start,
//! health signal, 14-day cleanup).
//!
//! Flow (Rust-gecis-teknik-plan.md, section 3):
//! 1. The Electron bridge release verifies a signed server plan, downloads the migrator and
//!    the new setup (size + SHA-256 from the plan), decrypts its secrets with safeStorage and
//!    pipes `{ job, handoff }` JSON to `DescallMigrator.exe --receive-handoff` over stdin.
//!    Plain text never touches the disk.
//! 2. The migrator DPAPI-seals the handoff (CurrentUser + purpose entropy) into an
//!    owner-only file (CREATE_NEW, protected DACL) and records the job in `state.json`.
//! 3. `DescallMigrator.exe --run` (detached; Electron quits) drives [`runner`]: every step
//!    is persisted before it starts, so a kill -9 or a power cut resumes into the right
//!    branch (`--resume` from RunOnce, from the Electron bridge or from the new app).
//! 4. The old install folder is renamed to `.legacy` and the new app is installed silently
//!    into the same folder (same `Descall.exe` path), or next to it for machine-wide and
//!    unsafe custom folders ([`strategy`]). The new app must write [`health`] "ready"
//!    within the timeout, otherwise everything is rolled back and Electron is relaunched
//!    with its session untouched (its userData is never modified).
//! 5. The new app imports the handoff ([`import`]), and 14 days after the commit removes
//!    the `.legacy` folder ([`cleanup`]).
//!
//! Everything that decides something is platform independent and unit tested; the
//! Windows calls live in [`win`] behind the [`sys::Sys`] trait.

pub mod app;
pub mod cleanup;
pub mod handoff;
pub mod health;
pub mod import;
pub mod job;
pub mod oscrypt;
pub mod paths;
pub mod plan;
pub mod regsnap;
pub mod report;
pub mod runner;
pub mod setup_cmd;
pub mod shortcuts;
pub mod state;
pub mod strategy;
pub mod sys;

#[cfg(windows)]
pub mod win;

#[derive(Debug, thiserror::Error)]
pub enum MigrateError {
    #[error("handoff: {0}")]
    Handoff(String),
    #[error("job: {0}")]
    Job(String),
    #[error("oscrypt: {0}")]
    OsCrypt(String),
    #[error("state: {0}")]
    State(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[cfg(windows)]
    #[error(transparent)]
    Win(#[from] windows::core::Error),
}
pub type Result<T> = std::result::Result<T, MigrateError>;

/// Seconds since the Unix epoch (0 if the clock is before 1970).
pub fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Lower-case hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex(&Sha256::digest(bytes))
}

/// Lower-case hex SHA-256 of a file, streamed (the setup is ~10 MB).
pub fn sha256_file(path: &std::path::Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex(&h.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char);
    }
    s
}

/// Write `bytes` to `path` crash-safely: temp file in the same folder, fsync, rename over.
/// A kill -9 leaves either the old or the new content, never half a file.
pub fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    std::fs::create_dir_all(dir)?;
    let tmp = paths::with_suffix(path, ".tmp");
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(super::sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f.bin");
        std::fs::write(&p, b"abc").unwrap();
        assert_eq!(super::sha256_file(&p).unwrap(), super::sha256_hex(b"abc"));
    }

    #[test]
    fn atomic_write_replaces_and_leaves_no_temp() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub").join("state.json");
        super::write_atomic(&p, b"one").unwrap();
        super::write_atomic(&p, b"two").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"two");
        assert!(!super::paths::with_suffix(&p, ".tmp").exists());
    }
}
