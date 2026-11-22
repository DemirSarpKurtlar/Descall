//! Descall+ desktop features on Tauri 2 (port of frontend/electron/premium/).
//!
//! Same contract as electron/premium/index.cjs, so the web app needs no change:
//! - the page calls `window.descallPremium.invoke('premium:<feature>:<verb>', ...args)` and
//!   listens with `descallPremium.on('premium:...', fn)` (app/shim/premium-shim.js);
//! - every call is checked: channel allow-list, sender window, entitlement gate (renderer claim
//!   ∩ the shell's own GET /api/premium/me), feature switch; a feature module runs only while
//!   `gate.has(key)` and its `features.<key>.enabled` setting is not false;
//! - settings live in `<app data>/premium-settings.json` and `<app data>/premium/*.json`.
//!
//! Wiring in main.rs (the only lines this module needs there):
//!   `mod premium;`, `.plugin(premium::init())`, and in `generate_handler!`:
//!   `premium::premium_invoke, premium::premium_blob_put, premium::premium_blob_take,
//!    premium::premium_hud_action`.
//! Optional hooks for the shell (tray, notifications, portal windows, token, locale) are the
//! `pub fn`s at the end of this file.

// Shared with desktop/premium-logic (Linux tests); some helpers are only used there.
#[allow(dead_code)]
pub mod logic;

mod clip;
mod features;
mod hotkeys;
mod overlay;
mod platform;
mod raw_input;
// Reached through the shell hooks below (notifications, tray) once the shell wires them.
#[allow(dead_code)]
mod toast;
#[allow(dead_code)]
pub mod tray;
mod wins;

use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Webview, WindowEvent, Wry};

use logic::gate::{Gate, VerifyError};
use logic::rules;
use logic::store::Store;
use logic::tray::TrayItem;

pub(crate) const DEFAULT_API: &str = "https://des-call.onrender.com";

// ---- small helpers -----------------------------------------------------------------------------

pub(crate) fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub(crate) fn iso_now() -> String {
    // RFC 3339 in UTC without a date crate: days since epoch -> civil date.
    let ms = now_ms();
    let secs = ms / 1000;
    let (days, rem) = (secs / 86_400, secs % 86_400);
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3600, rem % 3600 / 60, rem % 60, ms % 1000)
}

pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn arg(args: &[Value], i: usize) -> Value {
    args.get(i).cloned().unwrap_or(Value::Null)
}

pub(crate) fn ok(extra: Value) -> Value {
    let mut v = json!({ "ok": true });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
        for (k, x) in e {
            o.insert(k.clone(), x.clone());
        }
    }
    v
}

pub(crate) fn fail(code: &str) -> Value {
    json!({ "ok": false, "error": code })
}

// ---- feature contract -----------------------------------------------------------------------------

/// Who may call a channel: the main window only, or also the Descall+ app windows
/// (pop-outs, the quick launcher). Electron `{ from: 'main' | 'app' }`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum From {
    Main,
    App,
}

pub(crate) struct Caller {
    /// Window kind: "main" or the kind of a tracked Descall+ window.
    pub kind: String,
}

/// Bus messages between the host, the shell's window events and the feature modules. Handled
/// one at a time on the bus thread, never on the UI thread.
#[derive(Clone, Debug)]
pub(crate) enum Bus {
    Reconcile,
    Call,
    App,
    Settings(String),
    WindowOpened { label: String, kind: String },
    WindowClosed { label: String },
    ModulesChanged,
    BeforeQuit,
    SidebarReveal(Option<(i32, i32)>),
    PopoutOpen { route: String, bounds: Option<logic::geom::Rect> },
    Displays,
    Moved(String),
    Resized(String),
    Focus(String, bool),
    Minimized(String),
    SessionLock(bool),
    Tick { key: &'static str, tag: &'static str, gen: u64 },
    Reverify(u64),
    Flush,
}

