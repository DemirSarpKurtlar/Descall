//! DescallMigrator.exe: the one-time Electron -> Tauri bootstrapper (no window).
//!
//!   --receive-handoff   stdin = `{ "job": {...}, "handoff": {...} }` from the Electron bridge;
//!                       DPAPI-seals the handoff into an owner-only file, records the job.
//!   --run               after Electron quit (spawned detached by the bridge): run the move.
//!   --resume            after a crash / kill / reboot (RunOnce, the bridge or the new app).
//!   --status            print the outcome report JSON (the next app sends it to the server).
//!   --cleanup           the 14-day cleanup of the old install (per user).
//!   --cleanup-machine   the same for a machine-wide install (run elevated, once).
//!
//! Exit codes: 0 done / ok, 1 skipped (nothing changed or rolled back), 3 needs help,
//! 2 usage, 10.. handoff errors (see [`HandoffExit`]), 17 another migrator is running,
//! 18 no state.
//!
//! Signed with the same Authenticode certificate as Descall. The bridge only spawns it
//! after the SHA-256 from the Ed25519-signed plan matched.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use descall_migrate::plan::Step;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    ReceiveHandoff,
    Run,
    Resume,
    Status,
    Cleanup { machine: bool },
}

fn parse_args(args: &[String]) -> Option<Mode> {
    let has = |f: &str| args.iter().skip(1).any(|a| a == f);
    let modes = [
        ("--receive-handoff", Mode::ReceiveHandoff),
        ("--run", Mode::Run),
        ("--resume", Mode::Resume),
        ("--status", Mode::Status),
        ("--cleanup", Mode::Cleanup { machine: false }),
        ("--cleanup-machine", Mode::Cleanup { machine: true }),
    ];
    let found: Vec<Mode> = modes.iter().filter(|(f, _)| has(f)).map(|(_, m)| *m).collect();
    (found.len() == 1).then(|| found[0])
}

/// `--receive-handoff` failures, so the bridge can report a precise reason.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum HandoffExit {
    Read = 10,
    Parse = 11,
    Invalid = 12,
    Seal = 14,
    Write = 15,
    DiskFull = 16,
    Busy = 17,
    TooLarge = 19,
    MismatchedIds = 20,
}

#[cfg_attr(not(windows), allow(dead_code))]
fn exit_for(step: Step) -> i32 {
    match step {
        Step::Done => 0,
        Step::Skipped => 1,
        Step::NeedsHelp => 3,
        _ => 3,
    }
}

/// Parse + validate the stdin envelope (platform independent, unit tested).
#[cfg_attr(not(windows), allow(dead_code))]
fn check_envelope(raw: &[u8], now: u64) -> Result<descall_migrate::handoff::Envelope, HandoffExit> {
    if raw.len() > descall_migrate::handoff::MAX_BYTES {
        return Err(HandoffExit::TooLarge);
    }
    let env: descall_migrate::handoff::Envelope = serde_json::from_slice(raw).map_err(|_| HandoffExit::Parse)?;
    env.job.validate().map_err(|_| HandoffExit::Invalid)?;
    env.handoff.validate(now).map_err(|_| HandoffExit::Invalid)?;
    if !env.handoff.migration_id.is_empty() && env.handoff.migration_id != env.job.id {
        return Err(HandoffExit::MismatchedIds);
    }
    Ok(env)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let Some(mode) = parse_args(&args) else { std::process::exit(2) };
    std::process::exit(platform::run(mode));
}

#[cfg(windows)]
mod platform {
    use super::*;
    use descall_migrate::runner::{run_cleanup, CleanupResult, Runner};
    use descall_migrate::state::{state_path, MigrationState};
    use descall_migrate::sys::Sys;
    use descall_migrate::win::{env_from_process, secure_file, shell, WinSys};
    use std::io::Read;

    pub fn run(mode: Mode) -> i32 {
        let Some(env) = env_from_process() else { return 2 };
        let _ = secure_file::create_owner_only_dir(&env.work_dir);
        let sys = WinSys::new(&env);
        let lock = env.work_dir.join("migrator.lock");
        if mode != Mode::Status && !sys.acquire_lock(&lock) {
            return HandoffExit::Busy as i32;
        }
        match mode {
            Mode::ReceiveHandoff => receive(&sys, &env),
            Mode::Run | Mode::Resume => {
                shell::init_com();
                let Ok(mut r) = Runner::load(&sys, &env) else { return 18 };
                sys.log(&format!("{} job {}", if mode == Mode::Run { "run" } else { "resume" }, r.state.job.id));
                let end = if mode == Mode::Run { r.run() } else { r.resume() };
                exit_for(end)
            }
            Mode::Status => match sys.read(&state_path(&env.work_dir)).ok().and_then(|b| MigrationState::from_bytes(&b).ok()) {
                Some(st) => {
                    println!("{}", serde_json::to_string(&descall_migrate::report::outcome(&st)).unwrap_or_default());
                    0
                }
                None => 18,
            },
            Mode::Cleanup { machine } => {
                if machine && !other_profiles_moved() {
                    return 4;
                }
                match run_cleanup(&sys, &env, machine) {
                    CleanupResult::Done | CleanupResult::NothingToDo | CleanupResult::NotDue => 0,
                    CleanupResult::NeedsElevation => 5,
                    CleanupResult::Failed(code) => {
                        sys.log(&format!("cleanup failed: {code}"));
                        6
                    }
                }
            }
        }
    }

