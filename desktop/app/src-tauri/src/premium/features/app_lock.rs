//! app_lock (Plus): PIN lock with a salted scrypt hash (the Electron record format), sealed
//! with DPAPI in `premium/app-lock.bin`. Locks on system idle (GetLastInputInfo every 15 s,
//! only while armed), on minimize and on the Windows session lock, each optional. The lock
//! screen is drawn by the renderer; the shell holds the locked flag so a reload stays locked.
//! A UI lock, not encryption at rest.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};

use super::Poll;
use crate::premium::logic::pin::{hash_pin, lockout_ms, valid_pin, verify_pin};
use crate::premium::logic::rules::{num, redact_locked, truthy};
use crate::premium::{arg, lock, now_ms, ok, platform, Bus, Caller, Feature, From, Host};

#[derive(Clone)]
struct Config {
    enabled: bool,
    idle_minutes: u64,
    on_minimize: bool,
    on_system_lock: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self { enabled: false, idle_minutes: 10, on_minimize: true, on_system_lock: true }
    }
}

impl Config {
    fn json(&self) -> Value {
        json!({ "enabled": self.enabled, "idleMinutes": self.idle_minutes, "onMinimize": self.on_minimize, "onSystemLock": self.on_system_lock })
    }
}

#[derive(Default)]
pub struct F {
    locked: AtomicBool,
    failures: AtomicU32,
    blocked_until: AtomicU64,
    config: Mutex<Config>,
    record: Mutex<Option<Value>>,
    encrypted: AtomicBool,
    idle: Poll,
}

/// The PIN record (salted scrypt hash, never the PIN) lives DPAPI-sealed in the shell's secret
/// store as `app-lock` (crate::secure_store::APP_LOCK), where the Electron import puts it.
fn load_record(h: &Host) -> (Option<Value>, bool) {
    let rec = crate::secure_store::get(&h.app, crate::secure_store::APP_LOCK).and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(Value::is_object);
    (rec, cfg!(windows))
}

fn write_record(h: &Host, rec: &Value) -> bool {
    crate::secure_store::set(&h.app, crate::secure_store::APP_LOCK, &rec.to_string())
}

impl F {
    fn record(&self) -> Option<Value> {
        lock(&self.record).clone()
    }

    fn pin_length(&self) -> Option<u64> {
        self.record().and_then(|r| r.get("len").and_then(|l| num(Some(l)))).filter(|n| n.fract() == 0.0 && (4.0..=12.0).contains(n)).map(|n| n as u64)
    }

    fn do_lock(&self, h: &Host, reason: &str) -> Value {
        if !lock(&self.config).enabled || self.record().is_none() {
            return json!({ "ok": false, "error": "no_pin" });
        }
        self.locked.store(true, Ordering::Relaxed);
        h.send("premium:app_lock:locked", json!({ "locked": true, "reason": reason }));
        ok(json!({ "locked": true }))
    }

    fn status(&self) -> Value {
        ok(json!({
            "hasPin": self.record().is_some(),
            "pinLength": self.pin_length(),
            "locked": self.locked.load(Ordering::Relaxed),
            "config": lock(&self.config).json(),
            "encrypted": self.encrypted.load(Ordering::Relaxed),
            "retryInMs": self.blocked_until.load(Ordering::Relaxed).saturating_sub(now_ms()),
            "hello": false,
        }))
    }

