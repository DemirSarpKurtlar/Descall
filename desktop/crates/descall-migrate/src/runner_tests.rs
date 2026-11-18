//! Runner tests on a fake system: a real temp folder for the files, everything else
//! (processes, registry, setup, the new app, the clock) simulated, with fault injection.
//! A "kill -9" is a panic inside a system call; the test then loads state.json from disk
//! into a fresh runner and resumes, exactly like `DescallMigrator.exe --resume`.

use super::*;
use crate::health::HealthReport;
use crate::job::{default_args, SetupSpec};
use crate::setup_cmd::SetupArg;
use crate::strategy::Entry;
use crate::sys::ElectronInstall;
use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;
use std::io;
use std::panic::{catch_unwind, AssertUnwindSafe};

#[derive(Clone, Copy, PartialEq, Debug)]
enum SetupBehavior {
    Install,
    Exit(i32),
    Timeout,
    DiskFull,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum AppBehavior {
    Ready,
    StartsButNeverReady,
    ReportsFailure,
    DiesAtOnce,
}

struct FakeSys {
    root: tempfile::TempDir,
    clock_ms: Cell<u64>,
    procs: RefCell<Vec<(PathBuf, u32)>>,
    next_pid: Cell<u32>,
    reg: RefCell<BTreeMap<(Hive, String, String), RegData>>,
    extra_subkeys: RefCell<Vec<String>>,
    setup: Cell<SetupBehavior>,
    app: Cell<AppBehavior>,
    /// Name of the operation that "kills" the migrator (panics) the next time it runs.
    crash_on: RefCell<Option<&'static str>>,
    free: Cell<u64>,
    rename_failures: Cell<u32>,
    state_disk_full: Cell<bool>,
    electron_ignores_quit: Cell<bool>,
    shortcuts: RefCell<Vec<(PathBuf, Option<PathBuf>)>>,
    install: RefCell<Option<ElectronInstall>>,
    build: Cell<u32>,
    spawned: RefCell<Vec<(PathBuf, Vec<String>)>>,
    log: RefCell<Vec<String>>,
    env: Env,
}

const T0: u64 = 1_800_000_000;

impl FakeSys {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let r = root.path().to_path_buf();
        let env = Env {
            work_dir: r.join("Local").join("Descall-Migration"),
            appdata: r.join("Roaming"),
            local_app_data: r.join("Local"),
            self_exe: r.join("Local").join("Descall-Migration").join("DescallMigrator.exe"),
        };
        std::fs::create_dir_all(&env.work_dir).unwrap();
        FakeSys {
            root,
            clock_ms: Cell::new(T0 * 1000),
            procs: RefCell::new(Vec::new()),
            next_pid: Cell::new(100),
            reg: RefCell::new(BTreeMap::new()),
            extra_subkeys: RefCell::new(Vec::new()),
            setup: Cell::new(SetupBehavior::Install),
            app: Cell::new(AppBehavior::Ready),
            crash_on: RefCell::new(None),
            free: Cell::new(50 * 1024 * 1024 * 1024),
            rename_failures: Cell::new(0),
            state_disk_full: Cell::new(false),
            electron_ignores_quit: Cell::new(false),
            shortcuts: RefCell::new(Vec::new()),
            install: RefCell::new(None),
            build: Cell::new(22631),
            spawned: RefCell::new(Vec::new()),
            log: RefCell::new(Vec::new()),
            env,
        }
    }

    fn path(&self, rel: &str) -> PathBuf {
        rel.split('/').fold(self.root.path().to_path_buf(), |p, c| p.join(c))
    }

    fn maybe_crash(&self, op: &'static str) {
        if *self.crash_on.borrow() == Some(op) {
            *self.crash_on.borrow_mut() = None;
            panic!("simulated kill -9 during {op}");
        }
    }

    fn key(hive: Hive, key: &str, name: &str) -> (Hive, String, String) {
        (hive, key.to_lowercase(), name.to_lowercase())
    }

    fn set_reg(&self, hive: Hive, key: &str, name: &str, data: RegData) {
        self.reg.borrow_mut().insert(Self::key(hive, key, name), data);
    }

    fn get_reg(&self, hive: Hive, key: &str, name: &str) -> RegData {
        self.reg.borrow().get(&Self::key(hive, key, name)).cloned().unwrap_or(RegData::Absent)
    }

