//! Game mode detector. The app samples the desktop every few seconds (Windows: the shell's
//! "D3D full screen" notification state, the foreground window and the 3D engine utilisation
//! of every GPU) and feeds the samples here; this decides when a game starts and ends.
//!
//! A game is on when the foreground app runs full-screen exclusive, when the foreground exe is
//! on the owner's game list, or when the GPU stays above 80 % for 30 s. It ends 60 s after
//! none of those hold (alt-tab, loading screens and short menus do not flap the share).
//! Apps on the ignore list (OBS, the browser, Descall itself...) never count.

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sample {
    pub t_ms: u64,
    /// SHQueryUserNotificationState == QUNS_RUNNING_D3D_FULL_SCREEN.
    pub exclusive_fullscreen: bool,
    /// 3D engine utilisation, the busiest GPU (0..100).
    pub gpu_pct: f32,
    /// Lower-case image name of the foreground window's process ("cs2.exe").
    pub foreground_exe: Option<String>,
}

pub const GPU_HIGH_PCT: f32 = 80.0;
pub const GPU_HOLD_MS: u64 = 30_000;
pub const EXIT_HOLD_MS: u64 = 60_000;

/// Image names that are never a game, whatever they do with the GPU.
pub const DEFAULT_IGNORE: &[&str] = &[
    "descall.exe",
    "descallnode.exe",
    "obs64.exe",
    "msedge.exe",
    "chrome.exe",
    "firefox.exe",
    "explorer.exe",
    "vlc.exe",
    "mpc-hc64.exe",
    "premiere pro.exe",
    "davinciresolve.exe",
    "blender.exe",
    "lockapp.exe",
];

/// Image names treated as games even in borderless windowed mode (editable in the popover).
pub const DEFAULT_GAMES: &[&str] = &[
    "cs2.exe",
    "valorant-win64-shipping.exe",
    "fortniteclient-win64-shipping.exe",
    "javaw.exe",
    "minecraft.windows.exe",
    "leagueoflegends.exe",
    "r5apex.exe",
    "gta5.exe",
    "eldenring.exe",
    "rocketleague.exe",
    "overwatch.exe",
    "dota2.exe",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Exclusive,
    Listed,
    Gpu,
}

