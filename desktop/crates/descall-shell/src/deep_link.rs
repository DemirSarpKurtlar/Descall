//! `descall://` links opened from Windows (browser, chat, shortcut). The installer registers
//! the scheme (tauri.conf.json plugins.deep-link.desktop.schemes), so Windows starts
//! `Descall.exe "descall://dm/ayse"`: a cold start carries it in argv, a second launch while
//! Descall runs hands its argv to the single-instance callback. The shell only picks the URL
//! out of argv; the page resolves it (frontend/src/lib/deepLinks.js, the same rules as iOS and
//! Android) and routes in-app.

pub const SCHEME: &str = "descall";
/// Longer links are not ours (deepLinks.js paths are short; invite codes are 6-32 chars).
pub const MAX_LEN: usize = 2048;

/// The first `descall:` URL in argv (argv[0], the exe, is skipped). None when there is none
/// or it is malformed: control characters, too long, or Electron's own app origin
/// (`descall://app/...`, never a link).
pub fn from_args<S: AsRef<str>>(argv: &[S]) -> Option<String> {
    argv.iter().skip(1).map(|a| a.as_ref().trim()).find_map(accept)
}

/// A single candidate: `descall:` (any case), sane length, printable.
pub fn accept(raw: &str) -> Option<String> {
    let raw = raw.trim().trim_matches('"');
    if raw.len() <= SCHEME.len() + 1 || raw.len() > MAX_LEN {
        return None;
    }
    let scheme = raw.get(..SCHEME.len() + 1)?;
    let rest = &raw[SCHEME.len() + 1..];
    if !scheme.eq_ignore_ascii_case("descall:") {
        return None;
    }
    if raw.chars().any(|c| c.is_control()) {
        return None;
    }
    let lower = rest.to_ascii_lowercase();
    if lower == "//app" || lower.starts_with("//app/") || lower.starts_with("//app?") || lower.starts_with("//app#") {
        return None;
    }
    Some(format!("descall:{rest}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    const EXE: &str = r"C:\Users\D\AppData\Local\Descall\Descall.exe";

    #[test]
    fn picks_the_link_out_of_argv() {
        assert_eq!(from_args(&[EXE, "descall://dm/ayse"]).as_deref(), Some("descall://dm/ayse"));
        assert_eq!(from_args(&[EXE, "--autostart", "DESCALL://invite/AbC123"]).as_deref(), Some("descall://invite/AbC123"));
        assert_eq!(from_args(&[EXE, "\"descall://server/1/2\""]).as_deref(), Some("descall://server/1/2"));
        assert_eq!(from_args(&[EXE, "descall:whats-new"]).as_deref(), Some("descall:whats-new"));
    }

    #[test]
    fn ignores_everything_else() {
        assert_eq!(from_args(&[EXE]), None);
        assert_eq!(from_args(&["descall://dm/x"]), None, "argv[0] is the exe");
        assert_eq!(from_args(&[EXE, "--hidden", "-Embedding", "--migrated", "--migration-id", "m-1"]), None);
        assert_eq!(from_args(&[EXE, "https://descall.com/dm/x"]), None);
        assert_eq!(from_args(&[EXE, "descall:"]), None);
        assert_eq!(from_args(&[EXE, "descallx://dm/x"]), None);
        assert_eq!(from_args(&[EXE, "descall://dm/x\u{0}y"]), None);
        assert_eq!(from_args(&[EXE, &format!("descall://dm/{}", "a".repeat(MAX_LEN))]), None);
        for app in ["descall://app", "descall://app/index.html", "DESCALL://APP/settings", "descall://app?x=1"] {
            assert_eq!(from_args(&[EXE, app]), None, "{app}: Electron's app origin is not a link");
        }
        assert_eq!(from_args(&[EXE, "descall://apps"]).as_deref(), Some("descall://apps"));
        assert_eq!(from_args(&[EXE, "çağrı://dm/x"]), None, "multi-byte prefix does not panic");
    }
}