    /// An Electron install with its files, userData, autostart and a desktop shortcut.
    fn electron_at(&self, dir: &Path, per_machine: bool) -> MigrationJob {
        std::fs::create_dir_all(dir.join("resources")).unwrap();
        std::fs::create_dir_all(dir.join("locales")).unwrap();
        std::fs::write(dir.join("Descall.exe"), b"electron").unwrap();
        std::fs::write(dir.join("resources").join("app.asar"), b"asar").unwrap();
        std::fs::write(dir.join("ffmpeg.dll"), b"dll").unwrap();
        std::fs::write(dir.join("Uninstall Descall.exe"), b"un").unwrap();
        let ud = self.env.electron_user_data();
        std::fs::create_dir_all(ud.join("Cache")).unwrap();
        std::fs::write(ud.join("auth-token.bin"), b"v10-sealed-token").unwrap();
        let exe = dir.join("Descall.exe");
        let hive = if per_machine { Hive::Hklm } else { Hive::Hkcu };
        let key = format!(r"{}\{{2a1b-guid}}", regsnap::UNINSTALL);
        self.set_reg(hive, &key, "DisplayName", RegData::Sz("Descall 3.10.0".into()));
        *self.install.borrow_mut() =
            Some(ElectronInstall { key_path: key, per_machine, install_location: dir.to_path_buf(), display_version: "3.10.0".into() });
        self.set_reg(Hive::Hkcu, regsnap::RUN, regsnap::RUN_VALUE, RegData::Sz(format!("\"{}\" --autostart --hidden", exe.display())));
        self.set_reg(Hive::Hkcu, regsnap::STARTUP_APPROVED_RUN, regsnap::RUN_VALUE, RegData::Binary(vec![3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        let lnk = self.path("Desktop/Descall.lnk");
        std::fs::create_dir_all(lnk.parent().unwrap()).unwrap();
        std::fs::write(&lnk, b"lnk-to-electron").unwrap();
        self.shortcuts.borrow_mut().push((lnk, Some(exe.clone())));
        // Electron is running and quits after spawning the migrator.
        self.procs.borrow_mut().push((exe.clone(), 1));

        let setup = self.env.work_dir.join("Descall-Setup-4.0.0.exe");
        std::fs::write(&setup, b"tauri-setup-bytes").unwrap();
        std::fs::write(crate::import::handoff_path(&self.env.work_dir), b"dpapi-sealed").unwrap();
        MigrationJob {
            id: "mig-0001-abcd".into(),
            install_id: "install-1".into(),
            created_at_unix: T0,
            setup: SetupSpec { path: setup, sha256: crate::sha256_hex(b"tauri-setup-bytes"), size: 17, version: "4.0.0".into(), args: default_args() },
            electron_exe: exe,
            electron_version: "3.10.0".into(),
            launch_hidden: false,
            per_machine_hint: per_machine,
            health_timeout_secs: None,
            min_win_build: Some(19041),
        }
    }

    fn start(&self, job: MigrationJob) -> Step {
        Runner::<FakeSys>::record_job(self, &self.env, job).unwrap();
        let mut r = Runner::load(self, &self.env).unwrap();
        r.run()
    }

    /// Run until the injected crash, then resume from disk like a new process would.
    fn start_crash_resume(&self, job: MigrationJob, op: &'static str) -> (Step, MigrationState) {
        *self.crash_on.borrow_mut() = Some(op);
        Runner::<FakeSys>::record_job(self, &self.env, job).unwrap();
        let crashed = catch_unwind(AssertUnwindSafe(|| {
            let mut r = Runner::load(self, &self.env).unwrap();
            r.run()
        }));
        assert!(crashed.is_err(), "the crash at {op} did not happen");
        let at = Runner::load(self, &self.env).unwrap().state.step;
        let mut r = Runner::load(self, &self.env).unwrap();
        let end = r.resume();
        assert_eq!(r.state.resumes, 1);
        (end, MigrationState { step: at, ..r.state })
    }

    fn final_state(&self) -> MigrationState {
        Runner::load(self, &self.env).unwrap().state
    }

    fn electron_relaunched_with(&self, flag: &str) -> bool {
        self.spawned.borrow().iter().any(|(exe, args)| std::fs::read(exe).map(|b| b == b"electron").unwrap_or(false) && args.iter().any(|a| a == flag))
    }
}

fn entries_of(p: &Path) -> io::Result<Vec<Entry>> {
    let mut v = Vec::new();
    for e in std::fs::read_dir(p)? {
        let e = e?;
        v.push(Entry { name: e.file_name().to_string_lossy().into_owned(), is_dir: e.file_type()?.is_dir() });
    }
    v.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(v)
}

impl Sys for FakeSys {
    fn now_unix(&self) -> u64 {
        self.clock_ms.get() / 1000
    }
    fn now_ms(&self) -> u64 {
        self.clock_ms.get()
    }
    fn sleep_ms(&self, ms: u64) {
        self.clock_ms.set(self.clock_ms.get() + ms);
        // Electron finishes quitting a little after the migrator starts waiting.
        if !self.electron_ignores_quit.get() {
            self.procs.borrow_mut().retain(|(_, pid)| *pid != 1);
        }
    }
    fn log(&self, line: &str) {
        self.log.borrow_mut().push(line.to_string());
    }
    fn acquire_lock(&self, _path: &Path) -> bool {
        true
    }
    fn exists(&self, p: &Path) -> bool {
        p.exists()
    }
    fn list_dir(&self, p: &Path) -> io::Result<Vec<Entry>> {
        entries_of(p)
    }
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        self.maybe_crash("rename");
        if self.rename_failures.get() > 0 {
            self.rename_failures.set(self.rename_failures.get() - 1);
            return Err(io::Error::from(io::ErrorKind::PermissionDenied));
        }
        std::fs::rename(from, to)
    }
    fn remove_dir_all(&self, p: &Path) -> io::Result<()> {
        std::fs::remove_dir_all(p)
    }
    fn remove_file(&self, p: &Path) -> io::Result<()> {
        std::fs::remove_file(p)
    }
    fn read(&self, p: &Path) -> io::Result<Vec<u8>> {
        std::fs::read(p)
    }
    fn write_atomic(&self, p: &Path, bytes: &[u8]) -> io::Result<()> {
        if self.state_disk_full.get() && p.ends_with("state.json") {
            return Err(io::Error::from(io::ErrorKind::StorageFull));
        }
        crate::write_atomic(p, bytes)
    }
    fn copy_file(&self, from: &Path, to: &Path) -> io::Result<()> {
        if let Some(d) = to.parent() {
            std::fs::create_dir_all(d)?;
        }
        std::fs::copy(from, to).map(|_| ())
    }
    fn file_size(&self, p: &Path) -> io::Result<u64> {
        Ok(std::fs::metadata(p)?.len())
    }
    fn sha256_file(&self, p: &Path) -> io::Result<String> {
        crate::sha256_file(p)
    }
    fn free_space(&self, _p: &Path) -> io::Result<u64> {
        Ok(self.free.get())
    }
    fn shred(&self, p: &Path) {
        let _ = std::fs::remove_file(p);
    }
    fn pids_of(&self, exe: &Path) -> Vec<u32> {
        self.procs.borrow().iter().filter(|(e, _)| paths::same_path(e, exe)).map(|(_, p)| *p).collect()
    }
    fn terminate(&self, pid: u32) -> bool {
        self.procs.borrow_mut().retain(|(_, p)| *p != pid);
        true
    }
    fn spawn(&self, exe: &Path, args: &[String]) -> io::Result<u32> {
        self.maybe_crash("spawn");
        if !exe.exists() {
            return Err(io::Error::from(io::ErrorKind::NotFound));
        }
        let pid = self.next_pid.get();
        self.next_pid.set(pid + 1);
        self.spawned.borrow_mut().push((exe.to_path_buf(), args.to_vec()));
        let is_new = std::fs::read(exe).map(|b| b == b"tauri").unwrap_or(false);
        if !is_new {
            self.procs.borrow_mut().push((exe.to_path_buf(), pid));
            return Ok(pid);
        }
        let id = args.iter().position(|a| a == "--migration-id").and_then(|i| args.get(i + 1)).cloned().unwrap_or_default();
        let mut rep = HealthReport { migration_id: id, stage: "started".into(), pid, at_unix: self.now_unix(), ..Default::default() };
        match self.app.get() {
            AppBehavior::DiesAtOnce => return Ok(pid),
            AppBehavior::StartsButNeverReady => {}
            AppBehavior::Ready => {
                rep.stage = "ready".into();
                rep.first_paint = true;
                rep.auth_ok = true;
                rep.handoff_imported = true;
            }
            AppBehavior::ReportsFailure => {
                rep.stage = "failed".into();
                rep.error = Some("webview2_missing".into());
            }
        }
        self.procs.borrow_mut().push((exe.to_path_buf(), pid));
        crate::health::write(&self.env.appdata, &rep).unwrap();
        Ok(pid)
    }
    fn run_setup(&self, _exe: &Path, args: &[SetupArg], _timeout_ms: u64) -> io::Result<Option<i32>> {
        self.maybe_crash("run_setup");
        let dir = match args.last() {
            Some(SetupArg::Raw(d)) => PathBuf::from(d.trim_start_matches("/D=")),
            _ => return Ok(Some(9)),
        };
        match self.setup.get() {
            SetupBehavior::Exit(c) => return Ok(Some(c)),
            SetupBehavior::Timeout => {
                self.clock_ms.set(self.clock_ms.get() + SETUP_TIMEOUT_MS);
                return Ok(None);
            }
            SetupBehavior::DiskFull => {
                // Half-written install, then the disk fills up.
                std::fs::create_dir_all(&dir).unwrap();
                std::fs::write(dir.join("partial.bin"), b"x").unwrap();
                return Err(io::Error::from(io::ErrorKind::StorageFull));
            }
            SetupBehavior::Install => {}
        }
        std::fs::create_dir_all(dir.join("resources")).unwrap();
        std::fs::write(dir.join("Descall.exe"), b"tauri").unwrap();
        // NSIS writes its own uninstall key and shortcut, and resets the Run value.
        let key = format!(r"{}\Descall", regsnap::UNINSTALL);
        self.set_reg(Hive::Hkcu, &key, "InstallLocation", RegData::Sz(dir.to_string_lossy().into()));
        self.set_reg(Hive::Hkcu, &key, "DisplayName", RegData::Sz("Descall".into()));
        self.extra_subkeys.borrow_mut().push("Descall".into());
        self.set_reg(Hive::Hkcu, regsnap::RUN, regsnap::RUN_VALUE, RegData::Absent);
        let new_lnk = self.path("StartMenu/Descall (new).lnk");
        std::fs::create_dir_all(new_lnk.parent().unwrap()).unwrap();
        std::fs::write(&new_lnk, b"lnk-to-new").unwrap();
        self.shortcuts.borrow_mut().push((new_lnk, Some(dir.join("Descall.exe"))));
        Ok(Some(0))
    }
    fn os_build(&self) -> u32 {
        self.build.get()
    }
    fn electron_install(&self) -> Option<ElectronInstall> {
        self.install.borrow().clone()
    }
    fn protected_dirs(&self) -> Vec<PathBuf> {
        vec![self.env.local_app_data.clone(), self.env.appdata.clone()]
    }
    fn reg_read(&self, hive: Hive, key: &str, name: &str) -> RegData {
        self.get_reg(hive, key, name)
    }
    fn reg_write(&self, v: &RegValue) -> io::Result<()> {
        if v.data == RegData::Absent {
            self.reg.borrow_mut().remove(&Self::key(v.hive, &v.key, &v.name));
        } else {
            self.set_reg(v.hive, &v.key, &v.name, v.data.clone());
        }
        Ok(())
    }
    fn reg_subkeys(&self, hive: Hive, key: &str) -> Vec<String> {
        let prefix = format!("{}\\", key.to_lowercase());
        let mut out: Vec<String> = self
            .reg
            .borrow()
            .keys()
            .filter(|(h, k, _)| *h == hive && k.starts_with(&prefix))
            .map(|(_, k, _)| k[prefix.len()..].split('\\').next().unwrap().to_string())
            .collect();
        out.sort();
        out.dedup();
        out
    }
    fn reg_delete_key(&self, hive: Hive, key: &str) -> io::Result<()> {
        let k = key.to_lowercase();
        self.reg.borrow_mut().retain(|(h, kk, _), _| !(*h == hive && (kk == &k || kk.starts_with(&format!("{k}\\")))));
        Ok(())
    }
    fn find_shortcuts(&self) -> Vec<(PathBuf, Option<PathBuf>)> {
        self.shortcuts.borrow().iter().filter(|(p, _)| p.exists()).cloned().collect()
    }
    fn retarget_shortcut(&self, lnk: &Path, new_exe: &Path) -> io::Result<()> {
        for s in self.shortcuts.borrow_mut().iter_mut() {
            if s.0 == lnk {
                s.1 = Some(new_exe.to_path_buf());
            }
        }
        std::fs::write(lnk, b"lnk-to-new")
    }
}

fn per_user(s: &FakeSys) -> (PathBuf, MigrationJob) {
    let dir = s.path("Local/Programs/Descall");
    let job = s.electron_at(&dir, false);
    (dir, job)
}

fn is_electron(dir: &Path) -> bool {
    std::fs::read(dir.join("Descall.exe")).map(|b| b == b"electron").unwrap_or(false)
}
fn is_tauri(dir: &Path) -> bool {
    std::fs::read(dir.join("Descall.exe")).map(|b| b == b"tauri").unwrap_or(false)
}

/// What a rolled-back machine must look like: Electron in its folder, same session, same
/// autostart (incl. the Task Manager "disabled" byte), no leftovers, Electron relaunched.
fn assert_rolled_back(s: &FakeSys, dir: &Path) {
    assert!(is_electron(dir), "Electron is back in its folder");
    assert!(!paths::with_suffix(dir, ".legacy").exists(), "no .legacy left");
    assert_eq!(std::fs::read(s.env.electron_user_data().join("auth-token.bin")).unwrap(), b"v10-sealed-token", "session untouched");
    assert_eq!(s.get_reg(Hive::Hkcu, regsnap::RUN, regsnap::RUN_VALUE), RegData::Sz(format!("\"{}\" --autostart --hidden", dir.join("Descall.exe").display())));
    assert!(regsnap::startup_disabled(&s.get_reg(Hive::Hkcu, regsnap::STARTUP_APPROVED_RUN, regsnap::RUN_VALUE)));
    assert_eq!(s.get_reg(Hive::Hkcu, &format!(r"{}\Descall", regsnap::UNINSTALL), "DisplayName"), RegData::Absent, "new uninstall key removed");
    assert_eq!(s.get_reg(Hive::Hkcu, regsnap::RUN_ONCE, regsnap::RESUME_VALUE), RegData::Absent, "resume hook removed");
    assert!(!crate::import::handoff_path(&s.env.work_dir).exists(), "handoff shredded");
    assert!(s.electron_relaunched_with("--migration-failed"), "Electron relaunched: {:?}", s.spawned.borrow());
}

#[test]
fn per_user_install_moves_in_place_and_commits() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    assert_eq!(s.start(job), Step::Done);
    assert!(is_tauri(&dir), "new app in the same folder (same Descall.exe path)");
    let legacy = paths::with_suffix(&dir, ".legacy");
    assert!(is_electron(&legacy), "old install kept as .legacy");
    let st = s.final_state();
    assert_eq!(st.layout.as_ref().unwrap().strategy, Strategy::InPlace);
    assert!(st.failure.is_none());
    // Autostart value written back after the setup reset it, Task Manager state kept.
    assert_eq!(s.get_reg(Hive::Hkcu, regsnap::RUN, regsnap::RUN_VALUE), RegData::Sz(format!("\"{}\" --autostart --hidden", dir.join("Descall.exe").display())));
    assert!(regsnap::startup_disabled(&s.get_reg(Hive::Hkcu, regsnap::STARTUP_APPROVED_RUN, regsnap::RUN_VALUE)));
    // Electron hidden from Apps, cleanup scheduled, secrets and setup gone, hook removed.
    assert_eq!(s.get_reg(Hive::Hkcu, &format!(r"{}\{{2a1b-guid}}", regsnap::UNINSTALL), "SystemComponent"), RegData::Dword(1));
    let rec: CleanupRecord = serde_json::from_slice(&std::fs::read(cleanup::record_path(&s.env.work_dir)).unwrap()).unwrap();
    assert_eq!(rec.legacy_dir.as_deref(), Some(legacy.as_path()));
    assert!(!crate::import::handoff_path(&s.env.work_dir).exists());
    assert!(!st.job.setup.path.exists());
    assert_eq!(s.get_reg(Hive::Hkcu, regsnap::RUN_ONCE, regsnap::RESUME_VALUE), RegData::Absent);
    let new_launch = s.spawned.borrow().iter().find(|(e, _)| is_tauri(e.parent().unwrap())).cloned().unwrap();
    assert!(new_launch.1.contains(&"--migrated".to_string()) && !new_launch.1.contains(&"--hidden".to_string()));
    assert_eq!(crate::report::outcome(&st).event, "done");
}

#[test]
fn tray_user_gets_the_new_app_hidden() {
    let s = FakeSys::new();
    let (_, mut job) = per_user(&s);
    job.launch_hidden = true;
    assert_eq!(s.start(job), Step::Done);
    assert!(s.spawned.borrow().iter().any(|(_, a)| a.contains(&"--migrated".to_string()) && a.contains(&"--hidden".to_string())));
}

#[test]
fn custom_folder_with_only_electron_moves_in_place() {
    let s = FakeSys::new();
    let dir = s.path("Oyun Araclari/Descall Custom");
    let job = s.electron_at(&dir, false);
    assert_eq!(s.start(job), Step::Done);
    assert!(is_tauri(&dir) && is_electron(&paths::with_suffix(&dir, ".legacy")));
}

#[test]
fn custom_folder_shared_with_other_apps_goes_side_by_side_and_retargets() {
    let s = FakeSys::new();
    let dir = s.path("Apps");
    let job = s.electron_at(&dir, false);
    std::fs::create_dir_all(dir.join("OtherGame")).unwrap();
    assert_eq!(s.start(job), Step::Done);
    let sbs = strategy::side_by_side_dir(&s.env.local_app_data);
    assert!(is_tauri(&sbs), "new app in Local\\Programs\\Descall");
    assert!(is_electron(&dir) && dir.join("OtherGame").exists(), "the shared folder is untouched");
    let new_exe = sbs.join("Descall.exe");
    assert_eq!(s.get_reg(Hive::Hkcu, regsnap::RUN, regsnap::RUN_VALUE), RegData::Sz(format!("\"{}\" --autostart --hidden", new_exe.display())));
    let lnk = s.path("Desktop/Descall.lnk");
    assert_eq!(std::fs::read(&lnk).unwrap(), b"lnk-to-new", "desktop shortcut retargeted");
}

#[test]
fn machine_wide_install_goes_side_by_side_without_elevation() {
    let s = FakeSys::new();
    let dir = s.path("ProgramFiles/Descall");
    let job = s.electron_at(&dir, true);
    assert_eq!(s.start(job), Step::Done);
    assert!(is_electron(&dir), "Program Files is left alone (no UAC)");
    assert!(is_tauri(&strategy::side_by_side_dir(&s.env.local_app_data)));
    let st = s.final_state();
    let l = st.layout.unwrap();
    assert!(l.per_machine && l.strategy == Strategy::SideBySide);
    assert!(l.electron_uninstall_key.unwrap().starts_with("HKLM\\"));
    let rec: CleanupRecord = serde_json::from_slice(&std::fs::read(cleanup::record_path(&s.env.work_dir)).unwrap()).unwrap();
    assert!(rec.needs_elevation());
}

#[test]
fn setup_failure_rolls_back_and_relaunches_electron_with_its_session() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.setup.set(SetupBehavior::Exit(2));
    assert_eq!(s.start(job), Step::Skipped);
    assert_rolled_back(&s, &dir);
    let st = s.final_state();
    assert_eq!(st.failure.as_deref(), Some("setup_exit_2"));
    assert_eq!(crate::report::outcome(&st).event, "rollback_ok");
}

