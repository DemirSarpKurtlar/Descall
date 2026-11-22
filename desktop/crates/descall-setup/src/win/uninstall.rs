//! Apps & features "Uninstall". Runs from a %TEMP% copy so the install folder (with uninstall.exe
//! in it) can be removed completely; the temp copy is deleted at next reboot.
//! User data (`%APPDATA%\com.descall.app`) stays unless `--purge`.

use crate::cli::Args;
use crate::layout::{Layout, UNINSTALLER};
use std::path::{Path, PathBuf};
use std::time::Duration;
use windows::core::HSTRING;
use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT};
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONERROR, MB_ICONINFORMATION, MB_ICONQUESTION, MB_YESNO};

use super::{log, procs, shell, texts};

fn install_dir(args: &Args) -> Option<PathBuf> {
    if let Some(d) = &args.dir {
        return Some(d.clone());
    }
    if let Some((d, _)) = shell::installed() {
        return Some(d);
    }
    let me = std::env::current_exe().ok()?;
    let parent = me.parent()?.to_path_buf();
    me.file_name()?.to_str()?.eq_ignore_ascii_case(UNINSTALLER).then_some(parent)
}

pub fn run(args: &Args, layout: &Layout, lang: &str) -> i32 {
    let tx = texts::get(lang);
    let Some(dir) = install_dir(args) else {
        log::error("uninstall: install folder unknown");
        return 1;
    };
    if !args.from_temp {
        // Relaunch from %TEMP% so every file in `dir` can go.
        let tmp = std::env::temp_dir().join(format!("Descall-Uninstall-{}.exe", std::process::id()));
        if let Ok(me) = std::env::current_exe() {
            if std::fs::copy(&me, &tmp).is_ok() {
                let mut cmd = std::process::Command::new(&tmp);
                cmd.arg("--uninstall").arg("--from-temp").arg("--dir").arg(&dir).arg("--lang").arg(lang);
                if args.silent {
                    cmd.arg("/S");
                }
                if args.purge {
                    cmd.arg("--purge");
                }
                if cmd.spawn().is_ok() {
                    return 0;
                }
            }
        }
    }
    if !args.silent {
        let r = unsafe { MessageBoxW(None, &HSTRING::from(tx.un_q), &HSTRING::from(tx.title), MB_YESNO | MB_ICONQUESTION) };
        if r != IDYES {
            return 4;
        }
    }
    let ok = remove(&dir, layout, args.purge);
    if !args.silent {
        let (text, icon) = if ok { (tx.un_done, MB_ICONINFORMATION) } else { (tx.un_fail, MB_ICONERROR) };
        unsafe { MessageBoxW(None, &HSTRING::from(text), &HSTRING::from(tx.title), icon) };
    }
    if let Ok(me) = std::env::current_exe() {
        unsafe {
            let _ = MoveFileExW(&HSTRING::from(me.as_os_str()), None, MOVEFILE_DELAY_UNTIL_REBOOT);
        }
    }
    if ok {
        0
    } else {
        1
    }
}

/// descall:// is written by the app (not by this installer): drop it when it opens this install.
fn remove_deep_link_into(dir: &Path) {
    let cu = &windows_registry::CURRENT_USER;
    let cmd = cu.open(crate::layout::DEEP_LINK_COMMAND_KEY).and_then(|k| k.get_string("")).unwrap_or_default();
    if crate::layout::deep_link_is_ours(&cmd, &dir.display().to_string()) {
        let _ = cu.remove_tree(crate::layout::DEEP_LINK_KEY);
    }
}

fn remove(dir: &Path, layout: &Layout, purge: bool) -> bool {
    log::info(&format!("uninstall {}", dir.display()));
    // Never delete a folder that is not a Descall install.
    if !dir.join(crate::layout::EXE).is_file() && !dir.join(UNINSTALLER).is_file() {
        log::error("refusing to remove a folder without Descall.exe");
        shell::unregister_all();
        return !dir.exists();
    }
    if !procs::close_all(dir, Duration::from_secs(6)) {
        log::error("Descall still running");
        return false;
    }
    for l in [shell::start_menu_lnk(), shell::desktop_lnk(), shell::taskbar_pin_lnk()].into_iter().flatten() {
        shell::remove_link_into(&l, dir);
    }
    shell::unregister_all();
    remove_deep_link_into(dir);
    shell::notify_shell();
    // Only our own files: the folder holds nothing else (installed from a verified payload).
    let ok = std::fs::remove_dir_all(dir).is_ok() || !dir.exists();
    if !ok {
        super::job::schedule_delete_tree(dir);
    }
    if purge {
        let _ = std::fs::remove_dir_all(layout.app_data());
    }
    let _ = std::fs::remove_dir_all(layout.cache_root());
    let _ = std::fs::remove_dir_all(layout.setup_root().join("webview"));
    ok
}
