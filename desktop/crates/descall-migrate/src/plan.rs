//! The migration state machine. Pure, so every branch is unit tested on any host;
//! [`crate::runner`] performs each step and feeds the outcome back into [`next`].
//!
//! Principle: nothing irreversible happens before the new app has proved that it boots and
//! is signed in. The old install is *renamed*, not deleted; Electron's userData is never
//! touched; the `.legacy` folder is removed 14 days after the commit ([`crate::cleanup`]).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Step {
    /// The handoff is sealed and the job recorded; waiting for `--run`.
    Ready,
    /// Windows build, free disk space, setup SHA-256, install folder shape and strategy,
    /// sealed handoff present. Nothing is changed here.
    Preflight,
    /// Electron quit itself after spawning us; wait for every process whose image is the
    /// old `Descall.exe` (by full path: the new exe has the same name) to exit.
    WaitElectronExit,
    /// Snapshot the registry values and shortcuts we may touch (Run, StartupApproved,
    /// toast CLSID, GPU preference, Electron's Uninstall key, every `.lnk` to the old exe).
    SnapshotRegistry,
    /// In place: rename `<dir>` to `<dir>.legacy` (same volume, atomic). Side by side: no-op.
    BackupInstallDir,
    /// Run the new setup silently into the target folder and verify the new `Descall.exe`.
    InstallNew,
    /// Put the shell state back the way the user had it (autostart value and its Task
    /// Manager state, toast CLSID, GPU preference), retarget shortcuts when the path changed.
    PatchShell,
    /// Start the new app with `--migrated` (and `--hidden` if Electron was in the tray).
    LaunchNew,
    /// Wait for the new app's health file: first paint + signed in + handoff imported.
    AwaitHealth,
    /// Hide Electron from "Apps", record the 14-day cleanup, drop the resume hook.
    Commit,
    /// Stop the new app, remove it, rename `.legacy` back, restore registry and shortcuts,
    /// relaunch Electron with `--migration-failed` (same session: its userData is intact).
    Rollback,
    Done,
    /// Preflight said no, or Electron did not exit: nothing was changed.
    Skipped,
    /// Rollback itself failed: both folders are kept and the user is shown the download link.
    NeedsHelp,
}

