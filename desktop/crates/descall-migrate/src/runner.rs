//! Executes the state machine of [`crate::plan`] against a [`Sys`].
//!
//! Journal rule: `state.json` is written (atomically) with the step about to run BEFORE it
//! runs. If that write fails (disk full) before anything changed, the run is skipped; if it
//! fails after the rename, the run rolls back at once. Rollback is idempotent, so a crash
//! inside it just runs it again on resume.

use std::path::{Path, PathBuf};

use crate::cleanup::{self, CleanupRecord};
use crate::health::{self, Verdict};
use crate::job::MigrationJob;
use crate::paths;
use crate::plan::{next, Outcome, Step};
use crate::regsnap::{self, Hive, RegData, RegSnapshot, RegValue};
use crate::shortcuts::{self, ShortcutBackup};
use crate::state::{self, Layout, MigrationState, ResumeFacts, StepRecord};
use crate::strategy::{self, Choice, Strategy};
use crate::sys::{io_code, Env, Sys};

pub const DEFAULT_MIN_WIN_BUILD: u32 = 19041;
/// Free space needed on the install volume: 4x the setup plus a margin.
pub const DISK_MARGIN_BYTES: u64 = 300 * 1024 * 1024;
pub const WORK_DIR_MIN_FREE: u64 = 16 * 1024 * 1024;
pub const ELECTRON_EXIT_TIMEOUT_MS: u64 = 90_000;
pub const SETUP_TIMEOUT_MS: u64 = 10 * 60_000;
/// The new process must say "started" (or at least exist) within this time.
pub const START_GRACE_MS: u64 = 60_000;
/// How long the new process may be gone before we call it a crash.
pub const GONE_GRACE_MS: u64 = 10_000;
/// After a skip, how long to wait for a quitting Electron before relaunching it.
pub const ELECTRON_REQUIT_WAIT_MS: u64 = 20_000;
const POLL_MS: u64 = 500;

type StepResult = Result<(), String>;

pub struct Runner<'a, S: Sys> {
    pub sys: &'a S,
    pub env: &'a Env,
    pub state: MigrationState,
}

impl<'a, S: Sys> Runner<'a, S> {
    pub fn new(sys: &'a S, env: &'a Env, state: MigrationState) -> Self {
        Runner { sys, env, state }
    }

    /// Record a received job (after the handoff is sealed): `state.json` at step Ready.
    pub fn record_job(sys: &S, env: &Env, job: MigrationJob) -> crate::Result<()> {
        let st = MigrationState::new(job, sys.now_unix());
        sys.write_atomic(&state::state_path(&env.work_dir), &st.to_bytes()?)?;
        Ok(())
    }

    pub fn load(sys: &'a S, env: &'a Env) -> crate::Result<Self> {
        let bytes = sys.read(&state::state_path(&env.work_dir))?;
        Ok(Runner::new(sys, env, MigrationState::from_bytes(&bytes)?))
    }

    fn persist(&mut self) -> bool {
        self.state.updated_at_unix = self.sys.now_unix();
        match self.state.to_bytes() {
            Ok(b) => match self.sys.write_atomic(&state::state_path(&self.env.work_dir), &b) {
                Ok(()) => true,
                Err(e) => {
                    self.sys.log(&format!("state write failed: {}", io_code("state", &e)));
                    false
                }
            },
            Err(_) => false,
        }
    }

    /// `--run`: from Ready (a fresh job) through to a terminal step.
    pub fn run(&mut self) -> Step {
        let start = if self.state.step == Step::Ready { Step::Ready } else { self.state.step };
        if start != Step::Ready {
            // A second --run on a job that already started is a resume.
            return self.resume();
        }
        self.drive(Step::Ready)
    }

    /// `--resume`: continue after a crash, a kill or a reboot.
    pub fn resume(&mut self) -> Step {
        if self.state.step.is_terminal() {
            return self.state.step;
        }
        self.state.resumes += 1;
        let facts = self.resume_facts();
        let step = state::resume_step(&self.state, facts);
        self.sys.log(&format!("resume #{} at {} -> {}", self.state.resumes, self.state.step.as_str(), step.as_str()));
        if step == Step::Skipped && self.state.step != Step::Skipped {
            self.state.note_failure("interrupted");
        }
        self.drive(step)
    }

