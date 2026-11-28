//! Process-tree arithmetic for the echo guard (portable; the Windows snapshot lives in
//! echo_guard.rs). The loopback excludes "our process tree": Descall.exe plus every
//! descendant (WebView2 browser, renderer, audio service). The guard double-checks that
//! every process playing WebView2 audio is in that set.

use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcEntry {
    pub pid: u32,
    pub ppid: u32,
    /// Creation time (any monotonic unit). Windows reuses PIDs: a "child" created before
    /// its "parent" is an orphan whose real parent died, not a descendant.
    pub created: u64,
    pub exe: String,
}

/// `root` and all of its descendants.
pub fn descendants(root: u32, procs: &[ProcEntry]) -> HashSet<u32> {
    let mut children: HashMap<u32, Vec<&ProcEntry>> = HashMap::new();
    for p in procs {
        if p.pid != p.ppid {
            children.entry(p.ppid).or_default().push(p);
        }
    }
    let created: HashMap<u32, u64> = procs.iter().map(|p| (p.pid, p.created)).collect();
    let mut out = HashSet::from([root]);
    let mut stack = vec![root];
    while let Some(pid) = stack.pop() {
        let parent_created = created.get(&pid).copied().unwrap_or(0);
        for c in children.get(&pid).map(|v| v.as_slice()).unwrap_or(&[]) {
            if c.created >= parent_created && out.insert(c.pid) {
                stack.push(c.pid);
            }
        }
    }
    out
}

/// Executable names whose audio would be the call (our WebView2 runtime processes).
pub fn is_webview_exe(exe: &str) -> bool {
    let e = exe.to_ascii_lowercase();
    e.ends_with("msedgewebview2.exe")
}

/// `StartInfo.audio_error` when the echo guard turned system audio off.
pub const ECHO_RISK_AUDIO_ERROR: &str = "echo-risk";

/// Whether a share may start the process loopback: the page asked for audio and the echo
/// guard trusts the loopback. An untrusted loopback could carry the call (viewers hear
/// themselves), so the share goes out video only instead.
pub fn share_system_audio(wanted: bool, echo_risk: bool) -> bool {
    wanted && !echo_risk
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echo_risk_turns_system_audio_off() {
        assert!(share_system_audio(true, false));
        assert!(!share_system_audio(true, true), "untrusted loopback: video only");
        assert!(!share_system_audio(false, false));
        assert!(!share_system_audio(false, true));
        assert_eq!(ECHO_RISK_AUDIO_ERROR, "echo-risk");
    }

    fn p(pid: u32, ppid: u32, created: u64) -> ProcEntry {
        ProcEntry { pid, ppid, created, exe: format!("p{pid}.exe") }
    }

    #[test]
    fn walks_the_tree() {
        let procs = vec![p(4, 0, 0), p(100, 4, 10), p(200, 100, 20), p(300, 200, 30), p(301, 200, 31), p(400, 4, 40), p(500, 400, 50)];
        let d = descendants(100, &procs);
        assert_eq!(d, HashSet::from([100, 200, 300, 301]));
        assert!(!d.contains(&400));
    }

    #[test]
    fn pid_reuse_and_self_loops_do_not_leak_in() {
        // 900 claims parent 100 but was created before 100: its real parent is long gone.
        let procs = vec![p(900, 100, 5), p(100, 4, 10), p(7, 7, 1), p(200, 100, 20)];
        let d = descendants(100, &procs);
        assert_eq!(d, HashSet::from([100, 200]));
        assert_eq!(descendants(7, &procs), HashSet::from([7]));
    }

    #[test]
    fn webview_names() {
        assert!(is_webview_exe("C:\\x\\msedgewebview2.exe"));
        assert!(is_webview_exe("MSEDGEWEBVIEW2.EXE"));
        assert!(!is_webview_exe("msedge.exe"));
    }
}
