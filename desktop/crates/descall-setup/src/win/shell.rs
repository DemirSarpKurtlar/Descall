//! Shell integration: shortcuts (kept and retargeted, never duplicated), Apps & features entry,
//! autostart value, toast activator, and small helpers (open URL, clipboard, folder picker).

use crate::layout::{self, APP_ID, AUTOSTART_ARGS, EXE, LNK, RUN_KEY, SHORTCUT_AUMID, SHORTCUT_TOAST_ACTIVATOR, UNINSTALLER, UNINSTALL_KEY};
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows::core::{Interface, GUID, HSTRING, PCWSTR};
use windows::Win32::Foundation::{HANDLE, HGLOBAL, HWND};
use windows::Win32::Storage::EnhancedStorage::{PKEY_AppUserModel_ID, PKEY_AppUserModel_ToastActivatorCLSID};
use windows::Win32::System::Com::StructuredStorage::{InitPropVariantFromCLSID, PROPVARIANT};
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    FileOpenDialog, IFileOpenDialog, IShellItem, IShellLinkW, SHChangeNotify, ShellExecuteW, ShellLink, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SHCNE_ASSOCCHANGED, SHCNF_IDLIST,
    SIGDN_FILESYSPATH, SLGP_RAWPATH,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::sys;

pub fn start_menu_lnk() -> Option<PathBuf> {
    sys::known_folder(&sys::FOLDERID_Programs).map(|p| p.join(LNK))
}
pub fn desktop_lnk() -> Option<PathBuf> {
    sys::known_folder(&sys::FOLDERID_Desktop).map(|p| p.join(LNK))
}
pub fn taskbar_pin_lnk() -> Option<PathBuf> {
    sys::known_folder(&sys::FOLDERID_RoamingAppData).map(|p| p.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar").join(LNK))
}

pub fn link_target(lnk: &Path) -> Option<PathBuf> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let pf: IPersistFile = link.cast().ok()?;
        pf.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ).ok()?;
        let mut buf = [0u16; 1024];
        link.GetPath(&mut buf, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32).ok()?;
        let n = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        (n > 0).then(|| PathBuf::from(String::from_utf16_lossy(&buf[..n])))
    }
}

fn write_link(lnk: &Path, exe: &Path) -> windows::core::Result<()> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let pf: IPersistFile = link.cast()?;
        if lnk.exists() {
            // Load first so the user's own arguments, hotkey and "Run" style survive.
            let _ = pf.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ);
        }
        link.SetPath(&HSTRING::from(exe.as_os_str()))?;
        if let Some(dir) = exe.parent() {
            link.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?;
        }
        link.SetIconLocation(&HSTRING::from(exe.as_os_str()), 0)?;
        link.SetDescription(&HSTRING::from("Descall"))?;
        let store: IPropertyStore = link.cast()?;
        let v = PROPVARIANT::from(SHORTCUT_AUMID);
        store.SetValue(&PKEY_AppUserModel_ID, &v)?;
        let clsid = GUID::try_from(SHORTCUT_TOAST_ACTIVATOR.trim_matches(['{', '}'])).map_err(|_| windows::core::Error::from_hresult(windows::Win32::Foundation::E_INVALIDARG))?;
        let v = InitPropVariantFromCLSID(&clsid)?;
        store.SetValue(&PKEY_AppUserModel_ToastActivatorCLSID, &v)?;
        store.Commit()?;
        if let Some(parent) = lnk.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        pf.Save(&HSTRING::from(lnk.as_os_str()), true)
    }
}

/// What happened to one shortcut.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkOutcome {
    Created,
    /// Already pointed at this exe: untouched.
    Kept,
    /// Pointed at an older Descall (other folder): same .lnk file, new target. Pins keep working.
    Retargeted,
    Skipped,
}

fn is_descall_exe(p: &Path) -> bool {
    p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.eq_ignore_ascii_case(EXE))
}