pub(crate) trait Feature: Send + Sync {
    fn key(&self) -> &'static str;
    fn channels(&self) -> &'static [(&'static str, From)];
    fn start(&self, _h: &Host) {}
    fn stop(&self, _h: &Host) {}
    fn call(&self, h: &Host, channel: &str, args: &[Value], caller: &Caller) -> Result<Value, String>;
    fn on_bus(&self, _h: &Host, _ev: &Bus) {}
    #[allow(dead_code)]
    fn tray(&self, _h: &Host) -> Vec<TrayItem> {
        Vec::new()
    }
    /// A click on one of this feature's tray ids ("premium|<rest>"); true when handled.
    #[allow(dead_code)]
    fn on_tray(&self, _h: &Host, _rest: &str) -> bool {
        false
    }
    /// Final notification filter (Electron notifyHooks.registerFinal): runs after quick reply
    /// on every { title, options } payload while the feature runs; None drops it.
    fn notify_filter(&self, _h: &Host, payload: Value) -> Option<Value> {
        Some(payload)
    }
}

// ---- host -------------------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub(crate) struct AuxEntry {
    pub kind: String,
    pub meta: Value,
}

type TokenReader = Box<dyn Fn(&AppHandle) -> Option<String> + Send + Sync>;
type AppHook = Box<dyn Fn(&AppHandle) + Send + Sync>;
type BootProvider = Box<dyn Fn(&AppHandle, &str) -> Option<String> + Send + Sync>;

#[derive(Default)]
struct Hooks {
    token_reader: Option<TokenReader>,
    tray_rebuild: Option<AppHook>,
    boot_script: Option<BootProvider>,
}

struct Blob {
    bytes: Vec<u8>,
    at: Instant,
}

pub(crate) struct Host {
    pub app: AppHandle,
    pub gate: Mutex<Gate>,
    store: Mutex<Store>,
    pub call_state: Mutex<Value>,
    pub app_state: Mutex<Value>,
    running: Mutex<BTreeSet<&'static str>>,
    features: Vec<Arc<dyn Feature>>,
    bus_tx: Mutex<Sender<Bus>>,
    pub windows: Mutex<HashMap<String, AuxEntry>>,
    renderer_token: Mutex<String>,
    hooks: Mutex<Hooks>,
    locale: Mutex<Option<String>>,
    blobs: Mutex<HashMap<u64, Blob>>,
    next_id: AtomicU64,
    verify_gen: AtomicU64,
    flush_pending: Mutex<bool>,
    pub hotkeys: hotkeys::HotkeyManager,
    pub data_dir: PathBuf,
}

static HOST: OnceLock<Arc<Host>> = OnceLock::new();

pub(crate) fn host() -> Option<&'static Arc<Host>> {
    HOST.get()
}

