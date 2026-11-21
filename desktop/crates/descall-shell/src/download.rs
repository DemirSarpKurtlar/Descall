//! `download-file`: the page names the file, the shell writes it into Downloads.
//! Port of electron/safeDownload.cjs. The name is reduced to a plain file name (no
//! separators, reserved or control characters, device names, leading dots, trailing dots
//! or spaces, bidi tricks), so it always lands directly inside the Downloads folder.

use std::path::{Path, PathBuf};
use unicode_normalization::UnicodeNormalization;

pub const MAX_NAME_LENGTH: usize = 180;
pub const MAX_EXT_LENGTH: usize = 16;
pub const FALLBACK_NAME: &str = "download";
/// Hard cap for one download through the shell (the page only downloads attachments).
pub const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

fn is_reserved_char(c: char) -> bool {
    matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) <= 0x1f || (0x7f..=0x9f).contains(&(c as u32))
}

fn is_invisible(c: char) -> bool {
    matches!(c as u32, 0x200B..=0x200F | 0x202A..=0x202E | 0x2066..=0x2069 | 0xFEFF)
}

fn is_windows_device_name(s: &str) -> bool {
    let stem = s.split('.').next().unwrap_or("").to_lowercase();
    let mut chars = stem.chars();
    let head: String = chars.by_ref().take(3).collect();
    let rest: Vec<char> = chars.collect();
    match head.as_str() {
        "con" | "prn" | "aux" | "nul" => rest.is_empty(),
        "com" | "lpt" => rest.len() == 1 && (rest[0].is_ascii_digit() || matches!(rest[0], '¹' | '²' | '³')),
        _ => false,
    }
}

/// path.extname: the last ".xyz" of the name, not counting a leading dot.
fn extname(s: &str) -> &str {
    match s.rfind('.') {
        Some(i) if i > 0 => &s[i..],
        _ => "",
    }
}

fn trim_trailing_dots_spaces(s: &str) -> &str {
    s.trim_end_matches(['.', ' '])
}

pub fn sanitize_filename(name: &str) -> String {
    let s: String = name.nfc().collect();
    let base = s.rsplit(['/', '\\']).next().unwrap_or("");
    let replaced: String = base.chars().map(|c| if is_reserved_char(c) { '_' } else { c }).filter(|c| !is_invisible(*c)).collect();
    let trimmed = trim_trailing_dots_spaces(replaced.trim().trim_start_matches('.'));
    if trimmed.is_empty() {
        return FALLBACK_NAME.into();
    }
    let mut out = trimmed.to_string();
    if is_windows_device_name(&out) {
        out = format!("_{out}");
    }
    if out.chars().count() > MAX_NAME_LENGTH {
        let ext = extname(&out).to_string();
        let ext_len = ext.chars().count();
        if !ext.is_empty() && ext_len <= MAX_EXT_LENGTH {
            let head: String = out.chars().take(MAX_NAME_LENGTH - ext_len).collect();
            out = format!("{}{ext}", trim_trailing_dots_spaces(&head));
        } else {
            let head: String = out.chars().take(MAX_NAME_LENGTH).collect();
            out = trim_trailing_dots_spaces(&head).to_string();
        }
    }
    if out.is_empty() {
        FALLBACK_NAME.into()
    } else {
        out
    }
}

/// Destination for a page-named download: always a direct child of `dir`.
pub fn resolve_download_path(dir: &Path, name: &str) -> Result<(PathBuf, String), &'static str> {
    let safe = sanitize_filename(name);
    let path = dir.join(&safe);
    if path.parent() != Some(dir) || path.file_name().and_then(|n| n.to_str()) != Some(safe.as_str()) {
        return Err("download path escapes the downloads folder");
    }
    Ok((path, safe))
}

/// Only http(s) URLs without credentials are fetched.
pub fn is_downloadable_url(url: &str) -> bool {
    match url::Url::parse(url) {
        Ok(u) => matches!(u.scheme(), "http" | "https") && u.username().is_empty() && u.password().is_none(),
        Err(_) => false,
    }
}

/// A free name in `dir` for `name`: "x.zip", then "x (1).zip", "x (2).zip"... (Electron
/// overwrote; the shell keeps the user's earlier download instead).
pub fn unique_path(dir: &Path, name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(name);
    if !exists(&first) {
        return first;
    }
    let ext = extname(name);
    let stem = &name[..name.len() - ext.len()];
    for i in 1..1000 {
        let p = dir.join(format!("{stem} ({i}){ext}"));
        if !exists(&p) {
            return p;
        }
    }
    first
}

/// The temporary file of a download in progress: the whole target name plus a suffix, so
/// "a.zip" and "a.pdf" downloading at once never share one part file (with_extension
/// gave both "a.descall-part").
pub fn part_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".descall-part");
    target.with_file_name(name)
}

#[cfg(test)]
mod tests {
    //! safeDownload.selftest.mjs.
    use super::*;
    use std::path::Path;

