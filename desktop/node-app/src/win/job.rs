//! The Job Object around the backend (descall_node::limits): per-process and per-job committed
//! memory limits, a hard CPU rate cap, below-normal priority, and KILL_ON_JOB_CLOSE so the
//! backend and cloudflared never outlive Descall Node (even when it crashes).
//!
//! The child is assigned right after spawn; node.exe starts no children of its own before it
//! has loaded its modules, so nothing escapes the job in that window.

use std::os::windows::io::AsRawHandle;

use descall_node::limits::JobLimits;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::*;
use windows::Win32::System::Threading::BELOW_NORMAL_PRIORITY_CLASS;

pub struct Job {
    h: HANDLE,
}

// The handle is used from the supervisor thread only, but the Job lives in shared state.
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

impl Job {
    pub fn create(limits: Option<&JobLimits>) -> Option<Job> {
        let h = unsafe { CreateJobObjectW(None, windows::core::PCWSTR::null()) }.ok()?;
        let job = Job { h };
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        let mut flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if let Some(l) = limits {
            flags |= JOB_OBJECT_LIMIT_PROCESS_MEMORY | JOB_OBJECT_LIMIT_JOB_MEMORY | JOB_OBJECT_LIMIT_PRIORITY_CLASS;
            info.ProcessMemoryLimit = l.process_memory_bytes as usize;
            info.JobMemoryLimit = l.job_memory_bytes as usize;
            info.BasicLimitInformation.PriorityClass = BELOW_NORMAL_PRIORITY_CLASS.0;
        }
        info.BasicLimitInformation.LimitFlags = flags;
        let ok = unsafe { SetInformationJobObject(job.h, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32) };
        if ok.is_err() {
            log::warn!("[job] limits not applied: {ok:?}");
        }
        if let Some(l) = limits {
            job.set_cpu_rate(l.cpu_rate);
        }
        Some(job)
    }

    pub fn assign(&self, child: &std::process::Child) -> bool {
        unsafe { AssignProcessToJobObject(self.h, HANDLE(child.as_raw_handle())) }.is_ok()
    }

    /// Hard cap in 1/100 % of the machine; None removes the cap.
    pub fn set_cpu_rate(&self, rate: Option<u32>) -> bool {
        let mut c = JOBOBJECT_CPU_RATE_CONTROL_INFORMATION::default();
        match rate {
            Some(r) => {
                c.ControlFlags = JOB_OBJECT_CPU_RATE_CONTROL_ENABLE | JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP;
                c.Anonymous.CpuRate = r.clamp(1, 10_000);
            }
            None => c.ControlFlags = JOB_OBJECT_CPU_RATE_CONTROL(0),
        }
        unsafe { SetInformationJobObject(self.h, JobObjectCpuRateControlInformation, &c as *const _ as *const _, std::mem::size_of::<JOBOBJECT_CPU_RATE_CONTROL_INFORMATION>() as u32) }.is_ok()
    }

    pub fn accounting(&self) -> Option<(u64, u64)> {
        let mut a = JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION::default();
        unsafe { QueryInformationJobObject(Some(self.h), JobObjectBasicAndIoAccountingInformation, &mut a as *mut _ as *mut _, std::mem::size_of::<JOBOBJECT_BASIC_AND_IO_ACCOUNTING_INFORMATION>() as u32, None) }.ok()?;
        let cpu = (a.BasicInfo.TotalUserTime + a.BasicInfo.TotalKernelTime).max(0) as u64;
        let io = a.IoInfo.ReadTransferCount + a.IoInfo.WriteTransferCount + a.IoInfo.OtherTransferCount;
        Some((cpu, io))
    }

    pub fn terminate(&self) {
        let _ = unsafe { TerminateJobObject(self.h, 0) };
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.h) };
    }
}