impl Host {
    fn new(app: AppHandle) -> (Arc<Host>, std::sync::mpsc::Receiver<Bus>) {
        let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("Descall"));
        let store = Store::open(&data_dir.join("premium-settings.json"));
        let (tx, rx) = channel();
        let h = Arc::new(Host {
            hotkeys: hotkeys::HotkeyManager::new(app.clone()),
            app,
            gate: Mutex::new(Gate::new()),
            store: Mutex::new(store),
            call_state: Mutex::new(json!({ "active": false })),
            app_state: Mutex::new(json!({ "unread": 0 })),
            running: Mutex::new(BTreeSet::new()),
            features: features::all(),
            bus_tx: Mutex::new(tx),
            windows: Mutex::new(HashMap::new()),
            renderer_token: Mutex::new(String::new()),
            hooks: Mutex::new(Hooks::default()),
            locale: Mutex::new(None),
            blobs: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            verify_gen: AtomicU64::new(0),
            flush_pending: Mutex::new(false),
            data_dir,
        });
        (h, rx)
    }

    // -- bus and timers --

    pub fn bus(&self, ev: Bus) {
        let _ = lock(&self.bus_tx).send(ev);
    }

    /// Deliver `ev` on the bus after `ms`; features ignore stale ticks with their own
    /// generation counter. A timer task on the async runtime: it was an OS thread per timer,
    /// and the debounces (widget / sidebar moves, window snaps, settings flush) start one per
    /// event, so a drag created and tore down a thread for every Moved event.
    pub fn after(&self, ms: u64, ev: Bus) {
        let tx = lock(&self.bus_tx).clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(ms)).await;
            let _ = tx.send(ev);
        });
    }

    pub fn tick(&self, key: &'static str, tag: &'static str, gen: u64, ms: u64) {
        self.after(ms, Bus::Tick { key, tag, gen });
    }

    /// Repeating tick on one thread until the returned flag is set (polling features).
    pub fn every(&self, key: &'static str, tag: &'static str, ms: u64) -> Arc<std::sync::atomic::AtomicBool> {
        let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop.clone();
        let tx = lock(&self.bus_tx).clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(ms));
            if flag.load(Ordering::Relaxed) || tx.send(Bus::Tick { key, tag, gen: 0 }).is_err() {
                break;
            }
        });
        stop
    }

    pub fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    // -- renderer events --

    /// Event to the main window's renderer (`descallPremium.on`). Channel must be premium:*.
    pub fn send(&self, channel: &str, payload: Value) -> bool {
        if !channel.starts_with("premium:") || self.app.get_webview_window("main").is_none() {
            return false;
        }
        self.app.emit_to("main", channel, payload).is_ok()
    }

    // -- settings --

    pub fn store(&self) -> MutexGuard<'_, Store> {
        lock(&self.store)
    }

    pub fn feature_settings(&self, key: &str) -> Map<String, Value> {
        self.store().feature(key)
    }

    pub fn setting_bool(&self, path: &str, fallback: bool) -> bool {
        self.store().get_bool(path, fallback)
    }

    pub fn store_set(&self, path: &str, value: Value) {
        let changed_enabled = path.starts_with("features.") && (path.ends_with(".enabled") || path.matches('.').count() == 1);
        let _ = self.store().set(path, value);
        self.schedule_flush();
        if changed_enabled {
            self.bus(Bus::Reconcile);
        }
    }

    pub fn patch_feature(&self, key: &str, patch: &Value) -> Map<String, Value> {
        let next = self.store().patch_feature(key, patch);
        self.schedule_flush();
        self.bus(Bus::Reconcile);
        next
    }

    fn schedule_flush(&self) {
        let mut p = lock(&self.flush_pending);
        if !*p {
            *p = true;
            self.after(400, Bus::Flush);
        }
    }

    pub fn flush(&self) {
        *lock(&self.flush_pending) = false;
        self.store().flush();
    }

    /// compat.cjs c.store(name): `<app data>/premium/<name>.json`.
    pub fn premium_dir(&self) -> PathBuf {
        let d = self.data_dir.join("premium");
        let _ = std::fs::create_dir_all(&d);
        d
    }

    pub fn read_json(&self, name: &str) -> Option<Value> {
        logic::store::read_json(&self.premium_dir(), name)
    }

    pub fn write_json(&self, name: &str, v: &Value) -> bool {
        logic::store::write_json(&self.premium_dir(), name, v)
    }

    // -- state --

    pub fn has(&self, key: &str) -> bool {
        lock(&self.gate).has(key)
    }

    pub fn is_running(&self, key: &str) -> bool {
        lock(&self.running).contains(key)
    }

    pub fn in_call(&self) -> bool {
        lock(&self.call_state).get("active").and_then(Value::as_bool).unwrap_or(false)
    }

    pub fn locale(&self) -> String {
        if let Some(l) = lock(&self.locale).clone() {
            return l;
        }
        std::fs::read_to_string(self.data_dir.join("ui-locale.json"))
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.get("locale").and_then(Value::as_str).and_then(logic::i18n::match_locale).map(str::to_string))
            .unwrap_or_else(|| "en".into())
    }

    pub fn et(&self, key: &str, vars: &[(&str, &str)]) -> String {
        logic::i18n::et(&self.locale(), key, vars)
    }

    pub fn refresh_tray(&self) {
        let hooks = lock(&self.hooks);
        if let Some(f) = &hooks.tray_rebuild {
            f(&self.app);
        }
    }

    pub fn renderer_token(&self) -> String {
        lock(&self.renderer_token).clone()
    }

    pub fn boot_script_for(&self, label: &str) -> Option<String> {
        lock(&self.hooks).boot_script.as_ref().and_then(|f| f(&self.app, label))
    }

    /// The shell's single "bring Descall back" path (state::show_main, Electron premium
    /// ctx.showMainWindow): on the event loop thread, so the focus really lands (this bus
    /// runs on its own thread), back on the taskbar, and the page told it is in front again
    /// (app:visibility). A toast click, a Descall+ hotkey or tray entry after a hide to the
    /// tray used to leave html.app-backgrounded on, so the page kept its animations paused
    /// and held DM read receipts back.
    pub fn show_main(&self) {
        crate::state::show_main(&self.app);
    }

    // -- blobs (ArrayBuffers across IPC) --

    pub fn put_blob(&self, bytes: Vec<u8>) -> Value {
        let id = self.next_id();
        let size = bytes.len();
        let mut b = lock(&self.blobs);
        b.retain(|_, x| x.at.elapsed() < Duration::from_secs(120));
        let held: Vec<(u64, usize)> = b.iter().map(|(k, x)| (*k, x.bytes.len())).collect();
        for old in rules::blobs_to_evict(&held, size) {
            b.remove(&old);
        }
        b.insert(id, Blob { bytes, at: Instant::now() });
        json!({ "__blob": id, "size": size })
    }

    /// Is the `{ __blob }` placeholder still held (not evicted by the 300 MB cap)?
    pub fn has_blob(&self, v: &Value) -> bool {
        v.get("__blob").and_then(Value::as_u64).is_some_and(|id| lock(&self.blobs).contains_key(&id))
    }

    pub fn take_blob(&self, v: &Value) -> Option<Vec<u8>> {
        let id = v.get("__blob")?.as_u64()?;
        lock(&self.blobs).remove(&id).map(|b| b.bytes)
    }

    // -- modules --

    fn enabled_for(&self, key: &str) -> bool {
        match self.store().get(&format!("features.{key}.enabled")) {
            Some(Value::Bool(b)) => b,
            _ => !logic::OFF_BY_DEFAULT.contains(&key),
        }
    }

    fn reconcile(&self) {
        let mut changed = false;
        for f in &self.features {
            let key = f.key();
            let want = self.has(key) && self.enabled_for(key);
            let running = self.is_running(key);
            if want && !running {
                lock(&self.running).insert(key);
                let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f.start(self)));
                if r.is_err() {
                    log::error!("[premium] {key} failed to start");
                    lock(&self.running).remove(key);
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f.stop(self)));
                } else {
                    log::info!("[premium] started {key}");
                }
                changed = true;
            } else if !want && running {
                lock(&self.running).remove(key);
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f.stop(self)));
                log::info!("[premium] stopped {key}");
                changed = true;
            }
        }
        if changed {
            self.dispatch_bus(&Bus::ModulesChanged);
            self.refresh_tray();
        }
    }

    fn dispatch_bus(&self, ev: &Bus) {
        for f in &self.features {
            if self.is_running(f.key()) {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f.on_bus(self, ev)));
            }
        }
    }

    fn run_bus(self: &Arc<Self>, ev: Bus) {
        match &ev {
            Bus::Reconcile => self.reconcile(),
            Bus::Flush => self.flush(),
            Bus::Reverify(gen) => {
                if *gen == self.verify_gen.load(Ordering::Relaxed) {
                    self.request_verify(true);
                }
            }
            Bus::WindowClosed { label, .. } => {
                lock(&self.windows).remove(label);
                self.dispatch_bus(&ev);
            }
            Bus::BeforeQuit => {
                self.dispatch_bus(&ev);
                self.flush();
            }
            _ => {
                wins::on_bus(self, &ev);
                self.dispatch_bus(&ev);
            }
        }
    }

    // -- gate --

    async fn fetch_me(&self) -> Result<Value, VerifyError> {
        let file = lock(&self.hooks).token_reader.as_ref().and_then(|f| f(&self.app)).unwrap_or_default();
        let mut tokens: Vec<String> = Vec::new();
        for t in [file, self.renderer_token()] {
            if !t.is_empty() && !tokens.contains(&t) {
                tokens.push(t);
            }
        }
        if tokens.is_empty() {
            return Err(VerifyError::NoToken);
        }
        let base = std::env::var("DESCALL_API_URL").ok().map(|s| s.trim().trim_end_matches('/').to_string()).filter(|s| s.starts_with("https://")).unwrap_or_else(|| DEFAULT_API.into());
        let client = reqwest::Client::builder().timeout(Duration::from_secs(15)).build().map_err(|_| VerifyError::Network)?;
        let mut last = VerifyError::Network;
        for t in tokens {
            match client.get(format!("{base}/api/premium/me")).bearer_auth(&t).header("Accept", "application/json").send().await {
                Ok(res) if res.status().is_success() => return res.json::<Value>().await.map_err(|_| VerifyError::Network),
                Ok(res) => last = VerifyError::Http(res.status().as_u16()),
                Err(_) => return Err(VerifyError::Network), // the same for the other token
            }
        }
        Err(last)
    }

    fn request_verify(self: &Arc<Self>, force: bool) {
        {
            let mut g = lock(&self.gate);
            if !g.should_verify(force, now_ms()) {
                return;
            }
            g.verifying = true;
        }
        let h = self.clone();
        tauri::async_runtime::spawn(async move {
            h.verify_now().await;
        });
    }

    async fn verify_now(self: &Arc<Self>) {
        let res = self.fetch_me().await;
        let changed = {
            let mut g = lock(&self.gate);
            match &res {
                Ok(body) => g.verify_ok(body, now_ms()),
                Err(e) => {
                    log::warn!("[premium] verify failed: {}", logic::gate::failure_code(e));
                    g.verify_err(e, now_ms())
                }
            }
        };
        if changed {
            self.bus(Bus::Reconcile);
        }
        self.schedule_reverify();
    }

    fn schedule_reverify(&self) {
        let gen = self.verify_gen.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some(ms) = lock(&self.gate).next_check_in(now_ms()) {
            self.after(ms, Bus::Reverify(gen));
        }
    }

    fn snapshot(&self) -> Value {
        lock(&self.gate).snapshot()
    }

    fn running_keys(&self) -> Vec<&'static str> {
        lock(&self.running).iter().copied().collect()
    }

    // -- dispatch --

    fn caller_for(&self, label: &str) -> Option<Caller> {
        if label == "main" {
            return Some(Caller { kind: "main".into() });
        }
        let kind = lock(&self.windows).get(label).map(|e| e.kind.clone())?;
        // Account windows run another account: never the owner's entitlements.
        if kind == "account" {
            return None;
        }
        Some(Caller { kind })
    }

    fn dispatch(self: &Arc<Self>, label: &str, channel: &str, args: Vec<Value>) -> Result<Value, String> {
        if !rules::valid_channel(channel) {
            return Err("premium channel expected".into());
        }
        // An account window's own session token (multi_account); nothing else from there.
        if channel == "premium:multi_account:token" {
            let token = args.first().and_then(Value::as_str);
            return Ok(json!({ "ok": features::multi_account::store_token(self, label, token) }));
        }
        let Some(caller) = self.caller_for(label) else { return Ok(fail("forbidden")) };
        if let Some(r) = self.core(channel, &args, &caller) {
            return r;
        }
        for f in &self.features {
            let Some((_, from)) = f.channels().iter().find(|(c, _)| *c == channel) else { continue };
            if !self.is_running(f.key()) {
                continue; // another module may own it while running (e.g. none today)
            }
            if *from == From::Main && caller.kind != "main" {
                return Ok(fail("forbidden"));
            }
            return f.call(self, channel, &args, &caller);
        }
        Ok(fail("locked"))
    }

    fn core(self: &Arc<Self>, channel: &str, args: &[Value], caller: &Caller) -> Option<Result<Value, String>> {
        let main_only = |r: Value| if caller.kind == "main" { Ok(r) } else { Ok(fail("forbidden")) };
        let a0 = arg(args, 0);
        Some(match channel {
            "premium:entitlements" => {
                if caller.kind != "main" {
                    return Some(Ok(fail("forbidden")));
                }
                let plan = a0.get("plan").and_then(Value::as_str).filter(|p| !p.is_empty()).map(str::to_string);
                let token = a0.get("token").and_then(Value::as_str).filter(|t| plan.is_some() && t.len() < 4096).unwrap_or("").to_string();
                *lock(&self.renderer_token) = token;
                let keys: Vec<String> = a0.get("keys").and_then(Value::as_array).map(|k| k.iter().map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).collect()).unwrap_or_default();
                let out = lock(&self.gate).set_entitlements(&keys, plan.as_deref(), now_ms());
                if out.changed {
                    self.bus(Bus::Reconcile);
                }
                match out.verify {
                    Some(force) => self.request_verify(force),
                    None => self.schedule_reverify(),
                }
                Ok(ok(self.snapshot()))
            }
            "premium:verify" => {
                if caller.kind != "main" {
                    return Some(Ok(fail("forbidden")));
                }
                {
                    let mut g = lock(&self.gate);
                    if g.verifying {
                        drop(g);
                        let until = Instant::now() + Duration::from_secs(20);
                        while lock(&self.gate).verifying && Instant::now() < until {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                    } else {
                        g.verifying = true;
                        drop(g);
                        tauri::async_runtime::block_on(self.verify_now());
                    }
                }
                self.reconcile();
                Ok(ok(json!({ "running": self.running_keys() }).as_object().map(|r| {
                    let mut s = self.snapshot();
                    s["running"] = r["running"].clone();
                    s
                }).unwrap_or_default()))
            }
            "premium:status" => {
                let mut s = self.snapshot();
                s["running"] = json!(self.running_keys());
                s["modules"] = json!(self.features.iter().map(|f| f.key()).collect::<Vec<_>>());
                s["platform"] = json!("win32");
                Ok(ok(s))
            }
            "premium:settings:get" => {
                if a0.is_null() {
                    return Some(Ok(ok(json!({ "features": self.store().get_or("features", json!({})) }))));
                }
                let k = a0.as_str().map(str::to_string).unwrap_or_else(|| a0.to_string());
                if !rules::valid_settings_key(&k) {
                    return Some(Ok(fail("bad-key")));
                }
                Ok(ok(json!({ "settings": Value::Object(self.feature_settings(&k)) })))
            }
            "premium:settings:set" => {
                if caller.kind != "main" {
                    return Some(Ok(fail("forbidden")));
                }
                let k = a0.as_str().unwrap_or("").to_string();
                if !rules::valid_settings_key(&k) || !logic::tiers::is_contract_key(&k) {
                    return Some(Ok(fail("bad-key")));
                }
                let patch = arg(args, 1);
                let patch = if patch.is_null() { json!({}) } else { patch };
                if patch.to_string().len() > 16 * 1024 {
                    return Some(Ok(fail("too-large")));
                }
                let next = self.patch_feature(&k, &patch);
                self.bus(Bus::Settings(k.clone()));
                self.send("premium:settings-changed", json!({ "key": k, "settings": next }));
                Ok(ok(json!({ "settings": next })))
            }
            "premium:focus-main" => {
                self.show_main();
                Ok(ok(json!({})))
            }
            "premium:call-state" => main_only({
                *lock(&self.call_state) = rules::call_state(&a0);
                self.bus(Bus::Call);
                ok(json!({}))
            }),
            "premium:app-state" => main_only({
                *lock(&self.app_state) = rules::app_state(&a0);
                // The shim adds the UI language (Electron learns it from app:locale).
                if let Some(l) = a0.get("__lang").and_then(Value::as_str).and_then(logic::i18n::match_locale) {
                    let mut cur = lock(&self.locale);
                    if cur.as_deref() != Some(l) {
                        *cur = Some(l.to_string());
                        drop(cur);
                        self.refresh_tray();
                    }
                }
                self.bus(Bus::App);
                // A toast clicked while Descall was closed opens its chat once the page is up
                // (whether or not quick_reply runs: the "toast" style is another feature).
                features::quick_reply::flush_clicks();
                ok(json!({}))
            }),
            _ => return None,
        })
    }
}

