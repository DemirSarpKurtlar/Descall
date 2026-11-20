//! Shortcuts (IShellLinkW + IPersistFile). The caller initialises COM (apartment) once.

use std::path::{Path, PathBuf};

use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ, STGM_READWRITE,
};
use windows::Win32::UI::Shell::{FOLDERID_Desktop, IShellLinkW, SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT};

pub fn init_com() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

fn desktop() -> Option<PathBuf> {
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(PathBuf::from)
    }
}

fn link() -> windows::core::Result<IShellLinkW> {
    unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
}

pub fn target_of(lnk: &Path) -> Option<PathBuf> {
    unsafe {
        let l = link().ok()?;
        let pf: IPersistFile = l.cast().ok()?;
        pf.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ).ok()?;
        let mut buf = [0u16; 1024];
        l.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        (end > 0).then(|| PathBuf::from(String::from_utf16_lossy(&buf[..end])))
    }
}

pub fn retarget(lnk: &Path, new_exe: &Path) -> windows::core::Result<()> {
    unsafe {
        let l = link()?;
        let pf: IPersistFile = l.cast()?;
        pf.Load(&HSTRING::from(lnk.as_os_str()), STGM_READWRITE)?;
        l.SetPath(&HSTRING::from(new_exe.as_os_str()))?;
        if let Some(dir) = new_exe.parent() {
            l.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?;
        }
        pf.Save(None, true)?;
    }
    Ok(())
}

/// `.lnk` files of the user's shell folders, with their targets.
pub fn find_shortcuts() -> Vec<(PathBuf, Option<PathBuf>)> {
    let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) else { return Vec::new() };
    let mut out = Vec::new();
    for dir in crate::shortcuts::shortcut_folders(&appdata, desktop().as_deref()) {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if crate::shortcuts::is_lnk(&p) && p.is_file() {
                let t = target_of(&p);
                out.push((p, t));
            }
        }
    }
    out
}
