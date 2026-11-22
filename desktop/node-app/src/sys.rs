//! Platform pieces behind one interface: machine size, the Job Object, process memory, login
//! auto-start, the game probe and the power / session watcher. Windows implementations are in
//! `win/`; elsewhere (development builds only) they are harmless stand-ins.

use descall_node::limits::{JobLimits, Machine};

pub fn machine() -> Machine {
    let logical_cpus = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1);
    Machine { total_mb: total_mb(), logical_cpus }
}

#[cfg(windows)]
fn total_mb() -> u32 {
    crate::win::total_memory_mb()
}

#[cfg(not(windows))]
fn total_mb() -> u32 {
    std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|t| t.lines().find(|l| l.starts_with("MemTotal:")).and_then(|l| l.split_whitespace().nth(1)).and_then(|kb| kb.parse::<u64>().ok()))
        .map(|kb| (kb / 1024) as u32)
        .unwrap_or(8192)
}

/// Job Object holding one child (and its children).
pub struct Job {
    #[cfg(windows)]
    inner: crate::win::job::Job,
}

impl Job {
    /// `limits`: memory / CPU caps (backend); None: only kill-on-close (tunnel).
    pub fn create(limits: Option<&JobLimits>) -> Option<Job> {
        #[cfg(windows)]
        {
            crate::win::job::Job::create(limits).map(|inner| Job { inner })
        }
        #[cfg(not(windows))]
        {
            let _ = limits;
            Some(Job {})
        }
    }

    pub fn assign(&self, child: &std::process::Child) -> bool {
        #[cfg(windows)]
        {
            self.inner.assign(child)
        }
        #[cfg(not(windows))]
        {
            let _ = child;
            true
        }
    }

    pub fn set_cpu_rate(&self, rate: Option<u32>) -> bool {
        #[cfg(windows)]
        {
            self.inner.set_cpu_rate(rate)
        }
        #[cfg(not(windows))]
        {
            let _ = rate;
            true
        }
    }

    /// Total CPU time (100 ns units) and I/O bytes of everything in the job so far.
    pub fn accounting(&self) -> Option<(u64, u64)> {
        #[cfg(windows)]
        {
            self.inner.accounting()
        }
        #[cfg(not(windows))]
        {
            None
        }
    }

    pub fn terminate(&self) {
        #[cfg(windows)]
        self.inner.terminate();
    }
}

/// Private (committed) memory of a child in MB.
pub fn process_mb(child: &std::process::Child) -> Option<f64> {
    #[cfg(windows)]
    {
        crate::win::process_private_mb(child)
    }
    #[cfg(not(windows))]
    {
        let t = std::fs::read_to_string(format!("/proc/{}/status", child.id())).ok()?;
        let kb: f64 = t.lines().find(|l| l.starts_with("VmRSS:"))?.split_whitespace().nth(1)?.parse().ok()?;
        Some(kb / 1024.0)
    }
}

pub const RUN_VALUE: &str = "DescallNode";

pub fn autostart_enabled() -> bool {
    #[cfg(windows)]
    {
        crate::win::autostart_enabled()
    }
    #[cfg(not(windows))]
    false
}

pub fn set_autostart(on: bool) -> bool {
    #[cfg(windows)]
    {
        crate::win::set_autostart(on)
    }
    #[cfg(not(windows))]
    {
        let _ = on;
        false
    }
}

/// Samples the desktop for the game mode detector.
pub struct GameProbe {
    #[cfg(windows)]
    inner: crate::win::game::Probe,
}

impl GameProbe {
    pub fn new() -> GameProbe {
        GameProbe {
            #[cfg(windows)]
            inner: crate::win::game::Probe::new(),
        }
    }

    pub fn sample(&mut self, now: u64) -> descall_node::game::Sample {
        #[cfg(windows)]
        {
            self.inner.sample(now)
        }
        #[cfg(not(windows))]
        {
            descall_node::game::Sample { t_ms: now, ..Default::default() }
        }
    }
}

/// Session end and sleep: WM_QUERYENDSESSION / WM_ENDSESSION / PBT_APMSUSPEND /
/// PBT_APMRESUMEAUTOMATIC become supervisor events; the watcher holds Windows' shutdown until
/// the node finished draining (up to 10 s) via [`crate::runner::Signals`].
pub fn watch_power(tx: std::sync::mpsc::Sender<crate::runner::Msg>, signals: std::sync::Arc<crate::runner::Signals>) {
    #[cfg(windows)]
    crate::win::power::start(tx, signals);
    #[cfg(not(windows))]
    {
        let _ = (tx, signals);
    }
}

/// The tray's small icon size (16 px at 100 %).
pub fn small_icon_px() -> u32 {
    #[cfg(windows)]
    {
        crate::win::small_icon_px()
    }
    #[cfg(not(windows))]
    32
}

/// Rounded corners for the frameless popover (Windows 11).
pub fn round_corners(w: &tauri::WebviewWindow) {
    #[cfg(windows)]
    crate::win::round_corners(w);
    #[cfg(not(windows))]
    let _ = w;
}

/// CREATE_NO_WINDOW for children: no console flashes.
pub fn hide_console(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}
