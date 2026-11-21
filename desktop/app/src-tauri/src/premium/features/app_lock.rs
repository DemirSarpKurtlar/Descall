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
use crate::premium::logic::rules::{num, truthy};
use crate::premium::{arg, lock, now_ms, ok, platform, wins, Bus, Caller, Feature, From, Host};

/// Locked right now, for the notification filter (premium::notify_filter).
static LOCKED_NOW: AtomicBool = AtomicBool::new(false);
/// Windows hidden by the lock, shown again on unlock.
static HIDDEN: Mutex<Vec<String>> = Mutex::new(Vec::new());
const LOCKED_TAG: &str = "descall-locked";

pub(crate) fn is_locked() -> bool {
    LOCKED_NOW.load(Ordering::Relaxed)
}

/// appLockRedact.cjs: while locked a toast carries no sender, preview, avatar or quick reply.
/// Messages become one generic notice under one tag; calls still ring, as "Descall", without
/// the caller's or the group's name. Every other decoration is dropped on purpose.
pub(crate) fn redact(payload: &Value, locked_text: &str) -> Value {
    let empty = json!({});
    let options = payload.get("options").filter(|v| v.is_object()).unwrap_or(&empty);
    let data = options.get("data").filter(|v| v.is_object()).unwrap_or(&empty);
    let kind = data.get("type").and_then(Value::as_str).unwrap_or("");
    let is_call = kind == "call" || kind == "group-call";
    let mut out_data = json!({});
    if is_call {
        let call_type = if data.get("callType").and_then(Value::as_str) == Some("video") { "video" } else { "voice" };
        out_data = json!({ "type": kind, "callType": call_type });
        for k in ["callId", "groupId"] {
            if let Some(v) = data.get(k).filter(|v| !v.is_null()) {
                out_data[k] = v.clone();
            }
        }
    }
    let body = if is_call { "" } else { locked_text };
    let mut out = json!({
        "title": "Descall",
        "options": {
            "body": body,
            "requireInteraction": truthy(options.get("requireInteraction")),
            "silent": truthy(options.get("silent")),
            "avatarUrl": Value::Null,
            "data": out_data,
        },
    });
    if !is_call {
        out["options"]["tag"] = json!(LOCKED_TAG);
    } else if let Some(t) = options.get("tag").filter(|v| !v.is_null()) {
        out["options"]["tag"] = t.clone();
    }
    out
}

/// Electron's hideOtherWindows: pop-outs and account windows hide until the PIN is entered;
/// the main window draws the lock screen itself.
fn hide_others(h: &Host) {
    let mut hidden = lock(&HIDDEN);
    for (label, e) in wins::list(h, None) {
        if !matches!(e.kind.as_str(), "popout" | "account") {
            continue;
        }
        if let Some(w) = h.app.get_webview_window(&label) {
            if w.is_visible().unwrap_or(false) && w.hide().is_ok() {
                hidden.push(label);
            }
        }
    }
}

fn restore_others(h: &Host) {
    let labels = std::mem::take(&mut *lock(&HIDDEN));
    for label in &labels {
        if let Some(w) = h.app.get_webview_window(label) {
            let _ = w.show();
        }
    }
    if !labels.is_empty() {
        // The PIN was typed in the main window: it keeps the focus.
        if let Some(m) = h.app.get_webview_window("main") {
            let _ = m.set_focus();
        }
    }
}

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

    /// Sets the flag (also for the notification filter) and hides / restores the other app
    /// windows on a change. Returns the previous value.
    fn set_locked(&self, h: &Host, v: bool) -> bool {
        let was = self.locked.swap(v, Ordering::Relaxed);
        LOCKED_NOW.store(v, Ordering::Relaxed);
        if v && !was {
            hide_others(h);
        } else if !v && was {
            restore_others(h);
        }
        was
    }

    fn do_lock(&self, h: &Host, reason: &str) -> Value {
        if !lock(&self.config).enabled || self.record().is_none() {
            return json!({ "ok": false, "error": "no_pin" });
        }
        self.set_locked(h, true);
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
        if self.set_locked(h, false) {
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
                self.set_locked(h, false);
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
                    self.set_locked(h, false);
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
                self.set_locked(h, false);
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_message_toast_has_no_sender_or_preview() {
        let p = json!({ "title": "Ada", "quickReply": { "conv": "dm:1" }, "options": { "body": "secret", "tag": "dm-1", "avatarUrl": "https://x/a.png", "silent": true, "data": { "type": "dm", "from": "Ada", "preview": "secret" } } });
        let r = redact(&p, "Unlock to see it");
        assert_eq!(r, json!({ "title": "Descall", "options": { "body": "Unlock to see it", "tag": "descall-locked", "requireInteraction": false, "silent": true, "avatarUrl": null, "data": {} } }));
    }

    #[test]
    fn locked_call_still_rings_without_names() {
        let p = json!({ "title": "Ada", "options": { "body": "Ada is calling", "tag": "call-7", "requireInteraction": true, "data": { "type": "group-call", "callType": "video", "callId": "7", "groupId": "g", "groupName": "Team" } } });
        let r = redact(&p, "x");
        assert_eq!(r, json!({ "title": "Descall", "options": { "body": "", "tag": "call-7", "requireInteraction": true, "silent": false, "avatarUrl": null, "data": { "type": "group-call", "callType": "video", "callId": "7", "groupId": "g" } } }));
    }
}