// ---- commands ----------------------------------------------------------------------------------

/// `descallPremium.invoke(channel, ...args)`. Handlers may block (dialogs, waits for the
/// renderer), so they run on the blocking pool, never on the UI thread.
#[tauri::command]
pub async fn premium_invoke(webview: Webview, channel: String, args: Vec<Value>) -> Result<Value, String> {
    let Some(h) = host().cloned() else { return Err("premium host not ready".into()) };
    let label = webview.label().to_string();
    tauri::async_runtime::spawn_blocking(move || h.dispatch(&label, &channel, args)).await.map_err(|e| e.to_string())?
}

/// Raw bytes in (an ArrayBuffer argument); returns a `{ __blob }` placeholder for the next call.
#[tauri::command]
pub fn premium_blob_put(webview: Webview, request: tauri::ipc::Request<'_>) -> Result<Value, String> {
    let h = host().ok_or("premium host not ready")?;
    let label = webview.label();
    if h.caller_for(label).is_none() && !overlay::is_overlay(label) {
        return Err("forbidden".into());
    }
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= rules::DROP_MAX_BYTES => Ok(h.put_blob(bytes.clone())),
        tauri::ipc::InvokeBody::Raw(_) => Err("too-large".into()),
        _ => Err("raw body expected".into()),
    }
}

