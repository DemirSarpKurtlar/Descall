//! Runtime check of the assumption the echo fix rests on: every process that plays the
//! call (the WebView2 runtime) is a descendant of Descall.exe, so EXCLUDE_TARGET_PROCESS_TREE
//! removes it from the loopback. If a future WebView2 moved audio to a shared runtime
//! process outside our tree, the call would leak into the share again. The host calls
//! [`audit`] when a share with audio starts; a non-empty `webview_outside_tree` means "do
//! not trust the loopback": the share falls back to video only (lane L2).

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, FILETIME};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
use windows::Win32::System::Threading::{GetCurrentProcessId, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

use crate::proctree::{descendants, is_webview_exe, ProcEntry};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioSession {
    pub pid: u32,
    pub exe: String,
    pub in_our_tree: bool,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EchoAudit {
    pub our_pid: u32,
    pub tree_size: usize,
    pub sessions: Vec<AudioSession>,
    /// WebView2 processes with an audio session that are NOT in our tree.
    pub webview_outside_tree: Vec<AudioSession>,
}

impl EchoAudit {
    pub fn safe(&self) -> bool {
        self.webview_outside_tree.is_empty()
    }
}

fn creation_time(pid: u32) -> u64 {
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return 0 };
        let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
        let r = GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u);
        let _ = CloseHandle(h);
        if r.is_err() {
            return 0;
        }
        ((c.dwHighDateTime as u64) << 32) | c.dwLowDateTime as u64
    }
}

/// Every process (pid, parent, creation time, exe name).
pub fn snapshot() -> Vec<ProcEntry> {
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            let n = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            out.push(ProcEntry { pid: e.th32ProcessID, ppid: e.th32ParentProcessID, created: creation_time(e.th32ProcessID), exe: String::from_utf16_lossy(&e.szExeFile[..n]) });
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    out
}

/// Our process tree right now.
pub fn our_tree() -> std::collections::HashSet<u32> {
    descendants(unsafe { GetCurrentProcessId() }, &snapshot())
}

/// Audio sessions on the default output device, with their owning process.
pub fn audio_sessions() -> crate::Result<Vec<(u32, bool)>> {
    crate::imaging::ensure_com();
    let mut out = Vec::new();
    unsafe {
        let e: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let dev = e.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|_| crate::CaptureError::NoAudioDevice)?;
        let mgr: IAudioSessionManager2 = dev.Activate(CLSCTX_ALL, None)?;
        let list = mgr.GetSessionEnumerator()?;
        for i in 0..list.GetCount()? {
            let Ok(ctl) = list.GetSession(i) else { continue };
            let Ok(ctl2) = windows::core::Interface::cast::<IAudioSessionControl2>(&ctl) else { continue };
            let pid = ctl2.GetProcessId().unwrap_or(0);
            let active = ctl.GetState().map(|s| s == AudioSessionStateActive).unwrap_or(false);
            if pid != 0 {
                out.push((pid, active));
            }
        }
    }
    Ok(out)
}

pub fn audit() -> crate::Result<EchoAudit> {
    let procs = snapshot();
    let me = unsafe { GetCurrentProcessId() };
    let tree = descendants(me, &procs);
    let exe_of = |pid: u32| procs.iter().find(|p| p.pid == pid).map(|p| p.exe.clone()).unwrap_or_default();
    let sessions: Vec<AudioSession> = audio_sessions()?.into_iter().map(|(pid, active)| AudioSession { pid, exe: exe_of(pid), in_our_tree: tree.contains(&pid), active }).collect();
    // Other apps' WebView2 (Teams, widgets) are legitimately captured, so an outside WebView2
    // session alone is not a problem. The escape signature is: our tree runs WebView2, none
    // of our processes owns an audio session, yet an active WebView2 session exists outside
    // the tree. Then the call audio may be coming from there, and we do not trust the
    // loopback.
    let ours_has_webview = procs.iter().any(|p| tree.contains(&p.pid) && is_webview_exe(&p.exe));
    let ours_plays = sessions.iter().any(|s| s.in_our_tree);
    let webview_outside_tree = if ours_has_webview && !ours_plays {
        sessions.iter().filter(|s| !s.in_our_tree && s.active && is_webview_exe(&s.exe)).cloned().collect()
    } else {
        Vec::new()
    };
    Ok(EchoAudit { our_pid: me, tree_size: tree.len(), sessions, webview_outside_tree })
}