#[test]
fn disk_full_during_setup_rolls_back_cleanly() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.setup.set(SetupBehavior::DiskFull);
    assert_eq!(s.start(job), Step::Skipped);
    assert_rolled_back(&s, &dir);
    assert!(!dir.join("partial.bin").exists(), "half-written files removed");
    assert_eq!(s.final_state().failure.as_deref(), Some("disk_full"));
}

#[test]
fn not_enough_free_space_skips_before_touching_anything() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.free.set(100 * 1024 * 1024);
    assert_eq!(s.start(job), Step::Skipped);
    assert!(is_electron(&dir));
    assert_eq!(s.final_state().failure.as_deref(), Some("disk_full"));
    assert!(s.electron_relaunched_with("--migration-skipped"), "Electron had quit: relaunched");
}

#[test]
fn journal_write_failing_before_the_rename_skips() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    Runner::<FakeSys>::record_job(&s, &s.env, job).unwrap();
    let mut r = Runner::load(&s, &s.env).unwrap();
    s.state_disk_full.set(true);
    assert_eq!(r.run(), Step::Skipped);
    assert!(is_electron(&dir) && !paths::with_suffix(&dir, ".legacy").exists());
}

#[test]
fn setup_timeout_and_hash_mismatch() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.setup.set(SetupBehavior::Timeout);
    assert_eq!(s.start(job), Step::Skipped);
    assert_rolled_back(&s, &dir);
    assert_eq!(s.final_state().failure.as_deref(), Some("setup_timeout"));

    let s = FakeSys::new();
    let (dir, mut job) = per_user(&s);
    job.setup.sha256 = "0".repeat(64);
    assert_eq!(s.start(job), Step::Skipped);
    assert!(is_electron(&dir));
    assert_eq!(s.final_state().failure.as_deref(), Some("setup_hash_mismatch"));
}