impl Step {
    pub fn is_terminal(self) -> bool {
        matches!(self, Step::Done | Step::Skipped | Step::NeedsHelp)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Step::Ready => "ready",
            Step::Preflight => "preflight",
            Step::WaitElectronExit => "wait_electron_exit",
            Step::SnapshotRegistry => "snapshot_registry",
            Step::BackupInstallDir => "backup_install_dir",
            Step::InstallNew => "install_new",
            Step::PatchShell => "patch_shell",
            Step::LaunchNew => "launch_new",
            Step::AwaitHealth => "await_health",
            Step::Commit => "commit",
            Step::Rollback => "rollback",
            Step::Done => "done",
            Step::Skipped => "skipped",
            Step::NeedsHelp => "needs_help",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Ok,
    Failed,
}

pub fn next(step: Step, outcome: Outcome) -> Step {
    use Outcome::*;
    use Step::*;
    match (step, outcome) {
        (Ready, Ok) => Preflight,
        (Ready, Failed) => Skipped,
        (Preflight, Ok) => WaitElectronExit,
        (Preflight, Failed) => Skipped,
        (WaitElectronExit, Ok) => SnapshotRegistry,
        (WaitElectronExit, Failed) => Skipped,
        (SnapshotRegistry, Ok) => BackupInstallDir,
        (SnapshotRegistry, Failed) => Skipped,
        // A failed rename (locked file, antivirus) moved nothing: relaunch Electron.
        (BackupInstallDir, Ok) => InstallNew,
        (BackupInstallDir, Failed) => Skipped,
        (InstallNew, Ok) => PatchShell,
        (PatchShell, Ok) => LaunchNew,
        (LaunchNew, Ok) => AwaitHealth,
        (AwaitHealth, Ok) => Commit,
        (InstallNew | PatchShell | LaunchNew | AwaitHealth, Failed) => Rollback,
        // The new app is healthy at this point; a commit detail failing is logged, not undone.
        (Commit, _) => Done,
        (Rollback, Ok) => Skipped,
        (Rollback, Failed) => NeedsHelp,
        (s @ (Done | Skipped | NeedsHelp), _) => s,
    }
}

/// True when the step may have left the machine changed: a crash inside it must resume
/// into [`Step::Rollback`] (or [`Step::Commit`] when the new app already reported healthy).
pub fn needs_rollback_on_crash(step: Step) -> bool {
    matches!(step, Step::InstallNew | Step::PatchShell | Step::LaunchNew | Step::AwaitHealth)
}

/// Deterministic cohort bucket 0..10000 for staged rollout. The server
/// (backend/lib/desktopMigration.js `bucketOf`) uses the same FNV-1a 64 over `salt:id`, so
/// a test vector pins both implementations.
pub fn bucket(id: &str, salt: &str) -> u32 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in salt.bytes().chain(*b":").chain(id.trim().to_ascii_lowercase().bytes()) {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    (h % 10_000) as u32
}

/// `basis_points` = percent x 100 (0..=10000).
pub fn in_wave(id: &str, salt: &str, basis_points: u32) -> bool {
    bucket(id, salt) < basis_points.min(10_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path_reaches_done_through_every_step() {
        let mut s = Step::Ready;
        let mut seen = vec![s];
        while !s.is_terminal() {
            s = next(s, Outcome::Ok);
            seen.push(s);
        }
        assert_eq!(s, Step::Done);
        for must in [Step::Preflight, Step::BackupInstallDir, Step::InstallNew, Step::AwaitHealth, Step::Commit] {
            assert!(seen.contains(&must), "{must:?}");
        }
        assert!(!seen.contains(&Step::Rollback));
    }

    #[test]
    fn failures_before_the_rename_skip_and_after_it_roll_back() {
        for s in [Step::Ready, Step::Preflight, Step::WaitElectronExit, Step::SnapshotRegistry, Step::BackupInstallDir] {
            assert_eq!(next(s, Outcome::Failed), Step::Skipped, "{s:?}");
            assert!(!needs_rollback_on_crash(s));
        }
        for s in [Step::InstallNew, Step::PatchShell, Step::LaunchNew, Step::AwaitHealth] {
            assert_eq!(next(s, Outcome::Failed), Step::Rollback, "{s:?}");
            assert!(needs_rollback_on_crash(s));
        }
        assert_eq!(next(Step::Rollback, Outcome::Ok), Step::Skipped);
        assert_eq!(next(Step::Rollback, Outcome::Failed), Step::NeedsHelp);
        assert_eq!(next(Step::Commit, Outcome::Failed), Step::Done);
        for t in [Step::Done, Step::Skipped, Step::NeedsHelp] {
            assert_eq!(next(t, Outcome::Failed), t);
        }
    }

    #[test]
    fn step_names_match_serde() {
        for s in [Step::Ready, Step::WaitElectronExit, Step::BackupInstallDir, Step::NeedsHelp] {
            assert_eq!(serde_json::to_value(s).unwrap(), serde_json::json!(s.as_str()));
        }
    }

    #[test]
    fn buckets_are_stable_uniform_and_match_the_server_vector() {
        assert_eq!(bucket("abc", "wave1"), bucket(" ABC ", "wave1"));
        // Same vector as backend/test/desktopMigration.integration.test.cjs.
        assert_eq!(bucket("00000000-0000-4000-8000-000000000001", "descall-migration-v1"), SERVER_VECTOR);
        let n = (0..20_000).filter(|i| in_wave(&format!("id-{i}"), "wave1", 500)).count();
        assert!((800..1200).contains(&n), "{n}"); // ~5 %
        assert!(!in_wave("x", "wave1", 0));
        assert!(in_wave("x", "wave1", 10_000));
    }
    const SERVER_VECTOR: u32 = 2249;
}