/// Keeps an existing shortcut, retargets one that points to another Descall, creates it if `create`.
pub fn ensure_link(lnk: &Path, exe: &Path, create: bool) -> LinkOutcome {
    if lnk.exists() {
        match link_target(lnk) {
            Some(t) if same_path(&t, exe) => {
                // Same target: keep the file, but make sure the AUMID / toast activator are stamped.
                let _ = write_link(lnk, exe);
                return LinkOutcome::Kept;
            }
            Some(t) if is_descall_exe(&t) => {
                return if write_link(lnk, exe).is_ok() { LinkOutcome::Retargeted } else { LinkOutcome::Kept };
            }
            // A user's own Descall.lnk pointing elsewhere: leave it alone.
            _ => return LinkOutcome::Kept,
        }
    }
    if create && write_link(lnk, exe).is_ok() {
        return LinkOutcome::Created;
    }
    LinkOutcome::Skipped
}

pub fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().trim_end_matches('\\').eq_ignore_ascii_case(b.to_string_lossy().trim_end_matches('\\'))
}

/// Removes a shortcut only if it points into `dir` (uninstall).
pub fn remove_link_into(lnk: &Path, dir: &Path) {
    if let Some(t) = link_target(lnk) {
        if t.starts_with(dir) || t.to_string_lossy().to_lowercase().starts_with(&dir.to_string_lossy().to_lowercase()) {
            let _ = std::fs::remove_file(lnk);
        }
    }
}

pub fn notify_shell() {
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
}

/* ------------------------------------------------------------- registry */

pub fn autostart_get() -> Option<String> {
    windows_registry::CURRENT_USER.open(RUN_KEY).ok()?.get_string(APP_ID).ok()
}

/// Same value name as Electron's login item, so Task Manager's enabled/disabled choice
/// (StartupApproved\Run, keyed by name) carries over untouched.
pub fn autostart_set(exe: &Path, on: bool) -> windows::core::Result<()> {
    let k = windows_registry::CURRENT_USER.create(RUN_KEY)?;
    if on {
        k.set_string(APP_ID, format!("\"{}\" {}", exe.display(), AUTOSTART_ARGS))
    } else {
        match k.remove_value(APP_ID) {
            Err(e) if e.code().0 as u32 != 0x8007_0002 => Err(e),
            _ => Ok(()),
        }
    }
}

/// `HKCU\Software\Classes\CLSID\{toast}` = "Descall", `LocalServer32` = "<dir>\Descall.exe" (layout::toast_registry).
pub fn toast_activator_set(dir: &Path) -> windows::core::Result<()> {
    for v in layout::toast_registry(&dir.to_string_lossy()) {
        windows_registry::CURRENT_USER.create(&v.key)?.set_string(v.name, &v.value)?;
    }
    Ok(())
}

pub struct UninstallEntry<'a> {
    pub dir: &'a Path,
    pub version: &'a str,
    pub size_kb: u32,
}

pub fn register_uninstall(e: &UninstallEntry) -> windows::core::Result<()> {
    let k = windows_registry::CURRENT_USER.create(UNINSTALL_KEY)?;
    let exe = e.dir.join(EXE);
    let un = e.dir.join(UNINSTALLER);
    k.set_string("DisplayName", "Descall")?;
    k.set_string("DisplayVersion", e.version)?;
    k.set_string("Publisher", layout::publisher())?;
    k.set_string("DisplayIcon", format!("\"{}\",0", exe.display()))?;
    k.set_string("InstallLocation", e.dir.display().to_string())?;
    k.set_string("UninstallString", format!("\"{}\" --uninstall", un.display()))?;
    k.set_string("QuietUninstallString", format!("\"{}\" --uninstall /S", un.display()))?;
    k.set_string("URLInfoAbout", "https://descall.com")?;
    k.set_string("HelpLink", "https://descall.com/contact")?;
    k.set_string("InstallDate", today())?;
    k.set_u32("EstimatedSize", e.size_kb)?;
    k.set_u32("NoModify", 1)?;
    k.set_u32("NoRepair", 1)?;
    k.set_string("Comments", "Per-user install, no admin rights")?;
    Ok(())
}