impl Reason {
    pub fn key(self) -> &'static str {
        match self {
            Reason::Exclusive => "game.reason.exclusive",
            Reason::Listed => "game.reason.listed",
            Reason::Gpu => "game.reason.gpu",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Change {
    pub active: bool,
    pub reason: Option<Reason>,
    pub exe: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Detector {
    gpu_high_since: Option<u64>,
    last_signal_ms: Option<u64>,
    active: bool,
    reason: Option<Reason>,
    exe: Option<String>,
}

pub fn normalize_exe(name: &str) -> String {
    let base = name.rsplit(['\\', '/']).next().unwrap_or(name).trim().to_lowercase();
    if base.is_empty() || base.ends_with(".exe") {
        base
    } else {
        format!("{base}.exe")
    }
}

impl Detector {
    pub fn active(&self) -> bool {
        self.active
    }
    pub fn reason(&self) -> Option<Reason> {
        self.reason
    }
    pub fn exe(&self) -> Option<&str> {
        self.exe.as_deref()
    }

    /// Feed one sample; returns a change when game mode starts or ends.
    pub fn update(&mut self, s: &Sample, games: &[String], ignore: &[String]) -> Option<Change> {
        let fg = s.foreground_exe.as_deref().map(normalize_exe);
        let ignored = fg.as_ref().is_some_and(|e| ignore.iter().any(|i| normalize_exe(i) == *e) || DEFAULT_IGNORE.contains(&e.as_str()));
        let listed = !ignored && fg.as_ref().is_some_and(|e| games.iter().any(|g| normalize_exe(g) == *e));
        let gpu_high = s.gpu_pct.is_finite() && s.gpu_pct > GPU_HIGH_PCT && !ignored;
        if gpu_high {
            self.gpu_high_since.get_or_insert(s.t_ms);
        } else {
            self.gpu_high_since = None;
        }
        let gpu_held = self.gpu_high_since.is_some_and(|t0| s.t_ms.saturating_sub(t0) >= GPU_HOLD_MS);
        let signal = if s.exclusive_fullscreen && !ignored {
            Some(Reason::Exclusive)
        } else if listed {
            Some(Reason::Listed)
        } else if gpu_held {
            Some(Reason::Gpu)
        } else {
            None
        };
        if let Some(r) = signal {
            self.last_signal_ms = Some(s.t_ms);
            if !self.active {
                self.active = true;
                self.reason = Some(r);
                self.exe = fg.clone();
                return Some(Change { active: true, reason: Some(r), exe: fg });
            }
            return None;
        }
        if self.active && self.last_signal_ms.is_none_or(|t| s.t_ms.saturating_sub(t) >= EXIT_HOLD_MS) {
            self.active = false;
            self.reason = None;
            self.exe = None;
            return Some(Change { active: false, reason: None, exe: None });
        }
        None
    }

    /// Game mode switched off in the cfg: forget an active game without a change event.
    pub fn reset(&mut self) {
        *self = Detector::default();
    }
}

/// Busiest GPU from the PDH counter `\GPU Engine(*engtype_3D)\Utilization Percentage`:
/// instance names look like `pid_1234_luid_0x0000_0x0000D2F1_phys_0_eng_0_engtype_3D`; the
/// engines of one adapter (same luid) add up, the adapter with the highest sum wins.
pub fn gpu_from_instances(samples: &[(String, f64)]) -> f32 {
    let mut per: Vec<(String, f64)> = Vec::new();
    for (name, v) in samples {
        if !v.is_finite() || *v < 0.0 {
            continue;
        }
        let luid = name.find("luid_").map(|i| name[i..].split("_phys").next().unwrap_or("").to_string()).unwrap_or_default();
        match per.iter_mut().find(|(k, _)| *k == luid) {
            Some((_, sum)) => *sum += v,
            None => per.push((luid, *v)),
        }
    }
    per.iter().map(|(_, s)| *s).fold(0.0, f64::max).min(100.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(t: u64, excl: bool, gpu: f32, exe: &str) -> Sample {
        Sample { t_ms: t * 1000, exclusive_fullscreen: excl, gpu_pct: gpu, foreground_exe: if exe.is_empty() { None } else { Some(exe.into()) } }
    }

    fn games() -> Vec<String> {
        DEFAULT_GAMES.iter().map(|g| g.to_string()).collect()
    }

    #[test]
    fn gpu_counter_instances() {
        let v = vec![
            ("pid_10_luid_0x00000000_0x0000D2F1_phys_0_eng_0_engtype_3D".to_string(), 40.0),
            ("pid_11_luid_0x00000000_0x0000D2F1_phys_0_eng_0_engtype_3D".to_string(), 45.5),
            ("pid_12_luid_0x00000000_0x0000AAAA_phys_0_eng_0_engtype_3D".to_string(), 20.0),
            ("pid_13_luid_0x00000000_0x0000AAAA_phys_0_eng_0_engtype_3D".to_string(), f64::NAN),
        ];
        assert!((gpu_from_instances(&v) - 85.5).abs() < 1e-3);
        assert_eq!(gpu_from_instances(&[("x".into(), 250.0)]), 100.0);
        assert_eq!(gpu_from_instances(&[]), 0.0);
    }

    #[test]
    fn exclusive_fullscreen_starts_at_once_and_ends_after_60s() {
        let mut d = Detector::default();
        assert_eq!(d.update(&s(0, false, 10.0, "explorer.exe"), &[], &[]), None);
        let c = d.update(&s(5, true, 40.0, "Game.exe"), &[], &[]).unwrap();
        assert!(c.active && c.reason == Some(Reason::Exclusive) && c.exe.as_deref() == Some("game.exe"));
        // Closed at 10 s: still on at 69 s, off at 70 s.
        assert_eq!(d.update(&s(10, true, 40.0, "game.exe"), &[], &[]), None);
        assert_eq!(d.update(&s(30, false, 5.0, "explorer.exe"), &[], &[]), None);
        assert_eq!(d.update(&s(69, false, 5.0, "explorer.exe"), &[], &[]), None);
        assert_eq!(d.update(&s(70, false, 5.0, "explorer.exe"), &[], &[]).map(|c| c.active), Some(false));
        assert!(!d.active());
    }

    #[test]
    fn gpu_must_stay_high_for_30s() {
        let mut d = Detector::default();
        for t in (0..30).step_by(5) {
            assert_eq!(d.update(&s(t, false, 92.0, "render.exe"), &[], &[]), None, "t={t}");
        }
        let c = d.update(&s(30, false, 92.0, "render.exe"), &[], &[]).unwrap();
        assert_eq!(c.reason, Some(Reason::Gpu));
    }

    #[test]
    fn a_dip_resets_the_gpu_timer() {
        let mut d = Detector::default();
        d.update(&s(0, false, 95.0, "x.exe"), &[], &[]);
        d.update(&s(20, false, 50.0, "x.exe"), &[], &[]);
        assert_eq!(d.update(&s(35, false, 95.0, "x.exe"), &[], &[]), None);
        assert_eq!(d.update(&s(60, false, 95.0, "x.exe"), &[], &[]), None);
        assert!(d.update(&s(65, false, 95.0, "x.exe"), &[], &[]).is_some());
    }

    #[test]
    fn listed_game_in_borderless_window() {
        let mut d = Detector::default();
        let c = d.update(&s(0, false, 30.0, r"C:\Games\CS2\cs2.exe"), &games(), &[]).unwrap();
        assert_eq!(c.reason, Some(Reason::Listed));
        assert_eq!(normalize_exe("Minecraft"), "minecraft.exe");
    }

    #[test]
    fn ignore_list_wins() {
        let mut d = Detector::default();
        assert_eq!(d.update(&s(0, true, 99.0, "obs64.exe"), &[], &[]), None);
        assert_eq!(d.update(&s(40, true, 99.0, "obs64.exe"), &[], &[]), None);
        let ignore = vec!["Blender".to_string(), "unity.exe".to_string()];
        let mut d = Detector::default();
        assert_eq!(d.update(&s(0, false, 99.0, "unity.exe"), &[], &ignore), None);
        assert_eq!(d.update(&s(40, false, 99.0, "unity.exe"), &[], &ignore), None);
        assert_eq!(d.update(&s(0, false, 99.0, "cs2.exe"), &games(), &["cs2.exe".into()]), None);
    }

    #[test]
    fn signal_while_active_keeps_it_on() {
        let mut d = Detector::default();
        d.update(&s(0, true, 0.0, "g.exe"), &[], &[]);
        for t in (10..300).step_by(10) {
            assert_eq!(d.update(&s(t, t % 50 == 0, 0.0, "g.exe"), &[], &[]), None, "t={t}");
        }
        assert!(d.active());
        d.reset();
        assert!(!d.active());
        assert_eq!(d.update(&s(1, false, f32::NAN, ""), &[], &[]), None);
    }
}
