//! Path helpers that behave like Windows paths on every host (so the tests on Linux check
//! the same rules): comparison is case-insensitive and treats `/` and `\` alike.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Name of the Electron and the Tauri executable. Both apps use the same name and the same
/// path (in-place strategy), so taskbar pins, firewall rules and GPU preferences survive.
pub const APP_EXE: &str = "Descall.exe";
/// Folder the migrator works in: `%LOCALAPPDATA%\Descall-Migration`.
pub const WORK_DIR_NAME: &str = "Descall-Migration";
/// The new app's identifier (Tauri `identifier`): `%APPDATA%\com.descall.app`.
pub const NEW_APP_ID: &str = "com.descall.app";
/// Electron's userData folder name: `%APPDATA%\Descall`.
pub const ELECTRON_USER_DATA: &str = "Descall";

/// `path` + `suffix` on the last component (`C:\A\Descall` + `.legacy`).
pub fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s: OsString = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// Normalised form for comparisons: lower case, `\` separators, no trailing separator,
/// no surrounding quotes.
pub fn norm(path: &Path) -> String {
    let s = path.to_string_lossy();
    let s = s.trim().trim_matches('"');
    let mut out: String = s.chars().map(|c| if c == '/' { '\\' } else { c }).collect::<String>().to_lowercase();
    while out.len() > 3 && out.ends_with('\\') {
        out.pop();
    }
    out
}

pub fn same_path(a: &Path, b: &Path) -> bool {
    norm(a) == norm(b)
}

/// True when `child` is `parent` or inside it.
pub fn is_within(child: &Path, parent: &Path) -> bool {
    let c = norm(child);
    let p = norm(parent);
    c == p || (c.starts_with(&p) && c[p.len()..].starts_with('\\'))
}

/// Strip quotes and trailing separators from a registry `InstallLocation`.
pub fn clean_install_location(raw: &str) -> PathBuf {
    let mut s = raw.trim().trim_matches('"').to_string();
    while s.len() > 3 && (s.ends_with('\\') || s.ends_with('/')) {
        s.pop();
    }
    PathBuf::from(s)
}

/// Number of components after the root (`C:\` = 0, `C:\Apps` = 1). Works for `\` and `/`.
pub fn depth(path: &Path) -> usize {
    let n = norm(path);
    let body = match n.find(":\\") {
        Some(i) => &n[i + 2..],
        None => n.trim_start_matches('\\'),
    };
    body.split('\\').filter(|p| !p.is_empty()).count()
}

/// Last component equals `name` (case-insensitive).
pub fn file_name_is(path: &Path, name: &str) -> bool {
    let n = norm(path);
    n.rsplit('\\').next().map(|last| last == name.to_lowercase()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_like_windows() {
        assert!(same_path(Path::new(r"C:\Users\Demir\AppData\Local\Programs\descall\Descall.exe"), Path::new("c:/users/demir/appdata/local/programs/Descall/descall.exe")));
        assert!(same_path(Path::new(r"D:\Apps\Descall\"), Path::new(r"d:\apps\descall")));
        assert!(!same_path(Path::new(r"D:\Apps\Descall"), Path::new(r"D:\Apps\Descall.legacy")));
        assert!(is_within(Path::new(r"D:\Apps\Descall\resources\app.asar"), Path::new(r"d:\apps\descall")));
        assert!(!is_within(Path::new(r"D:\Apps\Descall.legacy\Descall.exe"), Path::new(r"D:\Apps\Descall")));
    }

    #[test]
    fn cleans_registry_locations_and_counts_depth() {
        assert_eq!(clean_install_location(r#""C:\Program Files\Descall\""#), PathBuf::from(r"C:\Program Files\Descall"));
        assert_eq!(depth(Path::new(r"C:\")), 0);
        assert_eq!(depth(Path::new(r"C:\Apps")), 1);
        assert_eq!(depth(Path::new(r"C:\Users\Demir\AppData\Local\Programs\Descall")), 6);
        assert_eq!(depth(Path::new("/tmp/x/Descall")), 3);
        assert!(file_name_is(Path::new(r"C:\A\descall.EXE"), APP_EXE));
        assert_eq!(with_suffix(Path::new(r"C:\A\Descall"), ".legacy"), PathBuf::from(r"C:\A\Descall.legacy"));
    }
}
