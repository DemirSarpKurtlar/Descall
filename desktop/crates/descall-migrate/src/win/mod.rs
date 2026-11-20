//! Windows implementation of [`crate::sys::Sys`].

pub mod dpapi;
pub mod registry;
pub mod secure_file;
pub mod shell;

use std::cell::RefCell;
use std::io::{self, Write};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, GetDiskFreeSpaceExW, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_DELETE_ON_CLOSE, FILE_GENERIC_WRITE, FILE_SHARE_NONE, OPEN_ALWAYS,
};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};

use crate::paths;
use crate::regsnap::{Hive, RegData, RegValue};
use crate::setup_cmd::SetupArg;
use crate::strategy::Entry;
use crate::sys::{ElectronInstall, Env, Sys};

const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_LOG_BYTES: u64 = 1024 * 1024;

pub struct WinSys {
    log_path: PathBuf,
    lock: RefCell<Option<HANDLE>>,
    started: Instant,
    base_ms: u64,
}

impl WinSys {
    pub fn new(env: &Env) -> Self {
        let base_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        WinSys { log_path: env.work_dir.join("migrator.log"), lock: RefCell::new(None), started: Instant::now(), base_ms }
    }
}

impl Drop for WinSys {
    fn drop(&mut self) {
        if let Some(h) = self.lock.borrow_mut().take() {
            unsafe {
                let _ = CloseHandle(h);
            }
        }
    }
}

/// The current user's folders from the environment.
pub fn env_from_process() -> Option<Env> {
    let local = PathBuf::from(std::env::var_os("LOCALAPPDATA")?);
    let appdata = PathBuf::from(std::env::var_os("APPDATA")?);
    Some(Env { work_dir: local.join(paths::WORK_DIR_NAME), appdata, local_app_data: local, self_exe: std::env::current_exe().ok()? })
}

fn wide(p: &Path) -> Vec<u16> {
    p.as_os_str().encode_wide().chain([0]).collect()
}

fn image_path(pid: u32) -> Option<PathBuf> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        r.ok()?;
        Some(PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
    }
}

/// Every pid whose image is `exe` (Toolhelp snapshot + full image path).
pub fn pids_of_image(exe: &Path) -> Vec<u32> {
    let mut out = Vec::new();
    let want_name = exe.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let end = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            let name = String::from_utf16_lossy(&e.szExeFile[..end]).to_lowercase();
            if name == want_name {
                if let Some(img) = image_path(e.th32ProcessID) {
                    if paths::same_path(&img, exe) {
                        out.push(e.th32ProcessID);
                    }
                }
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    out
}

impl Sys for WinSys {
    fn now_unix(&self) -> u64 {
        crate::unix_now()
    }
    fn now_ms(&self) -> u64 {
        self.base_ms + self.started.elapsed().as_millis() as u64
    }
    fn sleep_ms(&self, ms: u64) {
        std::thread::sleep(Duration::from_millis(ms));
    }
    fn log(&self, line: &str) {
        if std::fs::metadata(&self.log_path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
            let _ = std::fs::rename(&self.log_path, paths::with_suffix(&self.log_path, ".old"));
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&self.log_path) {
            let _ = writeln!(f, "{} {}", crate::unix_now(), line);
        }
    }
    fn acquire_lock(&self, path: &Path) -> bool {
        if self.lock.borrow().is_some() {
            return true;
        }
        let w = wide(path);
        let h = unsafe {
            CreateFileW(PCWSTR(w.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_NONE, None, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_DELETE_ON_CLOSE, None)
        };
        match h {
            Ok(h) => {
                *self.lock.borrow_mut() = Some(h);
                true
            }
            Err(_) => false,
        }
    }

    fn exists(&self, p: &Path) -> bool {
        p.exists()
    }
    fn list_dir(&self, p: &Path) -> io::Result<Vec<Entry>> {
        let mut v = Vec::new();
        for e in std::fs::read_dir(p)? {
            let e = e?;
            v.push(Entry { name: e.file_name().to_string_lossy().into_owned(), is_dir: e.file_type()?.is_dir() });
        }
        Ok(v)
    }
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
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
    fn free_space(&self, p: &Path) -> io::Result<u64> {
        let w = wide(p);
        let mut free = 0u64;
        unsafe { GetDiskFreeSpaceExW(PCWSTR(w.as_ptr()), Some(&mut free), None, None) }.map_err(|e| io::Error::from_raw_os_error(e.code().0 & 0xffff))?;
        Ok(free)
    }
    fn shred(&self, p: &Path) {
        secure_file::shred(p)
    }

    fn pids_of(&self, exe: &Path) -> Vec<u32> {
        pids_of_image(exe)
    }
    fn terminate(&self, pid: u32) -> bool {
        unsafe {
            match OpenProcess(PROCESS_TERMINATE, false, pid) {
                Ok(h) => {
                    let r = TerminateProcess(h, 1).is_ok();
                    let _ = CloseHandle(h);
                    r
                }
                Err(_) => false,
            }
        }
    }
    fn spawn(&self, exe: &Path, args: &[String]) -> io::Result<u32> {
        let child = Command::new(exe)
            .args(args)
            .current_dir(exe.parent().unwrap_or(Path::new(".")))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
            .spawn()?;
        Ok(child.id())
    }
    fn run_setup(&self, exe: &Path, args: &[SetupArg], timeout_ms: u64) -> io::Result<Option<i32>> {
        let mut cmd = Command::new(exe);
        for a in args {
            match a {
                SetupArg::Quoted(s) => {
                    cmd.arg(s);
                }
                SetupArg::Raw(s) => {
                    cmd.raw_arg(s);
                }
            }
        }
        let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn()?;
        let t0 = Instant::now();
        loop {
            if let Some(status) = child.try_wait()? {
                return Ok(Some(status.code().unwrap_or(-1)));
            }
            if t0.elapsed() >= Duration::from_millis(timeout_ms) {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(None);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    fn os_build(&self) -> u32 {
        registry::os_build()
    }
    fn electron_install(&self) -> Option<ElectronInstall> {
        registry::find_electron()
    }
    fn protected_dirs(&self) -> Vec<PathBuf> {
        crate::strategy::protected_dirs(&|k| std::env::var(k).ok())
    }

    fn reg_read(&self, hive: Hive, key: &str, name: &str) -> RegData {
        registry::read(hive, key, name)
    }
    fn reg_write(&self, v: &RegValue) -> io::Result<()> {
        registry::write(v)
    }
    fn reg_subkeys(&self, hive: Hive, key: &str) -> Vec<String> {
        registry::subkeys(hive, key)
    }
    fn reg_delete_key(&self, hive: Hive, key: &str) -> io::Result<()> {
        registry::delete_tree(hive, key)
    }

    fn find_shortcuts(&self) -> Vec<(PathBuf, Option<PathBuf>)> {
        shell::find_shortcuts()
    }
    fn retarget_shortcut(&self, lnk: &Path, new_exe: &Path) -> io::Result<()> {
        shell::retarget(lnk, new_exe).map_err(|e| io::Error::other(e.to_string()))
    }
}
