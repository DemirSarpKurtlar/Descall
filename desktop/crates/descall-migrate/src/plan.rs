//! The bootstrapper's state machine. Pure, so every branch is unit-tested on any host;
//! the Windows executor (DescallMigrator.exe) performs each step and reports the outcome.
//!
//! Principle: nothing irreversible happens before the new app has proved it boots and is
//! signed in. The old install is *renamed*, not deleted, until the commit step; the
//! Electron uninstall key and the `.legacy` folder are removed 14 days later by the new app.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Step {
    /// Windows build >= 19041, WebView2 runtime present (else install it silently),
    /// disk space >= 300 MB, Electron install found, handoff file present and decryptable.
    Preflight,
    /// Electron quit itself after spawning us; wait for every Descall.exe of the old
    /// install dir to exit (by full image path, not by name: the new exe has the same name).
    WaitElectronExit,
    /// Snapshot registry values we will touch (Run, StartupApproved, CLSID LocalServer32,
    /// Uninstall\{electron-guid}, UserGpuPreferences) into the migration folder.
    SnapshotRegistry,
    /// Rename <InstallLocation> to <InstallLocation>.legacy (same volume, atomic).
    BackupInstallDir,
    /// Run the Tauri NSIS setup silently into the same <InstallLocation> (same Descall.exe
    /// path: taskbar pins, firewall rules, GPU preference and shortcuts keep working).
    InstallNew,
    /// Shortcuts with AUMID com.descall.app + ToastActivatorCLSID, CLSID LocalServer32,
    /// Run key value "com.descall.app" (same value name keeps the Task Manager state).
    PatchShell,
    /// Start the new app with --migrated (hidden if Electron was in the tray).
    LaunchNew,
    /// Wait for <appdata>/migration/health.json: first paint + /api/auth/me 200 + handoff
    /// imported. Timeout 120 s.
    AwaitHealth,
    /// Delete Electron's Uninstall key, report success, schedule the 14-day cleanup.
    Commit,
    /// Stop the new app, remove its files and keys, rename .legacy back, restore the
    /// registry snapshot, relaunch Electron with --migration-failed, report.
    Rollback,
    Done,
    /// Preflight said no: nothing was changed, Electron keeps running (re-offered later).
    Skipped,
    /// Rollback itself failed: leave both folders, tell the user with the download link.
    NeedsHelp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Ok,
    Failed,
}

pub fn next(step: Step, outcome: Outcome) -> Step {
    use Outcome::*;
    use Step::*;
    match (step, outcome) {
        (Preflight, Ok) => WaitElectronExit,
        (Preflight, Failed) => Skipped,
        (WaitElectronExit, Ok) => SnapshotRegistry,
        (WaitElectronExit, Failed) => Skipped,
        (SnapshotRegistry, Ok) => BackupInstallDir,
        (SnapshotRegistry, Failed) => Skipped,
        // Nothing moved yet if the rename fails (a locked file): relaunch Electron.
        (BackupInstallDir, Ok) => InstallNew,
        (BackupInstallDir, Failed) => Skipped,
        (InstallNew, Ok) => PatchShell,
        (PatchShell, Ok) => LaunchNew,
        (LaunchNew, Ok) => AwaitHealth,
        (AwaitHealth, Ok) => Commit,
        (Commit, _) => Done,
        (InstallNew | PatchShell | LaunchNew | AwaitHealth, Failed) => Rollback,
        (Rollback, Ok) => Done,
        (Rollback, Failed) => NeedsHelp,
        (s @ (Done | Skipped | NeedsHelp), _) => s,
    }
}

/// True when the step left the machine changed (a crash here must resume into Rollback
/// on the next start: the bootstrapper persists the current step in migration/state.json).
pub fn needs_rollback_on_crash(step: Step) -> bool {
    matches!(step, Step::InstallNew | Step::PatchShell | Step::LaunchNew | Step::AwaitHealth)
}

/// Deterministic cohort bucket 0..10000 for staged rollout (server is the authority; the
/// client uses the same function so a cached plan stays stable offline). FNV-1a 64.
pub fn bucket(install_id: &str, salt: &str) -> u32 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in salt.bytes().chain([b':']).chain(install_id.bytes()) {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    (h % 10_000) as u32
}

pub fn in_wave(install_id: &str, salt: &str, percent_x100: u32) -> bool {
    bucket(install_id, salt) < percent_x100.min(10_000)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn happy_path() {
        let mut s = Step::Preflight;
        let mut seen = vec![s];
        while !matches!(s, Step::Done | Step::Skipped | Step::NeedsHelp) {
            s = next(s, Outcome::Ok);
            seen.push(s);
        }
        assert_eq!(s, Step::Done);
        assert!(seen.contains(&Step::Commit));
        assert!(!seen.contains(&Step::Rollback));
    }
    #[test]
    fn failures_after_the_rename_roll_back_and_before_it_skip() {
        assert_eq!(next(Step::BackupInstallDir, Outcome::Failed), Step::Skipped);
        for s in [Step::InstallNew, Step::PatchShell, Step::LaunchNew, Step::AwaitHealth] {
            assert_eq!(next(s, Outcome::Failed), Step::Rollback);
            assert!(needs_rollback_on_crash(s));
        }
        assert_eq!(next(Step::Rollback, Outcome::Failed), Step::NeedsHelp);
    }
    #[test]
    fn buckets_are_stable_and_roughly_uniform() {
        assert_eq!(bucket("abc", "wave1"), bucket("abc", "wave1"));
        let n = (0..20_000).filter(|i| in_wave(&format!("id-{i}"), "wave1", 500)).count();
        assert!((800..1200).contains(&n), "{n}"); // ~5 %
    }
}