    fn resume_facts(&self) -> ResumeFacts {
        let Some(l) = &self.state.layout else { return ResumeFacts { old_dir_exists: true, ..Default::default() } };
        let health_ready = match self.state.launched_at_unix {
            Some(at) => {
                let bytes = self.sys.read(&self.env.health_file()).ok();
                health::evaluate(bytes.as_deref(), &self.state.job.id, at) == Verdict::Ready
            }
            None => false,
        };
        ResumeFacts {
            old_dir_exists: self.sys.exists(&l.old_exe()),
            legacy_exists: l.legacy_dir.as_ref().map(|d| self.sys.exists(d)).unwrap_or(false),
            health_ready,
        }
    }

    fn drive(&mut self, mut step: Step) -> Step {
        loop {
            self.state.step = step;
            let persisted = self.persist();
            if step.is_terminal() {
                self.finish();
                return step;
            }
            let t0 = self.sys.now_ms();
            let result = if !persisted && step != Step::Rollback && step != Step::Commit {
                // No journal, no change: before the rename this skips, after it rolls back.
                Err("state_write_failed".to_string())
            } else {
                self.exec(step)
            };
            let ms = self.sys.now_ms().saturating_sub(t0);
            let (outcome, code) = match result {
                Ok(()) => (Outcome::Ok, None),
                Err(code) => (Outcome::Failed, Some(code)),
            };
            self.sys.log(&format!("{} {} {}ms {}", step.as_str(), if outcome == Outcome::Ok { "ok" } else { "failed" }, ms, code.as_deref().unwrap_or("")));
            if let Some(c) = &code {
                if step != Step::Commit {
                    self.state.note_failure(c);
                }
            }
            self.state.history.push(StepRecord { step, ok: outcome == Outcome::Ok, ms, code });
            step = next(step, outcome);
        }
    }

    fn exec(&mut self, step: Step) -> StepResult {
        match step {
            Step::Ready => Ok(()),
            Step::Preflight => self.preflight(),
            Step::WaitElectronExit => self.wait_electron_exit(),
            Step::SnapshotRegistry => self.snapshot(),
            Step::BackupInstallDir => self.backup_install_dir(),
            Step::InstallNew => self.install_new(),
            Step::PatchShell => self.patch_shell(),
            Step::LaunchNew => self.launch_new(),
            Step::AwaitHealth => self.await_health(),
            Step::Commit => self.commit(),
            Step::Rollback => self.rollback(),
            Step::Done | Step::Skipped | Step::NeedsHelp => Ok(()),
        }
    }

    fn layout(&self) -> Result<Layout, String> {
        self.state.layout.clone().ok_or_else(|| "no_layout".to_string())
    }

    // ---------------------------------------------------------------- steps