/// Bytes of a `{ __blob }` placeholder the shell sent with an event (main window only).
#[tauri::command]
pub fn premium_blob_take(webview: Webview, id: u64) -> Result<tauri::ipc::Response, String> {
    let h = host().ok_or("premium host not ready")?;
    if webview.label() != "main" {
        return Err("forbidden".into());
    }
    h.take_blob(&json!({ "__blob": id })).map(tauri::ipc::Response::new).ok_or_else(|| "gone".into())
}

/// `window.descallHud.action(type, payload)` from a HUD / widget / drop window.
#[tauri::command]
pub fn premium_hud_action(webview: Webview, kind: String, payload: Value) -> Result<(), String> {
    let h = host().cloned().ok_or("premium host not ready")?;
    let label = webview.label().to_string();
    std::thread::spawn(move || overlay::on_action(&h, &label, &kind, payload));
    Ok(())
}

// ---- plugin ------------------------------------------------------------------------------------

/// `.plugin(premium::init())` in main.rs.
pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::<Wry>::new("descall-premium")
        .js_init_script(include_str!("../../../shim/premium-shim.js").to_string())
        .register_uri_scheme_protocol(overlay::SCHEME, |_ctx, request| overlay::serve(request))
        .setup(|app, _api| {
            let (h, rx) = Host::new(app.clone());
            let _ = HOST.set(h.clone());
            let worker = h.clone();
            std::thread::Builder::new().name("premium-bus".into()).spawn(move || {
                while let Ok(ev) = rx.recv() {
                    worker.run_bus(ev);
                }
            })?;
            // Toast replies typed while Descall was closed (cold start through COM).
            toast::register_activator(features::quick_reply::on_activation);
            platform::start_watcher(Box::new(|ev| {
                if let Some(h) = host() {
                    h.bus(ev);
                }
            }));
            log::info!("[premium] host ready: {} desktop modules", h.features.len());
            Ok(())
        })
        .on_page_load(|webview, payload| {
            // The main renderer draws the portal windows: a reload orphans them.
            if webview.label() == "main" && payload.event() == tauri::webview::PageLoadEvent::Started {
                if let Some(h) = host().cloned() {
                    std::thread::spawn(move || wins::close_portals(&h));
                }
            }
        })
        .on_event(|_app, event| {
            let Some(h) = host() else { return };
            match event {
                RunEvent::WindowEvent { label, event, .. } => match event {
                    WindowEvent::Moved(_) => h.bus(Bus::Moved(label.clone())),
                    WindowEvent::Resized(size) => {
                        if size.width == 0 && size.height == 0 {
                            h.bus(Bus::Minimized(label.clone()));
                        } else {
                            h.bus(Bus::Resized(label.clone()));
                        }
                    }
                    WindowEvent::Focused(f) => h.bus(Bus::Focus(label.clone(), *f)),
                    WindowEvent::ScaleFactorChanged { .. } => h.bus(Bus::Displays),
                    WindowEvent::Destroyed if lock(&h.windows).contains_key(label) => h.bus(Bus::WindowClosed { label: label.clone() }),
                    _ => {}
                },
                RunEvent::ExitRequested { .. } => {
                    // Right here on the event loop thread, while every window still exists, like
                    // Electron's synchronous before-quit. Posted to the bus thread, the session
                    // snapshot (session_restore) raced the windows being torn down: their bounds
                    // read failed and the pop-outs were saved as none, or the process was gone
                    // before the bus got to it. Window getters on this thread are answered
                    // directly (tauri-runtime-wry send_user_message), so this cannot block.
                    h.run_bus(Bus::BeforeQuit);
                }
                RunEvent::Exit => h.flush(),
                _ => {}
            }
        })
        .build()
}

