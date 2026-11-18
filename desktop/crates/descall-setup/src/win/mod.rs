//! Windows host: picks the mode, shows the window and drives the screens.

mod http;
mod job;
mod log;
mod migrate;
mod procs;
mod shell;
mod sys;
mod texts;
mod ui;
mod uninstall;

use crate::cli::{Args, Mode};
use crate::download::Control;
use crate::layout::{self, Layout, MIN_WINDOWS_BUILD};
use job::{Ctx, InstallOpts, JobError, Release, Report};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};
use ui::{Cmd, Kind, Ui};
use windows::core::HSTRING;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONERROR, MB_ICONQUESTION, MB_YESNO};

/// Exit codes for callers (migrator, Tauri updater, scripts).
pub mod exit {
    pub const OK: i32 = 0;
    pub const FAILED: i32 = 1;
    pub const KEEP_OLD: i32 = 3;
    pub const CANCELLED: i32 = 4;
    pub const DEFERRED: i32 = 10;
}

pub fn run(mut args: Args) -> i32 {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let layout = job::default_layout();
    let log_path = log::init(&layout.logs_dir());
    let lang = args.lang.as_deref().map(|l| sys::pick_language(&[l.to_string()])).unwrap_or_else(|| sys::pick_language(&sys::ui_languages())).to_string();
    log::info(&format!("args {args:?} lang {lang}"));
    if args.mode == Mode::Uninstall {
        return uninstall::run(&args, &layout, &lang);
    }
    if args.passive && args.mode == Mode::Install {
        args.mode = Mode::Update;
    }
    if args.silent {
        return silent(&args, &layout, &lang);
    }
    if !ensure_webview2(&lang) {
        return exit::FAILED;
    }
    let (tx, rx) = channel::<Cmd>();
    let kind = if args.mode == Mode::Update { Kind::Toast } else { Kind::Main };
    let title = texts::get(&lang).title;
    let data_dir = layout.setup_root().join("webview");
    let engine_tx = tx.clone();
    ui::run(kind, title, data_dir, sys::reduced_motion(), tx, move |ui| {
        log::attach_ui(ui.clone());
        std::thread::spawn(move || {
            let mut e = Engine::new(ui.clone(), engine_tx, rx, args, layout, lang, log_path);
            let code = e.run();
            log::info(&format!("exit {code}"));
            ui.exit(code);
        });
    })
}

/// No WebView2 (old Windows 10 without Edge updates): offer the Evergreen bootstrapper.
fn ensure_webview2(lang: &str) -> bool {
    if sys::webview2_version().is_some() {
        return true;
    }
    let t = texts::get(lang);
    let yes = unsafe { MessageBoxW(None, &HSTRING::from(t.wv_q), &HSTRING::from(t.title), MB_YESNO | MB_ICONQUESTION) } == IDYES;
    if !yes {
        return false;
    }
    let ok = (|| -> Option<()> {
        let s = http::Session::new().ok()?;
        let path = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
        let mut f = std::fs::File::create(&path).ok()?;
        s.get("https://go.microsoft.com/fwlink/p/?LinkId=2124703", None, &mut |c| {
            use std::io::Write;
            f.write_all(c).map_err(crate::download::DlError::Disk)
        })
        .ok()?;
        drop(f);
        let st = std::process::Command::new(&path).args(["/silent", "/install"]).status().ok()?;
        let _ = std::fs::remove_file(&path);
        (st.success() && sys::webview2_version().is_some()).then_some(())
    })()
    .is_some();
    if !ok {
        unsafe { MessageBoxW(None, &HSTRING::from(t.wv_fail), &HSTRING::from(t.title), MB_ICONERROR) };
    }
    ok
}

