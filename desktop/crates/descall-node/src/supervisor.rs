//! The supervisor state machine: what the PC node should be doing, as a pure function of
//! events. The app feeds it events (a child exited, the backend answered health, the owner
//! pressed Pause, a game started, Windows is shutting down, a second passed...) and executes
//! the commands it returns (spawn, stop, drain, report state, exit). No clock, no I/O here.
//!
//! ```text
//!  Setup --configured--> Starting --backend ready--> Active <--> Game (smaller share)
//!                           ^  \--exit/timeout--> Backoff --timer--> Starting
//!                           |                       \--5 crashes / 10 min--> Error
//!  Paused <--drain done-- Draining <--pause / schedule out / game handover / shutdown--
//!  Drained <--drain done-- Draining <--"Boşalt" (stay up, no users) ; Resume -> Active
//! ```
//!
//! Every way out of serving users goes through Draining: the backend sends `node:move` to its
//! sockets and the app waits until they are gone or [`crate::local_api::DRAIN_TIMEOUT_MS`]
//! passed, then stops the processes.

use crate::cfg::PcCfg;
use crate::local_api::DRAIN_TIMEOUT_MS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Required setup values are missing.
    Setup,
    Stopped,
    Starting,
    Active,
    /// Serving on the game-mode share.
    Game,
    Draining,
    /// Drained by the owner ("Boşalt"): processes up, no users, until Resume.
    Drained,
    Paused,
    Backoff,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseWhy {
    Manual,
    Schedule,
    Game,
    Suspend,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// Five unexpected exits within ten minutes.
    Crashing,
    /// The primary answered 401 / 403: the node key was revoked.
    KeyRevoked,
    /// node.exe / cloudflared.exe / the backend folder is missing or fails its checksum.
    Runtime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Goal {
    Pause,
    Restart,
    Exit,
    Stay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Proc {
    Backend,
    Tunnel,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// App start: are the required setup values stored?
    Boot { configured: bool },
    /// The setup form saved a complete set (also after a revoked key was replaced).
    Configured,
    /// The owner deleted the stored secrets ("Gizlileri sil ve durdur").
    Unconfigured,
    BackendReady,
    TunnelReady,
    Exited { what: Proc, code: Option<i32> },
    /// Could not start a child; `fatal`: the runtime itself is broken (missing, bad checksum).
    SpawnFailed { what: Proc, fatal: bool },
    Pause,
    Resume,
    Drain,
    Retry,
    /// Sockets left on this node while draining (from the local status endpoint).
    DrainProgress { remaining: u32 },
    /// The backend has no local drain endpoint: stop it (clients reconnect to Render).
    DrainUnsupported,
    Schedule { in_slot: bool },
    Game { active: bool },
    Cfg(PcCfg),
    /// WM_ENDSESSION, service stop, tray Quit.
    Shutdown,
    /// PBT_APMSUSPEND.
    Suspend,
    /// PBT_APMRESUMEAUTOMATIC.
    PowerResume,
    KeyRevoked,
    Tick,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Cmd {
    SpawnBackend { share_mb: u32, cores: u32 },
    SpawnTunnel,
    StopBackend,
    StopTunnel,
    /// Ask the local backend to move its users (`/api/node/local/drain`).
    StartDrain { reason: &'static str },
    /// Tell the local backend its contract state (`/api/node/local/state`).
    ReportState { state: &'static str, game_mode: bool, memory_mb: u32 },
    /// New CPU cap on the running job (no restart).
    SetCpu { cores: u32 },
    /// `/api/node/drain-done` to the primary.
    DrainDone,
    /// An unexpected stop of a child (the popover's "kopma" count).
    CountDrop { what: Proc },
    /// Everything stopped: the app may exit now.
    Exit,
}

pub const START_TIMEOUT_MS: u64 = 120_000;
pub const BACKOFF_BASE_MS: u64 = 1_000;
pub const BACKOFF_MAX_MS: u64 = 60_000;
pub const CRASH_WINDOW_MS: u64 = 10 * 60_000;
pub const CRASH_LIMIT: usize = 5;
/// Running this long without a crash forgets the backoff.
pub const STABLE_MS: u64 = 5 * 60_000;

#[derive(Debug, Clone)]
pub struct Supervisor {
    phase: Phase,
    cfg: PcCfg,
    configured: bool,
    manual_pause: bool,
    schedule_in: bool,
    game: bool,
    suspended: bool,
    exiting: bool,
    revoked: bool,
    goal: Option<Goal>,
    drain_reason: &'static str,
    drain_deadline: u64,
    backend_running: bool,
    backend_stopping: bool,
    backend_ready: bool,
    tunnel_running: bool,
    tunnel_stopping: bool,
    tunnel_ready: bool,
    running_share_mb: u32,
    running_cores: u32,
    starting_since: u64,
    crashes: Vec<u64>,
    attempt: u32,
    retry_at: u64,
    tunnel_attempt: u32,
    tunnel_retry_at: Option<u64>,
    stable_since: Option<u64>,
    error: Option<ErrorKind>,
    exit_sent: bool,
    reported: Option<(&'static str, bool, u32)>,
}

impl Supervisor {
    pub fn new(cfg: PcCfg) -> Supervisor {
        Supervisor {
            phase: Phase::Stopped,
            cfg,
            configured: false,
            manual_pause: false,
            schedule_in: true,
            game: false,
            suspended: false,
            exiting: false,
            revoked: false,
            goal: None,
            drain_reason: "",
            drain_deadline: 0,
            backend_running: false,
            backend_stopping: false,
            backend_ready: false,
            tunnel_running: false,
            tunnel_stopping: false,
            tunnel_ready: false,
            running_share_mb: 0,
            running_cores: 0,
            starting_since: 0,
            crashes: Vec::new(),
            attempt: 0,
            retry_at: 0,
            tunnel_attempt: 0,
            tunnel_retry_at: None,
            stable_since: None,
            error: None,
            exit_sent: false,
            reported: None,
        }
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }
    pub fn error(&self) -> Option<ErrorKind> {
        self.error
    }
    pub fn cfg(&self) -> &PcCfg {
        &self.cfg
    }
    pub fn manual_pause(&self) -> bool {
        self.manual_pause
    }
    pub fn tunnel_ready(&self) -> bool {
        self.tunnel_ready
    }
    pub fn backend_ready(&self) -> bool {
        self.backend_ready
    }
    pub fn running_share_mb(&self) -> u32 {
        self.running_share_mb
    }
    pub fn retry_at(&self) -> Option<u64> {
        (self.phase == Phase::Backoff).then_some(self.retry_at)
    }
    pub fn drain_goal(&self) -> Option<Goal> {
        self.goal
    }
    /// Why the current or last drain started ("pause", "schedule", "game", "shutdown"...).
    pub fn drain_reason(&self) -> &'static str {
        self.drain_reason
    }
    pub fn crashes_in_window(&self) -> usize {
        self.crashes.len()
    }

    /// Why the node is paused (or about to be), most important first.
    pub fn pause_why(&self) -> Option<PauseWhy> {
        if self.suspended {
            Some(PauseWhy::Suspend)
        } else if self.manual_pause {
            Some(PauseWhy::Manual)
        } else if self.game && self.cfg.game_hands_over() {
            Some(PauseWhy::Game)
        } else if !self.schedule_in {
            Some(PauseWhy::Schedule)
        } else {
            None
        }
    }

    fn want_running(&self) -> bool {
        self.configured && !self.revoked && !self.exiting && self.error.is_none() && self.pause_why().is_none()
    }

    fn target_share(&self) -> u32 {
        self.cfg.effective_mb(self.game)
    }

    /// Contract state of the node (`dc:nodes.state`).
    pub fn contract_state(&self) -> &'static str {
        match self.phase {
            Phase::Active | Phase::Game => "active",
            Phase::Draining | Phase::Drained => "draining",
            Phase::Paused => "paused",
            _ => "down",
        }
    }

    pub fn handle(&mut self, ev: Event, now: u64) -> Vec<Cmd> {
        let mut out = Vec::new();
        match ev {
            Event::Boot { configured } => {
                self.configured = configured;
                self.phase = if configured { Phase::Stopped } else { Phase::Setup };
            }
            Event::Configured => {
                self.configured = true;
                if self.revoked || self.error == Some(ErrorKind::KeyRevoked) {
                    self.revoked = false;
                    self.error = None;
                }
                if self.phase == Phase::Setup || (self.phase == Phase::Error && self.error.is_none()) {
                    self.phase = Phase::Stopped;
                }
            }
            Event::Unconfigured => {
                self.configured = false;
                if self.error == Some(ErrorKind::KeyRevoked) {
                    self.error = None;
                    self.revoked = false;
                    self.phase = Phase::Setup;
                }
            }
            Event::BackendReady => {
                self.backend_ready = true;
                if self.phase == Phase::Starting {
                    self.phase = if self.target_share() < self.cfg.ram_mb { Phase::Game } else { Phase::Active };
                    self.stable_since = Some(now);
                }
            }
            Event::TunnelReady => {
                self.tunnel_ready = true;
                self.tunnel_attempt = 0;
            }
            Event::Exited { what: Proc::Backend, .. } => {
                self.backend_running = false;
                self.backend_ready = false;
                if std::mem::take(&mut self.backend_stopping) {
                    // Expected: a restart spawns again in reconcile.
                } else if self.phase == Phase::Draining {
                    // Died while draining: its users are gone anyway.
                    out.push(Cmd::CountDrop { what: Proc::Backend });
                    self.finish_drain(now, &mut out, false);
                } else if matches!(self.phase, Phase::Starting | Phase::Active | Phase::Game | Phase::Drained) {
                    self.crash(now, &mut out);
                }
            }
            Event::Exited { what: Proc::Tunnel, .. } => {
                self.tunnel_running = false;
                self.tunnel_ready = false;
                let expected = std::mem::take(&mut self.tunnel_stopping);
                if self.want_running() && matches!(self.phase, Phase::Starting | Phase::Active | Phase::Game | Phase::Drained) {
                    if expected {
                        // Stopped for a pause that was taken back before it ended.
                        self.tunnel_running = true;
                        out.push(Cmd::SpawnTunnel);
                    } else {
                        out.push(Cmd::CountDrop { what: Proc::Tunnel });
                        self.tunnel_attempt += 1;
                        self.tunnel_retry_at = Some(now + backoff_ms(self.tunnel_attempt));
                    }
                }
            }
            Event::SpawnFailed { what, fatal } => {
                match what {
                    Proc::Backend => self.backend_running = false,
                    Proc::Tunnel => self.tunnel_running = false,
                }
                if fatal {
                    self.fail(ErrorKind::Runtime, &mut out);
                } else if what == Proc::Backend {
                    self.crash(now, &mut out);
                } else {
                    self.tunnel_attempt += 1;
                    self.tunnel_retry_at = Some(now + backoff_ms(self.tunnel_attempt));
                }
            }
            Event::Pause => self.manual_pause = true,
            Event::Resume => {
                self.manual_pause = false;
                if self.phase == Phase::Drained {
                    self.phase = if self.target_share() < self.cfg.ram_mb { Phase::Game } else { Phase::Active };
                }
            }
            Event::Drain => {
                if matches!(self.phase, Phase::Active | Phase::Game) {
                    self.begin_drain(Goal::Stay, "drain", now, &mut out);
                }
            }
            Event::Retry => {
                if self.phase == Phase::Error && self.error != Some(ErrorKind::KeyRevoked) {
                    self.error = None;
                    self.crashes.clear();
                    self.attempt = 0;
                    self.phase = Phase::Stopped;
                } else if self.phase == Phase::Backoff {
                    self.retry_at = now;
                }
            }
            Event::DrainProgress { remaining } => {
                if self.phase == Phase::Draining && remaining == 0 {
                    self.finish_drain(now, &mut out, true);
                }
            }
            Event::DrainUnsupported => {
                if self.phase == Phase::Draining {
                    self.finish_drain(now, &mut out, false);
                }
            }
            Event::Schedule { in_slot } => self.schedule_in = in_slot,
            Event::Game { active } => self.game = active,
            Event::Cfg(next) => {
                let cores_changed = next.cores != self.cfg.cores;
                self.cfg = next;
                if cores_changed && self.backend_running && matches!(self.phase, Phase::Active | Phase::Game | Phase::Drained | Phase::Draining) {
                    self.running_cores = self.cfg.cores;
                    out.push(Cmd::SetCpu { cores: self.cfg.cores });
                }
            }
            Event::Shutdown => self.exiting = true,
            Event::Suspend => self.suspended = true,
            Event::PowerResume => self.suspended = false,
            Event::KeyRevoked => self.revoked = true,
            Event::Tick => self.tick(now, &mut out),
        }
        self.reconcile(now, &mut out);
        self.report(&mut out);
        out
    }

    fn tick(&mut self, now: u64, out: &mut Vec<Cmd>) {
        match self.phase {
            Phase::Draining if now >= self.drain_deadline => self.finish_drain(now, out, false),
            Phase::Starting if self.backend_running && !self.backend_stopping && now.saturating_sub(self.starting_since) >= START_TIMEOUT_MS => {
                // Never answered health: stop it and count it as a crash.
                self.backend_stopping = true;
                out.push(Cmd::StopBackend);
                self.crash(now, out);
            }
            Phase::Backoff if now >= self.retry_at && self.want_running() => self.start(now, out),
            Phase::Active | Phase::Game if self.stable_since.is_some_and(|t| now.saturating_sub(t) >= STABLE_MS) => {
                self.attempt = 0;
                self.crashes.retain(|t| now.saturating_sub(*t) < CRASH_WINDOW_MS);
            }
            _ => {}
        }
        if let Some(at) = self.tunnel_retry_at {
            if now >= at && !self.tunnel_running && self.want_running() && matches!(self.phase, Phase::Starting | Phase::Active | Phase::Game | Phase::Drained) {
                self.tunnel_retry_at = None;
                self.tunnel_running = true;
                out.push(Cmd::SpawnTunnel);
            }
        }
    }

    fn reconcile(&mut self, now: u64, out: &mut Vec<Cmd>) {
        if self.exiting && !self.exit_sent && !matches!(self.phase, Phase::Draining) {
            if self.backend_running && self.backend_ready && matches!(self.phase, Phase::Active | Phase::Game | Phase::Drained | Phase::Starting) {
                self.begin_drain(Goal::Exit, "shutdown", now, out);
            } else {
                self.stop_all(out);
                self.phase = Phase::Stopped;
                self.exit_sent = true;
                out.push(Cmd::Exit);
            }
            return;
        }
        match self.phase {
            Phase::Setup => {
                if self.configured {
                    self.phase = Phase::Stopped;
                    self.reconcile(now, out);
                }
            }
            Phase::Error | Phase::Draining => {}
            Phase::Backoff => {
                if !self.want_running() {
                    self.stop_all(out);
                    self.phase = self.idle_phase();
                }
            }
            Phase::Stopped | Phase::Paused => {
                if self.want_running() {
                    self.start(now, out);
                } else {
                    self.phase = self.idle_phase();
                }
            }
            Phase::Starting | Phase::Active | Phase::Game | Phase::Drained => {
                if !self.want_running() {
                    let reason = match self.pause_why() {
                        Some(PauseWhy::Schedule) => "schedule",
                        Some(PauseWhy::Game) => "game",
                        Some(PauseWhy::Suspend) => "suspend",
                        _ if self.revoked => "revoked",
                        _ => "pause",
                    };
                    self.begin_drain(Goal::Pause, reason, now, out);
                } else if self.backend_running && !self.backend_stopping && self.running_share_mb != self.target_share() && self.phase != Phase::Starting {
                    let reason = if self.game { "game" } else { "rebalance" };
                    self.begin_drain(Goal::Restart, reason, now, out);
                } else if self.phase == Phase::Starting && !self.backend_running && !self.backend_stopping {
                    // Restart: the old process is gone, start the new one.
                    self.start(now, out);
                } else if matches!(self.phase, Phase::Active | Phase::Game) {
                    self.phase = if self.running_share_mb < self.cfg.ram_mb { Phase::Game } else { Phase::Active };
                }
            }
        }
    }

    fn idle_phase(&self) -> Phase {
        if !self.configured {
            Phase::Setup
        } else if self.revoked {
            Phase::Error
        } else if self.pause_why().is_some() {
            Phase::Paused
        } else {
            Phase::Stopped
        }
    }

    fn start(&mut self, now: u64, out: &mut Vec<Cmd>) {
        if !self.configured {
            self.phase = Phase::Setup;
            return;
        }
        self.phase = Phase::Starting;
        self.starting_since = now;
        if !self.tunnel_running {
            self.tunnel_running = true;
            self.tunnel_retry_at = None;
            out.push(Cmd::SpawnTunnel);
        }
        if !self.backend_running && !self.backend_stopping {
            let share = self.target_share();
            self.backend_running = true;
            self.backend_ready = false;
            self.running_share_mb = share;
            self.running_cores = self.cfg.cores;
            out.push(Cmd::SpawnBackend { share_mb: share, cores: self.cfg.cores });
        }
    }

    fn begin_drain(&mut self, goal: Goal, reason: &'static str, now: u64, out: &mut Vec<Cmd>) {
        self.goal = Some(goal);
        self.drain_reason = reason;
        if !(self.backend_running && self.backend_ready) {
            self.finish_drain(now, out, false);
            return;
        }
        self.phase = Phase::Draining;
        self.drain_deadline = now + DRAIN_TIMEOUT_MS;
        out.push(Cmd::StartDrain { reason });
    }

    fn finish_drain(&mut self, now: u64, out: &mut Vec<Cmd>, drained: bool) {
        let goal = self.goal.take().unwrap_or(Goal::Pause);
        if drained || self.backend_running {
            out.push(Cmd::DrainDone);
        }
        match goal {
            Goal::Stay => self.phase = Phase::Drained,
            Goal::Pause => {
                self.stop_all(out);
                self.phase = if self.revoked {
                    self.error = Some(ErrorKind::KeyRevoked);
                    Phase::Error
                } else {
                    self.idle_phase()
                };
            }
            Goal::Exit => {
                self.stop_all(out);
                self.phase = Phase::Stopped;
                self.exit_sent = true;
                out.push(Cmd::Exit);
            }
            Goal::Restart => {
                if self.backend_running {
                    self.backend_stopping = true;
                    out.push(Cmd::StopBackend);
                }
                self.backend_ready = false;
                self.phase = Phase::Starting;
                self.starting_since = now;
            }
        }
    }

    fn stop_all(&mut self, out: &mut Vec<Cmd>) {
        if self.backend_running && !self.backend_stopping {
            self.backend_stopping = true;
            out.push(Cmd::StopBackend);
        }
        if self.tunnel_running && !self.tunnel_stopping {
            self.tunnel_stopping = true;
            out.push(Cmd::StopTunnel);
        }
        self.tunnel_retry_at = None;
        self.backend_ready = false;
    }

    fn crash(&mut self, now: u64, out: &mut Vec<Cmd>) {
        out.push(Cmd::CountDrop { what: Proc::Backend });
        self.backend_ready = false;
        self.stable_since = None;
        self.crashes.push(now);
        self.crashes.retain(|t| now.saturating_sub(*t) < CRASH_WINDOW_MS);
        if self.crashes.len() >= CRASH_LIMIT {
            self.fail(ErrorKind::Crashing, out);
            return;
        }
        self.attempt += 1;
        self.retry_at = now + backoff_ms(self.attempt);
        self.phase = Phase::Backoff;
    }

    fn fail(&mut self, kind: ErrorKind, out: &mut Vec<Cmd>) {
        self.stop_all(out);
        self.error = Some(kind);
        self.phase = Phase::Error;
    }

    fn report(&mut self, out: &mut Vec<Cmd>) {
        if !self.backend_ready {
            self.reported = None;
            return;
        }
        let now = (self.contract_state(), self.phase == Phase::Game, self.running_share_mb);
        if self.reported != Some(now) && !matches!(self.phase, Phase::Draining) {
            self.reported = Some(now);
            out.push(Cmd::ReportState { state: now.0, game_mode: now.1, memory_mb: now.2 });
        }
    }
}

/// 1 s, 2 s, 4 s ... 60 s.
pub fn backoff_ms(attempt: u32) -> u64 {
    (BACKOFF_BASE_MS << attempt.saturating_sub(1).min(16)).min(BACKOFF_MAX_MS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cfg(ram: u32, share: u32, handover: bool) -> PcCfg {
        PcCfg::from_value(&json!({ "ramMb": ram, "cores": 4, "gameMode": { "enabled": true, "shareMb": share, "fullHandover": handover } }))
    }

    fn running(c: PcCfg) -> Supervisor {
        let mut s = Supervisor::new(c);
        s.handle(Event::Boot { configured: true }, 0);
        s.handle(Event::Tick, 0);
        s.handle(Event::BackendReady, 1_000);
        s.handle(Event::TunnelReady, 1_000);
        assert_eq!(s.phase(), Phase::Active);
        s
    }

    fn has(out: &[Cmd], c: &Cmd) -> bool {
        out.contains(c)
    }

    #[test]
    fn setup_first_then_start() {
        let mut s = Supervisor::new(PcCfg::default());
        assert!(s.handle(Event::Boot { configured: false }, 0).is_empty());
        assert_eq!(s.phase(), Phase::Setup);
        let out = s.handle(Event::Configured, 10);
        assert_eq!(s.phase(), Phase::Starting);
        assert!(has(&out, &Cmd::SpawnTunnel));
        assert!(has(&out, &Cmd::SpawnBackend { share_mb: 2048, cores: 2 }));
        let out = s.handle(Event::BackendReady, 20);
        assert_eq!(s.phase(), Phase::Active);
        assert_eq!(out, vec![Cmd::ReportState { state: "active", game_mode: false, memory_mb: 2048 }]);
        assert!(s.handle(Event::Tick, 30).is_empty(), "no repeated report");
    }

    #[test]
    fn crash_backs_off_then_restarts() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Exited { what: Proc::Backend, code: Some(1) }, 5_000);
        assert!(has(&out, &Cmd::CountDrop { what: Proc::Backend }));
        assert_eq!(s.phase(), Phase::Backoff);
        assert_eq!(s.retry_at(), Some(6_000));
        assert!(s.handle(Event::Tick, 5_500).is_empty());
        let out = s.handle(Event::Tick, 6_000);
        assert_eq!(s.phase(), Phase::Starting);
        assert_eq!(out, vec![Cmd::SpawnBackend { share_mb: 3072, cores: 4 }], "the tunnel kept running");
        assert_eq!(backoff_ms(1), 1_000);
        assert_eq!(backoff_ms(3), 4_000);
        assert_eq!(backoff_ms(40), 60_000);
    }

    #[test]
    fn five_crashes_in_ten_minutes_is_an_error_until_retry() {
        let mut s = running(cfg(3072, 1024, false));
        let mut t = 10_000;
        for i in 0..CRASH_LIMIT {
            s.handle(Event::Exited { what: Proc::Backend, code: Some(1) }, t);
            if i + 1 < CRASH_LIMIT {
                t += 61_000;
                s.handle(Event::Tick, t);
                s.handle(Event::BackendReady, t);
            }
        }
        assert_eq!(s.phase(), Phase::Error);
        assert_eq!(s.error(), Some(ErrorKind::Crashing));
        assert!(s.handle(Event::Tick, t + 600_000).is_empty(), "stays down");
        let out = s.handle(Event::Retry, t + 600_001);
        assert_eq!(s.phase(), Phase::Starting);
        assert!(has(&out, &Cmd::SpawnBackend { share_mb: 3072, cores: 4 }));
    }

    #[test]
    fn pause_drains_then_stops_and_resume_starts() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Pause, 2_000);
        assert_eq!(s.phase(), Phase::Draining);
        assert_eq!(out, vec![Cmd::StartDrain { reason: "pause" }]);
        assert!(s.handle(Event::DrainProgress { remaining: 12 }, 3_000).is_empty());
        let out = s.handle(Event::DrainProgress { remaining: 0 }, 4_000);
        assert_eq!(out, vec![Cmd::DrainDone, Cmd::StopBackend, Cmd::StopTunnel]);
        assert_eq!(s.phase(), Phase::Paused);
        assert_eq!(s.pause_why(), Some(PauseWhy::Manual));
        // The expected exits are not crashes.
        assert!(s.handle(Event::Exited { what: Proc::Backend, code: Some(0) }, 4_100).is_empty());
        assert!(s.handle(Event::Exited { what: Proc::Tunnel, code: Some(0) }, 4_100).is_empty());
        assert_eq!(s.contract_state(), "paused");
        let out = s.handle(Event::Resume, 9_000);
        assert_eq!(s.phase(), Phase::Starting);
        assert_eq!(out, vec![Cmd::SpawnTunnel, Cmd::SpawnBackend { share_mb: 3072, cores: 4 }]);
    }

    #[test]
    fn drain_gives_up_after_ten_seconds() {
        let mut s = running(cfg(3072, 1024, false));
        s.handle(Event::Pause, 2_000);
        assert!(s.handle(Event::Tick, 11_999).is_empty());
        let out = s.handle(Event::Tick, 12_000);
        assert_eq!(out, vec![Cmd::DrainDone, Cmd::StopBackend, Cmd::StopTunnel]);
        assert_eq!(s.phase(), Phase::Paused);
    }

    #[test]
    fn backend_without_local_drain_is_just_stopped() {
        let mut s = running(cfg(3072, 1024, false));
        s.handle(Event::Pause, 2_000);
        let out = s.handle(Event::DrainUnsupported, 2_100);
        assert!(has(&out, &Cmd::StopBackend));
        assert_eq!(s.phase(), Phase::Paused);
    }

    #[test]
    fn schedule_out_pauses_and_in_starts() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Schedule { in_slot: false }, 2_000);
        assert_eq!(out, vec![Cmd::StartDrain { reason: "schedule" }]);
        s.handle(Event::DrainProgress { remaining: 0 }, 3_000);
        assert_eq!((s.phase(), s.pause_why()), (Phase::Paused, Some(PauseWhy::Schedule)));
        s.handle(Event::Exited { what: Proc::Backend, code: Some(0) }, 3_100);
        s.handle(Event::Exited { what: Proc::Tunnel, code: Some(0) }, 3_100);
        // Manual pause outlives the schedule.
        s.handle(Event::Pause, 3_200);
        assert!(s.handle(Event::Schedule { in_slot: true }, 4_000).is_empty());
        assert_eq!(s.pause_why(), Some(PauseWhy::Manual));
        let out = s.handle(Event::Resume, 5_000);
        assert!(has(&out, &Cmd::SpawnBackend { share_mb: 3072, cores: 4 }));
    }

    #[test]
    fn game_with_a_share_restarts_smaller_and_back() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Game { active: true }, 2_000);
        assert_eq!(out, vec![Cmd::StartDrain { reason: "game" }]);
        let out = s.handle(Event::DrainProgress { remaining: 0 }, 3_000);
        assert_eq!(out, vec![Cmd::DrainDone, Cmd::StopBackend]);
        assert_eq!(s.phase(), Phase::Starting);
        let out = s.handle(Event::Exited { what: Proc::Backend, code: Some(0) }, 3_200);
        assert_eq!(out, vec![Cmd::SpawnBackend { share_mb: 1024, cores: 4 }]);
        let out = s.handle(Event::BackendReady, 4_000);
        assert_eq!(s.phase(), Phase::Game);
        assert_eq!(out, vec![Cmd::ReportState { state: "active", game_mode: true, memory_mb: 1024 }]);
        // The game ends: back to the full share the same way.
        let out = s.handle(Event::Game { active: false }, 100_000);
        assert_eq!(out, vec![Cmd::StartDrain { reason: "rebalance" }]);
        s.handle(Event::DrainProgress { remaining: 0 }, 101_000);
        let out = s.handle(Event::Exited { what: Proc::Backend, code: Some(0) }, 101_100);
        assert_eq!(out, vec![Cmd::SpawnBackend { share_mb: 3072, cores: 4 }]);
        s.handle(Event::BackendReady, 102_000);
        assert_eq!(s.phase(), Phase::Active);
    }

    #[test]
    fn game_handover_pauses() {
        let mut s = running(cfg(3072, 1024, true));
        s.handle(Event::Game { active: true }, 2_000);
        s.handle(Event::DrainProgress { remaining: 0 }, 3_000);
        assert_eq!((s.phase(), s.pause_why()), (Phase::Paused, Some(PauseWhy::Game)));
        s.handle(Event::Exited { what: Proc::Backend, code: None }, 3_100);
        s.handle(Event::Exited { what: Proc::Tunnel, code: None }, 3_100);
        let out = s.handle(Event::Game { active: false }, 70_000);
        assert!(has(&out, &Cmd::SpawnBackend { share_mb: 3072, cores: 4 }));
    }

    #[test]
    fn shutdown_drains_then_exits() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Shutdown, 2_000);
        assert_eq!(out, vec![Cmd::StartDrain { reason: "shutdown" }]);
        let out = s.handle(Event::DrainProgress { remaining: 0 }, 2_500);
        assert_eq!(out, vec![Cmd::DrainDone, Cmd::StopBackend, Cmd::StopTunnel, Cmd::Exit]);
        assert!(s.handle(Event::Tick, 3_000).is_empty(), "Exit once");
        // Not running: exit at once.
        let mut idle = Supervisor::new(PcCfg::default());
        idle.handle(Event::Boot { configured: false }, 0);
        assert_eq!(idle.handle(Event::Shutdown, 1), vec![Cmd::Exit]);
    }

    #[test]
    fn suspend_and_power_resume() {
        let mut s = running(cfg(3072, 1024, false));
        assert_eq!(s.handle(Event::Suspend, 2_000), vec![Cmd::StartDrain { reason: "suspend" }]);
        s.handle(Event::Tick, 12_000);
        assert_eq!(s.pause_why(), Some(PauseWhy::Suspend));
        s.handle(Event::Exited { what: Proc::Backend, code: None }, 12_100);
        s.handle(Event::Exited { what: Proc::Tunnel, code: None }, 12_100);
        let out = s.handle(Event::PowerResume, 50_000);
        assert!(has(&out, &Cmd::SpawnTunnel));
    }

    #[test]
    fn owner_drain_stays_up_until_resume() {
        let mut s = running(cfg(3072, 1024, false));
        s.handle(Event::Drain, 2_000);
        let out = s.handle(Event::DrainProgress { remaining: 0 }, 3_000);
        assert_eq!(s.phase(), Phase::Drained);
        assert_eq!(out, vec![Cmd::DrainDone, Cmd::ReportState { state: "draining", game_mode: false, memory_mb: 3072 }]);
        let out = s.handle(Event::Resume, 9_000);
        assert_eq!(s.phase(), Phase::Active);
        assert_eq!(out, vec![Cmd::ReportState { state: "active", game_mode: false, memory_mb: 3072 }]);
    }

    #[test]
    fn cfg_changes() {
        let mut s = running(cfg(3072, 1024, false));
        let mut c = s.cfg().clone();
        c.cores = 6;
        assert_eq!(s.handle(Event::Cfg(c.clone()), 2_000), vec![Cmd::SetCpu { cores: 6 }]);
        c.ram_mb = 4096;
        assert_eq!(s.handle(Event::Cfg(c), 3_000), vec![Cmd::StartDrain { reason: "rebalance" }]);
    }

    #[test]
    fn revoked_key_stops_until_a_new_key() {
        let mut s = running(cfg(3072, 1024, false));
        assert_eq!(s.handle(Event::KeyRevoked, 2_000), vec![Cmd::StartDrain { reason: "revoked" }]);
        s.handle(Event::DrainProgress { remaining: 0 }, 3_000);
        assert_eq!((s.phase(), s.error()), (Phase::Error, Some(ErrorKind::KeyRevoked)));
        s.handle(Event::Exited { what: Proc::Backend, code: None }, 3_100);
        s.handle(Event::Exited { what: Proc::Tunnel, code: None }, 3_100);
        assert!(s.handle(Event::Retry, 4_000).is_empty(), "retry does not bypass a revoked key");
        let out = s.handle(Event::Configured, 5_000);
        assert!(has(&out, &Cmd::SpawnBackend { share_mb: 3072, cores: 4 }));
    }

    #[test]
    fn start_timeout_counts_as_a_crash() {
        let mut s = Supervisor::new(cfg(3072, 1024, false));
        s.handle(Event::Boot { configured: true }, 0);
        s.handle(Event::Tick, 0);
        let out = s.handle(Event::Tick, START_TIMEOUT_MS);
        assert!(has(&out, &Cmd::StopBackend) && has(&out, &Cmd::CountDrop { what: Proc::Backend }));
        assert_eq!(s.phase(), Phase::Backoff);
        // Its exit afterwards is expected.
        assert!(s.handle(Event::Exited { what: Proc::Backend, code: None }, START_TIMEOUT_MS + 10).is_empty());
    }

    #[test]
    fn tunnel_crash_restarts_only_the_tunnel() {
        let mut s = running(cfg(3072, 1024, false));
        let out = s.handle(Event::Exited { what: Proc::Tunnel, code: Some(1) }, 5_000);
        assert_eq!(out, vec![Cmd::CountDrop { what: Proc::Tunnel }]);
        assert_eq!(s.phase(), Phase::Active);
        assert!(s.handle(Event::Tick, 5_500).is_empty());
        assert_eq!(s.handle(Event::Tick, 6_000), vec![Cmd::SpawnTunnel]);
    }

    #[test]
    fn wiping_the_secrets_stops_and_asks_for_setup() {
        let mut s = running(cfg(3072, 1024, false));
        assert_eq!(s.handle(Event::Unconfigured, 2_000), vec![Cmd::StartDrain { reason: "pause" }]);
        s.handle(Event::DrainProgress { remaining: 0 }, 2_500);
        assert_eq!(s.phase(), Phase::Setup);
    }

    #[test]
    fn broken_runtime_is_an_error() {
        let mut s = Supervisor::new(PcCfg::default());
        s.handle(Event::Boot { configured: true }, 0);
        s.handle(Event::Tick, 0);
        let out = s.handle(Event::SpawnFailed { what: Proc::Backend, fatal: true }, 10);
        assert_eq!(s.error(), Some(ErrorKind::Runtime));
        assert!(has(&out, &Cmd::StopTunnel));
    }
}