    fn receive(sys: &WinSys, env: &descall_migrate::sys::Env) -> i32 {
        // An unfinished run must never be overwritten by a new job.
        if let Ok(b) = sys.read(&state_path(&env.work_dir)) {
            if let Ok(st) = MigrationState::from_bytes(&b) {
                if !st.step.is_terminal() && st.step != Step::Ready {
                    return HandoffExit::Busy as i32;
                }
            }
        }
        let mut raw = zeroize::Zeroizing::new(Vec::new());
        let limit = descall_migrate::handoff::MAX_BYTES as u64 + 1;
        if std::io::stdin().take(limit).read_to_end(&mut raw).is_err() {
            return HandoffExit::Read as i32;
        }
        let envl = match check_envelope(&raw, descall_migrate::unix_now()) {
            Ok(e) => e,
            Err(code) => {
                sys.log(&format!("handoff rejected: {code:?}"));
                return code as i32;
            }
        };
        if let Err(e) = descall_migrate::import::seal_to(&env.work_dir, &envl.handoff) {
            sys.log(&format!("handoff seal failed: {e}"));
            return match e {
                descall_migrate::MigrateError::Io(ref io) if descall_migrate::sys::io_code("w", io) == "disk_full" => HandoffExit::DiskFull as i32,
                descall_migrate::MigrateError::Win(_) => HandoffExit::Seal as i32,
                _ => HandoffExit::Write as i32,
            };
        }
        if Runner::<WinSys>::record_job(sys, env, envl.job).is_err() {
            secure_file::shred(&descall_migrate::import::handoff_path(&env.work_dir));
            return HandoffExit::Write as i32;
        }
        sys.log("handoff sealed, job recorded");
        0
    }

    /// Every profile that used Electron has moved over (`C:\Users\*`).
    fn other_profiles_moved() -> bool {
        let Some(profile) = std::env::var_os("USERPROFILE").map(std::path::PathBuf::from) else { return false };
        let Some(users) = profile.parent() else { return false };
        let Ok(rd) = std::fs::read_dir(users) else { return false };
        let facts: Vec<descall_migrate::cleanup::ProfileFacts> = rd
            .flatten()
            .map(|e| e.path())
            .map(|p| descall_migrate::cleanup::ProfileFacts {
                has_electron_user_data: p.join(r"AppData\Roaming\Descall").exists(),
                migrated: p.join(r"AppData\Local\Descall-Migration\cleanup.json").exists(),
            })
            .collect();
        descall_migrate::cleanup::machine_cleanup_allowed(&facts)
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub fn run(_mode: Mode) -> i32 {
        eprintln!("DescallMigrator runs on Windows only.");
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(v: &[&str]) -> Vec<String> {
        std::iter::once("DescallMigrator.exe").chain(v.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn exactly_one_mode() {
        assert_eq!(parse_args(&a(&["--run"])), Some(Mode::Run));
        assert_eq!(parse_args(&a(&["--cleanup-machine"])), Some(Mode::Cleanup { machine: true }));
        assert_eq!(parse_args(&a(&[])), None);
        assert_eq!(parse_args(&a(&["--run", "--resume"])), None);
        assert_eq!(parse_args(&a(&["--whatever"])), None);
    }

    #[test]
    fn exit_codes() {
        assert_eq!(exit_for(Step::Done), 0);
        assert_eq!(exit_for(Step::Skipped), 1);
        assert_eq!(exit_for(Step::NeedsHelp), 3);
    }

    fn envelope(job_id: &str, handoff_id: &str, created: u64) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "job": {
                "id": job_id, "installId": "i-1", "createdAtUnix": created,
                "setup": { "path": r"C:\L\Descall-Migration\Descall-Setup-4.0.0.exe", "sha256": "c".repeat(64), "size": 10 },
                "electronExe": r"C:\L\Programs\Descall\Descall.exe"
            },
            "handoff": { "version": 1, "createdAtUnix": created, "migrationId": handoff_id, "token": "eyJhbGciOi.eyJzdWIiOiIx.c2ln" }
        }))
        .unwrap()
    }

    #[test]
    fn envelope_checks() {
        assert!(check_envelope(&envelope("mig-0001-abcd", "mig-0001-abcd", 1000), 1001).is_ok());
        assert_eq!(check_envelope(&envelope("mig-0001-abcd", "mig-0002-zzzz", 1000), 1001).err(), Some(HandoffExit::MismatchedIds));
        assert_eq!(check_envelope(&envelope("bad id", "", 1000), 1001).err(), Some(HandoffExit::Invalid));
        assert_eq!(check_envelope(&envelope("mig-0001-abcd", "", 1000), 1000 + 80 * 3600).err(), Some(HandoffExit::Invalid));
        assert_eq!(check_envelope(b"{", 1).err(), Some(HandoffExit::Parse));
        let big = vec![b' '; descall_migrate::handoff::MAX_BYTES + 1];
        assert_eq!(check_envelope(&big, 1).err(), Some(HandoffExit::TooLarge));
    }
}
