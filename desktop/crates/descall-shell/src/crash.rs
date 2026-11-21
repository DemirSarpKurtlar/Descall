//! What a shell panic tells the page (electronAPI.onMainError). `PanicHookInfo`'s Display
//! starts with the source location ("panicked at C:\Users\<builder>\.cargo\registry\...\x.rs:12:5"),
//! which named the build machine's user folder and the crate layout. The page gets the panic
//! message only, with file paths replaced and the length capped (the page shows or reports it).

pub const MAX_LEN: usize = 300;
pub const PATH: &str = "<path>";
pub const FALLBACK: &str = "internal error";

fn looks_like_path(token: &str) -> bool {
    let t = token.trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | '(' | ')' | '[' | ']' | '<' | '>' | ',' | ';'));
    let b = t.as_bytes();
    let drive = b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/');
    drive || t.contains('\\') || (t.starts_with('/') && t[1..].contains('/')) || t.starts_with("~/") || t.starts_with("file:")
}

/// Replace every whitespace-separated token that looks like a file path with [`PATH`].
pub fn redact_paths(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut token = String::new();
    let flush = |token: &mut String, out: &mut String| {
        if !token.is_empty() {
            out.push_str(if looks_like_path(token) { PATH } else { token });
            token.clear();
        }
    };
    for c in text.chars() {
        if c.is_whitespace() {
            flush(&mut token, &mut out);
            out.push(c);
        } else {
            token.push(c);
        }
    }
    flush(&mut token, &mut out);
    out
}

/// The page's copy of a panic: the payload (`panic!` / `expect` text) without any location or
/// path, one line, at most [`MAX_LEN`] characters.
pub fn page_message(payload: Option<&str>) -> String {
    let one_line = payload.unwrap_or_default().split_whitespace().collect::<Vec<_>>().join(" ");
    let clean = redact_paths(&one_line);
    let clean = clean.trim();
    if clean.is_empty() {
        return FALLBACK.to_string();
    }
    let mut s: String = clean.chars().take(MAX_LEN).collect();
    if clean.chars().count() > MAX_LEN {
        s.push_str("...");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_message() {
        assert_eq!(page_message(Some("premium host not ready")), "premium host not ready");
        assert_eq!(page_message(Some("called `Option::unwrap()` on a `None` value")), "called `Option::unwrap()` on a `None` value");
        assert_eq!(page_message(None), FALLBACK);
        assert_eq!(page_message(Some("   ")), FALLBACK);
    }

    #[test]
    fn never_shows_paths_or_user_names() {
        for (raw, user) in [
            (r"failed to read C:\Users\Builder\AppData\Roaming\com.descall.app\secure\auth-token.bin: denied", "Builder"),
            (r"open 'C:/Users/Demir/Downloads/x.zip' failed", "Demir"),
            ("panicked at /home/runner/.cargo/registry/src/index.crates.io/tauri-2.12.7/src/app.rs:12:5", "runner"),
            (r"\\?\C:\Users\Ayse\AppData\Local\Descall\x.json missing", "Ayse"),
            ("cannot open file:///C:/Users/Mehmet/x.html", "Mehmet"),
            ("bad ~/secret/key", "secret"),
        ] {
            let m = page_message(Some(raw));
            assert!(!m.contains(user), "{raw} -> {m}");
            assert!(m.contains(PATH), "{raw} -> {m}");
        }
        assert_eq!(page_message(Some(r"read C:\x\y.bin: denied")), "read <path> denied");
    }

    #[test]
    fn one_line_and_capped() {
        let long = "x".repeat(MAX_LEN * 3);
        let m = page_message(Some(&long));
        assert_eq!(m.chars().count(), MAX_LEN + 3);
        assert_eq!(page_message(Some("a\nb\r\n\tc")), "a b c");
        assert_eq!(page_message(Some("a/b ratio 1/2 ok")), "a/b ratio 1/2 ok", "relative fractions are not paths");
    }
}
