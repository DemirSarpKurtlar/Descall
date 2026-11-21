//! main.log of the Tauri shell (Electron: electron-log, `%APPDATA%\Descall\logs\main.log`,
//! level info, 1 MB then main.old.log). Without a logger every `log::` line of the shell
//! (boot watchdog, migration, downloads, refused IPC, panics) was dropped: a stuck start left
//! no evidence. The Tauri app writes `%LOCALAPPDATA%\com.descall.app\logs\main.log`.

pub const FILE_NAME: &str = "main.log";
pub const OLD_FILE_NAME: &str = "main.old.log";
/// electron-log's default maxSize.
pub const MAX_BYTES: u64 = 1024 * 1024;
/// One line never grows the file by more than this (a runaway message).
pub const MAX_LINE_CHARS: usize = 2400;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

/// Which records reach the file: the shell's own lines from info up, other crates (tauri,
/// wry, plugins) from warn up, so the file stays readable and small.
pub fn wanted(level: Level, target: &str) -> bool {
    let own = target == "Descall" || target.starts_with("Descall::") || target.starts_with("descall");
    if own {
        level <= Level::Info
    } else {
        level <= Level::Warn
    }
}

/// True when appending `incoming` bytes would pass [`MAX_BYTES`]: move main.log to
/// main.old.log first (one generation kept, like electron-log).
pub fn should_rotate(current: u64, incoming: usize) -> bool {
    current > 0 && current.saturating_add(incoming as u64) > MAX_BYTES
}

/// Civil date and time (UTC) of a Unix time in milliseconds.
fn civil(ms: u64) -> (i64, u32, u32, u64, u64, u64, u64) {
    let secs = ms / 1000;
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Howard Hinnant's days_from_civil inverse.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60, ms % 1000)
}

/// `[2026-11-21 20:04:05.123] [warn]  message` (electron-log layout, UTC), one line.
pub fn format_line(unix_ms: u64, level: Level, message: &str) -> String {
    let (y, mo, d, h, mi, s, ms) = civil(unix_ms);
    let name = match level {
        Level::Error => "error",
        Level::Warn => "warn",
        Level::Info => "info",
        Level::Debug => "debug",
        Level::Trace => "trace",
    };
    let one: String = message.replace(['\r', '\n'], " ").chars().take(MAX_LINE_CHARS).collect();
    format!("[{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}.{ms:03}] [{name}] {one}\n")
}

/// Renderer lines per minute that reach the file (a page in an error loop must not churn it).
pub const RENDERER_PER_MINUTE: u32 = 120;

/// Fixed one-minute window: `(window start, count)` -> (new state, may log).
pub fn renderer_rate(state: (u64, u32), now_ms: u64) -> ((u64, u32), bool) {
    let (start, n) = state;
    if now_ms.saturating_sub(start) >= 60_000 || now_ms < start {
        ((now_ms, 1), true)
    } else if n < RENDERER_PER_MINUTE {
        ((start, n + 1), true)
    } else {
        ((start, n), false)
    }
}

/// A page console line for main.log (Electron: console-message, 400 characters, 2400 for CSP
/// reports): one line, sign-in tokens (JWTs, Bearer values) replaced.
pub fn renderer_message(message: &str) -> String {
    let max = if message.contains("Content Security Policy") || message.starts_with("CSP ") { 2400 } else { 400 };
    let mut out = String::with_capacity(message.len().min(max));
    let mut bearer = false;
    for (i, word) in message.split_whitespace().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        let jwt = word.split(['"', '\'', '=', ':', ',', '(', ')']).any(|w| w.starts_with("eyJ") && w.matches('.').count() >= 2 && w.len() > 20);
        if bearer || jwt {
            out.push_str("<token>");
        } else {
            out.push_str(word);
        }
        bearer = word.eq_ignore_ascii_case("bearer");
    }
    out.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renderer_lines_drop_tokens_and_are_capped() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
        let m = renderer_message(&format!("fetch failed Authorization: Bearer abc.def.ghi token={jwt} done"));
        assert!(!m.contains("abc.def.ghi") && !m.contains(jwt), "{m}");
        assert_eq!(m, "fetch failed Authorization: Bearer <token> <token> done");
        assert_eq!(renderer_message("a\n  b\tc"), "a b c");
        assert_eq!(renderer_message(&"x".repeat(5000)).len(), 400);
        assert_eq!(renderer_message(&format!("CSP img-src blocked {}", "y".repeat(5000))).chars().count(), 2400);
        assert_eq!(renderer_message("[Shop] state ready"), "[Shop] state ready");
    }

    #[test]
    fn renderer_lines_are_rate_limited() {
        let mut s = (0u64, 0u32);
        let mut ok = 0;
        for i in 0..500 {
            let (n, allowed) = renderer_rate(s, 1_000 + i);
            s = n;
            ok += allowed as u32;
        }
        assert_eq!(ok, RENDERER_PER_MINUTE);
        let (_, allowed) = renderer_rate(s, 1_000 + 60_000);
        assert!(allowed, "a new minute opens again");
    }

    #[test]
    fn lines_look_like_electron_log() {
        assert_eq!(format_line(0, Level::Info, "x"), "[1970-01-01 00:00:00.000] [info] x\n");
        // 2026-11-21 20:04:05.123 UTC
        assert_eq!(format_line(1_795_291_445_123, Level::Warn, "[boot] no paint"), "[2026-11-21 20:04:05.123] [warn] [boot] no paint\n");
        assert_eq!(format_line(951_782_400_000, Level::Error, "leap"), "[2000-02-29 00:00:00.000] [error] leap\n");
        assert_eq!(format_line(0, Level::Info, "a\nb\r\nc"), "[1970-01-01 00:00:00.000] [info] a b  c\n", "one record, one line");
        assert!(format_line(0, Level::Info, &"x".repeat(10_000)).len() < MAX_LINE_CHARS + 64);
    }

    #[test]
    fn own_lines_from_info_others_from_warn() {
        assert!(wanted(Level::Info, "Descall::boot"));
        assert!(wanted(Level::Info, "Descall"));
        assert!(wanted(Level::Warn, "descall_capture::wgc"));
        assert!(!wanted(Level::Debug, "Descall::boot"));
        assert!(!wanted(Level::Info, "tauri::manager"));
        assert!(wanted(Level::Warn, "tauri::manager"));
        assert!(wanted(Level::Error, "wry"));
    }

    #[test]
    fn rotates_at_one_megabyte() {
        assert!(!should_rotate(0, 10_000_000), "an empty file is never rotated");
        assert!(!should_rotate(MAX_BYTES - 10, 10));
        assert!(should_rotate(MAX_BYTES - 10, 11));
    }
}
