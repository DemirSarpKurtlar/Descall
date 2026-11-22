//! The Windows Job Object that holds the backend (node.exe) and its children, computed from the
//! share in `dc:cfg:pc`. RAM share -> per-process and per-job committed memory limits plus the
//! V8 heap flag; cores -> a hard CPU rate cap (share of all logical processors). The job kills
//! everything when the app exits (KILL_ON_JOB_CLOSE) and runs it below normal priority, so a
//! game in the foreground always wins the CPU.

/// RAM the owner always keeps: the share never passes half the machine.
pub const MAX_SHARE_OF_MACHINE: f64 = 0.5;
/// V8 old space as a part of the share; the rest is code, buffers, sockets and native memory.
pub const HEAP_FRACTION: f64 = 0.70;
pub const HEAP_MIN_MB: u32 = 256;
/// Extra room of the whole job over the backend's own limit (ffmpeg and other children).
pub const JOB_EXTRA_MB: u32 = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Machine {
    pub total_mb: u32,
    pub logical_cpus: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JobLimits {
    /// RAM share actually applied (after the machine cap).
    pub share_mb: u32,
    /// JOB_OBJECT_LIMIT_PROCESS_MEMORY (bytes).
    pub process_memory_bytes: u64,
    /// JOB_OBJECT_LIMIT_JOB_MEMORY (bytes).
    pub job_memory_bytes: u64,
    /// `--max-old-space-size` for node.exe (MB).
    pub heap_mb: u32,
    /// JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP rate in 1/100 of a percent of the whole machine
    /// (1..=10000); None: the share covers every processor, no cap.
    pub cpu_rate: Option<u32>,
    /// Cores granted (after the machine cap), for the env and the popover.
    pub cores: u32,
}

pub fn compute(share_mb: u32, cores: u32, m: Machine) -> JobLimits {
    let machine_cap = ((m.total_mb as f64 * MAX_SHARE_OF_MACHINE) as u32).max(crate::cfg::RAM_MIN_MB);
    let share = share_mb.clamp(256, machine_cap.max(256));
    let heap = (((share as f64) * HEAP_FRACTION) as u32 / 16 * 16).max(HEAP_MIN_MB).min(share);
    let logical = m.logical_cpus.max(1);
    let cores = cores.clamp(1, logical);
    let cpu_rate = if cores >= logical { None } else { Some(((cores as u64 * 10_000) / logical as u64).clamp(1, 10_000) as u32) };
    let mb = 1024 * 1024u64;
    JobLimits {
        share_mb: share,
        process_memory_bytes: share as u64 * mb,
        job_memory_bytes: (share as u64 + JOB_EXTRA_MB as u64) * mb,
        heap_mb: heap,
        cpu_rate,
        cores,
    }
}

/// node.exe arguments in front of the entry script.
pub fn node_args(l: &JobLimits, entry: &str) -> Vec<String> {
    vec![format!("--max-old-space-size={}", l.heap_mb), "--enable-source-maps".into(), entry.into()]
}

/// What a new cfg needs from a running backend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Apply {
    Nothing,
    /// New CPU cap: SetInformationJobObject on the running job.
    LiveCpu,
    /// The heap flag is fixed at spawn: drain, restart with the new share.
    Restart,
}

pub fn apply_plan(running: &JobLimits, next: &JobLimits) -> Apply {
    if running.share_mb != next.share_mb || running.heap_mb != next.heap_mb {
        Apply::Restart
    } else if running.cpu_rate != next.cpu_rate {
        Apply::LiveCpu
    } else {
        Apply::Nothing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PC: Machine = Machine { total_mb: 32 * 1024, logical_cpus: 16 };

    #[test]
    fn three_gb_four_cores_on_the_owner_pc() {
        let l = compute(3072, 4, PC);
        assert_eq!(l.share_mb, 3072);
        assert_eq!(l.process_memory_bytes, 3072 * 1024 * 1024);
        assert_eq!(l.job_memory_bytes, (3072 + 512) * 1024 * 1024);
        assert_eq!(l.heap_mb, 2144, "70 % in 16 MB steps");
        assert_eq!(l.cpu_rate, Some(2500), "4 of 16 logical = 25 %");
        assert_eq!(node_args(&l, "server.js"), vec!["--max-old-space-size=2144", "--enable-source-maps", "server.js"]);
    }

    #[test]
    fn small_share_keeps_a_usable_heap() {
        let l = compute(512, 1, PC);
        assert_eq!(l.heap_mb, 352);
        assert_eq!(l.cpu_rate, Some(625));
    }

    #[test]
    fn never_more_than_half_the_machine() {
        let small = Machine { total_mb: 8192, logical_cpus: 4 };
        let l = compute(8192, 8, small);
        assert_eq!(l.share_mb, 4096);
        assert_eq!(l.cores, 4);
        assert_eq!(l.cpu_rate, None, "every processor: no cap");
    }

    #[test]
    fn tiny_or_broken_machine_values() {
        let l = compute(1024, 2, Machine { total_mb: 0, logical_cpus: 0 });
        assert!(l.share_mb >= 256 && l.heap_mb >= HEAP_MIN_MB && l.heap_mb <= l.share_mb);
        assert_eq!(l.cpu_rate, None);
    }

    #[test]
    fn plan_for_a_cfg_change() {
        let a = compute(3072, 4, PC);
        assert_eq!(apply_plan(&a, &compute(3072, 4, PC)), Apply::Nothing);
        assert_eq!(apply_plan(&a, &compute(3072, 6, PC)), Apply::LiveCpu);
        assert_eq!(apply_plan(&a, &compute(4096, 4, PC)), Apply::Restart);
        assert_eq!(apply_plan(&a, &compute(1024, 2, PC)), Apply::Restart);
    }
}
