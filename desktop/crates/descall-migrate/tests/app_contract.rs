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