#[test]
fn old_windows_and_missing_handoff_skip() {
    let s = FakeSys::new();
    let (_, job) = per_user(&s);
    s.build.set(18363);
    assert_eq!(s.start(job), Step::Skipped);
    assert_eq!(s.final_state().failure.as_deref(), Some("windows_too_old"));

    let s = FakeSys::new();
    let (_, job) = per_user(&s);
    std::fs::remove_file(crate::import::handoff_path(&s.env.work_dir)).unwrap();
    assert_eq!(s.start(job), Step::Skipped);
    assert_eq!(s.final_state().failure.as_deref(), Some("handoff_missing"));
}

#[test]
fn electron_that_does_not_quit_is_left_running() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.electron_ignores_quit.set(true);
    assert_eq!(s.start(job), Step::Skipped);
    assert_eq!(s.final_state().failure.as_deref(), Some("electron_still_running"));
    assert!(is_electron(&dir));
    assert!(s.spawned.borrow().is_empty(), "no second Electron");
}

#[test]
fn locked_folder_retries_then_skips() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.rename_failures.set(2); // antivirus holds a file briefly
    assert_eq!(s.start(job), Step::Done);
    assert!(is_tauri(&dir));

    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.rename_failures.set(50);
    assert_eq!(s.start(job), Step::Skipped);
    assert!(is_electron(&dir));
    assert_eq!(s.final_state().failure.as_deref(), Some("rename_access_denied"));
}

