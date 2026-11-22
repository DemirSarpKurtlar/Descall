//! `%LOCALAPPDATA%\DescallNode\logs\node.log`: one file for the app, the backend and the
//! tunnel (source tag per line), rotated at [`MAX_BYTES`] into node.1.log ... node.5.log.
//! Lines are written in Istanbul local time (the owner reads them) and are always redacted
//! first ([`crate::redact`]).

pub const FILE: &str = "node.log";
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;
pub const KEEP: u32 = 5;
pub const MAX_LINE_CHARS: usize = 4000;

pub fn rotated_name(n: u32) -> String {
    if n == 0 {
        FILE.to_string()
    } else {
        format!("node.{n}.log")
    }
}

pub fn should_rotate(current: u64, incoming: usize) -> bool {
    current > 0 && current.saturating_add(incoming as u64) > MAX_BYTES
}

/// Renames for one rotation, oldest first (node.4 -> node.5, ..., node -> node.1); the old
/// node.5.log is replaced (deleted by the rename on Windows: the app removes it first).
pub fn rotation() -> Vec<(String, String)> {
    (0..KEEP).rev().map(|n| (rotated_name(n), rotated_name(n + 1))).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    App,
    Backend,
    Tunnel,
}

impl Source {
    pub fn tag(self) -> &'static str {
        match self {
            Source::App => "app",
            Source::Backend => "backend",
            Source::Tunnel => "tunnel",
        }
    }
}

/// `[2026-11-22 23:41:00.123] [info] [backend] message` in local time, one line.
pub fn format_line(unix_ms: u64, offset_min: i32, level: &str, src: Source, message: &str) -> String {
    let l = crate::time::local(unix_ms, offset_min);
    let (h, m) = (l.minute_of_day / 60, l.minute_of_day % 60);
    let s = (unix_ms / 1000) % 60;
    let ms = unix_ms % 1000;
    let one: String = message.replace(['\r', '\n'], " ").chars().take(MAX_LINE_CHARS).collect();
    format!("[{} {h:02}:{m:02}:{s:02}.{ms:03}] [{level}] [{}] {}\n", l.day_key(), src.tag(), one.trim_end())
}

/// Level of a child's line: stderr is warn unless it says otherwise.
pub fn child_level(line: &str, stderr: bool) -> &'static str {
    // cloudflared: "2026-11-22T20:41:00Z INF Registered tunnel connection ..."
    for w in line.split_whitespace().take(3) {
        match w {
            "ERR" => return "error",
            "WRN" => return "warn",
            "INF" | "DBG" => return "info",
            _ => {}
        }
    }
    let l = line.to_ascii_lowercase();
    if l.contains("error") || l.contains(" err ") || l.contains("fatal") || l.contains("uncaught") {
        "error"
    } else if l.contains("warn") || stderr {
        "warn"
    } else {
        "info"
    }
}

/// Last `n` lines of a log text (the popover's viewer).
pub fn tail(text: &str, n: usize) -> Vec<&str> {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_order() {
        assert_eq!(rotation().first().unwrap(), &("node.4.log".to_string(), "node.5.log".to_string()));
        assert_eq!(rotation().last().unwrap(), &("node.log".to_string(), "node.1.log".to_string()));
        assert_eq!(rotation().len(), KEEP as usize);
        assert!(should_rotate(MAX_BYTES - 10, 11));
        assert!(!should_rotate(0, 10_000_000), "a huge first line still lands");
    }

    #[test]
    fn line_layout() {
        let l = format_line(1_795_380_060_123, 180, "info", Source::Backend, "Server listening\non port 3210\n");
        assert_eq!(l, "[2026-11-22 23:41:00.123] [info] [backend] Server listening on port 3210\n");
        assert_eq!(child_level("Error: boom", false), "error");
        assert_eq!(child_level("(node:1) Warning: x", false), "warn");
        assert_eq!(child_level("2026-11-22T20:41:00Z INF Registered tunnel connection", true), "info");
        assert_eq!(child_level("2026-11-22T20:41:00Z ERR lost connection", true), "error");
        assert_eq!(child_level("something on stderr", true), "warn");
        assert_eq!(child_level("ready", false), "info");
    }

    #[test]
    fn tail_lines() {
        assert_eq!(tail("a\nb\n\nc\n", 2), vec!["b", "c"]);
        assert_eq!(tail("", 5), Vec::<&str>::new());
    }
}