// ---- hooks for the shell (all optional) ---------------------------------------------------------
// The prototype shell has no tray or notification capsules yet, hence the allow(dead_code).

/// Main window `on_new_window`: Descall+ portal windows (call, sidebar) open here when their
/// feature runs. `None`: not ours, the shell decides. The page opens them with
/// `window.open("about:blank", "descall-premium-<kind>")`; premium-shim.js adds the kind as a
/// URL fragment because WebView2 does not report the target name.
pub fn on_new_window(app: &AppHandle, url: &tauri::Url, features: tauri::webview::NewWindowFeatures) -> Option<tauri::webview::NewWindowResponse<Wry>> {
    let _ = app;
    wins::portal_open(host()?, url, features)
}

/// Notification hooks (notifyHooks.cjs): `None` = drop it; the payload may gain `quickReply`.
#[allow(dead_code)]
pub fn notify_filter(payload: Value) -> Option<Value> {
    let Some(h) = host() else { return Some(payload) };
    let mut p = features::quick_reply::filter(h, payload)?;
    // Final filters after quick reply, as Electron's registerFinal: app_lock redacts whatever
    // is left (sender, text, avatar, the reply box) while Descall is locked.
    for f in &h.features {
        if h.is_running(f.key()) {
            p = f.notify_filter(h, p)?;
        }
    }
    Some(p)
}

