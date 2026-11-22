//! Game probe: the shell's notification state (QUNS_RUNNING_D3D_FULL_SCREEN = a full-screen
//! exclusive Direct3D app in front), the foreground window's exe name and the 3D engine
//! utilisation of every GPU (PDH `\GPU Engine(*engtype_3D)\Utilization Percentage`).

use windows::core::{w, PWSTR};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Performance::*;
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

pub struct Probe {
    query: Option<(PDH_HQUERY, PDH_HCOUNTER)>,
}

// PDH handles are used from the supervisor thread only.
unsafe impl Send for Probe {}

impl Probe {
    pub fn new() -> Probe {
        let mut q = PDH_HQUERY::default();
        let mut c = PDH_HCOUNTER::default();
        let query = unsafe {
            if PdhOpenQueryW(None, 0, &mut q) != 0 {
                None
            } else if PdhAddEnglishCounterW(q, w!("\\GPU Engine(*engtype_3D)\\Utilization Percentage"), 0, &mut c) != 0 {
                let _ = PdhCloseQuery(q);
                None
            } else {
                let _ = PdhCollectQueryData(q);
                Some((q, c))
            }
        };
        Probe { query }
    }

    fn gpu(&mut self) -> f32 {
        let Some((q, c)) = self.query else { return 0.0 };
        unsafe {
            if PdhCollectQueryData(q) != 0 {
                return 0.0;
            }
            let (mut size, mut count) = (0u32, 0u32);
            let _ = PdhGetFormattedCounterArrayW(c, PDH_FMT_DOUBLE, &mut size, &mut count, None);
            if size == 0 {
                return 0.0;
            }
            // u64 storage keeps the item array aligned.
            let mut buf = vec![0u64; (size as usize).div_ceil(8)];
            let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            if PdhGetFormattedCounterArrayW(c, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items)) != 0 {
                return 0.0;
            }
            let mut samples = Vec::with_capacity(count as usize);
            for i in 0..count as usize {
                let it = &*items.add(i);
                if it.FmtValue.CStatus == PDH_CSTATUS_VALID_DATA || it.FmtValue.CStatus == 1 {
                    let name = it.szName.to_string().unwrap_or_default();
                    samples.push((name, it.FmtValue.Anonymous.doubleValue));
                }
            }
            descall_node::game::gpu_from_instances(&samples)
        }
    }

    fn foreground_exe() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            r.ok()?;
            Some(descall_node::game::normalize_exe(&String::from_utf16_lossy(&buf[..len as usize])))
        }
    }

    pub fn sample(&mut self, now: u64) -> descall_node::game::Sample {
        let exclusive = unsafe { SHQueryUserNotificationState() }.map(|s| s == QUNS_RUNNING_D3D_FULL_SCREEN).unwrap_or(false);
        descall_node::game::Sample { t_ms: now, exclusive_fullscreen: exclusive, gpu_pct: self.gpu(), foreground_exe: Self::foreground_exe() }
    }
}

impl Drop for Probe {
    fn drop(&mut self) {
        if let Some((q, _)) = self.query.take() {
            unsafe {
                let _ = PdhCloseQuery(q);
            }
        }
    }
}