#[test]
fn app_that_never_gets_ready_fails_or_dies_rolls_back() {
    for (behavior, code) in
        [(AppBehavior::StartsButNeverReady, "health_timeout"), (AppBehavior::ReportsFailure, "app_webview2_missing"), (AppBehavior::DiesAtOnce, "app_exited")]
    {
        let s = FakeSys::new();
        let (dir, job) = per_user(&s);
        s.app.set(behavior);
        assert_eq!(s.start(job), Step::Skipped, "{behavior:?}");
        assert_rolled_back(&s, &dir);
        assert_eq!(s.final_state().failure.as_deref(), Some(code), "{behavior:?}");
    }
}

#[test]
fn side_by_side_rollback_restores_shortcuts_and_removes_the_new_copy() {
    let s = FakeSys::new();
    let dir = s.path("ProgramFiles/Descall");
    let job = s.electron_at(&dir, true);
    s.app.set(AppBehavior::ReportsFailure);
    assert_eq!(s.start(job), Step::Skipped);
    assert!(is_electron(&dir));
    assert!(!strategy::side_by_side_dir(&s.env.local_app_data).exists());
    assert_eq!(std::fs::read(s.path("Desktop/Descall.lnk")).unwrap(), b"lnk-to-electron");
    assert!(!s.path("StartMenu/Descall (new).lnk").exists(), "new shortcut to a removed path deleted");
    assert!(s.electron_relaunched_with("--migration-failed"));
}

