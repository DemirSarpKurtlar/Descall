//! main.log (descall_shell::logfile): the `log` records of the shell in
//! `%LOCALAPPDATA%\com.descall.app\logs\main.log`, rotated to main.old.log at 1 MB, like
//! Electron's electron-log main.log. Installed first thing in main(), before the Electron
//! import and the window, so a stuck start leaves evidence. Debug builds also print to stderr.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use descall_shell::logfile::{self, Level};

struct FileLog {
    dir: PathBuf,
    file: Mutex<Option<(File, u64)>>,
}

fn level(l: log::Level) -> Level {
    match l {
        log::Level::Error => Level::Error,
        log::Level::Warn => Level::Warn,
        log::Level::Info => Level::Info,
        log::Level::Debug => Level::Debug,
        log::Level::Trace => Level::Trace,
    }
}

impl FileLog {
    fn open(&self) -> Option<(File, u64)> {
        std::fs::create_dir_all(&self.dir).ok()?;
        let f = OpenOptions::new().create(true).append(true).open(self.dir.join(logfile::FILE_NAME)).ok()?;
        let len = f.metadata().map(|m| m.len()).unwrap_or(0);
        Some((f, len))
    }
}

impl log::Log for FileLog {
    fn enabled(&self, m: &log::Metadata) -> bool {
        logfile::wanted(level(m.level()), m.target())
    }

    fn log(&self, r: &log::Record) {
        if !self.enabled(r.metadata()) {
            return;
        }
        let line = logfile::format_line(crate::state::now_ms(), level(r.level()), &r.args().to_string());
        if cfg!(debug_assertions) {
            eprint!("{line}");
        }
        let Ok(mut slot) = self.file.lock() else { return };
        if slot.is_none() {
            *slot = self.open();
        }
        if slot.as_ref().is_some_and(|(_, len)| logfile::should_rotate(*len, line.len())) {
            *slot = None;
            let _ = std::fs::rename(self.dir.join(logfile::FILE_NAME), self.dir.join(logfile::OLD_FILE_NAME));
            *slot = self.open();
        }
        if let Some((f, len)) = slot.as_mut() {
            if f.write_all(line.as_bytes()).is_ok() {
                *len += line.len() as u64;
            }
        }
    }

    fn flush(&self) {
        if let Ok(mut slot) = self.file.lock() {
            if let Some((f, _)) = slot.as_mut() {
                let _ = f.flush();
            }
        }
    }
}

/// Tauri's app_log_dir on Windows: %LOCALAPPDATA%\<identifier>\logs.
fn log_dir() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).or_else(|| std::env::var_os("XDG_DATA_HOME").map(PathBuf::from))?;
    Some(base.join("com.descall.app").join("logs"))
}

pub fn init() {
    let Some(dir) = log_dir() else { return };
    let logger: &'static FileLog = Box::leak(Box::new(FileLog { dir, file: Mutex::new(None) }));
    if log::set_logger(logger).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
        log::info!("[main] Descall {} starting", env!("CARGO_PKG_VERSION"));
    }
}
