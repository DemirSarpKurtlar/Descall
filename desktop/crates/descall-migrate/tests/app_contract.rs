//! The Tauri app's bundle must be what the migrator expects: the NSIS setup it runs
//! silently with `/S /D=<dir>` (job::default_args), installing `Descall.exe` per user (no
//! elevation, same exe path as Electron), with the identifier that names the app's data
//! folder (`%APPDATA%\com.descall.app`, where health.json is written).

use std::path::Path;

use descall_migrate::{health, job, paths, setup_cmd};

fn tauri_conf() -> serde_json::Value {
    serde_json::from_str(include_str!("../../../app/src-tauri/tauri.conf.json")).expect("tauri.conf.json parses")
}

#[test]
fn the_app_bundle_matches_the_migrator() {
    let c = tauri_conf();
    assert_eq!(c["identifier"], paths::NEW_APP_ID, "health.json lives under the app identifier");
    assert_eq!(format!("{}.exe", c["mainBinaryName"].as_str().unwrap()), paths::APP_EXE, "same exe name as Electron");
    let targets: Vec<&str> = c["bundle"]["targets"].as_array().unwrap().iter().filter_map(|t| t.as_str()).collect();
    assert!(targets.contains(&"nsis"), "the migrator runs an NSIS setup");
    let nsis = &c["bundle"]["windows"]["nsis"];
    assert_eq!(nsis["installMode"], "currentUser", "a silent per-user install needs no UAC prompt");
    assert_ne!(nsis["displayLanguageSelector"], true, "a language dialog would block /S");
    let hooks = include_str!("../../../app/src-tauri/nsis/hooks.nsh");
    assert!(!hooks.contains("Abort") && !hooks.contains("MessageBox"), "installer hooks must not stop a silent install");
}

#[test]
fn the_setup_command_is_nsis_silent_with_the_target_last() {
    assert_eq!(job::default_args(), vec!["/S".to_string(), "/D={dir}".to_string()]);
    let args = setup_cmd::build(&job::default_args(), Path::new(r"C:\Users\Ayse Demir\AppData\Local\Programs\Descall")).unwrap();
    assert_eq!(args.first(), Some(&setup_cmd::SetupArg::Quoted("/S".into())));
    assert_eq!(args.last(), Some(&setup_cmd::SetupArg::Raw(r"/D=C:\Users\Ayse Demir\AppData\Local\Programs\Descall".into())));
}

#[test]
fn health_file_is_in_the_app_data_folder() {
    let appdata = Path::new(r"C:\Users\x\AppData\Roaming");
    let p = health::health_path(appdata);
    assert!(paths::same_path(&p, Path::new(r"C:\Users\x\AppData\Roaming\com.descall.app\migration\health.json")), "{}", p.display());
}

/// The reports the new app sends pass the server's whitelist (backend/lib/desktopMigration.js
/// cleanReport: EVENTS and CODE_RE).
#[test]
fn reports_use_the_servers_event_names_and_codes() {
    use descall_migrate::app::{codes, ElevatedRun};
    let backend = include_str!("../../../../frontend/backend/lib/desktopMigration.js");
    let events = &backend[backend.find("const EVENTS").expect("EVENTS")..];
    let events = &events[..events.find("]);").unwrap()];
    for e in ["\"done\"", "\"cleanup_done\"", "\"cleanup_failed\"", "\"rollback_ok\""] {
        assert!(events.contains(e), "{e} is a server event");
    }
    assert!(backend.contains(r"const CODE_RE = /^[a-z0-9_,.-]{1,80}$/;"), "code pattern changed: update this test");
    let code_ok = |c: &str| !c.is_empty() && c.len() <= 80 && c.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_,.-".contains(&b));
    let mut all: Vec<String> = [codes::HANDOFF_MISSING, codes::HANDOFF_INVALID, codes::AUTH_REJECTED, codes::START_FAILED].iter().map(|c| format!("app_{c}")).collect();
    for r in [ElevatedRun::Declined, ElevatedRun::Failed, ElevatedRun::Exit(4), ElevatedRun::Exit(6)] {
        all.push(r.report().1.unwrap().to_string());
    }
    for c in all {
        assert!(code_ok(&c), "{c}");
    }
}