    fn preflight(&mut self) -> StepResult {
        let job = self.state.job.clone();
        job.validate().map_err(|_| "bad_job".to_string())?;
        let min_build = job.min_win_build.unwrap_or(DEFAULT_MIN_WIN_BUILD);
        if self.sys.os_build() < min_build {
            return Err("windows_too_old".into());
        }
        if !self.sys.exists(&crate::import::handoff_path(&self.env.work_dir)) {
            return Err("handoff_missing".into());
        }
        self.verify_setup()?;
        if !self.sys.exists(&job.electron_exe) {
            return Err("electron_install_not_found".into());
        }

        let old_dir = job.electron_dir();
        let reg = self.sys.electron_install().filter(|i| paths::same_path(&i.install_location, &old_dir));
        let per_machine = reg.as_ref().map(|i| i.per_machine).unwrap_or(job.per_machine_hint);
        let entries = self.sys.list_dir(&old_dir).map_err(|e| io_code("list", &e))?;
        let verdict = strategy::inspect_dir(&old_dir, &entries, &self.sys.protected_dirs());
        let sbs = strategy::side_by_side_dir(&self.env.local_app_data);
        let sbs_free = !paths::same_path(&sbs, &old_dir) && (!self.sys.exists(&sbs) || self.sys.list_dir(&sbs).map(|e| e.is_empty()).unwrap_or(false));
        let strategy = match strategy::choose(&strategy::Facts { per_machine, verdict: verdict.clone(), side_by_side_free: sbs_free }) {
            Choice::Go(s) => s,
            Choice::Skip(code) => return Err(code.into()),
        };
        self.sys.log(&format!("layout: {} per_machine={} verdict={:?}", strategy.as_str(), per_machine, verdict));
        let (legacy_dir, new_dir) = match strategy {
            Strategy::InPlace => {
                let legacy = strategy::pick_legacy(&old_dir, |p| self.sys.exists(p)).ok_or("legacy_names_exhausted")?;
                (Some(legacy), old_dir.clone())
            }
            Strategy::SideBySide => (None, sbs),
        };

        // Disk space: the new install goes on the volume of new_dir (its parent may not
        // exist yet for side by side: walk up to an existing folder).
        let mut probe = new_dir.clone();
        while !self.sys.exists(&probe) {
            match probe.parent() {
                Some(p) if p != probe => probe = p.to_path_buf(),
                _ => break,
            }
        }
        let need = job.setup.size.saturating_mul(4).saturating_add(DISK_MARGIN_BYTES);
        let free = self.sys.free_space(&probe).map_err(|e| io_code("free_space", &e))?;
        if free < need {
            return Err("disk_full".into());
        }
        if self.sys.free_space(&self.env.work_dir).map(|f| f < WORK_DIR_MIN_FREE).unwrap_or(true) {
            return Err("disk_full".into());
        }

        let electron_uninstall_key = reg.map(|i| if i.per_machine { format!("HKLM\\{}", i.key_path) } else { i.key_path });
        self.state.layout = Some(Layout { strategy, old_dir, legacy_dir, new_dir, per_machine, electron_uninstall_key });
        Ok(())
    }

    fn verify_setup(&self) -> StepResult {
        let s = &self.state.job.setup;
        if !self.sys.exists(&s.path) {
            return Err("setup_missing".into());
        }
        let size = self.sys.file_size(&s.path).map_err(|e| io_code("setup", &e))?;
        if size != s.size {
            return Err("setup_size_mismatch".into());
        }
        let hash = self.sys.sha256_file(&s.path).map_err(|e| io_code("setup", &e))?;
        if hash != s.sha256 {
            return Err("setup_hash_mismatch".into());
        }
        Ok(())
    }

    fn wait_electron_exit(&mut self) -> StepResult {
        let exe = self.layout()?.old_exe();
        let deadline = self.sys.now_ms() + ELECTRON_EXIT_TIMEOUT_MS;
        loop {
            if self.sys.pids_of(&exe).is_empty() {
                return Ok(());
            }
            if self.sys.now_ms() >= deadline {
                return Err("electron_still_running".into());
            }
            self.sys.sleep_ms(POLL_MS);
        }
    }

    fn hkcu_uninstall_key(l: &Layout) -> Option<&str> {
        l.electron_uninstall_key.as_deref().filter(|k| !k.starts_with("HKLM\\"))
    }

    fn snapshot(&mut self) -> StepResult {
        let l = self.layout()?;
        let mut snap = RegSnapshot::default();
        for (hive, key, name) in regsnap::values_to_snapshot(&l.old_exe(), Self::hkcu_uninstall_key(&l)) {
            let data = self.sys.reg_read(hive, &key, &name);
            snap.values.push(RegValue { hive, key, name, data });
        }
        snap.uninstall_keys = self.sys.reg_subkeys(Hive::Hkcu, regsnap::UNINSTALL);

        // Shortcuts to the old exe, byte for byte (restored on rollback).
        let found = self.sys.find_shortcuts();
        let mut backups = Vec::new();
        for (n, lnk) in shortcuts::to_retarget(&found, &l.old_exe()).into_iter().enumerate() {
            let backup = shortcuts::backup_path(&self.env.work_dir, n);
            self.sys.copy_file(&lnk, &backup).map_err(|e| io_code("shortcut_backup", &e))?;
            backups.push(ShortcutBackup { path: lnk, backup });
        }
        self.state.registry = Some(snap);
        self.state.shortcuts = backups;

        // Resume hook: if the machine reboots or we are killed, Windows runs us at logon.
        let cmd = format!("\"{}\" --resume", self.env.self_exe.display());
        if let Err(e) =
            self.sys.reg_write(&RegValue { hive: Hive::Hkcu, key: regsnap::RUN_ONCE.into(), name: regsnap::RESUME_VALUE.into(), data: RegData::Sz(cmd) })
        {
            self.sys.log(&format!("resume hook not set: {}", io_code("runonce", &e)));
        }
        Ok(())
    }

