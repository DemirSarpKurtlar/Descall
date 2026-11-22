//! The supervisor thread. It owns the pure state machine (descall_node::supervisor) and every
//! moving part around it: the two child processes and their Job Objects, health and status
//! polls of the local backend, the tunnel's readiness, schedule and game mode inputs, usage
//! counters, the register heartbeat's answers, and the popover / tray state it publishes.
//!
//! Everything arrives as a [`Msg`] on one channel; one loop handles it, runs the commands the
//! state machine returns, and once a second feeds it a Tick. Network calls to the primary run
//! on the async runtime and come back as messages.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use descall_node::cfg::{self, PcCfg};
use descall_node::env::{backend_env, tunnel_args, tunnel_env, NodeIdentity};
use descall_node::game::{Detector, Reason};
use descall_node::heartbeat::{self, Beat, Outcome};
use descall_node::limits::{self, JobLimits, Machine};
use descall_node::local_api;
use descall_node::logrotate::{child_level, Source};
use descall_node::manifest;
use descall_node::schedule;
use descall_node::secrets;
use descall_node::supervisor::{Cmd, ErrorKind, Event, Phase, Proc, Supervisor};
use descall_node::tray_icon::Tone;
use descall_node::usage::Usage;
use descall_node::view::{self, Live, Snapshot};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::logger::{self, now_ms};
use crate::settings::{self, Settings};
use crate::store;
use crate::sys::{self, GameProbe, Job};

const ISTANBUL_OFFSET: i32 = 180;
const SERIES_MAX: usize = 360;

pub enum Msg {
    Event(Event),
    Act(String),
    Cfg(Value),
    SetupChanged,
    /// The setup fetched the primary's environment (`at`) and / or the owner's skip choice.
    BootstrapInfo { at: Option<u64>, skip: bool },
    Wipe,
    Register(Outcome),
    Publish,
}

/// Lets the power watcher hold Windows' shutdown until the node has drained.
#[derive(Default)]
pub struct Signals {
    state: Mutex<(bool, bool)>,
    cv: Condvar,
}

impl Signals {
    fn set(&self, exit: Option<bool>, paused: Option<bool>) {
        if let Ok(mut s) = self.state.lock() {
            if let Some(e) = exit {
                s.0 = e;
            }
            if let Some(p) = paused {
                s.1 = p;
            }
            self.cv.notify_all();
        }
    }
    fn wait(&self, timeout: Duration, f: impl Fn(&(bool, bool)) -> bool) {
        let Ok(g) = self.state.lock() else { return };
        let _ = self.cv.wait_timeout_while(g, timeout, |s| !f(s));
    }
    pub fn wait_exit(&self, timeout: Duration) {
        self.wait(timeout, |s| s.0);
    }
    pub fn wait_paused(&self, timeout: Duration) {
        self.wait(timeout, |s| s.1 || s.0);
    }
}

/// What the register task needs from the supervisor thread.
#[derive(Clone, Default)]
pub struct BeatInfo {
    pub configured: bool,
    pub revoked: bool,
    pub id: String,
    pub url: String,
    pub memory_mb: u32,
    pub cores: u32,
    pub state: &'static str,
    pub game_mode: bool,
    pub phase: String,
    pub uptime_sec: u64,
    pub drops_today: u32,
    pub machine: Option<Machine>,
}

pub struct Shared {
    pub tx: Mutex<Sender<Msg>>,
    pub state: Mutex<Value>,
    pub beat: Mutex<BeatInfo>,
    pub signals: Arc<Signals>,
}

impl Shared {
    pub fn send(&self, m: Msg) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(m);
        }
    }
}

struct Running {
    child: Child,
    job: Option<Job>,
}

struct Runtime {
    root: PathBuf,
    verified: Option<bool>,
}

impl Runtime {
    fn node(&self) -> PathBuf {
        self.root.join("runtime").join(sys_exe("node"))
    }
    fn cloudflared(&self) -> PathBuf {
        self.root.join("runtime").join(sys_exe("cloudflared"))
    }
    fn backend_dir(&self) -> PathBuf {
        self.root.join("backend").join("frontend").join("backend")
    }
    fn runtime_dir(&self) -> PathBuf {
        self.root.join("runtime")
    }

