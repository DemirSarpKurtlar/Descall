//! Shortcut handling for the side-by-side strategy (the exe path changes): every `.lnk`
//! the user has that points at the old `Descall.exe` (desktop, Start menu, taskbar pins)
//! is backed up byte for byte, then retargeted. Rollback copies the backups back.
//! In place the path does not change, so shortcuts are left alone.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::paths;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShortcutBackup {
    /// The live shortcut.
    pub path: PathBuf,
    /// Its copy in the work folder.
    pub backup: PathBuf,
}

/// Shell folders that hold the user's shortcuts (`appdata` = %APPDATA%, `desktop` from
/// SHGetKnownFolderPath so a redirected OneDrive desktop is found too).
pub fn shortcut_folders(appdata: &Path, desktop: Option<&Path>) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(d) = desktop {
        v.push(d.to_path_buf());
    }
    v.push(appdata.join(r"Microsoft\Windows\Start Menu\Programs"));
    v.push(appdata.join(r"Microsoft\Windows\Start Menu\Programs\Descall"));
    v.push(appdata.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"));
    v.push(appdata.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu"));
    v
}

pub fn is_lnk(p: &Path) -> bool {
    paths::norm(p).ends_with(".lnk")
}

/// Shortcuts to retarget: `.lnk` whose target is the old exe.
pub fn to_retarget(found: &[(PathBuf, Option<PathBuf>)], old_exe: &Path) -> Vec<PathBuf> {
    found
        .iter()
        .filter(|(lnk, target)| is_lnk(lnk) && target.as_deref().map(|t| paths::same_path(t, old_exe)).unwrap_or(false))
        .map(|(lnk, _)| lnk.clone())
        .collect()
}

/// Backup file name for the n-th shortcut (unique, inside the work folder).
pub fn backup_path(work_dir: &Path, n: usize) -> PathBuf {
    work_dir.join("lnk-backup").join(format!("{n:03}.lnk"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_only_shortcuts_to_the_old_exe() {
        let old = PathBuf::from(r"C:\Program Files\Descall\Descall.exe");
        let found = vec![
            (PathBuf::from(r"C:\U\Desktop\Descall.lnk"), Some(PathBuf::from(r"c:\program files\descall\descall.exe"))),
            (PathBuf::from(r"C:\U\Desktop\Steam.lnk"), Some(PathBuf::from(r"C:\Steam\steam.exe"))),
            (PathBuf::from(r"C:\U\Desktop\Broken.lnk"), None),
            (PathBuf::from(r"C:\U\Desktop\Descall.url"), Some(old.clone())),
        ];
        assert_eq!(to_retarget(&found, &old), vec![PathBuf::from(r"C:\U\Desktop\Descall.lnk")]);
        assert_eq!(shortcut_folders(Path::new(r"C:\A"), Some(Path::new(r"C:\D"))).len(), 5);
        assert!(backup_path(Path::new("/w"), 7).ends_with("lnk-backup/007.lnk"));
    }
}