/// Native reply toast for a DM marked by [`notify_filter`]; false = show the capsule instead.
#[allow(dead_code)]
pub fn show_quick_reply(title: &str, body: &str, conv: &str, click_data: Value) -> bool {
    host().is_some_and(|h| features::quick_reply::show(h, title, body, conv, click_data))
}

/// The "toast" notification style as a native toast whose click opens the chat; false = the
/// caller falls back to the plugin notification.
pub fn show_toast(title: &str, body: &str, silent: bool, click: Value) -> bool {
    host().is_some_and(|h| features::quick_reply::show_plain(h, title, body, silent, click))
}

/// Read the session token from the shell's secure store (auth-token); the renderer's own
/// claim is the fallback, as in Electron.
#[allow(dead_code)]
pub fn set_token_reader(f: impl Fn(&AppHandle) -> Option<String> + Send + Sync + 'static) {
    if let Some(h) = host() {
        lock(&h.hooks).token_reader = Some(Box::new(f));
    }
}

/// Called by the shell after the UI language changed (app_set_locale).
#[allow(dead_code)]
pub fn set_locale(locale: &str) {
    if let (Some(h), Some(l)) = (host(), logic::i18n::match_locale(locale)) {
        *lock(&h.locale) = Some(l.to_string());
        h.refresh_tray();
        // Text drawn from the language outside the tray (taskbar thumbnail tooltips).
        h.bus(Bus::App);
    }
}