fn ctx(layout: &Layout, lang: &str, args: &Args, ui: Option<Ui>, ctl: Arc<Control>) -> Ctx {
    Ctx {
        layout: layout.clone(),
        lang: lang.to_string(),
        allow_unsigned: args.allow_unsigned,
        manifest_url: args.manifest_url.clone().unwrap_or_else(|| layout::manifest_url().to_string()),
        ctl,
        ui,
    }
}

fn existing_dir(args: &Args, layout: &Layout) -> PathBuf {
    args.dir
        .clone()
        .or_else(|| shell::installed().map(|x| x.0))
        .or_else(|| shell::electron_install().map(|x| x.0).filter(|d| d.starts_with(&layout.local)))
        .unwrap_or_else(|| layout.default_install_dir())
}

/// `/S`: same pipeline, no window. Used by the migrator ("InstallNew") and quiet updates.
fn silent(args: &Args, layout: &Layout, lang: &str) -> i32 {
    let c = ctx(layout, lang, args, None, Arc::new(Control::default()));
    let dir = existing_dir(args, layout);
    let first = shell::installed().is_none() && shell::electron_install().is_none();
    let opts = InstallOpts {
        autostart: if first && shell::autostart_get().is_none() { Some(true) } else { None },
        desktop: first && !args.no_shortcuts,
        start_menu: !args.no_shortcuts,
        auto_update: true,
        legacy_backup: args.mode == Mode::Migrate,
    };
    let mut attempt = 0;
    let result = loop {
        attempt += 1;
        let r = job::load_release(&c).and_then(|rel| {
            let zip = job::fetch_payload(&c, &rel)?;
            if !procs::close_all(&dir, Duration::from_secs(8)) {
                return Err(JobError::Locked { procs: 1 });
            }
            job::install_files(&c, &rel, &zip, &dir, &opts)
        });
        match r {
            Err(JobError::Net { .. }) if attempt < 4 => std::thread::sleep(Duration::from_secs(5 * attempt)),
            other => break other,
        }
    };
    match result {
        Ok(_) => {
            if args.relaunch {
                shell::launch(&job::exe_in(&dir), &relaunch_args(args));
            }
            exit::OK
        }
        Err(e) => {
            log::error(&format!("silent install failed: {e:?}"));
            exit::FAILED
        }
    }
}

fn relaunch_args(args: &Args) -> Vec<String> {
    let mut a = args.app_args.clone();
    if !a.iter().any(|x| x == "--updated") {
        a.push("--updated".into());
    }
    a
}

/// What a finished background job reports back to the engine.
pub enum JobOutcome {
    Release(Result<Arc<Release>, JobError>),
    Installed(Result<(Arc<Release>, Report), JobError>),
    Closed(bool),
}

#[derive(PartialEq, Eq, Clone, Copy, Debug)]
enum Screen {
    Welcome,
    Progress,
    Done,
    Error,
    Migration,
    Update,
}

struct Engine {
    ui: Ui,
    tx: Sender<Cmd>,
    rx: Receiver<Cmd>,
    args: Args,
    layout: Layout,
    lang: String,
    log_path: PathBuf,
    dir: PathBuf,
    screen: Screen,
    ctl: Arc<Control>,
    release: Option<Arc<Release>>,
    opts: InstallOpts,
    started: Instant,
    busy: bool,
    retry: Option<(Instant, u32)>,
    attempts: u32,
    need: u64,
    launch_at: Option<Instant>,
}

const BACKOFF: [u64; 5] = [8, 15, 30, 60, 120];

impl Engine {
    fn new(ui: Ui, tx: Sender<Cmd>, rx: Receiver<Cmd>, args: Args, layout: Layout, lang: String, log_path: PathBuf) -> Self {
        let dir = existing_dir(&args, &layout);
        let first = shell::installed().is_none() && shell::electron_install().is_none();
        let opts = InstallOpts {
            autostart: if first { Some(true) } else { None },
            desktop: !args.no_shortcuts,
            start_menu: !args.no_shortcuts,
            auto_update: true,
            legacy_backup: args.mode == Mode::Migrate,
        };
        Engine {
            ui,
            tx,
            rx,
            args,
            layout,
            lang,
            log_path,
            dir,
            screen: Screen::Welcome,
            ctl: Arc::new(Control::default()),
            release: None,
            opts,
            started: Instant::now(),
            busy: false,
            retry: None,
            attempts: 0,
            need: 92 * 1024 * 1024,
            launch_at: None,
        }
    }