    fn backup_install_dir(&mut self) -> StepResult {
        let l = self.layout()?;
        let Some(legacy) = l.legacy_dir.clone() else { return Ok(()) };
        self.retry_rename(&l.old_dir, &legacy).map_err(|e| io_code("rename", &e))?;
        if self.sys.exists(&l.old_dir) || !self.sys.exists(&legacy) {
            return Err("rename_unverified".into());
        }
        Ok(())
    }

    fn install_new(&mut self) -> StepResult {
        let l = self.layout()?;
        // The setup sat in a user-writable folder since the bridge checked it: check again.
        self.verify_setup()?;
        let args = crate::setup_cmd::build(&self.state.job.setup.args, &l.new_dir).map_err(|_| "bad_setup_args".to_string())?;
        self.sys.log(&format!("setup: {}", crate::setup_cmd::display(&self.state.job.setup.path, &args)));
        match self.sys.run_setup(&self.state.job.setup.path, &args, SETUP_TIMEOUT_MS) {
            Ok(Some(0)) => {}
            Ok(Some(code)) => return Err(format!("setup_exit_{code}")),
            Ok(None) => return Err("setup_timeout".into()),
            Err(e) => return Err(io_code("setup_spawn", &e)),
        }
        if !self.sys.exists(&l.new_exe()) {
            return Err("new_exe_missing".into());
        }
        Ok(())
    }

    fn patch_shell(&mut self) -> StepResult {
        let l = self.layout()?;
        let snap = self.state.registry.clone().unwrap_or_default();
        for v in regsnap::patched_values(&snap, &l.old_exe(), &l.new_exe()) {
            self.sys.reg_write(&v).map_err(|e| io_code("patch_shell", &e))?;
        }
        if l.strategy == Strategy::SideBySide {
            for s in self.state.shortcuts.clone() {
                self.sys.retarget_shortcut(&s.path, &l.new_exe()).map_err(|e| io_code("shortcut", &e))?;
            }
        }
        Ok(())
    }

    fn launch_new(&mut self) -> StepResult {
        let l = self.layout()?;
        let _ = self.sys.remove_file(&self.env.health_file());
        let mut args = vec!["--migrated".to_string(), "--migration-id".to_string(), self.state.job.id.clone()];
        if self.state.job.launch_hidden {
            args.push("--hidden".into());
        }
        self.state.launched_at_unix = Some(self.sys.now_unix());
        // Journal the launch time first: a resume must judge health against it.
        self.persist();
        self.sys.spawn(&l.new_exe(), &args).map_err(|e| io_code("launch", &e))?;
        Ok(())
    }

    fn await_health(&mut self) -> StepResult {
        let l = self.layout()?;
        let launched = self.state.launched_at_unix.unwrap_or_else(|| self.sys.now_unix());
        let t0 = self.sys.now_ms();
        let deadline = t0 + self.state.job.health_timeout_secs() * 1000;
        let mut started = false;
        let mut gone_since: Option<u64> = None;
        loop {
            let now = self.sys.now_ms();
            let bytes = self.sys.read(&self.env.health_file()).ok();
            match health::evaluate(bytes.as_deref(), &self.state.job.id, launched) {
                Verdict::Ready => return Ok(()),
                Verdict::Failed(code) => return Err(format!("app_{code}")),
                Verdict::Started { .. } => started = true,
                Verdict::Pending => {}
            }
            let alive = !self.sys.pids_of(&l.new_exe()).is_empty();
            if alive {
                gone_since = None;
            } else if now >= t0 + 5_000 {
                let since = *gone_since.get_or_insert(now);
                if now - since >= GONE_GRACE_MS {
                    return Err("app_exited".into());
                }
            }
            if !started && now >= t0 + START_GRACE_MS && !alive {
                return Err("app_not_started".into());
            }
            if now >= deadline {
                return Err(if started { "health_timeout" } else { "app_not_started" }.into());
            }
            self.sys.sleep_ms(POLL_MS);
        }
    }

