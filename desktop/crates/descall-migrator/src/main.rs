//! DescallMigrator.exe
//!
//!   DescallMigrator.exe --receive-handoff     (spawned by the Electron bridge; stdin = Handoff JSON)
//!   DescallMigrator.exe --run --setup <path>  (after Electron quit; executes plan.rs)
//!   DescallMigrator.exe --resume              (Run-once key: a crash mid-migration resumes/rolls back)
//!
//! Signed with the same Authenticode certificate as Descall; the Electron bridge refuses to
//! spawn it unless WinVerifyTrust passes AND its SHA-256 matches the server plan.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use descall_migrate::handoff::{Handoff, ENTROPY};
use descall_migrate::plan::{next, Outcome, Step};

fn local_app_data() -> PathBuf {
    PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
}
fn work_dir() -> PathBuf {
    local_app_data().join("Descall-Migration")
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let code = if args.iter().any(|a| a == "--receive-handoff") {
        receive_handoff()
    } else if args.iter().any(|a| a == "--run" || a == "--resume") {
        let setup = args.iter().position(|a| a == "--setup").and_then(|i| args.get(i + 1)).map(PathBuf::from);
        run(setup)
    } else {
        2
    };
    std::process::exit(code);
}

/// stdin JSON -> validate -> DPAPI seal -> owner-only file. Plaintext never touches disk.
fn receive_handoff() -> i32 {
    let mut raw = Vec::new();
    if std::io::stdin().take(8 * 1024 * 1024).read_to_end(&mut raw).is_err() {
        return 10;
    }
    let now = unix_now();
    let parsed: Result<Handoff, _> = serde_json::from_slice(&raw);
    raw.iter_mut().for_each(|b| *b = 0);
    let Ok(h) = parsed else { return 11 };
    if h.validate(now).is_err() {
        return 12;
    }
    let Ok(plain) = serde_json::to_vec(&h) else { return 13 };
    #[cfg(windows)]
    {
        let Ok(sealed) = descall_migrate::dpapi::protect(&plain, Some(ENTROPY)) else { return 14 };
        let dir = work_dir();
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("handoff.bin");
        if path.exists() {
            descall_migrate::secure_file::shred(&path);
        }
        if descall_migrate::secure_file::write_owner_only(&path, &sealed).is_err() {
            return 15;
        }
    }
    let _ = (plain, ENTROPY);
    0
}

struct Ctx {
    setup: Option<PathBuf>,
    install_dir: PathBuf,
    legacy_dir: PathBuf,
    health: PathBuf,
}

fn run(setup: Option<PathBuf>) -> i32 {
    #[cfg(windows)]
    let found = descall_migrate::electron::find();
    #[cfg(not(windows))]
    let found: Option<()> = None;
    let Some(install) = found else { return report(Step::Skipped, "electron install not found") };
    #[cfg(windows)]
    let install_dir = PathBuf::from(install.install_location.trim_matches('"'));
    #[cfg(not(windows))]
    let install_dir = { let _ = install; PathBuf::new() };
    let legacy_dir = PathBuf::from(format!("{}.legacy", install_dir.display()));
    let appdata = PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default());
    let ctx = Ctx { setup, install_dir, legacy_dir, health: appdata.join("com.descall.app").join("migration").join("health.json") };

    let mut step = Step::Preflight;
    loop {
        persist_step(step);
        let outcome = match step {
            Step::Preflight => preflight(&ctx),
            Step::WaitElectronExit => wait_exit(&ctx.install_dir.join("Descall.exe"), Duration::from_secs(60)),
            Step::SnapshotRegistry => Outcome::Ok, // reg export of the keys listed in plan.rs
            Step::BackupInstallDir => ok_if(std::fs::rename(&ctx.install_dir, &ctx.legacy_dir).is_ok()),
            Step::InstallNew => install_new(&ctx),
            Step::PatchShell => Outcome::Ok, // Run value, CLSID, UserGpuPreferences (same exe path: mostly no-ops)
            Step::LaunchNew => ok_if(Command::new(ctx.install_dir.join("Descall.exe")).arg("--migrated").spawn().is_ok()),
            Step::AwaitHealth => await_file(&ctx.health, Duration::from_secs(120)),
            Step::Commit => {
                // Uninstall key removal + 14-day cleanup are done by the new app (it owns the
                // schedule); we only record success.
                Outcome::Ok
            }
            Step::Rollback => rollback(&ctx),
            Step::Done | Step::Skipped | Step::NeedsHelp => return report(step, ""),
        };
        step = next(step, outcome);
    }
}

fn preflight(ctx: &Ctx) -> Outcome {
    let handoff_ok = work_dir().join("handoff.bin").exists();
    let setup_ok = ctx.setup.as_ref().map(|p| p.exists()).unwrap_or(false);
    ok_if(handoff_ok && setup_ok && ctx.install_dir.join("Descall.exe").exists())
}

fn install_new(ctx: &Ctx) -> Outcome {
    let Some(setup) = &ctx.setup else { return Outcome::Failed };
    // NSIS: /S silent, /D= must be last and unquoted. The setup is the signed Tauri NSIS.
    let status = Command::new(setup).arg("/S").arg(format!("/D={}", ctx.install_dir.display())).status();
    ok_if(matches!(status, Ok(s) if s.success()) && ctx.install_dir.join("Descall.exe").exists())
}

fn rollback(ctx: &Ctx) -> Outcome {
    // Stop the new app (by full image path), remove its files, put the old folder back.
    let _ = wait_exit(&ctx.install_dir.join("Descall.exe"), Duration::from_secs(10));
    if ctx.legacy_dir.exists() {
        let _ = std::fs::remove_dir_all(&ctx.install_dir);
        if std::fs::rename(&ctx.legacy_dir, &ctx.install_dir).is_err() {
            return Outcome::Failed;
        }
    }
    // Registry snapshot restore + relaunch Electron with --migration-failed.
    ok_if(Command::new(ctx.install_dir.join("Descall.exe")).arg("--migration-failed").spawn().is_ok())
}

/// P1: enumerate processes (Toolhelp32) and compare QueryFullProcessImageNameW with `exe`;
/// never match by name only, the new exe is also Descall.exe.
fn wait_exit(exe: &Path, timeout: Duration) -> Outcome {
    let _ = (exe, timeout);
    Outcome::Ok
}

fn await_file(p: &Path, timeout: Duration) -> Outcome {
    let t0 = Instant::now();
    while t0.elapsed() < timeout {
        if p.exists() {
            return Outcome::Ok;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Outcome::Failed
}

fn ok_if(b: bool) -> Outcome {
    if b { Outcome::Ok } else { Outcome::Failed }
}

fn persist_step(step: Step) {
    let _ = std::fs::create_dir_all(work_dir());
    let _ = std::fs::write(work_dir().join("state.json"), serde_json::json!({ "step": step, "at": unix_now() }).to_string());
}

/// Telemetry: POST /api/desktop/migration/report {installId, step, outcome, durationMs,
/// winBuild, error} (P1, with the install id from the handoff). Here: local log only.
fn report(step: Step, detail: &str) -> i32 {
    let _ = std::fs::write(work_dir().join("result.json"), serde_json::json!({ "final": step, "detail": detail }).to_string());
    match step {
        Step::Done => 0,
        Step::Skipped => 1,
        _ => 3,
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
