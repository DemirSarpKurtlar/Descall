//! Writes that must survive: the sign-in token and the app-lock record (secure_store.rs), the
//! Descall+ settings store and the main window's position (window-state.json).
//!
//! "Sometimes it does not remember the sign-in": the token file was written to `*.bin.tmp` and
//! renamed over `auth-token.bin` once, and a failed rename (Windows refuses MoveFileEx while
//! another process has the target open: Defender / an indexer scanning the file the previous
//! write just created) answered false. The page then kept the new token in localStorage only,
//! while the store still held the PREVIOUS token (or, after a sign-out whose delete failed the
//! same way, the signed-out one): the next start signed in with that stale token, the server
//! refused it and the user was signed out. Same for a delete that failed.
//!
//! Now: the data is flushed to disk before the rename, a refused rename / delete is retried for
//! a moment, and if the target stays locked the file is overwritten in place (a delete
//! becomes an empty file, which the store reads as "no token").

use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// Attempts for a rename / delete that Windows refuses while the file is open elsewhere.
pub const ATTEMPTS: u32 = 6;
/// Pause between attempts (about 0.6 s in all: an antivirus scan of a few hundred bytes).
pub const PAUSE: Duration = Duration::from_millis(100);

fn retry<T>(mut op: impl FnMut() -> std::io::Result<T>, pause: Duration) -> std::io::Result<T> {
    let mut last = None;
    for i in 0..ATTEMPTS {
        match op() {
            Ok(v) => return Ok(v),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(e),
            Err(e) => last = Some(e),
        }
        if i + 1 < ATTEMPTS {
            std::thread::sleep(pause);
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("no attempt")))
}

fn write_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut f = std::fs::File::create(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

/// Replace `path` with `bytes`: temp file (flushed) + rename, retried; when the rename keeps
/// failing, the target is written in place. True when `path` now holds `bytes`.
pub fn replace(path: &Path, bytes: &[u8]) -> bool {
    replace_with(path, bytes, PAUSE, |from, to| std::fs::rename(from, to))
}

/// [`replace`] with the pause and the rename step injectable (tests).
pub fn replace_with(path: &Path, bytes: &[u8], pause: Duration, mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>) -> bool {
    // `<name>.tmp` next to the target (auth-token.bin.tmp, window-state.json.tmp).
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    if write_synced(&tmp, bytes).is_ok() && retry(|| rename(&tmp, path), pause).is_ok() {
        return true;
    }
    let _ = std::fs::remove_file(&tmp);
    // Locked for longer than the retries: overwrite in place (FILE_SHARE_WRITE scanners allow
    // it). Not atomic, but a stale token is worse than the small torn-write window.
    retry(|| write_synced(path, bytes), pause).is_ok() && std::fs::read(path).map(|b| b == bytes).unwrap_or(false)
}

/// Remove `path` (gone already counts). A delete that keeps failing empties the file instead,
/// so nothing readable is left behind.
pub fn remove(path: &Path) -> bool {
    remove_with(path, PAUSE, |p| std::fs::remove_file(p))
}

/// [`remove`] with the pause and the delete step injectable (tests).
pub fn remove_with(path: &Path, pause: Duration, mut delete: impl FnMut(&Path) -> std::io::Result<()>) -> bool {
    match retry(|| delete(path), pause) {
        Ok(()) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => retry(|| write_synced(path, b""), pause).is_ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("descall-durable-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn locked() -> std::io::Error {
        std::io::Error::from(std::io::ErrorKind::PermissionDenied)
    }

    #[test]
    fn replaces_and_leaves_no_temp_file() {
        let d = dir("ok");
        let p = d.join("auth-token.bin");
        std::fs::write(&p, b"old").unwrap();
        assert!(replace(&p, b"new"));
        assert_eq!(std::fs::read(&p).unwrap(), b"new");
        assert!(!d.join("auth-token.bin.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn json_files_get_their_own_temp_name() {
        let d = dir("json");
        let p = d.join("window-state.json");
        assert!(replace(&p, b"{\"x\":1}"));
        assert_eq!(std::fs::read(&p).unwrap(), b"{\"x\":1}");
        assert!(!d.join("window-state.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn a_rename_refused_for_a_moment_is_retried() {
        let d = dir("retry");
        let p = d.join("auth-token.bin");
        std::fs::write(&p, b"old").unwrap();
        let mut n = 0;
        assert!(replace_with(&p, b"new", Duration::ZERO, |a, b| {
            n += 1;
            if n < 3 { Err(locked()) } else { std::fs::rename(a, b) }
        }));
        assert_eq!(n, 3);
        assert_eq!(std::fs::read(&p).unwrap(), b"new");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn a_target_that_stays_locked_is_overwritten_never_left_stale() {
        let d = dir("stale");
        let p = d.join("auth-token.bin");
        std::fs::write(&p, b"previous-session").unwrap();
        assert!(replace_with(&p, b"new-session", Duration::ZERO, |_, _| Err(locked())));
        assert_eq!(std::fs::read(&p).unwrap(), b"new-session", "the old token must not survive a failed rename");
        assert!(!d.join("auth-token.bin.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn a_sign_out_whose_delete_fails_leaves_an_empty_file() {
        let d = dir("rm");
        let p = d.join("auth-token.bin");
        std::fs::write(&p, b"signed-out-token").unwrap();
        assert!(remove_with(&p, Duration::ZERO, |_| Err(locked())));
        assert_eq!(std::fs::read(&p).unwrap(), b"", "nothing readable left");
        assert!(remove(&d.join("missing.bin")), "already gone counts as removed");
        assert!(remove(&p));
        assert!(!p.exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}
