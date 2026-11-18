//! Everything the runner needs from the operating system, behind one trait: the Windows
//! implementation is [`crate::win::WinSys`]; the unit tests use a fake with a real temp
//! folder plus fault injection (crash at any step, disk full, locked files, a hanging or
//! failing setup, an app that never reports ready).

use std::io;
use std::path::{Path, PathBuf};

use crate::regsnap::{Hive, RegData, RegValue};
use crate::setup_cmd::SetupArg;
use crate::strategy::Entry;

/// Electron's Uninstall entry (electron-builder: `Uninstall\{GUID}` with DisplayName
/// "Descall <ver>" and "Uninstall Descall.exe").
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ElectronInstall {
    /// Key path relative to the hive.
    pub key_path: String,
    pub per_machine: bool,
    pub install_location: PathBuf,
    pub display_version: String,
}

/// Folders of the current user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Env {
    /// `%LOCALAPPDATA%\Descall-Migration`
    pub work_dir: PathBuf,
    /// `%APPDATA%`
    pub appdata: PathBuf,
    /// `%LOCALAPPDATA%`
    pub local_app_data: PathBuf,
    /// This executable (for the RunOnce resume hook).
    pub self_exe: PathBuf,
}

impl Env {
    pub fn health_file(&self) -> PathBuf {
        crate::health::health_path(&self.appdata)
    }
    pub fn electron_user_data(&self) -> PathBuf {
        self.appdata.join(crate::paths::ELECTRON_USER_DATA)
    }
}

pub trait Sys {
    fn now_unix(&self) -> u64;
    fn now_ms(&self) -> u64;
    fn sleep_ms(&self, ms: u64);
    /// One line to the migrator log (never secrets).
    fn log(&self, line: &str);
    /// Process-wide exclusive lock (held until exit; released by the OS on a kill).
    fn acquire_lock(&self, path: &Path) -> bool;

    fn exists(&self, p: &Path) -> bool;
    fn list_dir(&self, p: &Path) -> io::Result<Vec<Entry>>;
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn remove_dir_all(&self, p: &Path) -> io::Result<()>;
    fn remove_file(&self, p: &Path) -> io::Result<()>;
    fn read(&self, p: &Path) -> io::Result<Vec<u8>>;
    fn write_atomic(&self, p: &Path, bytes: &[u8]) -> io::Result<()>;
    fn copy_file(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn file_size(&self, p: &Path) -> io::Result<u64>;
    fn sha256_file(&self, p: &Path) -> io::Result<String>;
    fn free_space(&self, p: &Path) -> io::Result<u64>;
    /// Overwrite with zeros, then delete (best effort).
    fn shred(&self, p: &Path);

    /// Pids whose image is exactly `exe` (full path, case-insensitive).
    fn pids_of(&self, exe: &Path) -> Vec<u32>;
    fn terminate(&self, pid: u32) -> bool;
    /// Start a detached process; returns its pid.
    fn spawn(&self, exe: &Path, args: &[String]) -> io::Result<u32>;
    /// Run the setup and wait. `Ok(None)` = timed out (the process was killed).
    fn run_setup(&self, exe: &Path, args: &[SetupArg], timeout_ms: u64) -> io::Result<Option<i32>>;

    fn os_build(&self) -> u32;
    fn electron_install(&self) -> Option<ElectronInstall>;
    fn protected_dirs(&self) -> Vec<PathBuf>;

    fn reg_read(&self, hive: Hive, key: &str, name: &str) -> RegData;
    /// `RegData::Absent` deletes the value.
    fn reg_write(&self, v: &RegValue) -> io::Result<()>;
    fn reg_subkeys(&self, hive: Hive, key: &str) -> Vec<String>;
    fn reg_delete_key(&self, hive: Hive, key: &str) -> io::Result<()>;

    /// Every `.lnk` in the user's shell folders with its target (None when unreadable).
    fn find_shortcuts(&self) -> Vec<(PathBuf, Option<PathBuf>)>;
    fn retarget_shortcut(&self, lnk: &Path, new_exe: &Path) -> io::Result<()>;
}

/// Reason code for an I/O error (disk full is reported as such everywhere).
pub fn io_code(prefix: &str, e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::StorageFull => "disk_full".into(),
        io::ErrorKind::PermissionDenied => format!("{prefix}_access_denied"),
        io::ErrorKind::NotFound => format!("{prefix}_not_found"),
        _ => match e.raw_os_error() {
            // Windows: ERROR_DISK_FULL, ERROR_HANDLE_DISK_FULL
            Some(112) | Some(39) if cfg!(windows) => "disk_full".into(),
            // Windows: ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
            Some(32) | Some(33) if cfg!(windows) => format!("{prefix}_locked"),
            _ => format!("{prefix}_failed"),
        },
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn io_codes() {
        use std::io::{Error, ErrorKind};
        assert_eq!(super::io_code("rename", &Error::from(ErrorKind::StorageFull)), "disk_full");
        if cfg!(windows) {
            assert_eq!(super::io_code("rename", &Error::from_raw_os_error(112)), "disk_full");
            assert_eq!(super::io_code("rename", &Error::from_raw_os_error(32)), "rename_locked");
        }
        assert_eq!(super::io_code("rename", &Error::other("x")), "rename_failed");
        assert_eq!(super::io_code("rename", &Error::from(ErrorKind::PermissionDenied)), "rename_access_denied");
    }
}
