//! Setup log: `%LOCALAPPDATA%\Descall-Setup\logs\setup-<unix>.log` (last 10 kept). File lines are
//! English/structured for support; the page gets the same events as `{t, k, a, lv}` and renders
//! them in the user's language.

use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use super::ui::Ui;

struct Log {
    file: Mutex<Option<File>>,
    ui: Mutex<Option<Ui>>,
}

static LOG: OnceLock<Log> = OnceLock::new();

pub fn init(dir: &Path) -> PathBuf {
    let _ = fs::create_dir_all(dir);
    if let Ok(rd) = fs::read_dir(dir) {
        let mut old: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "log")).collect();
        old.sort();
        while old.len() >= 10 {
            let _ = fs::remove_file(old.remove(0));
        }
    }
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("setup-{secs}.log"));
    let file = OpenOptions::new().create(true).append(true).open(&path).ok();
    let _ = LOG.set(Log { file: Mutex::new(file), ui: Mutex::new(None) });
    info(&format!("Descall Setup {} ({} {})", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH));
    path
}

pub fn attach_ui(ui: Ui) {
    if let Some(l) = LOG.get() {
        if let Ok(mut u) = l.ui.lock() {
            *u = Some(ui);
        }
    }
}

/// Local wall-clock "HH:MM:SS" (from the UTC offset Windows reports).
pub fn clock() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let local = now + utc_offset_secs();
    let s = local.rem_euclid(86_400);
    format!("{:02}:{:02}:{:02}", s / 3600, (s / 60) % 60, s % 60)
}

fn utc_offset_secs() -> i64 {
    use windows::Win32::System::Time::{GetTimeZoneInformation, TIME_ZONE_INFORMATION};
    let mut tz = TIME_ZONE_INFORMATION::default();
    let r = unsafe { GetTimeZoneInformation(&mut tz) };
    let bias = tz.Bias + if r == 2 { tz.DaylightBias } else { tz.StandardBias };
    -(bias as i64) * 60
}

fn write(level: &str, text: &str) {
    if let Some(l) = LOG.get() {
        if let Ok(mut f) = l.file.lock() {
            if let Some(f) = f.as_mut() {
                let _ = writeln!(f, "{} [{level}] {text}", clock());
                let _ = f.flush();
            }
        }
    }
}

pub fn info(text: &str) {
    write("info", text);
}
pub fn warn(text: &str) {
    write("warn", text);
}
pub fn error(text: &str) {
    write("error", text);
}

/// A localized live-log line on the page (key from ui/i18n.js) plus a structured file line.
pub fn event(key: &str, args: Value, lv: &str) {
    write(if lv.is_empty() { "info" } else { lv }, &format!("{key} {args}"));
    if let Some(l) = LOG.get() {
        if let Ok(u) = l.ui.lock() {
            if let Some(ui) = u.as_ref() {
                ui.log(json!({ "t": clock(), "k": key, "a": args, "lv": lv }));
            }
        }
    }
}

/// Like `event`, but the page replaces its last line when that line has the same key (live
/// part counter). Not written to the file.
pub fn event_rep(key: &str, args: Value) {
    if let Some(l) = LOG.get() {
        if let Ok(u) = l.ui.lock() {
            if let Some(ui) = u.as_ref() {
                ui.log(json!({ "t": clock(), "k": key, "a": args, "lv": "", "rep": true }));
            }
        }
    }
}