    /// node.exe and cloudflared.exe against runtime-manifest.json (once per launch).
    fn verify(&mut self) -> bool {
        if let Some(v) = self.verified {
            return v;
        }
        let ok = match std::fs::read_to_string(self.root.join("runtime-manifest.json")).ok().and_then(|t| manifest::parse(&t)) {
            Some(m) => {
                let root = self.root.clone();
                let digest = move |p: &str| file_sha256(&root.join(p));
                let wanted = [format!("runtime/{}", sys_exe("node")), format!("runtime/{}", sys_exe("cloudflared"))];
                let w: Vec<&str> = wanted.iter().map(|s| s.as_str()).collect();
                match manifest::verify(&m, &w, &digest) {
                    manifest::Check::Ok => {
                        log::info!("[runtime] verified: node {}, cloudflared {}", m.node.as_deref().unwrap_or("?"), m.cloudflared.as_deref().unwrap_or("?"));
                        true
                    }
                    other => {
                        log::error!("[runtime] verification failed: {other:?}");
                        false
                    }
                }
            }
            None if cfg!(debug_assertions) => {
                log::warn!("[runtime] no runtime-manifest.json (development build): not verified");
                true
            }
            None => {
                log::error!("[runtime] runtime-manifest.json missing");
                false
            }
        };
        self.verified = Some(ok);
        ok
    }
}

fn sys_exe(n: &str) -> String {
    crate::paths::exe(n)
}

fn file_sha256(p: &Path) -> Option<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(p).ok()?;
    let mut h = manifest::Hasher::default();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Some(h.finish())
}

#[derive(Default)]
struct Timers {
    health: u64,
    tunnel: u64,
    status: u64,
    metrics: u64,
    game: u64,
    usage: u64,
    usage_save: u64,
    tick: u64,
}

pub struct Core {
    app: AppHandle,
    shared: Arc<Shared>,
    sup: Supervisor,
    settings: Settings,
    usage: Usage,
    detector: Detector,
    probe: GameProbe,
    machine: Machine,
    rt: Runtime,
    backend: Option<Running>,
    tunnel: Option<Running>,
    limits: Option<JobLimits>,
    port: u16,
    control_token: String,
    node_id: String,
    lang: String,
    live: Live,
    series: VecDeque<f64>,
    last_acct: Option<(u64, u64, u64)>,
    local_api: Option<bool>,
    schedule_in: bool,
    game_active: bool,
    gpu_pct: f32,
    saved_usd_server: Option<f64>,
    per_user_mb: Option<f64>,
    applying: bool,
    started_ms: u64,
    registered_once: bool,
    configured_once: bool,
    timers: Timers,
    last_state: Value,
    last_tray: Option<(Tone, String)>,
    exiting: bool,
}

pub fn configured() -> bool {
    secrets::missing(&store::get).is_empty()
}