#[test]
fn kill_9_before_the_rename_resumes_into_skip() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    // Crash on the first rename attempt: the journal says backup_install_dir, nothing moved.
    let (end, st) = s.start_crash_resume(job, "rename");
    assert_eq!(st.step, Step::BackupInstallDir);
    assert_eq!(end, Step::Skipped);
    assert!(is_electron(&dir));
    assert!(s.electron_relaunched_with("--migration-skipped"));
}

#[test]
fn kill_9_during_setup_resumes_into_rollback() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    let (end, st) = s.start_crash_resume(job, "run_setup");
    assert_eq!(st.step, Step::InstallNew);
    assert_eq!(end, Step::Skipped);
    assert_rolled_back(&s, &dir);
}

#[test]
fn kill_9_while_waiting_for_health_commits_if_the_app_got_ready() {
    // The crash hits the spawn call after the journal recorded launch_new; resume rolls back.
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    let (end, st) = s.start_crash_resume(job, "spawn");
    assert_eq!(st.step, Step::LaunchNew);
    assert_eq!(end, Step::Skipped);
    assert_rolled_back(&s, &dir);

    // Killed during await_health while the app was already ready: resume commits.
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    Runner::<FakeSys>::record_job(&s, &s.env, job).unwrap();
    let mut r = Runner::load(&s, &s.env).unwrap();
    for step in [
        Step::Ready,
        Step::Preflight,
        Step::WaitElectronExit,
        Step::SnapshotRegistry,
        Step::BackupInstallDir,
        Step::InstallNew,
        Step::PatchShell,
        Step::LaunchNew,
    ] {
        r.state.step = step;
        assert!(r.exec(step).is_ok(), "{step:?}");
    }
    r.state.step = Step::AwaitHealth;
    assert!(r.persist());
    drop(r); // killed here
    let mut r = Runner::load(&s, &s.env).unwrap();
    assert_eq!(r.resume(), Step::Done);
    assert!(is_tauri(&dir));
}