    fn patch(&self, v: Value) {
        self.ui.patch(v);
    }

    fn ctx(&self) -> Ctx {
        ctx(&self.layout, &self.lang, &self.args, Some(self.ui.clone()), self.ctl.clone())
    }

    fn spawn(&self, f: impl FnOnce(Ctx) -> JobOutcome + Send + 'static) {
        let c = self.ctx();
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let out = f(c);
            let _ = tx.send(Cmd::Job(Box::new(out)));
        });
    }

    fn run(&mut self) -> i32 {
        loop {
            let msg = match self.rx.recv_timeout(Duration::from_millis(250)) {
                Ok(m) => Some(m),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return exit::FAILED,
            };
            if let Some(code) = self.tick() {
                return code;
            }
            let Some(msg) = msg else { continue };
            if let Some(code) = self.handle(msg) {
                return code;
            }
        }
    }

    /// Timers: network retry countdown, launch countdown after migration.
    fn tick(&mut self) -> Option<i32> {
        if let Some((at, attempt)) = self.retry {
            let left = at.saturating_duration_since(Instant::now()).as_secs_f64().ceil() as u64;
            let net = sys::net_state();
            self.patch(json!({ "err": { "retryIn": left, "attempt": attempt, "diag": { "net": net.connected, "proxy": net.vpn || http::proxy_configured() } } }));
            if Instant::now() >= at {
                self.retry = None;
                log::event("l_retry_wait", json!({ "i": attempt, "n": BACKOFF.len() }), "");
                self.start_install();
            }
        }
        if let Some(at) = self.launch_at {
            let left = at.saturating_duration_since(Instant::now()).as_secs_f64().ceil() as u64;
            self.patch(json!({ "mig": { "launchIn": left } }));
            if Instant::now() >= at {
                self.launch(None, &["--migrated".to_string()]);
                return Some(exit::OK);
            }
        }
        None
    }

    fn handle(&mut self, msg: Cmd) -> Option<i32> {
        match msg {
            Cmd::Ready => {
                self.ui.mark_ready();
                self.on_ready();
            }
            Cmd::SystemClose => {
                if !self.busy || self.screen == Screen::Welcome {
                    return Some(if self.screen == Screen::Done { exit::OK } else { exit::CANCELLED });
                }
                self.patch(json!({ "ui": { "confirm": true } }));
            }
            Cmd::Browsed(p) => {
                let dir = layout::normalize_choice(&p);
                if sys::writable(&dir) {
                    self.dir = dir;
                    self.patch(json!({ "dirError": false }));
                } else {
                    log::warn(&format!("not writable: {}", dir.display()));
                    self.dir = dir;
                    self.patch(json!({ "dirError": true }));
                }
                self.send_welcome_disk();
                if self.screen == Screen::Error {
                    self.screen = Screen::Welcome;
                    self.patch(json!({ "screen": "welcome" }));
                }
            }
            Cmd::Job(out) => return self.on_job(*out),
            Cmd::Page(cmd, v) => return self.on_page(&cmd, &v),
        }
        None
    }

    fn on_ready(&mut self) {
        let os = sys::os_info();
        let wv = sys::webview2_version();
        log::info(&format!("{} build {} webview2 {:?}", os.name, os.build, wv));
        let existing = shell::installed().map(|(_, v)| v).or_else(|| shell::electron_install().map(|(_, v)| v));
        let desk_exists = shell::desktop_lnk().is_some_and(|p| p.exists());
        if !self.opts.autostart.unwrap_or(true) || shell::autostart_get().is_some() {
            self.opts.autostart = None;
        }
        let base = json!({
            "lang": self.lang,
            "version": env!("CARGO_PKG_VERSION"),
            "publisher": layout::publisher(),
            "logPath": self.log_path.display().to_string(),
            "dir": self.dir.display().to_string(),
            "sys": { "os": os.name, "osOk": os.build == 0 || os.build >= MIN_WINDOWS_BUILD, "wvOk": true, "diskOk": true },
            "opts": { "autostart": self.opts.autostart.unwrap_or(true), "desktop": self.opts.desktop, "autoUpdate": true },
            "existing": existing.map(|v| json!({ "version": v, "desktopShortcut": desk_exists })),
        });
        self.patch(base);
        self.send_welcome_disk();
        match self.args.mode {
            Mode::Install | Mode::Uninstall => {
                self.screen = Screen::Welcome;
                self.patch(json!({ "screen": "welcome" }));
                if os.build != 0 && os.build < MIN_WINDOWS_BUILD {
                    self.show_error(JobError::Install { code: format!("SYS-{:04X}", os.build) }, Some("system"));
                    return;
                }
                // Read the manifest in the background so sizes and version are real before "Install".
                self.spawn(|c| JobOutcome::Release(job::load_release(&c).map(Arc::new)));
            }
            Mode::Update => {
                self.screen = Screen::Update;
                let phase = if self.args.passive { "installing" } else { "ready" };
                self.patch(json!({ "screen": "update", "upd": { "v": "", "phase": phase, "size": 0, "secs": 4 } }));
                self.spawn(|c| JobOutcome::Release(job::load_release(&c).map(Arc::new)));
            }
            Mode::Migrate => {
                self.screen = Screen::Migration;
                let sum = migrate::summary(&self.layout);
                let from = self.args.from_version.clone().or(sum.from_version).or_else(|| shell::electron_install().map(|x| x.1)).unwrap_or_default();
                self.patch(json!({ "screen": "migration", "mig": {
                    "from": from, "to": "", "days": 14, "installing": true,
                    "rows": { "set": { "st": "wait" }, "ses": { "st": "wait" }, "sh": { "st": "wait" }, "cl": { "st": "wait" } } } }));
                self.start_install();
            }
        }
    }

    fn send_welcome_disk(&mut self) {
        let free = job::free_space(&self.dir);
        let need = self.release.as_ref().map(|r| job::space_needed(&r.m)).unwrap_or(self.need);
        self.need = need;
        self.patch(json!({
            "dir": self.dir.display().to_string(), "drive": sys::drive_label(&self.dir),
            "need": need, "free": if free == u64::MAX { Value::Null } else { json!(free) },
            "sys": { "diskOk": free == u64::MAX || free >= need },
        }));
    }

    fn on_page(&mut self, cmd: &str, v: &Value) -> Option<i32> {
        match cmd {
            "lang" => {
                if let Some(l) = v.get("lang").and_then(Value::as_str) {
                    self.lang = sys::pick_language(&[l.to_string()]).to_string();
                    log::info(&format!("language {}", self.lang));
                }
            }
            "url" => {
                if let Some(u) = v.get("url").and_then(Value::as_str) {
                    shell::open_url(u);
                }
            }
            "openlog" => shell::reveal(&self.log_path),
            "copy" => {
                if let Some(t) = v.get("text").and_then(Value::as_str) {
                    self.ui.copy(t.to_string());
                }
            }
            "browse" => self.ui.browse(self.dir.clone()),
            "install" => {
                if self.busy {
                    return None;
                }
                if let Some(o) = v.get("opts") {
                    let b = |k: &str, d: bool| o.get(k).and_then(Value::as_bool).unwrap_or(d);
                    let auto = b("autostart", true);
                    // Untouched default on an existing install: keep the user's current choice.
                    self.opts.autostart = if self.opts.autostart.is_none() && auto { None } else { Some(auto) };
                    self.opts.desktop = b("desktop", true);
                    self.opts.auto_update = b("autoUpdate", true);
                }
                if let Some(l) = v.get("lang").and_then(Value::as_str) {
                    self.lang = sys::pick_language(&[l.to_string()]).to_string();
                }
                self.started = Instant::now();
                self.attempts = 0;
                self.screen = Screen::Progress;
                self.patch(json!({ "screen": "progress", "dl": { "phase": "connect" } }));
                self.start_install();
            }
            "pause" => {
                self.ctl.pause.store(true, Ordering::Relaxed);
                self.patch(json!({ "dl": { "paused": true } }));
            }
            "resume" => {
                if self.ctl.pause.swap(false, Ordering::Relaxed) {
                    self.patch(json!({ "dl": { "paused": false } }));
                } else if self.screen == Screen::Error {
                    self.retry = None;
                    self.back_to_progress();
                    self.start_install();
                }
            }
            "retry" => {
                self.retry = None;
                self.back_to_progress();
                self.start_install();
            }
            "restart" => {
                self.retry = None;
                if let Some(r) = &self.release {
                    let _ = crate::download::Downloader::new(&r.m, &self.layout.cache_root()).reset();
                }
                self.back_to_progress();
                self.patch(json!({ "dl": { "got": 0, "part": 1 } }));
                self.start_install();
            }
            "cancel" => {
                self.ctl.cancel.store(true, Ordering::Relaxed);
                if !self.busy {
                    return Some(exit::CANCELLED);
                }
            }
            "closeapp" => {
                let dir = self.dir.clone();
                log::event("l_closing", json!({}), "");
                self.spawn(move |_| JobOutcome::Closed(procs::close_all(&dir, Duration::from_secs(8))));
            }
            "keepold" => return Some(exit::KEEP_OLD),
            "later" => return Some(exit::DEFERRED),
            "update-now" => {
                self.patch(json!({ "upd": { "phase": "installing" } }));
                self.start_install();
            }
            "launch" => {
                let open = v.get("open").and_then(Value::as_str).map(|s| format!("--open={s}"));
                self.launch(open, &[]);
                return Some(exit::OK);
            }
            "close" => {
                return Some(match self.screen {
                    Screen::Done => exit::OK,
                    Screen::Error if self.args.mode == Mode::Migrate => exit::KEEP_OLD,
                    _ => exit::CANCELLED,
                });
            }
            _ => log::warn(&format!("unknown page command {cmd}")),
        }
        None
    }

    fn back_to_progress(&mut self) {
        let scr = match self.args.mode {
            Mode::Migrate => Screen::Migration,
            Mode::Update => Screen::Update,
            _ => Screen::Progress,
        };
        self.screen = scr;
        let name = match scr {
            Screen::Migration => "migration",
            Screen::Update => "update",
            _ => "progress",
        };
        self.patch(json!({ "screen": name, "err": Value::Null }));
        if scr == Screen::Update {
            self.patch(json!({ "upd": { "phase": "installing" } }));
        }
    }

    fn launch(&self, open: Option<String>, extra: &[String]) {
        let exe = job::exe_in(&self.dir);
        let mut a: Vec<String> = extra.to_vec();
        if let Some(o) = open {
            a.push(o);
        }
        if shell::launch(&exe, &a) {
            log::event("l_launch", json!({}), "");
        }
    }

    fn start_install(&mut self) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.ctl.cancel.store(false, Ordering::Relaxed);
        self.ctl.pause.store(false, Ordering::Relaxed);
        let dir = self.dir.clone();
        let opts = self.opts.clone();
        let have = self.release.clone();
        let close_first = self.args.mode == Mode::Update;
        self.spawn(move |c| {
            let r = (|| {
                let rel = match have {
                    Some(r) => r,
                    None => Arc::new(job::load_release(&c)?),
                };
                c.patch(json!({ "version": rel.m.version }));
                let zip = job::fetch_payload(&c, &rel)?;
                if close_first {
                    log::event("l_closing", json!({}), "");
                    procs::close_all(&dir, Duration::from_secs(8));
                }
                let rep = job::install_files(&c, &rel, &zip, &dir, &opts)?;
                Ok((rel, rep))
            })();
            JobOutcome::Installed(r)
        });
    }

    fn show_error(&mut self, e: JobError, kind_override: Option<&str>) {
        let kind = kind_override.unwrap_or(if self.args.mode == Mode::Migrate && !matches!(e, JobError::Net { .. } | JobError::Locked { .. } | JobError::Disk { .. }) { "migrate" } else { e.kind() });
        log::error(&format!("error {kind} {}", e.code()));
        if self.screen == Screen::Update {
            self.patch(json!({ "upd": { "phase": "error", "code": e.code() } }));
            return;
        }
        let st = self.release.as_ref().map(|r| {
            let d = crate::download::Downloader::new(&r.m, &self.layout.cache_root());
            let s = d.load();
            (d.bytes_done(&s), d.parts_done(&s), r.m.part_count(), r.m.payload.size)
        });
        let (got, ready, parts, total) = st.unwrap_or((0, 0, 0, 0));
        let pct = if total > 0 { got as f64 * 100.0 / total as f64 } else { 0.0 };
        let net = sys::net_state();
        let mut err = json!({
            "kind": kind, "code": e.code(), "pct": pct.floor(), "partsReady": ready, "kept": got, "left": total.saturating_sub(got),
            "diag": { "net": net.connected, "proxy": net.vpn || http::proxy_configured(), "sig": !matches!(e, JobError::Integrity { sig_ok: false, .. }) },
            "retryIn": Value::Null,
        });
        match &e {
            JobError::Disk { .. } => {
                err["need"] = json!(self.need);
                err["free"] = json!(job::free_space(&self.dir).min(1 << 50));
                err["drive"] = json!(sys::drive_label(&self.dir));
            }
            JobError::Locked { procs } => err["procs"] = json!(procs),
            JobError::Net { .. } if (self.attempts as usize) < BACKOFF.len() => {
                let wait = BACKOFF[self.attempts as usize];
                self.attempts += 1;
                self.retry = Some((Instant::now() + Duration::from_secs(wait), self.attempts));
                err["retryIn"] = json!(wait);
                err["attempt"] = json!(self.attempts);
            }
            _ => {}
        }
        self.patch(json!({ "dl": { "parts": parts, "got": got, "total": total } }));
        self.screen = Screen::Error;
        self.patch(json!({ "err": err, "screen": "error" }));
    }

    fn on_job(&mut self, out: JobOutcome) -> Option<i32> {
        match out {
            JobOutcome::Release(Ok(rel)) => {
                let m = &rel.m;
                let build = sys::os_info().build;
                let os_ok = build == 0 || build >= m.min_windows_build.max(MIN_WINDOWS_BUILD);
                self.patch(json!({
                    "version": m.version,
                    "metrics": { "download": m.payload.size },
                    "upd": { "v": m.version, "size": m.payload.size, "notes": m.note_texts(&self.lang) },
                    "mig": { "to": m.version, "days": m.legacy_backup_days.unwrap_or(14) },
                    "dl": { "files": { "done": 0, "total": m.payload.files } },
                    "sys": { "osOk": os_ok },
                }));
                self.release = Some(rel);
                self.send_welcome_disk();
                if self.screen == Screen::Update && self.args.passive {
                    self.start_install();
                }
            }
            JobOutcome::Release(Err(e)) => {
                // Offline on the welcome screen is fine: "Install" tries again and shows the error.
                log::warn(&format!("release not loaded yet: {e:?}"));
                if self.screen == Screen::Update {
                    self.show_error(e, None);
                }
            }
            JobOutcome::Closed(ok) => {
                if ok {
                    self.back_to_progress();
                    self.start_install();
                } else {
                    self.show_error(JobError::Locked { procs: procs::running_in(&self.dir).len().max(1) }, None);
                }
            }
            JobOutcome::Installed(r) => {
                self.busy = false;
                match r {
                    Ok((rel, rep)) => return self.on_installed(rel, rep),
                    Err(JobError::Cancelled) => return Some(exit::CANCELLED),
                    Err(e) => self.show_error(e, None),
                }
            }
        }
        None
    }

    fn on_installed(&mut self, rel: Arc<Release>, rep: Report) -> Option<i32> {
        self.release = Some(rel.clone());
        let secs = self.started.elapsed().as_secs();
        log::info(&format!("installed {} files, {} bytes in {secs}s", rep.files, rep.bytes));
        match self.args.mode {
            Mode::Update => {
                self.patch(json!({ "upd": { "phase": "done", "v": rel.m.version } }));
                std::thread::sleep(Duration::from_millis(1200));
                if self.args.relaunch || !self.args.passive {
                    shell::launch(&job::exe_in(&self.dir), &relaunch_args(&self.args));
                }
                Some(exit::OK)
            }
            Mode::Migrate => {
                self.run_migration_rows(&rep);
                None
            }
            _ => {
                let desk = match rep.desktop {
                    shell::LinkOutcome::Created => "added",
                    shell::LinkOutcome::Kept | shell::LinkOutcome::Retargeted => "kept",
                    shell::LinkOutcome::Skipped => "none",
                };
                self.screen = Screen::Done;
                self.patch(json!({ "screen": "done", "done": { "secs": secs.max(1), "files": rep.files, "autostart": rep.autostart, "desktop": desk } }));
                None
            }
        }
    }

    /// Rows of the migration screen, run in order on the engine thread (each is quick).
    fn run_migration_rows(&mut self, rep: &Report) {
        let l = self.layout.clone();
        let sum = migrate::summary(&l);
        let row = |me: &Engine, id: &str, v: Value| me.patch(json!({ "mig": { "installing": false, "rows": { id: v } } }));

        row(self, "set", json!({ "st": "run" }));
        let n = migrate::copy_settings(&l);
        let n = sum.settings.unwrap_or(n);
        log::event("l_mig_settings", json!({ "n": n }), "");
        row(self, "set", json!({ "st": "ok", "n": n }));

        row(self, "ses", json!({ "st": "run" }));
        let ok = migrate::session_available(&l);
        if ok {
            log::event("l_mig_session", json!({}), "");
        } else {
            log::warn("no session handoff; one more sign-in");
        }
        row(self, "ses", json!({ "st": if ok { "ok" } else { "warn" } }));

        row(self, "sh", json!({ "st": "run" }));
        let shell_n = sum.shortcuts.unwrap_or(rep.shell_items + 1);
        log::event("l_mig_shell", json!({ "n": shell_n }), "");
        row(self, "sh", json!({ "st": "ok", "n": shell_n }));

        let total = migrate::cache_bytes(&l).max(1);
        row(self, "cl", json!({ "st": "run", "done": 0, "total": total }));
        let me = &*self;
        let mut last = Instant::now();
        let done = migrate::clean_caches(&l, |d| {
            if last.elapsed() > Duration::from_millis(100) {
                last = Instant::now();
                row(me, "cl", json!({ "st": "run", "done": d, "total": total }));
            }
        });
        log::event("l_mig_clean", json!({ "size": done }), "");
        row(self, "cl", json!({ "st": "ok" }));
        self.patch(json!({ "mig": { "finished": true, "launchIn": 3 } }));
        self.launch_at = Some(Instant::now() + Duration::from_secs(3));
    }
}
