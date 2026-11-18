//! Removing the old Electron install 14 days after a successful move.
//!
//! Written by the migrator's Commit step (`cleanup.json` in the work folder); executed by
//! [`crate::runner::run_cleanup`], which the new app calls on start (and
//! `DescallMigrator.exe --cleanup`). We do NOT run Electron's own uninstaller: some
//! electron-builder versions stop running processes by image NAME, which would kill the
//! new `Descall.exe`, and it removes the Start menu / desktop shortcuts that the new app
//! now owns under the same names. Instead we delete exactly what we know is Electron's:
//! - in place: the whole `<dir>.legacy` folder (it holds nothing else: checked before the
//!   rename) and Electron's per-user Uninstall key;
//! - side by side, per user: only Electron's own entries of the old folder (whitelist),
//!   then the folder if it is empty, and the Uninstall key;
//! - side by side, machine wide: needs elevation; the new app runs
//!   `DescallMigrator.exe --cleanup-machine` once with a UAC prompt, and only when no other
//!   Windows user still runs the old install ([`machine_cleanup_allowed`]).
//! Electron's userData keeps the session until then (rollback window); afterwards only its
//! caches are removed, never the user's files.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::strategy::{is_electron_entry, Entry, Strategy};

pub const KEEP_DAYS: u64 = 14;
const DAY: u64 = 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRecord {
    pub migration_id: String,
    pub committed_at_unix: u64,
    pub strategy: Strategy,
    pub old_dir: PathBuf,
    pub legacy_dir: Option<PathBuf>,
    pub per_machine: bool,
    pub electron_uninstall_key: Option<String>,
    #[serde(default)]
    pub done_at_unix: Option<u64>,
    #[serde(default)]
    pub attempts: u32,
    #[serde(default)]
    pub last_try_unix: u64,
    #[serde(default)]
    pub last_error: Option<String>,
}

impl CleanupRecord {
    pub fn due(&self, now: u64) -> bool {
        self.done_at_unix.is_none() && now >= self.committed_at_unix + KEEP_DAYS * DAY
    }

    /// Back off after failures (a file still locked by an antivirus scan): retry daily,
    /// give up quietly after 30 attempts.
    pub fn should_try(&self, now: u64) -> bool {
        self.due(now) && self.attempts < 30 && now >= self.last_try_unix + DAY / 2
    }

    /// Needs an elevated process (machine-wide files).
    pub fn needs_elevation(&self) -> bool {
        self.per_machine && self.strategy == Strategy::SideBySide
    }
}

pub fn record_path(work_dir: &Path) -> PathBuf {
    work_dir.join("cleanup.json")
}

/// Entries of the old folder that are Electron's (side-by-side cleanup).
pub fn electron_entries(entries: &[Entry]) -> Vec<Entry> {
    entries.iter().filter(|e| is_electron_entry(e)).cloned().collect()
}

/// Electron userData sub-folders that are caches only (never tokens or settings).
pub const USER_DATA_CACHES: &[&str] = &["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "Service Worker", "blob_storage", "Crashpad", "logs"];

/// One Windows profile as seen by the elevated machine cleanup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileFacts {
    /// `%APPDATA%\Descall` exists (the user ran Electron).
    pub has_electron_user_data: bool,
    /// `%LOCALAPPDATA%\Descall-Migration\cleanup.json` exists (the user moved over).
    pub migrated: bool,
}

/// The machine-wide Electron may go only when every profile that used it has moved.
pub fn machine_cleanup_allowed(profiles: &[ProfileFacts]) -> bool {
    profiles.iter().all(|p| !p.has_electron_user_data || p.migrated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec() -> CleanupRecord {
        CleanupRecord {
            migration_id: "mig-1234-x".into(),
            committed_at_unix: 1_000_000,
            strategy: Strategy::InPlace,
            old_dir: PathBuf::from(r"C:\P\Descall"),
            legacy_dir: Some(PathBuf::from(r"C:\P\Descall.legacy")),
            per_machine: false,
            electron_uninstall_key: None,
            done_at_unix: None,
            attempts: 0,
            last_try_unix: 0,
            last_error: None,
        }
    }

    #[test]
    fn due_after_fourteen_days_only_once() {
        let r = rec();
        assert!(!r.due(1_000_000 + 13 * DAY));
        assert!(r.due(1_000_000 + 14 * DAY));
        assert!(r.should_try(1_000_000 + 14 * DAY));
        let mut recent = rec();
        recent.last_try_unix = 1_000_000 + 14 * DAY - 60;
        assert!(!recent.should_try(1_000_000 + 14 * DAY), "backs off");
        let mut done = rec();
        done.done_at_unix = Some(5);
        assert!(!done.due(u64::MAX / 2));
        let mut tired = rec();
        tired.attempts = 30;
        assert!(!tired.should_try(1_000_000 + 30 * DAY));
        assert!(!rec().needs_elevation());
        let mut m = rec();
        m.per_machine = true;
        m.strategy = Strategy::SideBySide;
        assert!(m.needs_elevation());
    }

    #[test]
    fn side_by_side_removes_only_electron_files() {
        let entries = vec![Entry::file("Descall.exe"), Entry::dir("resources"), Entry::file("ffmpeg.dll"), Entry::dir("MyMods"), Entry::file("save.sav")];
        let names: Vec<String> = electron_entries(&entries).into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["Descall.exe", "resources", "ffmpeg.dll"]);
    }

    #[test]
    fn machine_cleanup_waits_for_every_user() {
        let moved = ProfileFacts { has_electron_user_data: true, migrated: true };
        let never_used = ProfileFacts { has_electron_user_data: false, migrated: false };
        let still_electron = ProfileFacts { has_electron_user_data: true, migrated: false };
        assert!(machine_cleanup_allowed(&[moved.clone(), never_used.clone()]));
        assert!(!machine_cleanup_allowed(&[moved, never_used, still_electron]));
    }
}
