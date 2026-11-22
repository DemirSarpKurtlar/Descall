//! node.log: the app's own `log` records and every line of the backend and cloudflared, in
//! one file with a source tag, Istanbul local time, rotated at 2 MB into five generations
//! (descall_node::logrotate). Every line goes through the redactor first, which knows the
//! exact stored secret values and the shapes of secrets (descall_node::redact): nothing secret
//! reaches the file or the popover's log viewer. Debug builds also print to stderr.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock, RwLock};

use descall_node::logrotate::{self, Source};
use descall_node::redact::Redactor;

struct Sink {
    dir: PathBuf,
    file: Mutex<Option<(File, u64)>>,
    redactor: RwLock<Redactor>,
}

static SINK: OnceLock<Sink> = OnceLock::new();

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn sink() -> &'static Sink {
    SINK.get_or_init(|| Sink { dir: crate::paths::logs_dir(), file: Mutex::new(None), redactor: RwLock::new(Redactor::default()) })
}

fn open(dir: &PathBuf) -> Option<(File, u64)> {
    std::fs::create_dir_all(dir).ok()?;
    let f = OpenOptions::new().create(true).append(true).open(dir.join(logrotate::FILE)).ok()?;
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    Some((f, len))
}

/// The stored secrets changed: the redactor learns the new values.
pub fn set_secrets(values: Vec<String>) {
    if let Ok(mut r) = sink().redactor.write() {
        r.set_secrets(values);
    }
}

pub fn redact(line: &str) -> String {
    sink().redactor.read().map(|r| r.redact(line)).unwrap_or_else(|_| descall_node::redact::redact_shapes(line))
}

pub fn write(level: &str, src: Source, message: &str) {
    let s = sink();
    let clean = redact(message);
    let line = logrotate::format_line(now_ms(), 180, level, src, &clean);
    if cfg!(debug_assertions) {
        eprint!("{line}");
    }
    let Ok(mut slot) = s.file.lock() else { return };
    if slot.is_none() {
        *slot = open(&s.dir);
    }
    if slot.as_ref().is_some_and(|(_, len)| logrotate::should_rotate(*len, line.len())) {
        *slot = None;
        let _ = std::fs::remove_file(s.dir.join(logrotate::rotated_name(logrotate::KEEP)));
        for (from, to) in logrotate::rotation() {
            let _ = std::fs::rename(s.dir.join(from), s.dir.join(to));
        }
        *slot = open(&s.dir);
    }
    if let Some((f, len)) = slot.as_mut() {
        if f.write_all(line.as_bytes()).is_ok() {
            *len += line.len() as u64;
        }
    }
}

/// Last `n` lines for the popover's viewer (redacted again, in case a secret was added later).
pub fn tail(n: usize) -> Vec<String> {
    let dir = crate::paths::logs_dir();
    let mut text = std::fs::read_to_string(dir.join(logrotate::FILE)).unwrap_or_default();
    if text.lines().count() < n {
        let older = std::fs::read_to_string(dir.join(logrotate::rotated_name(1))).unwrap_or_default();
        text = older + &text;
    }
    logrotate::tail(&text, n).into_iter().map(redact).collect()
}

struct AppLog;

impl log::Log for AppLog {
    fn enabled(&self, m: &log::Metadata) -> bool {
        let own = m.target().starts_with("DescallNode") || m.target().starts_with("descall");
        if own {
            m.level() <= log::Level::Info
        } else {
            m.level() <= log::Level::Warn
        }
    }

    fn log(&self, r: &log::Record) {
        if !self.enabled(r.metadata()) {
            return;
        }
        let level = match r.level() {
            log::Level::Error => "error",
            log::Level::Warn => "warn",
            log::Level::Info => "info",
            _ => "debug",
        };
        write(level, Source::App, &r.args().to_string());
    }

    fn flush(&self) {
        if let Ok(mut slot) = sink().file.lock() {
            if let Some((f, _)) = slot.as_mut() {
                let _ = f.flush();
            }
        }
    }
}

pub fn init() {
    static LOGGER: AppLog = AppLog;
    if log::set_logger(&LOGGER).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
}