    fn commit(&mut self) -> StepResult {
        let l = self.layout()?;
        let mut problems = Vec::new();
        // Hide Electron from "Apps & features" (per-user key only; HKLM needs elevation).
        if let Some(key) = Self::hkcu_uninstall_key(&l) {
            if let Err(e) = self.sys.reg_write(&RegValue { hive: Hive::Hkcu, key: key.to_string(), name: "SystemComponent".into(), data: RegData::Dword(1) }) {
                problems.push(io_code("hide_uninstall", &e));
            }
        }
        let rec = CleanupRecord {
            migration_id: self.state.job.id.clone(),
            committed_at_unix: self.sys.now_unix(),
            strategy: l.strategy,
            old_dir: l.old_dir.clone(),
            legacy_dir: l.legacy_dir.clone(),
            per_machine: l.per_machine,
            electron_uninstall_key: l.electron_uninstall_key.clone(),
            done_at_unix: None,
            attempts: 0,
            last_try_unix: 0,
            last_error: None,
        };
        match serde_json::to_vec_pretty(&rec) {
            Ok(b) => {
                if let Err(e) = self.sys.write_atomic(&cleanup::record_path(&self.env.work_dir), &b) {
                    problems.push(io_code("cleanup_record", &e));
                }
            }
            Err(_) => problems.push("cleanup_record_failed".into()),
        }
        if problems.is_empty() {
            Ok(())
        } else {
            Err(problems.join(","))
        }
    }

    fn rollback(&mut self) -> StepResult {
        let Some(l) = self.state.layout.clone() else { return Ok(()) };
        // 1. Stop the new app (by its full path; Electron is not running).
        self.stop(&l.new_exe());
        if l.strategy == Strategy::InPlace && !paths::same_path(&l.old_exe(), &l.new_exe()) {
            self.stop(&l.old_exe());
        }

        // 2. Files.
        match (&l.strategy, &l.legacy_dir) {
            (Strategy::InPlace, Some(legacy)) => {
                if self.sys.exists(legacy) {
                    if self.sys.exists(&l.old_dir) {
                        self.remove_or_quarantine(&l.old_dir)?;
                    }
                    self.retry_rename(legacy, &l.old_dir).map_err(|e| io_code("rollback_rename", &e))?;
                } else if !self.sys.exists(&l.old_exe()) {
                    return Err("legacy_missing".into());
                }
                // else: already renamed back by an earlier (interrupted) rollback.
            }
            _ => {
                if self.sys.exists(&l.new_dir) && !paths::same_path(&l.new_dir, &l.old_dir) {
                    if let Err(code) = self.remove_or_quarantine(&l.new_dir) {
                        // Electron's folder is untouched: a leftover is not fatal.
                        self.sys.log(&format!("side-by-side leftover: {code}"));
                    }
                }
            }
        }

        // 3. Registry: original values back, keys the setup added removed.
        if let Some(snap) = self.state.registry.clone() {
            for v in &snap.values {
                if let Err(e) = self.sys.reg_write(v) {
                    self.sys.log(&format!("restore {}\\{} failed: {}", v.key, v.name, io_code("reg", &e)));
                }
            }
            let now = self.sys.reg_subkeys(Hive::Hkcu, regsnap::UNINSTALL);
            for k in regsnap::added_keys(&snap.uninstall_keys, &now) {
                let key = format!("{}\\{}", regsnap::UNINSTALL, k);
                let loc = match self.sys.reg_read(Hive::Hkcu, &key, "InstallLocation") {
                    RegData::Sz(s) | RegData::ExpandSz(s) => Some(paths::clean_install_location(&s)),
                    _ => None,
                };
                let name = match self.sys.reg_read(Hive::Hkcu, &key, "DisplayName") {
                    RegData::Sz(s) => s,
                    _ => String::new(),
                };
                let ours = loc.map(|p| paths::same_path(&p, &l.new_dir)).unwrap_or(false) || name.starts_with("Descall");
                if ours {
                    let _ = self.sys.reg_delete_key(Hive::Hkcu, &key);
                }
            }
        }

        // 4. Shortcuts: put the user's own back; drop new ones that point at a removed path.
        for s in &self.state.shortcuts {
            if self.sys.exists(&s.backup) {
                if let Err(e) = self.sys.copy_file(&s.backup, &s.path) {
                    self.sys.log(&format!("shortcut restore failed: {}", io_code("lnk", &e)));
                }
            }
        }
        if l.strategy == Strategy::SideBySide {
            for (lnk, target) in self.sys.find_shortcuts() {
                if target.as_deref().map(|t| paths::same_path(t, &l.new_exe())).unwrap_or(false)
                    && !self.state.shortcuts.iter().any(|s| paths::same_path(&s.path, &lnk))
                {
                    let _ = self.sys.remove_file(&lnk);
                }
            }
        }
        let _ = self.sys.remove_file(&self.env.health_file());

        if !self.sys.exists(&l.old_exe()) {
            return Err("old_exe_missing_after_rollback".into());
        }
        Ok(())
    }