#[test]
fn kill_9_during_rollback_finishes_the_rollback() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    s.setup.set(SetupBehavior::Exit(1));
    // First rename is the backup (ok); crash on the second one (rollback's rename back).
    Runner::<FakeSys>::record_job(&s, &s.env, job).unwrap();
    let mut r = Runner::load(&s, &s.env).unwrap();
    for step in [Step::Ready, Step::Preflight, Step::WaitElectronExit, Step::SnapshotRegistry, Step::BackupInstallDir] {
        r.state.step = step;
        assert!(r.exec(step).is_ok());
    }
    r.state.step = Step::Rollback;
    assert!(r.persist());
    *s.crash_on.borrow_mut() = Some("rename");
    assert!(catch_unwind(AssertUnwindSafe(|| r.exec(Step::Rollback))).is_err());
    let mut r = Runner::load(&s, &s.env).unwrap();
    assert_eq!(r.resume(), Step::Skipped);
    assert_rolled_back(&s, &dir);
}

#[test]
fn resume_on_a_finished_run_changes_nothing() {
    let s = FakeSys::new();
    let (_, job) = per_user(&s);
    assert_eq!(s.start(job), Step::Done);
    let mut r = Runner::load(&s, &s.env).unwrap();
    assert_eq!(r.resume(), Step::Done);
    assert_eq!(r.state.resumes, 0);
}

