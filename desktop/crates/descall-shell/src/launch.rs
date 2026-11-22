//! Cold-start visibility. Port of electron/launchVisibility.cjs.
//!
//! A manual launch (Start menu, desktop shortcut, taskbar) always shows the window. Hidden
//! boot is only for the Windows login auto-start, registered with `--autostart --hidden`
//! under the Run value `com.descall.app` (the same value name Electron used, so the Task
//! Manager on/off state carries over). A quiet updater relaunch is a one-shot marker.

pub const AUTOSTART_ARGS: [&str; 2] = ["--autostart", "--hidden"];
pub const UPDATER_RELAUNCH_MAX_AGE_MS: i64 = 15 * 60 * 1000;
/// HKCU\Software\Microsoft\Windows\CurrentVersion\Run value name = the AppUserModelID.
pub const RUN_VALUE: &str = "com.descall.app";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartAction {
    Show,
    Hide,
    Minimize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartReason {
    Manual,
    Autostart,
    UpdaterRelaunch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ColdStart {
    pub action: StartAction,
    pub show_splash: bool,
    pub reason: StartReason,
}

/// Saved "start in background" mode of the previous run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundMode {
    Hidden,
    Minimized,
}

/// True for an argument that is a URI (`descall:dm/x`, `descall://...`, `https://...`): what a
/// web page or a document can make Windows start the app with. Drive paths (`C:\x`) are not.
pub fn is_uri_arg(arg: &str) -> bool {
    let arg = arg.trim().trim_matches('"');
    if arg.contains("://") {
        return true;
    }
    match arg.split_once(':') {
        Some((scheme, _)) => scheme.len() >= 2 && scheme.starts_with(|c: char| c.is_ascii_alphabetic()) && scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')),
        None => false,
    }
}

pub fn has_arg<S: AsRef<str>>(argv: &[S], flag: &str) -> bool {
    // A URL argument (an OS link such as descall://... that a web page can start the app
    // with) never carries launch flags, whatever text it holds: `descall:x --hidden` (a link
    // with raw spaces, which Windows hands over as one argument) used to start Descall hidden.
    argv.iter().map(|a| a.as_ref()).filter(|a| !a.is_empty() && !is_uri_arg(a)).any(|raw| {
        if raw == flag {
            return true;
        }
        let parts: Vec<&str> = raw.split_whitespace().collect();
        parts.len() > 1 && parts.contains(&flag)
    })
}

pub fn is_autostart_launch<S: AsRef<str>>(argv: &[S]) -> bool {
    AUTOSTART_ARGS.iter().any(|f| has_arg(argv, f))
}

pub fn is_fresh_relaunch_marker(mtime_ms: Option<i64>, now_ms: i64) -> bool {
    match mtime_ms {
        Some(m) => {
            let age = now_ms - m;
            (-5000..=UPDATER_RELAUNCH_MAX_AGE_MS).contains(&age)
        }
        None => false,
    }
}

pub fn decide_cold_start<S: AsRef<str>>(argv: &[S], background: Option<BackgroundMode>, updater_relaunch: bool) -> ColdStart {
    if is_autostart_launch(argv) {
        return ColdStart { action: StartAction::Hide, show_splash: false, reason: StartReason::Autostart };
    }
    // --updated alone is not enough: a manual launch that installs from the splash is
    // relaunched with that flag, and a stale tray file must not hide it.
    if updater_relaunch {
        if let Some(mode) = background {
            let action = if mode == BackgroundMode::Minimized { StartAction::Minimize } else { StartAction::Hide };
            return ColdStart { action, show_splash: false, reason: StartReason::UpdaterRelaunch };
        }
    }
    ColdStart { action: StartAction::Show, show_splash: true, reason: StartReason::Manual }
}

/// Marker file (app data folder) once the first start has decided on auto-start. Same name
/// as Electron's (launchVisibility.cjs AUTOSTART_MARKER_FILE), which lives in
/// `%APPDATA%\Descall`; an Electron marker counts too: that user already decided there and the
/// migrator carried their Run value (or its absence) over unchanged.
pub const AUTOSTART_MARKER_FILE: &str = "autostart-initialized";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutostartAction {
    /// First start ever: turn login auto-start on (Electron's first packaged run did).
    Enable,
    /// The Run value exists but would start the window visible: add the hidden args.
    RewriteArgs,
    None,
}

/// autostartLaunchAction: decided once, never re-enabled after the user turned it off.
/// `run_value` is the current `HKCU\...\Run\com.descall.app` data, if any.
pub fn autostart_launch_action(marker_exists: bool, electron_marker_exists: bool, run_value: Option<&str>) -> AutostartAction {
    if !marker_exists && !electron_marker_exists {
        return AutostartAction::Enable;
    }
    match run_value {
        Some(cmd) if !cmd.trim().is_empty() && !AUTOSTART_ARGS.iter().all(|f| cmd.split_whitespace().any(|p| p == *f)) => AutostartAction::RewriteArgs,
        _ => AutostartAction::None,
    }
}

/// Run value data for an enabled auto-start: the quoted exe plus the hidden args.
pub fn run_command(exe: &str) -> String {
    format!("\"{exe}\" {}", AUTOSTART_ARGS.join(" "))
}

#[cfg(test)]
mod tests {
    //! launchVisibility.selftest.mjs.
    use super::*;
    const EXE: &str = r"C:\Program Files\Descall\Descall.exe";

    #[test]
    fn url_arguments_never_carry_flags() {
        assert!(!is_autostart_launch(&[EXE, "descall://open --autostart --hidden"]));
        // Links without "//" (descall:whats-new is a valid deep link) carry no flags either.
        assert!(!is_autostart_launch(&[EXE, "descall:x --hidden"]));
        assert!(!is_autostart_launch(&[EXE, "\"DESCALL:dm/a --autostart\""]));
        assert!(!is_autostart_launch(&[EXE, "mailto:a --hidden"]));
        assert!(is_uri_arg("descall:whats-new") && is_uri_arg("https://descall.com") && !is_uri_arg(r"C:\Program Files\Descall\Descall.exe") && !is_uri_arg("--hidden") && !is_uri_arg("--migration-id=m-1"));
        assert!(!is_autostart_launch(&[EXE, "https://x.example/ --hidden"]));
        assert!(is_autostart_launch(&[EXE, "--autostart --hidden"]), "a joined flag string still counts");
        assert_eq!(decide_cold_start(&[EXE, "descall://x --hidden"], None, false).action, StartAction::Show);
    }

    #[test]
    fn autostart_is_decided_once() {
        let ok = run_command(EXE);
        // Fresh install, no Electron before: on, once.
        assert_eq!(autostart_launch_action(false, false, None), AutostartAction::Enable);
        // Turned off later (no Run value): stays off on every later start.
        assert_eq!(autostart_launch_action(true, false, None), AutostartAction::None);
        // Migrated from Electron with auto-start off: the Electron marker keeps it off.
        assert_eq!(autostart_launch_action(false, true, None), AutostartAction::None);
        // On with the hidden args: nothing to do.
        assert_eq!(autostart_launch_action(true, false, Some(&ok)), AutostartAction::None);
        assert_eq!(autostart_launch_action(false, true, Some(&ok)), AutostartAction::None);
        // On, but the value would open the window at login: rewrite with the args.
        assert_eq!(autostart_launch_action(true, false, Some(&format!("\"{EXE}\""))), AutostartAction::RewriteArgs);
        assert_eq!(autostart_launch_action(false, true, Some(&format!("\"{EXE}\" --autostart"))), AutostartAction::RewriteArgs);
        assert_eq!(autostart_launch_action(true, false, Some("  ")), AutostartAction::None);
    }

    #[test]
    fn manual_launch_ignores_stale_flags() {
        assert_eq!(decide_cold_start(&[EXE], Some(BackgroundMode::Hidden), false).action, StartAction::Show);
        assert_eq!(decide_cold_start(&[EXE], Some(BackgroundMode::Minimized), false).reason, StartReason::Manual);
        assert_eq!(decide_cold_start(&[EXE, "--updated"], Some(BackgroundMode::Hidden), false).action, StartAction::Show);
    }

    #[test]
    fn login_autostart_is_the_only_hidden_boot() {
        for flag in AUTOSTART_ARGS {
            let d = decide_cold_start(&[EXE, flag], None, false);
            assert_eq!((d.action, d.show_splash, d.reason), (StartAction::Hide, false, StartReason::Autostart));
        }
        assert_eq!(decide_cold_start(&[EXE, "--hidden-room"], None, false).action, StartAction::Show);
        let joined = format!("{EXE} --autostart --hidden");
        assert_eq!(decide_cold_start(&[joined.as_str()], None, false).action, StartAction::Hide);
    }

    #[test]
    fn quiet_updater_relaunch() {
        assert_eq!(decide_cold_start(&[EXE, "--updated"], Some(BackgroundMode::Hidden), true).action, StartAction::Hide);
        assert_eq!(decide_cold_start(&[EXE], Some(BackgroundMode::Hidden), false).action, StartAction::Show);
        assert_eq!(decide_cold_start(&[EXE], Some(BackgroundMode::Minimized), true).action, StartAction::Minimize);
        assert_eq!(decide_cold_start(&[EXE, "--updated"], None, true).action, StartAction::Show);
    }

    #[test]
    fn relaunch_marker_freshness() {
        let now = 1_700_000_000_000;
        assert!(is_fresh_relaunch_marker(Some(now), now));
        assert!(!is_fresh_relaunch_marker(Some(now - UPDATER_RELAUNCH_MAX_AGE_MS - 1), now));
        assert!(!is_fresh_relaunch_marker(None, now));
    }

    #[test]
    fn run_value_carries_the_hidden_args() {
        let cmd = run_command(EXE);
        assert!(cmd.starts_with('"') && cmd.contains("--autostart") && cmd.contains("--hidden"));
        assert!(is_autostart_launch(&[cmd.as_str()]));
    }
}