    fn arm(&self, h: &Host) {
        let c = lock(&self.config).clone();
        if c.enabled && c.idle_minutes > 0 {
            if !self.idle.on() {
                self.idle.start(h, "app_lock", "idle", 15_000);
            }
        } else {
            self.idle.stop();
        }
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "app_lock"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[
            ("premium:app_lock:status", From::Main),
            ("premium:app_lock:set-pin", From::Main),
            ("premium:app_lock:clear-pin", From::Main),
            ("premium:app_lock:config", From::Main),
            ("premium:app_lock:lock", From::Main),
            ("premium:app_lock:unlock", From::Main),
        ]
    }
    fn start(&self, h: &Host) {
        let saved = h.read_json("app_lock").unwrap_or(json!({}));
        let (rec, enc) = load_record(h);
        self.encrypted.store(enc, Ordering::Relaxed);
        let mut c = Config::default();
        if let Some(n) = num(saved.get("idleMinutes")) {
            c.idle_minutes = n.round().clamp(0.0, 240.0) as u64;
        }
        c.on_minimize = saved.get("onMinimize") != Some(&Value::Bool(false));
        c.on_system_lock = saved.get("onSystemLock") != Some(&Value::Bool(false));
        c.enabled = truthy(saved.get("enabled")) && rec.is_some();
        *lock(&self.record) = rec;
        *lock(&self.config) = c;
        self.arm(h);
    }
    fn stop(&self, h: &Host) {
        self.idle.stop();
        // Membership gone: the lock is released (a premium feature must not lock people out).
        if self.locked.swap(false, Ordering::Relaxed) {
            h.send("premium:app_lock:locked", json!({ "locked": false }));
        }
    }
    fn call(&self, h: &Host, ch: &str, args: &[Value], _c: &Caller) -> Result<Value, String> {
        let pin = arg(args, 0);
        let pin = pin.as_str().unwrap_or("").to_string();
        Ok(match ch {
            "premium:app_lock:status" => self.status(),
            "premium:app_lock:set-pin" => {
                if !valid_pin(&pin) {
                    return Ok(json!({ "ok": false, "error": "invalid" }));
                }
                let current = arg(args, 1);
                if let Some(rec) = self.record() {
                    if !verify_pin(current.as_str().unwrap_or(""), Some(&rec)) {
                        return Ok(json!({ "ok": false, "error": "wrong_pin" }));
                    }
                }
                let Some(mut rec) = hash_pin(&pin, None) else { return Ok(json!({ "ok": false, "error": "invalid" })) };
                rec["len"] = json!(pin.len());
                if !write_record(h, &rec) {
                    return Ok(json!({ "ok": false, "error": "write_failed" }));
                }
                *lock(&self.record) = Some(rec);
                ok(json!({}))
            }
            "premium:app_lock:clear-pin" => {
                if let Some(rec) = self.record() {
                    if !verify_pin(&pin, Some(&rec)) {
                        return Ok(json!({ "ok": false, "error": "wrong_pin" }));
                    }
                }
                crate::secure_store::set(&h.app, crate::secure_store::APP_LOCK, "");
                *lock(&self.record) = None;
                let cfg = {
                    let mut c = lock(&self.config);
                    c.enabled = false;
                    c.json()
                };
                h.write_json("app_lock", &cfg);
                self.locked.store(false, Ordering::Relaxed);
                self.arm(h);
                ok(json!({}))
            }
            "premium:app_lock:config" => {
                let raw = arg(args, 0);
                let cfg = {
                    let mut c = lock(&self.config);
                    c.enabled = truthy(raw.get("enabled")) && self.record().is_some();
                    if let Some(n) = num(raw.get("idleMinutes")) {
                        c.idle_minutes = n.round().clamp(0.0, 240.0) as u64;
                    }
                    c.on_minimize = raw.get("onMinimize") != Some(&Value::Bool(false));
                    c.on_system_lock = raw.get("onSystemLock") != Some(&Value::Bool(false));
                    c.json()
                };
                h.write_json("app_lock", &cfg);
                self.arm(h);
                self.status()
            }
            "premium:app_lock:lock" => self.do_lock(h, "manual"),
            _ => {
                let now = now_ms();
                let until = self.blocked_until.load(Ordering::Relaxed);
                if now < until {
                    return Ok(json!({ "ok": false, "error": "blocked", "retryInMs": until - now }));
                }
                let Some(rec) = self.record() else {
                    self.locked.store(false, Ordering::Relaxed);
                    return Ok(ok(json!({ "locked": false })));
                };
                if !verify_pin(&pin, Some(&rec)) {
                    let n = self.failures.fetch_add(1, Ordering::Relaxed) + 1;
                    let next = now + lockout_ms(n);
                    self.blocked_until.store(next, Ordering::Relaxed);
                    return Ok(json!({ "ok": false, "error": "wrong_pin", "retryInMs": next - now }));
                }
                self.failures.store(0, Ordering::Relaxed);
                self.blocked_until.store(0, Ordering::Relaxed);
                self.locked.store(false, Ordering::Relaxed);
                if self.pin_length().is_none() {
                    let mut r = rec.clone();
                    r["len"] = json!(pin.len());
                    if write_record(h, &r) {
                        *lock(&self.record) = Some(r);
                    }
                }
                h.send("premium:app_lock:locked", json!({ "locked": false }));
                ok(json!({ "locked": false }))
            }
        })
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        let c = lock(&self.config).clone();
        if !c.enabled {
            return;
        }
        match ev {
            Bus::Tick { key: "app_lock", tag: "idle", .. } if !self.locked.load(Ordering::Relaxed) && c.idle_minutes > 0 => {
                if platform::idle_seconds() >= c.idle_minutes * 60 {
                    self.do_lock(h, "idle");
                }
            }
            Bus::Minimized(l) if l == "main" && c.on_minimize => {
                self.do_lock(h, "minimize");
            }
            Bus::SessionLock(true) if c.on_system_lock => {
                self.do_lock(h, "system");
            }
            _ => {}
        }
    }
    /// While locked, a capsule or toast shows nothing personal (Electron app_lock.cjs
    /// notificationFilter with appLockRedact.cjs; the Tauri shell showed sender and text).
    fn notify_filter(&self, h: &Host, payload: Value) -> Option<Value> {
        if !self.locked.load(Ordering::Relaxed) {
            return Some(payload);
        }
        Some(redact_locked(&payload, &crate::state::et(&h.app, "notif.locked", &[])))
    }
}
