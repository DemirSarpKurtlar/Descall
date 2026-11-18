//! Command line. Accepts the NSIS-style switches the migrator and Tauri's updater pass
//! (`/S`, `/P`, `/R`, `/NS`, `/UPDATE`, `/D=<dir>` last, `/ARGS ...`) plus our own `--long` flags.

use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Mode {
    /// First install, reinstall or manual upgrade (welcome screen).
    #[default]
    Install,
    /// In-app update (update toast). `/UPDATE` from the Tauri updater lands here too.
    Update,
    /// Electron user moved over by the migrator (migration screen).
    Migrate,
    /// Apps & features "Uninstall".
    Uninstall,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Args {
    pub mode: Mode,
    /// `/S`: no window at all; exit code tells the caller what happened.
    pub silent: bool,
    /// `/P`: progress only, no questions (Tauri updater "passive").
    pub passive: bool,
    /// `/R`: start Descall again when done.
    pub relaunch: bool,
    /// `/NS`: do not create new shortcuts (existing ones are still kept and retargeted).
    pub no_shortcuts: bool,
    pub dir: Option<PathBuf>,
    /// Version the user comes from (`--from 3.9.3`), shown on the migration screen.
    pub from_version: Option<String>,
    pub lang: Option<String>,
    /// Staging/QA manifest URL (`--manifest https://...`).
    pub manifest_url: Option<String>,
    /// Debug builds only: accept a manifest without a minisign signature.
    pub allow_unsigned: bool,
    /// Internal: the uninstaller re-launched itself from %TEMP%.
    pub from_temp: bool,
    /// Uninstall also removes %APPDATA%\com.descall.app (user data).
    pub purge: bool,
    /// Extra arguments for Descall.exe when it is started afterwards (`/ARGS a b c`).
    pub app_args: Vec<String>,
}

fn eq(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

pub fn parse<I: IntoIterator<Item = String>>(args: I) -> Args {
    let v: Vec<String> = args.into_iter().collect();
    let mut a = Args::default();
    let mut i = 0;
    while i < v.len() {
        let s = v[i].as_str();
        let next = |i: &mut usize| -> Option<String> {
            *i += 1;
            v.get(*i).cloned()
        };
        if eq(s, "/S") || eq(s, "--silent") || eq(s, "--quiet") {
            a.silent = true;
        } else if eq(s, "/P") || eq(s, "--passive") {
            a.passive = true;
        } else if eq(s, "/R") || eq(s, "--relaunch") {
            a.relaunch = true;
        } else if eq(s, "/NS") || eq(s, "--no-shortcuts") {
            a.no_shortcuts = true;
        } else if eq(s, "/UPDATE") || eq(s, "--update") {
            a.mode = Mode::Update;
        } else if eq(s, "--migrate") {
            a.mode = Mode::Migrate;
        } else if eq(s, "--uninstall") || eq(s, "/UNINSTALL") {
            a.mode = Mode::Uninstall;
        } else if eq(s, "--from-temp") {
            a.from_temp = true;
        } else if eq(s, "--purge") {
            a.purge = true;
        } else if eq(s, "--allow-unsigned") {
            a.allow_unsigned = cfg!(debug_assertions);
        } else if eq(s, "--from") {
            a.from_version = next(&mut i);
        } else if eq(s, "--lang") {
            a.lang = next(&mut i);
        } else if eq(s, "--manifest") {
            a.manifest_url = next(&mut i).filter(|u| u.starts_with("https://"));
        } else if eq(s, "--dir") {
            a.dir = next(&mut i).map(PathBuf::from);
        } else if s.get(..3).is_some_and(|p| eq(p, "/D=")) {
            // NSIS rule: /D= is last and may contain spaces, so it takes the rest of the line.
            let mut dir = s[3..].to_string();
            for rest in &v[i + 1..] {
                dir.push(' ');
                dir.push_str(rest);
            }
            let dir = dir.trim().trim_matches('"').to_string();
            if !dir.is_empty() {
                a.dir = Some(PathBuf::from(dir));
            }
            break;
        } else if eq(s, "/ARGS") || eq(s, "--") {
            a.app_args = v[i + 1..].to_vec();
            break;
        }
        // Unknown switches are ignored on purpose: future updaters may pass more.
        i += 1;
    }
    if a.silent {
        a.passive = false;
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &[&str]) -> Args {
        parse(s.iter().map(|x| x.to_string()))
    }

    #[test]
    fn defaults_to_interactive_install() {
        assert_eq!(p(&[]), Args::default());
    }

    #[test]
    fn migrator_install_new_keeps_the_same_folder() {
        let a = p(&["/S", "/D=C:\\Users\\Ada Lovelace\\AppData\\Local\\Programs\\Descall"]);
        assert!(a.silent);
        assert_eq!(a.mode, Mode::Install);
        assert_eq!(a.dir.unwrap(), PathBuf::from("C:\\Users\\Ada Lovelace\\AppData\\Local\\Programs\\Descall"));
    }

    #[test]
    fn d_switch_takes_split_rest_of_line() {
        let a = p(&["/P", "/D=C:\\Program", "Files", "(x86)\\Descall"]);
        assert_eq!(a.dir.unwrap(), PathBuf::from("C:\\Program Files (x86)\\Descall"));
        assert!(a.passive);
    }

    #[test]
    fn tauri_updater_switches() {
        let a = p(&["/P", "/R", "/UPDATE", "/ARGS", "--updated", "--hidden"]);
        assert_eq!(a.mode, Mode::Update);
        assert!(a.passive && a.relaunch);
        assert_eq!(a.app_args, vec!["--updated", "--hidden"]);
    }

    #[test]
    fn migrate_flags() {
        let a = p(&["--migrate", "--from", "3.9.3", "--dir", "D:\\Descall", "--lang", "de"]);
        assert_eq!(a.mode, Mode::Migrate);
        assert_eq!(a.from_version.as_deref(), Some("3.9.3"));
        assert_eq!(a.lang.as_deref(), Some("de"));
        assert_eq!(a.dir.unwrap(), PathBuf::from("D:\\Descall"));
    }

    #[test]
    fn silent_wins_over_passive_and_manifest_must_be_https() {
        let a = p(&["/P", "/S", "--manifest", "http://evil.example/m.json"]);
        assert!(a.silent && !a.passive);
        assert!(a.manifest_url.is_none());
    }

    #[test]
    fn uninstall_mode() {
        let a = p(&["--uninstall", "--from-temp", "--purge", "/S"]);
        assert_eq!(a.mode, Mode::Uninstall);
        assert!(a.from_temp && a.purge && a.silent);
    }
}
