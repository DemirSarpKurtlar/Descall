//! Where the new app goes.
//!
//! * **In place** (the normal per-user install, also custom folders): rename `<dir>` to
//!   `<dir>.legacy` and install into `<dir>`. Same `Descall.exe` path, so taskbar pins,
//!   shortcuts, the autostart value, firewall rules and the GPU preference keep working.
//! * **Side by side**: install into `%LOCALAPPDATA%\Programs\Descall` and retarget the
//!   user's shortcuts and autostart. Used when renaming is impossible or unsafe:
//!   - a machine-wide install (Program Files: renaming needs elevation, i.e. a UAC prompt);
//!   - a custom folder that holds anything that is not Electron's own files (an
//!     electron-builder install straight into `D:\Apps` would otherwise move other apps);
//!   - a protected location (drive root, the profile folder, Program Files itself).
//!
//! In both cases the old files stay until the cleanup ([`crate::cleanup`]).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    InPlace,
    SideBySide,
}

impl Strategy {
    pub fn as_str(self) -> &'static str {
        match self {
            Strategy::InPlace => "in_place",
            Strategy::SideBySide => "side_by_side",
        }
    }
}

/// One entry of the install folder (top level only).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
}

impl Entry {
    pub fn file(name: &str) -> Self {
        Entry { name: name.into(), is_dir: false }
    }
    pub fn dir(name: &str) -> Self {
        Entry { name: name.into(), is_dir: true }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum DirVerdict {
    /// Only Electron's own files: safe to rename.
    ElectronOnly,
    /// No `Descall.exe` or no `resources` folder: not an Electron install.
    NotElectron,
    /// Drive root, profile, Program Files and similar.
    Protected,
    /// Something else lives in the folder (first few names, for the log).
    Foreign(Vec<String>),
}

/// Top-level names an electron-builder Windows install contains.
const ELECTRON_DIRS: &[&str] = &["resources", "locales", "swiftshader"];
const ELECTRON_FILE_EXT: &[&str] = &[".dll", ".pak", ".bin", ".dat", ".json", ".txt", ".html", ".ico"];
const ELECTRON_FILES: &[&str] = &["descall.exe", "uninstall descall.exe", "version", "license", "licenses.chromium.html", "license.electron.txt"];

pub fn is_electron_entry(e: &Entry) -> bool {
    let n = e.name.to_lowercase();
    if e.is_dir {
        return ELECTRON_DIRS.contains(&n.as_str());
    }
    ELECTRON_FILES.contains(&n.as_str()) || ELECTRON_FILE_EXT.iter().any(|ext| n.ends_with(ext))
}

/// Folders that must never be renamed, whatever they contain.
pub fn is_protected(dir: &Path, protected: &[PathBuf]) -> bool {
    paths::depth(dir) < 1 || protected.iter().any(|p| paths::same_path(p, dir))
}

pub fn inspect_dir(dir: &Path, entries: &[Entry], protected: &[PathBuf]) -> DirVerdict {
    let has_exe = entries.iter().any(|e| !e.is_dir && e.name.eq_ignore_ascii_case(paths::APP_EXE));
    let has_resources = entries.iter().any(|e| e.is_dir && e.name.eq_ignore_ascii_case("resources"));
    if !has_exe || !has_resources {
        return DirVerdict::NotElectron;
    }
    if is_protected(dir, protected) {
        return DirVerdict::Protected;
    }
    let foreign: Vec<String> = entries.iter().filter(|e| !is_electron_entry(e)).map(|e| e.name.clone()).take(5).collect();
    if foreign.is_empty() {
        DirVerdict::ElectronOnly
    } else {
        DirVerdict::Foreign(foreign)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Facts {
    pub per_machine: bool,
    pub verdict: DirVerdict,
    /// The side-by-side target is free (absent or empty).
    pub side_by_side_free: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Choice {
    Go(Strategy),
    /// Nothing can be done safely; reason code for the report.
    Skip(&'static str),
}

pub fn choose(f: &Facts) -> Choice {
    if f.verdict == DirVerdict::NotElectron {
        return Choice::Skip("electron_install_not_found");
    }
    let in_place_ok = !f.per_machine && f.verdict == DirVerdict::ElectronOnly;
    if in_place_ok {
        return Choice::Go(Strategy::InPlace);
    }
    if f.side_by_side_free {
        Choice::Go(Strategy::SideBySide)
    } else {
        Choice::Skip("side_by_side_target_busy")
    }
}

/// `<dir>.legacy`, then `<dir>.legacy-2` ... (a NeedsHelp leftover must not be overwritten).
pub fn pick_legacy(dir: &Path, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    (1..=9).map(|n| if n == 1 { paths::with_suffix(dir, ".legacy") } else { paths::with_suffix(dir, &format!(".legacy-{n}")) }).find(|p| !exists(p))
}

/// Side-by-side target: `%LOCALAPPDATA%\Programs\Descall` (the Tauri per-user default).
pub fn side_by_side_dir(local_app_data: &Path) -> PathBuf {
    local_app_data.join("Programs").join("Descall")
}

/// Protected folders for [`inspect_dir`] from the usual environment variables.
pub fn protected_dirs(env: &dyn Fn(&str) -> Option<String>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for var in ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PUBLIC", "ProgramData"] {
        if let Some(v) = env(var) {
            let p = PathBuf::from(v);
            if var == "USERPROFILE" {
                if let Some(parent) = p.parent() {
                    out.push(parent.to_path_buf());
                }
            }
            out.push(p.join("Programs"));
            out.push(p.join("Desktop"));
            out.push(p.join("Documents"));
            out.push(p.join("Downloads"));
            out.push(p);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn electron_entries() -> Vec<Entry> {
        vec![
            Entry::file("Descall.exe"),
            Entry::file("Uninstall Descall.exe"),
            Entry::dir("resources"),
            Entry::dir("locales"),
            Entry::file("ffmpeg.dll"),
            Entry::file("chrome_100_percent.pak"),
            Entry::file("icudtl.dat"),
            Entry::file("v8_context_snapshot.bin"),
            Entry::file("vk_swiftshader_icd.json"),
            Entry::file("LICENSES.chromium.html"),
        ]
    }

    #[test]
    fn plain_per_user_install_goes_in_place() {
        let dir = Path::new(r"C:\Users\Demir\AppData\Local\Programs\Descall");
        let v = inspect_dir(dir, &electron_entries(), &[]);
        assert_eq!(v, DirVerdict::ElectronOnly);
        assert_eq!(choose(&Facts { per_machine: false, verdict: v, side_by_side_free: true }), Choice::Go(Strategy::InPlace));
    }

    #[test]
    fn custom_folder_with_other_apps_goes_side_by_side() {
        let mut e = electron_entries();
        e.push(Entry::dir("OtherApp"));
        e.push(Entry::file("notes.docx"));
        let v = inspect_dir(Path::new(r"D:\Apps"), &e, &[]);
        assert_eq!(v, DirVerdict::Foreign(vec!["OtherApp".into(), "notes.docx".into()]));
        assert_eq!(choose(&Facts { per_machine: false, verdict: v.clone(), side_by_side_free: true }), Choice::Go(Strategy::SideBySide));
        assert_eq!(choose(&Facts { per_machine: false, verdict: v, side_by_side_free: false }), Choice::Skip("side_by_side_target_busy"));
    }

    #[test]
    fn custom_electron_only_folder_goes_in_place() {
        let v = inspect_dir(Path::new(r"E:\Oyun Araçları\Descall"), &electron_entries(), &[]);
        assert_eq!(choose(&Facts { per_machine: false, verdict: v, side_by_side_free: false }), Choice::Go(Strategy::InPlace));
    }

    #[test]
    fn machine_wide_install_goes_side_by_side() {
        let v = inspect_dir(Path::new(r"C:\Program Files\Descall"), &electron_entries(), &[]);
        assert_eq!(choose(&Facts { per_machine: true, verdict: v, side_by_side_free: true }), Choice::Go(Strategy::SideBySide));
    }

    #[test]
    fn protected_and_non_electron_folders() {
        let protected = protected_dirs(&|k| match k {
            "USERPROFILE" => Some(r"C:\Users\Demir".into()),
            "ProgramFiles" => Some(r"C:\Program Files".into()),
            _ => None,
        });
        assert_eq!(inspect_dir(Path::new(r"C:\Users\Demir"), &electron_entries(), &protected), DirVerdict::Protected);
        assert_eq!(inspect_dir(Path::new(r"C:\Users\Demir\Desktop"), &electron_entries(), &protected), DirVerdict::Protected);
        assert_eq!(inspect_dir(Path::new(r"D:\"), &electron_entries(), &protected), DirVerdict::Protected);
        assert_eq!(inspect_dir(Path::new(r"D:\Descall"), &electron_entries(), &protected), DirVerdict::ElectronOnly);
        let v = inspect_dir(Path::new(r"D:\Descall"), &[Entry::file("Descall.exe")], &protected);
        assert_eq!(v, DirVerdict::NotElectron);
        assert_eq!(choose(&Facts { per_machine: false, verdict: v, side_by_side_free: true }), Choice::Skip("electron_install_not_found"));
        // Protected but a real Electron install: still served side by side.
        assert_eq!(choose(&Facts { per_machine: false, verdict: DirVerdict::Protected, side_by_side_free: true }), Choice::Go(Strategy::SideBySide));
    }

    #[test]
    fn legacy_names_never_reuse_an_existing_folder() {
        let dir = Path::new(r"C:\A\Descall");
        assert_eq!(pick_legacy(dir, |_| false), Some(PathBuf::from(r"C:\A\Descall.legacy")));
        let taken = [PathBuf::from(r"C:\A\Descall.legacy"), PathBuf::from(r"C:\A\Descall.legacy-2")];
        assert_eq!(pick_legacy(dir, |p| taken.iter().any(|t| t == p)), Some(PathBuf::from(r"C:\A\Descall.legacy-3")));
        assert_eq!(pick_legacy(dir, |_| true), None);
        assert_eq!(side_by_side_dir(Path::new(r"C:\Users\D\AppData\Local")), PathBuf::from(r"C:\Users\D\AppData\Local").join("Programs").join("Descall"));
    }
}