/// The shell rebuilds its tray menu (calling [`tray::append`]) when Descall+ items change.
#[allow(dead_code)]
pub fn set_tray_rebuilder(f: impl Fn(&AppHandle) + Send + Sync + 'static) {
    if let Some(h) = host() {
        lock(&h.hooks).tray_rebuild = Some(Box::new(f));
    }
}

/// Boot script (window.__DESCALL_BOOT__ ...) for a Descall+ app window the premium module
/// opens (pop-outs "popout-*", accounts "acct-*"). Without it a minimal boot object is used.
#[allow(dead_code)]
pub fn set_boot_script_provider(f: impl Fn(&AppHandle, &str) -> Option<String> + Send + Sync + 'static) {
    if let Some(h) = host() {
        lock(&h.hooks).boot_script = Some(Box::new(f));
    }
}

/// Descall+ window (portal, pop-out, launcher, HUD): the shell's notifications skip these.
#[allow(dead_code)]
pub fn is_aux_window(label: &str) -> bool {
    host().is_some_and(|h| lock(&h.windows).contains_key(label)) || overlay::is_overlay(label)
}

/// token_set / token_clear from an account window: stored for that account, not the owner.
/// Returns false when `label` is not an account window (the shell handles it).
#[allow(dead_code)]
pub fn account_token(label: &str, token: Option<&str>) -> bool {
    host().is_some_and(|h| features::multi_account::store_token(h, label, token))
}

/// token_clear from the owner's window (sign out): entitlements and the renderer's token go,
/// so Descall+ features stop at once, as Electron's secure-token:clear called gate.reset().
pub fn signed_out() {
    if let Some(h) = host() {
        lock(&h.renderer_token).clear();
        if lock(&h.gate).reset() {
            h.bus(Bus::Reconcile);
        }
    }
}