fn today() -> String {
    // YYYYMMDD from the system clock (UTC is fine for InstallDate).
    let days = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0) as i64;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}{m:02}{d:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn unregister_all() {
    let cu = &windows_registry::CURRENT_USER;
    for (key, value) in layout::uninstall_registry() {
        match value {
            None => {
                let _ = cu.remove_tree(&key);
            }
            Some(name) => {
                if let Ok(k) = cu.open(&key) {
                    let _ = k.remove_value(name);
                }
            }
        }
    }
}

/// Our own entry, if Descall (Tauri) is already installed: (InstallLocation, DisplayVersion).
pub fn installed() -> Option<(PathBuf, String)> {
    let k = windows_registry::CURRENT_USER.open(UNINSTALL_KEY).ok()?;
    let dir = k.get_string("InstallLocation").ok()?;
    let ver = k.get_string("DisplayVersion").unwrap_or_default();
    Some((PathBuf::from(dir), ver))
}

/// Electron per-user install (electron-builder writes a GUID key; matched like the migrator does).
pub fn electron_install() -> Option<(PathBuf, String)> {
    let parent = windows_registry::CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Uninstall").ok()?;
    for name in parent.keys().ok()? {
        let Ok(k) = parent.open(&name) else { continue };
        let display = k.get_string("DisplayName").unwrap_or_default();
        let un = k.get_string("UninstallString").unwrap_or_default();
        if display.starts_with("Descall") && un.contains("Uninstall Descall.exe") {
            let dir = k.get_string("InstallLocation").ok()?;
            return Some((PathBuf::from(dir), k.get_string("DisplayVersion").unwrap_or_default()));
        }
    }
    None
}

/* -------------------------------------------------------------- helpers */

pub fn open(target: &str, args: Option<&str>) -> bool {
    let r = unsafe {
        ShellExecuteW(
            None,
            &HSTRING::from("open"),
            &HSTRING::from(target),
            &args.map(HSTRING::from).unwrap_or_default(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    r.0 as usize > 32
}

pub fn open_url(url: &str) {
    if url.starts_with("https://") {
        open(url, None);
    }
}

/// Opens Explorer with the log file selected.
pub fn reveal(path: &Path) {
    let _ = std::process::Command::new("explorer.exe").arg(format!("/select,{}", path.display())).spawn();
}

pub fn launch(exe: &Path, args: &[String]) -> bool {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args);
    if let Some(d) = exe.parent() {
        cmd.current_dir(d);
    }
    cmd.spawn().is_ok()
}

pub fn copy_text(owner: HWND, text: &str) -> bool {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        if OpenClipboard(Some(owner)).is_err() {
            return false;
        }
        let _ = EmptyClipboard();
        let ok = (|| -> windows::core::Result<()> {
            let h: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
            let p = GlobalLock(h) as *mut u16;
            if p.is_null() {
                return Err(windows::core::Error::from_thread());
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
            let _ = GlobalUnlock(h);
            SetClipboardData(13 /* CF_UNICODETEXT */, Some(HANDLE(h.0)))?;
            Ok(())
        })()
        .is_ok();
        let _ = CloseClipboard();
        ok
    }
}

/// Folder picker (IFileOpenDialog in folder mode), starting at `start`.
pub fn pick_folder(owner: HWND, start: &Path) -> Option<PathBuf> {
    unsafe {
        let dlg: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        let opts = dlg.GetOptions().ok()?;
        dlg.SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM).ok()?;
        let mut s = start.to_path_buf();
        while !s.exists() {
            s = s.parent()?.to_path_buf();
        }
        if let Ok(item) = windows::Win32::UI::Shell::SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(s.as_os_str()), None) {
            let _ = dlg.SetFolder(&item);
        }
        dlg.Show(Some(owner)).ok()?;
        let item = dlg.GetResult().ok()?;
        let p = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let out = p.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const c_void));
        out.map(PathBuf::from)
    }
}
