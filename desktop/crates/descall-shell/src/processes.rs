//! `scanProcesses()`: running process image names for the activity detector, minus system
//! and tool processes. Same BLOCKLIST as electron/processScanner.cjs; the Windows side
//! enumerates with Toolhelp32 in-process instead of spawning tasklist.exe.

use std::collections::BTreeSet;

pub const BLOCKLIST: &[&str] = &[
    "svchost.exe", "runtimebroker.exe", "system", "registry", "smss.exe", "csrss.exe",
    "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "dwm.exe", "explorer.exe",
    "taskhostw.exe", "sihost.exe", "fontdrvhost.exe", "searchhost.exe", "searchindexer.exe",
    "searchapp.exe", "ctfmon.exe", "audiodg.exe", "wuauclt.exe", "msiexec.exe", "spoolsv.exe",
    "dllhost.exe", "conhost.exe", "backgroundtaskhost.exe", "msmpeng.exe", "nissrv.exe",
    "igfxcuiservice.exe", "igfxem.exe", "nvdisplay.container.exe", "nvcontainer.exe",
    "textinputhost.exe", "sppsvc.exe", "usocoreworker.exe", "startmenuexperiencehost.exe",
    "shellexperiencehost.exe", "applicationframehost.exe", "systemsettings.exe",
    "lockapp.exe", "logonui.exe", "werfault.exe", "wermgr.exe", "ngen.exe", "ngentask.exe",
    "microsoftedgeupdate.exe", "googleupdate.exe", "crashreporter.exe", "updater.exe",
    "setup.exe", "unins000.exe", "uninstall.exe", "installer.exe", "compattelrunner.exe",
    "cmd.exe", "powershell.exe", "pwsh.exe", "windowsterminal.exe", "windows terminal.exe",
    "wt.exe", "openconsole.exe", "notepad.exe", "calc.exe", "calculator.exe", "calculatorapp.exe",
    "snippingtool.exe", "screensketch.exe", "mmc.exe", "control.exe", "regedit.exe",
    "bash.exe", "wsl.exe", "wslhost.exe", "widgets.exe", "widgetservice.exe",
    "msedgewebview2.exe", "securityhealthhost.exe", "smartscreen.exe", "searchui.exe",
    "gamebar.exe", "gamebarftw.exe",
];

/// Lowercase, deduplicated, blocklist removed. Order is sorted (Electron returned insertion
/// order of a Set; the page treats the list as a set).
pub fn filter_names<I, S>(names: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut out = BTreeSet::new();
    for n in names {
        let name = n.as_ref().trim().to_lowercase();
        if name.is_empty() || BLOCKLIST.contains(&name.as_str()) {
            continue;
        }
        out.insert(name);
    }
    out.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filters_system_and_tools_and_dedupes() {
        let got = filter_names(["svchost.exe", "Spotify.exe", "spotify.exe", "explorer.exe", "MsEdgeWebView2.exe", "  ", "cs2.exe", "Descall.exe"]);
        assert_eq!(got, vec!["cs2.exe", "descall.exe", "spotify.exe"]);
    }
    #[test]
    fn blocklist_matches_the_electron_one() {
        let src = include_str!("../../../../frontend/electron/processScanner.cjs");
        let start = src.find("new Set([").unwrap();
        let body = &src[start..src[start..].find("]);").unwrap() + start];
        let electron: BTreeSet<&str> = body.split('\'').skip(1).step_by(2).collect();
        let ours: BTreeSet<&str> = BLOCKLIST.iter().copied().collect();
        assert_eq!(ours, electron, "keep in sync with frontend/electron/processScanner.cjs");
    }
}