impl Core {
    pub fn new(app: AppHandle, shared: Arc<Shared>) -> Core {
        let settings = Settings::load();
        let cfg = settings.cfg();
        let lang = settings.lang.clone().unwrap_or_else(|| descall_node::i18n::pick(&[std::env::var("LANG").unwrap_or_default()]).to_string());
        let root = crate::paths::runtime_root(app.path().resource_dir().ok());
        let node_id = settings.node_id();
        Core {
            app,
            shared,
            sup: Supervisor::new(cfg),
            usage: settings::load_usage(),
            detector: Detector::default(),
            probe: GameProbe::new(),
            machine: sys::machine(),
            rt: Runtime { root, verified: None },
            backend: None,
            tunnel: None,
            limits: None,
            port: std::env::var("DESCALL_NODE_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(descall_node::DEFAULT_PORT),
            control_token: settings::random_token(),
            node_id,
            lang,
            live: Live::default(),
            series: VecDeque::new(),
            last_acct: None,
            local_api: None,
            schedule_in: true,
            game_active: false,
            gpu_pct: 0.0,
            saved_usd_server: None,
            per_user_mb: None,
            applying: false,
            started_ms: now_ms(),
            registered_once: false,
            configured_once: configured(),
            timers: Timers::default(),
            last_state: Value::Null,
            last_tray: None,
            exiting: false,
            settings,
        }
    }

    pub fn run(mut self, rx: Receiver<Msg>) {
        logger::set_secrets(store::all_values());
        let m = self.machine;
        log::info!("[app] Descall Node {} starting ({}), {} MB RAM, {} logical CPUs, runtime {}", descall_node::SERVICE_VERSION, self.node_id, m.total_mb, m.logical_cpus, self.rt.root.display());
        let now = now_ms();
        self.schedule_in = schedule::evaluate(&self.sup.cfg().schedule, now).in_slot;
        self.feed(Event::Schedule { in_slot: self.schedule_in });
        self.feed(Event::Boot { configured: configured() });
        self.publish();
        loop {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(m) => self.on_msg(m),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            while let Ok(m) = rx.try_recv() {
                self.on_msg(m);
            }
            self.periodic(now_ms());
            self.publish();
            if self.exiting {
                break;
            }
        }
    }

    fn feed(&mut self, ev: Event) {
        let now = now_ms();
        let before = self.sup.phase();
        let cmds = self.sup.handle(ev, now);
        for c in cmds {
            self.exec(c);
        }
        let after = self.sup.phase();
        if before != after {
            log::info!("[supervisor] {before:?} -> {after:?}{}", if after == Phase::Draining { format!(" ({})", self.sup.drain_reason()) } else { String::new() });
            if matches!(after, Phase::Active | Phase::Game) {
                self.applying = false;
            }
            let paused = matches!(after, Phase::Paused | Phase::Stopped | Phase::Setup | Phase::Error);
            self.shared.signals.set(None, Some(paused));
        }
    }

    // ---- commands ----------------------------------------------------------------------------

    fn exec(&mut self, c: Cmd) {
        match c {
            Cmd::SpawnBackend { share_mb, cores } => {
                if !self.rt.verify() {
                    return self.feed(Event::SpawnFailed { what: Proc::Backend, fatal: true });
                }
                match self.spawn_backend(share_mb, cores) {
                    Ok(()) => {}
                    Err((e, fatal)) => {
                        log::error!("[backend] start failed: {e}");
                        self.feed(Event::SpawnFailed { what: Proc::Backend, fatal });
                    }
                }
            }
            Cmd::SpawnTunnel => {
                if !self.rt.verify() {
                    return self.feed(Event::SpawnFailed { what: Proc::Tunnel, fatal: true });
                }
                if let Err((e, fatal)) = self.spawn_tunnel() {
                    log::error!("[tunnel] start failed: {e}");
                    self.feed(Event::SpawnFailed { what: Proc::Tunnel, fatal });
                }
            }
            Cmd::StopBackend => stop(&mut self.backend, "backend"),
            Cmd::StopTunnel => stop(&mut self.tunnel, "tunnel"),
            Cmd::StartDrain { reason } => {
                let r = net_local("POST", self.port, local_api::DRAIN, Some(&self.control_token), Some(&local_api::drain_body(reason)));
                match r {
                    Some(200..=299) => {
                        log::info!("[drain] started ({reason})");
                        self.timers.status = 0;
                    }
                    other => {
                        log::warn!("[drain] backend has no local drain ({other:?}): stopping it, clients reconnect to Render");
                        self.local_api = Some(false);
                        self.feed(Event::DrainUnsupported);
                    }
                }
            }
            Cmd::ReportState { state, game_mode, memory_mb } => {
                if self.local_api != Some(false) {
                    let _ = net_local("POST", self.port, local_api::STATE, Some(&self.control_token), Some(&local_api::state_body(state, game_mode, memory_mb)));
                }
            }
            Cmd::SetCpu { cores } => {
                let share = self.sup.running_share_mb();
                let l = limits::compute(share, cores, self.machine);
                if let Some(job) = self.backend.as_ref().and_then(|b| b.job.as_ref()) {
                    job.set_cpu_rate(l.cpu_rate);
                }
                log::info!("[job] CPU cap now {} cores ({:?})", l.cores, l.cpu_rate);
                self.limits = Some(l);
            }
            Cmd::DrainDone => {
                let id = self.node_id.clone();
                if let (Some(primary), Some(key)) = (store::get("primaryUrl"), store::get("nodeKey")) {
                    tauri::async_runtime::spawn(async move {
                        let (st, _) = crate::net::primary_post(&primary, heartbeat::DRAIN_DONE, &key, &heartbeat::drain_done_body(&id)).await;
                        log::info!("[primary] drain-done sent ({st})");
                    });
                }
            }
            Cmd::CountDrop { what } => {
                self.usage.add_drop(now_ms(), ISTANBUL_OFFSET);
                log::warn!("[supervisor] unexpected stop of the {}", if what == Proc::Backend { "backend" } else { "tunnel" });
            }
            Cmd::Exit => {
                stop(&mut self.backend, "backend");
                stop(&mut self.tunnel, "tunnel");
                settings::save_usage(&self.usage);
                log::info!("[app] exit");
                self.shared.signals.set(Some(true), None);
                self.exiting = true;
                let app = self.app.clone();
                app.exit(0);
            }
        }
    }

    fn spawn_backend(&mut self, share_mb: u32, cores: u32) -> Result<(), (String, bool)> {
        let node = self.rt.node();
        let dir = self.rt.backend_dir();
        if !dir.join("server.js").exists() {
            return Err((format!("backend missing at {}", dir.display()), true));
        }
        let exe = if node.exists() { node } else if cfg!(debug_assertions) { PathBuf::from("node") } else { return Err(("node runtime missing".into(), true)) };
        let l = limits::compute(share_mb, cores, self.machine);
        let rt_dir = self.rt.runtime_dir().to_string_lossy().to_string();
        let id = NodeIdentity { node_id: &self.node_id, port: self.port, control_token: &self.control_token, version: descall_node::SERVICE_VERSION };
        let env = backend_env(&|k| std::env::var(k).ok(), &store::get, &id, &l, &rt_dir);
        let mut cmd = Command::new(&exe);
        cmd.args(limits::node_args(&l, "server.js")).current_dir(&dir).env_clear().envs(env).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        sys::hide_console(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| (e.to_string(), false))?;
        let job = Job::create(Some(&l));
        if let Some(j) = &job {
            if !j.assign(&child) {
                log::warn!("[job] could not assign the backend to its job object");
            }
        }
        pipe(&mut child, Source::Backend);
        log::info!("[backend] started pid {}: share {} MB (heap {} MB, job limit {} MB), {} cores (cap {:?})", child.id(), l.share_mb, l.heap_mb, l.job_memory_bytes / 1048576, l.cores, l.cpu_rate);
        self.backend = Some(Running { child, job });
        self.limits = Some(l);
        self.live = Live { kv_ok: self.live.kv_ok, ..Live::default() };
        self.last_acct = None;
        self.timers.health = 0;
        Ok(())
    }

    fn spawn_tunnel(&mut self) -> Result<(), (String, bool)> {
        let Some(token) = store::get("tunnelToken") else { return Err(("no tunnel token".into(), false)) };
        let exe = self.rt.cloudflared();
        let exe = if exe.exists() { exe } else if cfg!(debug_assertions) { PathBuf::from("cloudflared") } else { return Err(("cloudflared missing".into(), true)) };
        let rt_dir = self.rt.runtime_dir().to_string_lossy().to_string();
        let mut cmd = Command::new(&exe);
        cmd.args(tunnel_args(descall_node::TUNNEL_METRICS_PORT)).env_clear().envs(tunnel_env(&|k| std::env::var(k).ok(), &token, &rt_dir)).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        sys::hide_console(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| (e.to_string(), false))?;
        let job = Job::create(None);
        if let Some(j) = &job {
            j.assign(&child);
        }
        pipe(&mut child, Source::Tunnel);
        log::info!("[tunnel] started pid {}", child.id());
        self.tunnel = Some(Running { child, job });
        self.timers.tunnel = 0;
        Ok(())
    }

    // ---- messages ----------------------------------------------------------------------------

    fn on_msg(&mut self, m: Msg) {
        match m {
            Msg::Event(e) => self.feed(e),
            Msg::Act(a) => self.act(&a),
            Msg::Cfg(patch) => self.cfg_patch(&patch),
            Msg::SetupChanged => {
                logger::set_secrets(store::all_values());
                if configured() {
                    let was_running = matches!(self.sup.phase(), Phase::Active | Phase::Game | Phase::Drained | Phase::Starting | Phase::Backoff);
                    self.configured_once = true;
                    if matches!(self.sup.phase(), Phase::Setup | Phase::Error | Phase::Stopped) {
                        self.feed(Event::Configured);
                    } else if was_running && !self.sup.manual_pause() {
                        // New values reach the processes' env only at start: drain and restart.
                        log::info!("[setup] values changed: restarting with them");
                        self.feed(Event::Pause);
                        self.feed(Event::Resume);
                    }
                }
            }
            Msg::BootstrapInfo { at, skip } => {
                if at.is_some() {
                    self.settings.bootstrap_at = at;
                }
                if skip {
                    self.settings.bootstrap_at = None;
                }
                self.settings.bootstrap_skip = skip;
                self.settings.save();
            }
            Msg::Wipe => {
                store::wipe();
                self.settings.bootstrap_at = None;
                self.settings.bootstrap_skip = false;
                self.settings.save();
                logger::set_secrets(Vec::new());
                log::warn!("[setup] every stored value was deleted by the owner");
                self.feed(Event::Unconfigured);
            }
            Msg::Register(o) => self.on_register(o),
            Msg::Publish => self.last_state = Value::Null,
        }
    }

    fn act(&mut self, a: &str) {
        match a {
            "pause" => self.feed(Event::Pause),
            "resume" => self.feed(Event::Resume),
            "drain" => self.feed(Event::Drain),
            "retry" => self.feed(Event::Retry),
            "quit" => self.feed(Event::Shutdown),
            "admin" => {
                use tauri_plugin_opener::OpenerExt;
                let url = self.settings.admin_url.clone().unwrap_or_else(|| descall_node::DEFAULT_ADMIN_URL.into());
                if url.starts_with("https://") {
                    let _ = self.app.opener().open_url(url, None::<&str>);
                }
                crate::popover::hide(&self.app);
            }
            "openLogs" => {
                use tauri_plugin_opener::OpenerExt;
                let _ = self.app.opener().open_path(crate::paths::logs_dir().to_string_lossy().to_string(), None::<&str>);
            }
            _ => {}
        }
    }

    fn cfg_patch(&mut self, patch: &Value) {
        let old = self.sup.cfg().clone();
        let next = cfg::merge(&old, patch);
        if next == old {
            return;
        }
        log::info!("[cfg] popover: {patch}");
        self.applying = next.ram_mb != old.ram_mb && matches!(self.sup.phase(), Phase::Active | Phase::Game | Phase::Drained);
        self.settings.cfg = Some(next.to_value());
        self.settings.cfg_pending = true;
        self.settings.save();
        // Push first, so the cluster learns it before this node drains for a restart.
        self.push_cfg(patch);
        self.feed(Event::Cfg(next));
    }

    fn push_cfg(&mut self, patch: &Value) {
        if self.local_api == Some(false) || !self.sup.backend_ready() {
            return;
        }
        match net_local_json("PUT", self.port, local_api::CFG, Some(&self.control_token), Some(patch)) {
            Some((200..=299, _)) => {
                self.settings.cfg_pending = false;
                self.settings.save();
            }
            Some((404, _)) => self.local_api = Some(false),
            _ => {}
        }
    }

    fn on_register(&mut self, o: Outcome) {
        match o {
            Outcome::Revoked => {
                if self.sup.error() != Some(ErrorKind::KeyRevoked) {
                    log::error!("[primary] the node key was refused (revoked or wrong): stopping");
                    self.feed(Event::KeyRevoked);
                }
            }
            Outcome::Retry => {}
            Outcome::Ok(r) => {
                if !self.registered_once {
                    self.registered_once = true;
                    log::info!("[primary] registered as {}", self.node_id);
                }
                self.saved_usd_server = r.saved_usd_month.or(self.saved_usd_server);
                self.per_user_mb = r.per_user_mb.or(self.per_user_mb);
                if let Some(c) = r.cfg {
                    self.adopt_cfg(c, "primary");
                }
            }
        }
    }

    /// A cfg from the cluster (primary or the local backend's KV view).
    fn adopt_cfg(&mut self, c: PcCfg, from: &str) {
        if self.settings.cfg_pending {
            // The owner's own change has not reached the cluster yet: it wins until it has.
            if let Some(p) = self.settings.cfg.clone() {
                if self.sup.backend_ready() {
                    self.push_cfg(&p);
                }
            }
            return;
        }
        if &c != self.sup.cfg() {
            log::info!("[cfg] from {from}: {} MB, {} cores, game {}, schedule {}", c.ram_mb, c.cores, c.game_mode.enabled, c.schedule.active());
            self.settings.cfg = Some(c.to_value());
            self.settings.save();
            self.feed(Event::Cfg(c));
        }
    }

    // ---- periodic ----------------------------------------------------------------------------

    fn periodic(&mut self, now: u64) {
        self.reap(now);
        let phase = self.sup.phase();

        if phase == Phase::Starting && self.backend.is_some() && now >= self.timers.health {
            self.timers.health = now + 1000;
            if let Some((200, v)) = net_local_json("GET", self.port, local_api::HEALTH, None, None) {
                if local_api::health_ok(&v) {
                    log::info!("[backend] healthy on 127.0.0.1:{}", self.port);
                    self.feed(Event::BackendReady);
                }
            }
        }
        if self.tunnel.is_some() && !self.sup.tunnel_ready() && now >= self.timers.tunnel {
            self.timers.tunnel = now + 2000;
            if let Some(200..=299) = net_local("GET", descall_node::TUNNEL_METRICS_PORT, "/ready", None, None) {
                log::info!("[tunnel] connected");
                self.feed(Event::TunnelReady);
            }
        }
        if self.sup.backend_ready() && now >= self.timers.status {
            self.timers.status = now + if self.sup.phase() == Phase::Draining { 1000 } else { 5000 };
            self.poll_status();
        }
        if now >= self.timers.metrics {
            self.timers.metrics = now + 10_000;
            self.sample_metrics(now);
        }
        if now >= self.timers.game {
            self.timers.game = now + 5000;
            self.sample_game(now);
        }
        if now >= self.timers.usage {
            self.timers.usage = now + 5000;
            let serving = matches!(self.sup.phase(), Phase::Active | Phase::Game).then(|| self.sup.running_share_mb());
            self.usage.tick(now, ISTANBUL_OFFSET, serving);
            if now >= self.timers.usage_save {
                self.timers.usage_save = now + 60_000;
                settings::save_usage(&self.usage);
            }
            self.update_beat(now);
        }
        if now >= self.timers.tick {
            self.timers.tick = now + 1000;
            let ev = schedule::evaluate(&self.sup.cfg().schedule, now);
            if ev.in_slot != self.schedule_in {
                self.schedule_in = ev.in_slot;
                log::info!("[schedule] {}", if ev.in_slot { "slot started" } else { "outside the schedule" });
                self.feed(Event::Schedule { in_slot: ev.in_slot });
            }
            self.feed(Event::Tick);
        }
    }

    fn reap(&mut self, _now: u64) {
        for what in [Proc::Backend, Proc::Tunnel] {
            let slot = if what == Proc::Backend { &mut self.backend } else { &mut self.tunnel };
            let exited = slot.as_mut().and_then(|r| r.child.try_wait().ok().flatten());
            if let Some(st) = exited {
                *slot = None;
                log::info!("[{}] exited ({st})", if what == Proc::Backend { "backend" } else { "tunnel" });
                if what == Proc::Backend {
                    self.live = Live { kv_ok: self.live.kv_ok, ..Live::default() };
                }
                self.feed(Event::Exited { what, code: st.code() });
            }
        }
    }

    fn poll_status(&mut self) {
        match net_local_json("GET", self.port, local_api::STATUS, Some(&self.control_token), None) {
            Some((200, v)) => {
                self.local_api = Some(true);
                let s = local_api::parse_status(&v);
                self.live.conns = s.conns.or(self.live.conns);
                self.live.p95_ms = s.p95_ms;
                if s.mbps.is_some() {
                    self.live.mbps = s.mbps;
                }
                self.live.kv_ok = s.kv_ok;
                if self.sup.phase() == Phase::Draining {
                    let left = s.remaining.or(s.conns).unwrap_or(u32::MAX);
                    self.feed(Event::DrainProgress { remaining: left });
                }
                if let Some(c) = s.cfg {
                    self.adopt_cfg(c, "cluster");
                }
                if self.settings.cfg_pending {
                    if let Some(p) = self.settings.cfg.clone() {
                        self.push_cfg(&p);
                    }
                }
            }
            Some((404, _)) => self.local_api = Some(false),
            _ => {}
        }
    }

    fn sample_metrics(&mut self, now: u64) {
        let Some(b) = self.backend.as_ref() else {
            self.series.push_back(0.0);
            trim(&mut self.series);
            return;
        };
        let ram = sys::process_mb(&b.child);
        self.live.ram_used_mb = ram;
        if let Some(r) = ram {
            self.series.push_back(r);
            trim(&mut self.series);
        }
        if let Some((cpu, io)) = b.job.as_ref().and_then(|j| j.accounting()) {
            if let Some((t0, c0, io0)) = self.last_acct {
                let dt_ms = now.saturating_sub(t0).max(1);
                let cores = self.limits.map(|l| l.cores).unwrap_or(1).max(1) as f64;
                // CPU time is in 100 ns units: 10_000 per ms.
                let used = cpu.saturating_sub(c0) as f64 / 10_000.0;
                self.live.cpu_pct = Some((used / (dt_ms as f64 * cores) * 100.0).clamp(0.0, 100.0));
                if self.local_api != Some(true) || self.live.mbps.is_none() {
                    self.live.mbps = Some(io.saturating_sub(io0) as f64 * 8.0 / 1_000_000.0 / (dt_ms as f64 / 1000.0));
                }
            }
            self.last_acct = Some((now, cpu, io));
        }
    }

    fn sample_game(&mut self, now: u64) {
        let enabled = self.sup.cfg().game_mode.enabled;
        if !enabled {
            if self.detector.active() {
                self.detector.reset();
                self.game_active = false;
                self.feed(Event::Game { active: false });
            }
            return;
        }
        let s = self.probe.sample(now);
        self.gpu_pct = s.gpu_pct;
        let mut games: Vec<String> = descall_node::game::DEFAULT_GAMES.iter().map(|g| g.to_string()).collect();
        games.extend(self.settings.games.iter().cloned());
        if let Some(ch) = self.detector.update(&s, &games, &self.settings.ignore) {
            self.game_active = ch.active;
            log::info!("[game] {} ({:?} {})", if ch.active { "game started" } else { "game ended" }, ch.reason, ch.exe.as_deref().unwrap_or(""));
            self.feed(Event::Game { active: ch.active });
        }
    }

    fn update_beat(&mut self, now: u64) {
        let b = BeatInfo {
            configured: configured(),
            revoked: self.sup.error() == Some(ErrorKind::KeyRevoked),
            id: self.node_id.clone(),
            url: store::get("publicUrl").unwrap_or_else(|| descall_node::DEFAULT_PUBLIC_URL.into()),
            memory_mb: self.sup.running_share_mb().max(self.sup.cfg().effective_mb(self.game_active)),
            cores: self.sup.cfg().cores,
            state: self.sup.contract_state(),
            game_mode: self.sup.phase() == Phase::Game,
            phase: format!("{:?}", self.sup.phase()).to_lowercase(),
            uptime_sec: now.saturating_sub(self.started_ms) / 1000,
            drops_today: self.usage.drops_today,
            machine: Some(self.machine),
        };
        if let Ok(mut g) = self.shared.beat.lock() {
            *g = b;
        }
    }

    // ---- publish -----------------------------------------------------------------------------

    fn publish(&mut self) {
        let now = now_ms();
        let cfg = self.sup.cfg().clone();
        let eval = schedule::evaluate(&cfg.schedule, now);
        let public = store::get("publicUrl").unwrap_or_else(|| descall_node::DEFAULT_PUBLIC_URL.into());
        let series: Vec<f64> = self.series.iter().copied().collect();
        let snap = Snapshot {
            lang: &self.lang,
            phase: self.sup.phase(),
            pause_why: self.sup.pause_why(),
            error: self.sup.error(),
            retry_in_ms: self.sup.retry_at().map(|t| t.saturating_sub(now)),
            manual_pause: self.sup.manual_pause(),
            public_url: &public,
            version: descall_node::SERVICE_VERSION,
            cfg: &cfg,
            running_share_mb: self.sup.running_share_mb(),
            cfg_synced: !self.settings.cfg_pending,
            applying: self.applying,
            live: &self.live,
            ram_series: &series,
            schedule: &eval,
            game_active: self.game_active,
            game_reason: self.detector.reason().or(if self.game_active { Some(Reason::Exclusive) } else { None }),
            game_exe: self.detector.exe(),
            gpu_pct: self.gpu_pct,
            usage: &self.usage,
            saved_usd_server: self.saved_usd_server,
            per_user_mb: self.per_user_mb,
            tunnel_ready: self.sup.tunnel_ready(),
        };
        let v = view::build(&snap);
        let tray = view::tray(&snap);
        let state = json!({
            "view": v,
            "strings": descall_node::i18n::strings(&self.lang),
            "setup": secrets::status_json(&store::get),
            "autostart": sys::autostart_enabled(),
            "configuredOnce": self.configured_once,
            "bootstrap": { "at": self.settings.bootstrap_at, "skip": self.settings.bootstrap_skip },
        });
        if state != self.last_state {
            self.last_state = state.clone();
            if let Ok(mut g) = self.shared.state.lock() {
                *g = state.clone();
            }
            if crate::popover::visible(&self.app) {
                let _ = self.app.emit_to(crate::popover::LABEL, "node:state", state);
            }
        }
        if self.last_tray.as_ref() != Some(&tray) {
            crate::tray::update(&self.app, tray.0, &tray.1);
            self.last_tray = Some(tray);
        }
    }
}

fn trim(q: &mut VecDeque<f64>) {
    while q.len() > SERIES_MAX {
        q.pop_front();
    }
}

fn stop(slot: &mut Option<Running>, what: &str) {
    if let Some(r) = slot.as_mut() {
        log::info!("[{what}] stopping pid {}", r.child.id());
        if let Some(j) = &r.job {
            j.terminate();
        }
        let _ = r.child.kill();
    }
}

/// Child stdout / stderr into node.log, line by line, redacted.
fn pipe(child: &mut Child, src: Source) {
    fn spawn<R: std::io::Read + Send + 'static>(r: R, src: Source, stderr: bool) {
        let _ = std::thread::Builder::new().name(format!("descall-node-{}", src.tag())).spawn(move || {
            let mut rd = BufReader::new(r);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match rd.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let line = String::from_utf8_lossy(&buf);
                        let line = line.trim_end();
                        if !line.is_empty() {
                            logger::write(child_level(line, stderr), src, line);
                        }
                    }
                }
            }
        });
    }
    if let Some(o) = child.stdout.take() {
        spawn(o, src, false);
    }
    if let Some(e) = child.stderr.take() {
        spawn(e, src, true);
    }
}