#[test]
fn cleanup_after_fourteen_days_removes_only_the_legacy_install() {
    let s = FakeSys::new();
    let (dir, job) = per_user(&s);
    assert_eq!(s.start(job), Step::Done);
    assert_eq!(run_cleanup(&s, &s.env, false), CleanupResult::NotDue);
    s.clock_ms.set(s.clock_ms.get() + 15 * 24 * 3600 * 1000);
    assert_eq!(run_cleanup(&s, &s.env, false), CleanupResult::Done);
    assert!(!paths::with_suffix(&dir, ".legacy").exists());
    assert!(is_tauri(&dir), "the new app is untouched");
    assert_eq!(s.get_reg(Hive::Hkcu, &format!(r"{}\{{2a1b-guid}}", regsnap::UNINSTALL), "DisplayName"), RegData::Absent);
    let ud = s.env.electron_user_data();
    assert!(!ud.join("Cache").exists() && ud.join("auth-token.bin").exists(), "caches only");
    assert_eq!(run_cleanup(&s, &s.env, false), CleanupResult::NothingToDo);
}

#[test]
fn machine_wide_cleanup_waits_for_elevation_then_keeps_foreign_files() {
    let s = FakeSys::new();
    let dir = s.path("ProgramFiles/Descall");
    let job = s.electron_at(&dir, true);
    std::fs::write(dir.join("user-notes.docx"), b"x").unwrap();
    assert_eq!(s.start(job), Step::Done);
    s.clock_ms.set(s.clock_ms.get() + 15 * 24 * 3600 * 1000);
    assert_eq!(run_cleanup(&s, &s.env, false), CleanupResult::NeedsElevation);
    assert_eq!(run_cleanup(&s, &s.env, true), CleanupResult::Done);
    assert!(!dir.join("Descall.exe").exists() && !dir.join("resources").exists());
    assert!(dir.join("user-notes.docx").exists(), "only Electron's own files are deleted");
}