    #[test]
    fn ordinary_names_are_untouched() {
        for n in ["Descall-Setup-3.7.26.exe", "photo 1.png", "rapor (son).pdf", "Şükrü çiçek.txt"] {
            assert_eq!(sanitize_filename(n), n);
        }
    }

    #[test]
    fn basename_only() {
        assert_eq!(sanitize_filename(r"..\..\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\x.bat"), "x.bat");
        assert_eq!(sanitize_filename("../../../etc/cron.d/evil"), "evil");
        assert_eq!(sanitize_filename(r"C:\Windows\System32\drivers\etc\hosts"), "hosts");
        assert_eq!(sanitize_filename("/abs/path/file.zip"), "file.zip");
        assert_eq!(sanitize_filename("dir/"), "download");
    }

    #[test]
    fn reserved_controls_and_bidi() {
        assert_eq!(sanitize_filename("a<b>c:d\"e|f?g*h.txt"), "a_b_c_d_e_f_g_h.txt");
        assert_eq!(sanitize_filename("tab\there\nnew\u{0000}nul.txt"), "tab_here_new_nul.txt");
        assert_eq!(sanitize_filename("invoice\u{202E}txt.exe"), "invoicetxt.exe");
        assert_eq!(sanitize_filename("a\u{200B}b.txt"), "ab.txt");
        // NFC: a decomposed name is stored composed.
        assert_eq!(sanitize_filename("S\u{0327}u\u{0308}kru\u{0308}.txt"), "Şükrü.txt");
    }

    #[test]
    fn dots_and_spaces() {
        for (i, o) in [("..", "download"), (".", "download"), ("...hidden", "hidden"), ("name.exe. . ", "name.exe"), ("   ", "download"), ("", "download"), ("42", "42")] {
            assert_eq!(sanitize_filename(i), o, "{i:?}");
        }
    }

    #[test]
    fn device_names() {
        for n in ["CON", "con", "PRN.txt", "aux.tar.gz", "NUL", "COM1", "com9.log", "LPT1", "lpt3.txt", "COM¹"] {
            assert!(sanitize_filename(n).starts_with('_'), "{n} is prefixed");
        }
        assert_eq!(sanitize_filename("console.log"), "console.log");
        assert_eq!(sanitize_filename("COM10"), "COM10");
    }

    #[test]
    fn length_cap_keeps_a_short_extension() {
        let long = sanitize_filename(&format!("{}.exe", "a".repeat(400)));
        assert_eq!(long.chars().count(), MAX_NAME_LENGTH);
        assert!(long.ends_with(".exe"));
        assert_eq!(sanitize_filename(&"b".repeat(400)).len(), MAX_NAME_LENGTH);
        assert!(sanitize_filename(&format!("c.{}", "d".repeat(400))).len() <= MAX_NAME_LENGTH);
    }

    #[test]
    fn destination_is_a_direct_child() {
        let dir = Path::new("/tmp/descall-dl");
        let long = "x".repeat(1000);
        for n in [r"..\..\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\x.bat", "../../x.sh", "..", ".", "", "/etc/passwd", "a/../../b", "CON", long.as_str(), "%2e%2e%2fx"] {
            let (p, name) = resolve_download_path(dir, n).unwrap();
            assert_eq!(p.parent(), Some(dir), "{n} lands in Downloads");
            assert_eq!(p.file_name().unwrap().to_str().unwrap(), name);
            assert!(!name.contains('/') && !name.contains('\\'));
        }
        assert_eq!(resolve_download_path(dir, "Descall-Setup-3.7.26.exe").unwrap().0, dir.join("Descall-Setup-3.7.26.exe"));
    }

    #[test]
    fn only_http_is_fetched() {
        assert!(is_downloadable_url("https://github.com/x/releases/download/v1/Descall-Setup-1.0.0.exe"));
        assert!(is_downloadable_url("http://example.com/a.zip"));
        for u in ["file:///C:/Windows/win.ini", "descall://app/index.html", "javascript:alert(1)", "data:text/plain,x", "https://user:pw@example.com/a", "", "not a url"] {
            assert!(!is_downloadable_url(u), "{u} refused");
        }
    }

    #[test]
    fn unique_names_never_overwrite() {
        let dir = Path::new("/d");
        let taken = [dir.join("a.zip"), dir.join("a (1).zip")];
        assert_eq!(unique_path(dir, "a.zip", |p| taken.contains(&p.to_path_buf())), dir.join("a (2).zip"));
        assert_eq!(unique_path(dir, "b", |_| false), dir.join("b"));
        assert_eq!(part_path(&dir.join("a.zip")), dir.join("a.zip.descall-part"));
        assert_ne!(part_path(&dir.join("a.zip")), part_path(&dir.join("a.pdf")), "one part file per target");
        assert_eq!(part_path(&dir.join("b")), dir.join("b.descall-part"));
    }
}