fn net_local(method: &str, port: u16, path: &str, token: Option<&str>, body: Option<&Value>) -> Option<u16> {
    net_local_json(method, port, path, token, body).map(|(s, _)| s)
}

fn net_local_json(method: &str, port: u16, path: &str, token: Option<&str>, body: Option<&Value>) -> Option<(u16, Value)> {
    crate::net::local(method, port, path, token, body, Duration::from_millis(1500)).ok().map(|r| (r.status, r.body))
}

/// The heartbeat: register with the primary now and every 30 s (backing off on failures).
pub fn start_register_loop(shared: Arc<Shared>) {
    tauri::async_runtime::spawn(async move {
        let mut failures = 0u32;
        tokio::time::sleep(Duration::from_secs(3)).await;
        loop {
            let info = shared.beat.lock().map(|g| g.clone()).unwrap_or_default();
            let creds = (store::get("primaryUrl"), store::get("nodeKey"));
            let mut delay = heartbeat::next_delay_ms(failures);
            if let (true, false, Some(primary), Some(key)) = (info.configured, info.revoked, creds.0, creds.1) {
                let m = info.machine.unwrap_or(Machine { total_mb: 0, logical_cpus: 0 });
                let beat = Beat {
                    id: &info.id,
                    url: &info.url,
                    version: descall_node::SERVICE_VERSION,
                    memory_mb: info.memory_mb,
                    cores: info.cores,
                    state: info.state,
                    game_mode: info.game_mode,
                    phase: &info.phase,
                    uptime_sec: info.uptime_sec,
                    restarts_today: info.drops_today,
                    machine_mb: m.total_mb,
                    logical_cpus: m.logical_cpus,
                };
                let (st, body) = crate::net::primary_post(&primary, heartbeat::REGISTER, &key, &heartbeat::register_body(&beat)).await;
                let outcome = heartbeat::parse_reply(st, &body);
                failures = if matches!(outcome, Outcome::Ok(_)) { 0 } else { failures + 1 };
                if failures == 1 || failures.checked_rem(10) == Some(0) {
                    if st == 0 {
                        log::warn!("[primary] register failed: network");
                    } else if !matches!(outcome, Outcome::Ok(_)) {
                        log::warn!("[primary] register failed: HTTP {st}");
                    }
                }
                delay = heartbeat::next_delay_ms(failures);
                shared.send(Msg::Register(outcome));
            }
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }
    });
}