    // ---------------------------------------------------------------- helpers

    fn stop(&self, exe: &Path) {
        for _ in 0..20 {
            let pids = self.sys.pids_of(exe);
            if pids.is_empty() {
                return;
            }
            for p in pids {
                self.sys.terminate(p);
            }
            self.sys.sleep_ms(POLL_MS);
        }
    }

    fn retry_rename(&self, from: &Path, to: &Path) -> std::io::Result<()> {
        let mut last = None;
        for attempt in 0..5 {
            match self.sys.rename(from, to) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    // Disk full or a missing source does not get better by waiting.
                    if matches!(e.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::StorageFull) {
                        return Err(e);
                    }
                    last = Some(e);
                    self.sys.sleep_ms(400 * (attempt + 1));
                }
            }
        }
        Err(last.unwrap_or_else(|| std::io::Error::other("rename")))
    }

    /// Delete a folder; if a file stays locked, move the folder aside instead.
    fn remove_or_quarantine(&mut self, dir: &Path) -> StepResult {
        for attempt in 0..3 {
            if self.sys.remove_dir_all(dir).is_ok() || !self.sys.exists(dir) {
                return Ok(());
            }
            self.sys.sleep_ms(500 * (attempt + 1));
        }
        let q = paths::with_suffix(dir, &format!(".failed-{}", self.sys.now_unix()));
        self.sys.rename(dir, &q).map_err(|e| io_code("quarantine", &e))?;
        self.state.quarantine_dir = Some(q);
        Ok(())
    }

    fn electron_args(&self, extra: &str) -> Vec<String> {
        let mut a = vec![extra.to_string()];
        if self.state.job.launch_hidden {
            a.push("--hidden".into());
        }
        a
    }

    /// Terminal bookkeeping: shred the handoff, drop the resume hook, make sure the user has
    /// a running Descall again.
    fn finish(&mut self) {
        self.sys.shred(&crate::import::handoff_path(&self.env.work_dir));
        let _ = self.sys.reg_write(&RegValue { hive: Hive::Hkcu, key: regsnap::RUN_ONCE.into(), name: regsnap::RESUME_VALUE.into(), data: RegData::Absent });
        let _ = self.sys.remove_file(&self.state.job.setup.path);
        let rolled_back = self.state.history.iter().any(|h| h.step == Step::Rollback);
        let electron = self.state.layout.as_ref().map(|l| l.old_exe()).unwrap_or_else(|| self.state.job.electron_exe.clone());
        match self.state.step {
            Step::Skipped => {
                // Electron was told to quit when it started us: give it time to finish
                // quitting, then start it again. One that never quit is left alone.
                let deadline = self.sys.now_ms() + ELECTRON_REQUIT_WAIT_MS;
                while !self.sys.pids_of(&electron).is_empty() && self.sys.now_ms() < deadline {
                    self.sys.sleep_ms(POLL_MS);
                }
                if self.sys.exists(&electron) && self.sys.pids_of(&electron).is_empty() {
                    let flag = if rolled_back { "--migration-failed" } else { "--migration-skipped" };
                    let args = self.electron_args(flag);
                    if let Err(e) = self.sys.spawn(&electron, &args) {
                        self.sys.log(&format!("relaunch failed: {}", io_code("relaunch", &e)));
                    }
                }
            }
            Step::NeedsHelp => {
                // Start whatever still works so the user is not left without Descall.
                let legacy_exe = self.state.layout.as_ref().and_then(|l| l.legacy_dir.as_ref().map(|d| d.join(paths::APP_EXE)));
                let candidate: Option<PathBuf> = [Some(electron.clone()), legacy_exe].into_iter().flatten().find(|p| self.sys.exists(p));
                if let Some(exe) = candidate {
                    if self.sys.pids_of(&exe).is_empty() {
                        let args = self.electron_args("--migration-needs-help");
                        let _ = self.sys.spawn(&exe, &args);
                    }
                }
            }
            _ => {}
        }
    }
}

