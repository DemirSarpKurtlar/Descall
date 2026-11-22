//! Main-process error reporting. Port of electron/mainErrors.cjs (scrubPaths,
//! summarizeError, createErrorRelay) plus the crash file the Rust shell needs on top.
//!
//! Summaries `{ kind, name, message, stack }` go to the page as `app:main-error`
//! (electronAPI.onMainError), whose Sentry client reports them. They carry no absolute
//! paths and no user names.
//!
//! Release builds use `panic = "abort"`: a panic ends the process right after the hook, so an
//! event emitted from the hook never reaches the page. The hook therefore also writes the
//! summary to a small crash file, and the next start forwards it once the page has mounted.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const MAX_MESSAGE: usize = 300;
pub const MAX_STACK: usize = 2000;
pub const MAX_PENDING: usize = 10;
/// In the app data folder; read and removed on the next start.
pub const CRASH_FILE: &str = "last-crash.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Summary {
    pub kind: String,
    pub name: String,
    pub message: String,
    pub stack: String,
}

fn cut(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Drop user names and absolute paths: `C:\Users\x\...\file.rs` -> `~\file.rs`,
/// `/home/x/...` and `/Users/x/...` -> `~/...`.
pub fn scrub_paths(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        // Drive path: X:\ followed by directories; keep only the last component.
        if i + 2 < chars.len() && chars[i].is_ascii_alphabetic() && chars[i + 1] == ':' && (chars[i + 2] == '\\' || chars[i + 2] == '/') && (i == 0 || !chars[i - 1].is_ascii_alphanumeric()) {
            let mut j = i + 3;
            let mut last_sep = i + 2;
            while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ':' && chars[j] != ')' && chars[j] != '\'' && chars[j] != '"' {
                if chars[j] == '\\' || chars[j] == '/' {
                    last_sep = j;
                }
                j += 1;
            }
            out.push('~');
            out.push(chars[last_sep]);
            out.extend(&chars[last_sep + 1..j]);
            i = j;
            continue;
        }
        // Unix home: /home/<user> or /Users/<user>.
        for prefix in ["/home/", "/Users/"] {
            let p: Vec<char> = prefix.chars().collect();
            if chars[i..].starts_with(&p) {
                let mut j = i + p.len();
                while j < chars.len() && chars[j] != '/' && !chars[j].is_whitespace() {
                    j += 1;
                }
                out.push('~');
                i = j;
                break;
            }
        }
        if i < chars.len() {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// A Rust panic (`std::panic::PanicHookInfo`: payload text and source location).
pub fn panic_summary(payload: &str, file: Option<&str>, line: Option<u32>, thread: Option<&str>) -> Summary {
    let mut stack = String::new();
    if let Some(f) = file {
        stack = format!("at {}:{}", scrub_paths(f), line.unwrap_or(0));
    }
    if let Some(t) = thread.filter(|t| !t.is_empty()) {
        if !stack.is_empty() {
            stack.push('\n');
        }
        stack.push_str(&format!("thread {}", cut(t, 60)));
    }
    // The message also goes through crate::crash::redact_paths (T10): any path-like token
    // that scrub_paths keeps (relative, file:, ~/...) is replaced as well.
    let message = crate::secrets::redact(&crate::crash::redact_paths(&scrub_paths(payload)));
    Summary { kind: "panic".into(), name: "RustPanic".into(), message: cut(&message, MAX_MESSAGE), stack: cut(&stack, MAX_STACK) }
}

/// Any other shell-side failure (renderer process gone, ...).
pub fn summary(kind: &str, name: &str, message: &str) -> Summary {
    Summary { kind: cut(kind, 40), name: cut(name, 60), message: cut(&crate::secrets::redact(&scrub_paths(message)), MAX_MESSAGE), stack: String::new() }
}

/// The page's text for the payload of `std::panic::PanicHookInfo`.
pub fn payload_text(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "panic".to_string()
    }
}

/// createErrorRelay: errors raised before the page can receive them wait here (at most
/// `MAX_PENDING`, oldest dropped). `attach` is called once the page has mounted.
#[derive(Debug, Default)]
pub struct Relay {
    pending: VecDeque<Summary>,
    attached: bool,
}

impl Relay {
    /// Queue a summary. Returns the summaries to send now (all pending, in order) when
    /// the page is attached.
    pub fn push(&mut self, s: Summary) -> Vec<Summary> {
        self.pending.push_back(s);
        while self.pending.len() > MAX_PENDING {
            self.pending.pop_front();
        }
        if self.attached {
            self.pending.drain(..).collect()
        } else {
            Vec::new()
        }
    }

    /// The page can receive events: everything queued so far, in order.
    pub fn attach(&mut self) -> Vec<Summary> {
        self.attached = true;
        self.pending.drain(..).collect()
    }

    /// A new document started loading: queue until it mounts again.
    pub fn detach(&mut self) {
        self.attached = false;
    }

    pub fn len(&self) -> usize {
        self.pending.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }
}

/// Crash file body (one summary; a second crash before the next start replaces it).
pub fn encode_crash(s: &Summary, at_ms: u64) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({ "v": 1, "at": at_ms, "summary": s })).unwrap_or_default()
}

/// The summary in a crash file, re-scrubbed and capped (the file is ours, but it sits in a
/// user-writable folder). Files older than a week are dropped.
pub fn decode_crash(bytes: &[u8], now_ms: u64) -> Option<Summary> {
    const WEEK_MS: u64 = 7 * 24 * 3600 * 1000;
    let v: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let at = v.get("at")?.as_u64()?;
    if now_ms.saturating_sub(at) > WEEK_MS {
        return None;
    }
    let s: Summary = serde_json::from_value(v.get("summary")?.clone()).ok()?;
    if s.message.trim().is_empty() {
        return None;
    }
    Some(Summary {
        kind: cut(&s.kind, 40),
        name: cut(&s.name, 60),
        message: cut(&scrub_paths(&s.message), MAX_MESSAGE),
        stack: format!("previous run\n{}", cut(&scrub_paths(&s.stack), MAX_STACK)),
    })
}

