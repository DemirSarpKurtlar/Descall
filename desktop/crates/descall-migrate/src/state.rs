//! `state.json`: the migrator's journal. The step about to run is written (atomically,
//! fsynced) BEFORE it runs, so after a kill -9, a crash or a power cut [`resume_step`]
//! knows exactly which branch is safe: nothing changed yet (skip), roll back, or commit
//! because the new app already reported healthy.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::job::MigrationJob;
use crate::plan::Step;
use crate::regsnap::RegSnapshot;
use crate::shortcuts::ShortcutBackup;
use crate::strategy::Strategy;

pub const STATE_VERSION: u32 = 1;
/// After this many resumes of the same run, stop retrying and ask for help.
pub const MAX_RESUMES: u32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub strategy: Strategy,
    /// Folder Electron ran from.
    pub old_dir: PathBuf,
    /// `<old_dir>.legacy` (in place only).
    pub legacy_dir: Option<PathBuf>,
    /// Folder the new app goes to (= old_dir in place).
    pub new_dir: PathBuf,
    pub per_machine: bool,
    /// Electron's Uninstall key (HKCU path or HKLM path), when found.
    pub electron_uninstall_key: Option<String>,
}

impl Layout {
    pub fn old_exe(&self) -> PathBuf {
        self.old_dir.join(crate::paths::APP_EXE)
    }
    pub fn new_exe(&self) -> PathBuf {
        self.new_dir.join(crate::paths::APP_EXE)
    }
    /// Where the Electron exe lives after a rollback (the old dir in both strategies).
    pub fn electron_exe_after_rollback(&self) -> PathBuf {
        self.old_exe()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StepRecord {
    pub step: Step,
    pub ok: bool,
    pub ms: u64,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationState {
    pub version: u32,
    pub job: MigrationJob,
    /// The step that is running (or about to run).
    pub step: Step,
    #[serde(default)]
    pub layout: Option<Layout>,
    #[serde(default)]
    pub registry: Option<RegSnapshot>,
    #[serde(default)]
    pub shortcuts: Vec<ShortcutBackup>,
    #[serde(default)]
    pub launched_at_unix: Option<u64>,
    #[serde(default)]
    pub started_at_unix: u64,
    #[serde(default)]
    pub updated_at_unix: u64,
    #[serde(default)]
    pub history: Vec<StepRecord>,
    #[serde(default)]
    pub resumes: u32,
    /// Reason code of the first failure (`disk_full`, `setup_hash_mismatch`, ...).
    #[serde(default)]
    pub failure: Option<String>,
    /// Folder the half-installed new app was moved to when it could not be deleted.
    #[serde(default)]
    pub quarantine_dir: Option<PathBuf>,
    /// The final result was reported to the server (by the app that ran next).
    #[serde(default)]
    pub reported: bool,
}

impl MigrationState {
    pub fn new(job: MigrationJob, now: u64) -> Self {
        MigrationState {
            version: STATE_VERSION,
            job,
            step: Step::Ready,
            layout: None,
            registry: None,
            shortcuts: Vec::new(),
            launched_at_unix: None,
            started_at_unix: now,
            updated_at_unix: now,
            history: Vec::new(),
            resumes: 0,
            failure: None,
            quarantine_dir: None,
            reported: false,
        }
    }

    pub fn to_bytes(&self) -> crate::Result<Vec<u8>> {
        Ok(serde_json::to_vec_pretty(self)?)
    }

    pub fn from_bytes(b: &[u8]) -> crate::Result<Self> {
        let s: MigrationState = serde_json::from_slice(b)?;
        if s.version == 0 || s.version > STATE_VERSION {
            return Err(crate::MigrateError::State(format!("unsupported state version {}", s.version)));
        }
        Ok(s)
    }

    pub fn note_failure(&mut self, code: &str) {
        if self.failure.is_none() {
            self.failure = Some(code.to_string());
        }
    }
}

pub fn state_path(work_dir: &Path) -> PathBuf {
    work_dir.join("state.json")
}

/// What the file system says after a crash.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ResumeFacts {
    pub old_dir_exists: bool,
    pub legacy_exists: bool,
    /// The new app reported "ready" for this migration id after it was launched.
    pub health_ready: bool,
}

/// The step to continue with after the migrator died while running `state.step`.
pub fn resume_step(state: &MigrationState, f: ResumeFacts) -> Step {
    use Step::*;
    if state.resumes >= MAX_RESUMES && !state.step.is_terminal() {
        // Something keeps killing us: if the old install is intact there is nothing to
        // undo, otherwise leave both folders and ask for help.
        return if f.old_dir_exists && !f.legacy_exists { Skipped } else { NeedsHelp };
    }
    let in_place = state.layout.as_ref().map(|l| l.strategy == Strategy::InPlace).unwrap_or(false);
    match state.step {
        // Nothing was changed before the backup step.
        Ready | Preflight | WaitElectronExit | SnapshotRegistry => Skipped,
        BackupInstallDir => {
            // The rename is atomic: it either happened (legacy there, old gone) or not.
            if in_place && f.legacy_exists && !f.old_dir_exists {
                Rollback
            } else {
                Skipped
            }
        }
        AwaitHealth if f.health_ready => Commit,
        InstallNew | PatchShell | LaunchNew | AwaitHealth => Rollback,
        Commit => Commit,
        Rollback => Rollback,
        Done | Skipped | NeedsHelp => state.step,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(step: Step, strategy: Strategy) -> MigrationState {
        let mut s = MigrationState::new(crate::job::tests::sample(), 1);
        s.step = step;
        s.layout = Some(Layout {
            strategy,
            old_dir: PathBuf::from(r"C:\P\Descall"),
            legacy_dir: Some(PathBuf::from(r"C:\P\Descall.legacy")),
            new_dir: PathBuf::from(r"C:\P\Descall"),
            per_machine: false,
            electron_uninstall_key: None,
        });
        s
    }

    #[test]
    fn crash_before_any_change_skips() {
        for step in [Step::Ready, Step::Preflight, Step::WaitElectronExit, Step::SnapshotRegistry] {
            assert_eq!(resume_step(&st(step, Strategy::InPlace), ResumeFacts { old_dir_exists: true, ..Default::default() }), Step::Skipped);
        }
    }

    #[test]
    fn crash_around_the_rename_follows_the_file_system() {
        let s = st(Step::BackupInstallDir, Strategy::InPlace);
        assert_eq!(resume_step(&s, ResumeFacts { old_dir_exists: true, legacy_exists: false, health_ready: false }), Step::Skipped);
        assert_eq!(resume_step(&s, ResumeFacts { old_dir_exists: false, legacy_exists: true, health_ready: false }), Step::Rollback);
        let s = st(Step::BackupInstallDir, Strategy::SideBySide);
        assert_eq!(resume_step(&s, ResumeFacts { old_dir_exists: true, legacy_exists: false, health_ready: false }), Step::Skipped);
    }

    #[test]
    fn crash_after_the_rename_rolls_back_unless_the_app_is_already_healthy() {
        for step in [Step::InstallNew, Step::PatchShell, Step::LaunchNew, Step::AwaitHealth] {
            assert_eq!(resume_step(&st(step, Strategy::InPlace), ResumeFacts::default()), Step::Rollback, "{step:?}");
        }
        let healthy = ResumeFacts { health_ready: true, ..Default::default() };
        assert_eq!(resume_step(&st(Step::AwaitHealth, Strategy::InPlace), healthy), Step::Commit);
        assert_eq!(resume_step(&st(Step::LaunchNew, Strategy::InPlace), healthy), Step::Rollback);
        assert_eq!(resume_step(&st(Step::Commit, Strategy::InPlace), ResumeFacts::default()), Step::Commit);
        assert_eq!(resume_step(&st(Step::Rollback, Strategy::InPlace), ResumeFacts::default()), Step::Rollback);
        assert_eq!(resume_step(&st(Step::Done, Strategy::InPlace), ResumeFacts::default()), Step::Done);
    }

    #[test]
    fn endless_crash_loops_stop() {
        let mut s = st(Step::Rollback, Strategy::InPlace);
        s.resumes = MAX_RESUMES;
        assert_eq!(resume_step(&s, ResumeFacts { old_dir_exists: false, legacy_exists: true, health_ready: false }), Step::NeedsHelp);
        assert_eq!(resume_step(&s, ResumeFacts { old_dir_exists: true, legacy_exists: false, health_ready: false }), Step::Skipped);
    }

    #[test]
    fn json_round_trip_and_version_gate() {
        let s = st(Step::InstallNew, Strategy::InPlace);
        let back = MigrationState::from_bytes(&s.to_bytes().unwrap()).unwrap();
        assert_eq!(back, s);
        let mut v: serde_json::Value = serde_json::from_slice(&s.to_bytes().unwrap()).unwrap();
        v["version"] = serde_json::json!(99);
        assert!(MigrationState::from_bytes(&serde_json::to_vec(&v).unwrap()).is_err());
    }
}