/// Outcome of [`run_cleanup`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CleanupResult {
    NothingToDo,
    NotDue,
    NeedsElevation,
    Done,
    Failed(String),
}

/// The 14-day cleanup of the old install (see [`crate::cleanup`]). Call on every start of
/// the new app; cheap when there is nothing to do.
pub fn run_cleanup<S: Sys>(sys: &S, env: &Env, elevated: bool) -> CleanupResult {
    let path = cleanup::record_path(&env.work_dir);
    let Ok(bytes) = sys.read(&path) else { return CleanupResult::NothingToDo };
    let Ok(mut rec) = serde_json::from_slice::<CleanupRecord>(&bytes) else { return CleanupResult::NothingToDo };
    let now = sys.now_unix();
    if rec.done_at_unix.is_some() {
        return CleanupResult::NothingToDo;
    }
    if !rec.should_try(now) {
        return CleanupResult::NotDue;
    }
    if rec.needs_elevation() && !elevated {
        return CleanupResult::NeedsElevation;
    }
    rec.attempts += 1;
    rec.last_try_unix = now;
    let result = cleanup_once(sys, env, &rec);
    match &result {
        Ok(()) => {
            rec.done_at_unix = Some(now);
            rec.last_error = None;
        }
        Err(code) => rec.last_error = Some(code.clone()),
    }
    if let Ok(b) = serde_json::to_vec_pretty(&rec) {
        let _ = sys.write_atomic(&path, &b);
    }
    match result {
        Ok(()) => CleanupResult::Done,
        Err(code) => CleanupResult::Failed(code),
    }
}

fn cleanup_once<S: Sys>(sys: &S, env: &Env, rec: &CleanupRecord) -> Result<(), String> {
    match (rec.strategy, &rec.legacy_dir) {
        (Strategy::InPlace, Some(legacy)) => {
            if sys.exists(legacy) {
                // Never delete a folder that looks like the live install.
                if paths::same_path(legacy, &rec.old_dir) {
                    return Err("legacy_is_live".into());
                }
                sys.remove_dir_all(legacy).map_err(|e| io_code("legacy", &e))?;
            }
        }
        _ => {
            if sys.exists(&rec.old_dir.join(paths::APP_EXE)) {
                if !sys.pids_of(&rec.old_dir.join(paths::APP_EXE)).is_empty() {
                    return Err("old_app_running".into());
                }
                let entries = sys.list_dir(&rec.old_dir).map_err(|e| io_code("list", &e))?;
                for e in cleanup::electron_entries(&entries) {
                    let p = rec.old_dir.join(&e.name);
                    let r = if e.is_dir { sys.remove_dir_all(&p) } else { sys.remove_file(&p) };
                    r.map_err(|err| io_code("old_files", &err))?;
                }
                if sys.list_dir(&rec.old_dir).map(|e| e.is_empty()).unwrap_or(false) {
                    let _ = sys.remove_dir_all(&rec.old_dir);
                }
            }
        }
    }
    if let Some(key) = &rec.electron_uninstall_key {
        let (hive, k) = match key.strip_prefix("HKLM\\") {
            Some(rest) => (Hive::Hklm, rest),
            None => (Hive::Hkcu, key.as_str()),
        };
        let _ = sys.reg_delete_key(hive, k);
    }
    let ud = env.electron_user_data();
    for c in cleanup::USER_DATA_CACHES {
        let p = ud.join(c);
        if sys.exists(&p) {
            let _ = sys.remove_dir_all(&p);
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "runner_tests.rs"]
mod tests;