#[cfg(test)]
mod tests {
    //! mainErrors.selftest.mjs.
    use super::*;

    #[test]
    fn user_paths_are_scrubbed() {
        let w = scrub_paths(r"at C:\Users\demir\.cargo\registry\src\tauri-2.12.7\src\app.rs:12:5");
        assert!(!w.contains("demir") && !w.contains("Users"), "{w}");
        assert!(w.contains("app.rs"), "{w}");
        assert!(!scrub_paths("ENOENT: /home/ayse/.config/Descall/x.json").contains("ayse"));
        assert!(!scrub_paths("/Users/mert/Library/x").contains("mert"));
        assert_eq!(scrub_paths("index out of bounds: the len is 3 but the index is 5"), "index out of bounds: the len is 3 but the index is 5");
        // Not a drive path: a word ending in a letter before ':'.
        assert_eq!(scrub_paths("error: x"), "error: x");
    }

    #[test]
    /// Moved from bridge.rs (T1): one panic summary for the page, mainErrors.cjs shape.
    fn panic_summary_is_scrubbed() {
        let s = panic_summary(r"open C:\Users\Ayşe\AppData\Roaming\com.descall.app\x.json failed", Some(r"C:\Users\runner\.cargo\registry\src\tauri-2.12.7\src\lib.rs"), Some(10), None);
        assert_eq!((s.kind.as_str(), s.name.as_str()), ("panic", "RustPanic"));
        assert!(!s.message.contains("Ayşe") && s.message.starts_with("open ") && s.message.ends_with(" failed"), "{}", s.message);
        assert_eq!(s.stack, r"at ~\lib.rs:10");
        assert_eq!(scrub_paths("at /home/demir/app/x.js and /Users/ali/y"), "at ~/app/x.js and ~/y");
        assert_eq!(scrub_paths("src\\premium\\mod.rs:12:5"), "src\\premium\\mod.rs:12:5", "relative paths stay");
    }

    /// A panic or shell error that quotes a URL or a session object goes to Sentry (through
    /// the page) and to the crash file without its sign-in secrets.
    #[test]
    fn summaries_carry_no_tokens() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
        let s = panic_summary(&format!("called `Result::unwrap()` on an `Err` value: reqwest::Error {{ url: \"https://x.supabase.co/a?token=SeCrEt\", auth: Bearer {jwt} }}"), None, None, None);
        assert!(!s.message.contains("SeCrEt") && !s.message.contains(jwt), "{}", s.message);
        let t = summary("render-process-gone", "crashed", r#"state {"refresh_token":"r3fr3sh"}"#);
        assert!(!t.message.contains("r3fr3sh"), "{}", t.message);
        let back = decode_crash(&encode_crash(&s, 1_000), 2_000).expect("fresh crash file");
        assert!(!back.message.contains("SeCrEt"));
    }

    #[test]
    fn panic_summary_has_no_paths_and_is_capped() {
        let s = panic_summary(&format!("boom C:\\Users\\demir\\x.txt {}", "x".repeat(900)), Some(r"C:\Users\runneradmin\.cargo\registry\src\x\updater.rs"), Some(42), Some("tokio-runtime-worker"));
        assert_eq!(s.kind, "panic");
        assert!(!s.message.contains("demir") && s.message.chars().count() == MAX_MESSAGE);
        assert!(!s.stack.contains("runneradmin") && s.stack.contains("updater.rs:42") && s.stack.contains("tokio-runtime-worker"), "{}", s.stack);
        let p: Box<dyn std::any::Any + Send> = Box::new(String::from("owned"));
        assert_eq!(payload_text(p.as_ref()), "owned");
        let p: Box<dyn std::any::Any + Send> = Box::new("static");
        assert_eq!(payload_text(p.as_ref()), "static");
        let p: Box<dyn std::any::Any + Send> = Box::new(7u8);
        assert_eq!(payload_text(p.as_ref()), "panic");
    }

    #[test]
    fn relay_queues_until_attached_and_caps() {
        let mut r = Relay::default();
        for n in 0..12 {
            assert!(r.push(summary("k", "n", &n.to_string())).is_empty());
        }
        assert_eq!(r.len(), MAX_PENDING);
        let sent = r.attach();
        assert_eq!(sent.first().map(|s| s.message.as_str()), Some("2"));
        assert_eq!(sent.last().map(|s| s.message.as_str()), Some("11"));
        assert!(r.is_empty());
        assert_eq!(r.push(summary("k", "n", "live")).len(), 1, "attached: sent at once");
        r.detach();
        assert!(r.push(summary("k", "n", "reload")).is_empty(), "a reload queues again");
    }

    #[test]
    fn crash_file_round_trip_and_expiry() {
        let s = panic_summary("boom", Some("src/main.rs"), Some(1), None);
        let b = encode_crash(&s, 1_000);
        let back = decode_crash(&b, 2_000).expect("decoded");
        assert_eq!(back.message, "boom");
        assert!(back.stack.starts_with("previous run"));
        assert!(decode_crash(&b, 1_000 + 8 * 24 * 3600 * 1000).is_none(), "older than a week");
        assert!(decode_crash(b"not json", 0).is_none());
        let tampered = br#"{"v":1,"at":5,"summary":{"kind":"panic","name":"x","message":"C:\\Users\\eve\\a.txt","stack":""}}"#;
        assert!(!decode_crash(tampered, 6).unwrap().message.contains("eve"));
    }
}
