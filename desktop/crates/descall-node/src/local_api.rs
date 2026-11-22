//! Local control channel between this app (the supervisor) and the backend process it runs,
//! over http://127.0.0.1:<port>. Public in the hybrid contract: `GET /api/node/health`. The
//! others are loopback-only and need the header `x-descall-node-control: <token>` with the
//! per-launch random token the app put in `DESCALL_NODE_CONTROL_TOKEN` (the backend compares
//! it in constant time and refuses any request that did not come from 127.0.0.1 / ::1):
//!
//! * `GET  /api/node/local/status` -> `{ state, conns, p95ms, mbps, memRss, cfg, kv: {ok} }`
//! * `POST /api/node/local/drain`  `{ reason, timeoutMs }` -> `{ ok, remaining }`: state
//!   "draining", `node:move` to every socket of this node (jitter), keep answering
//!   `remaining` in status until it reaches 0.
//! * `POST /api/node/local/state`  `{ state: active|paused|draining, gameMode, memoryMb }`:
//!   the node's own `dc:nodes` entry follows the app (game mode, smaller share).
//! * `PUT  /api/node/local/cfg`    partial `dc:cfg:pc` -> `{ cfg }` (cluster.setCfg with
//!   actor "pc-tray"): the popover's sliders and switches, seen by the admin panel at once.
//!
//! A backend without these routes (older build) still works: the app then drains by stopping
//! the process (clients take the 2-5 s reconnect path) and keeps cfg changes local until the
//! primary sends the cfg back on the next register.

use serde_json::{json, Value};

use crate::cfg::PcCfg;

pub const HEADER: &str = "x-descall-node-control";
pub const HEALTH: &str = "/api/node/health";
pub const STATUS: &str = "/api/node/local/status";
pub const DRAIN: &str = "/api/node/local/drain";
pub const STATE: &str = "/api/node/local/state";
pub const CFG: &str = "/api/node/local/cfg";

/// Drain wait (contract: up to 10 s, then stop anyway).
pub const DRAIN_TIMEOUT_MS: u64 = 10_000;

pub fn url(port: u16, path: &str) -> String {
    format!("http://127.0.0.1:{port}{path}")
}

pub fn drain_body(reason: &str) -> Value {
    json!({ "reason": reason, "timeoutMs": DRAIN_TIMEOUT_MS })
}

pub fn state_body(state: &str, game_mode: bool, memory_mb: u32) -> Value {
    json!({ "state": state, "gameMode": game_mode, "memoryMb": memory_mb })
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Status {
    pub state: Option<String>,
    pub conns: Option<u32>,
    /// Sockets still on this node while draining.
    pub remaining: Option<u32>,
    pub p95_ms: Option<f64>,
    pub mbps: Option<f64>,
    pub mem_rss_mb: Option<f64>,
    pub cfg: Option<PcCfg>,
    pub kv_ok: Option<bool>,
}

fn num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64).filter(|n| n.is_finite() && *n >= 0.0)
}

pub fn parse_status(v: &Value) -> Status {
    Status {
        state: v.get("state").and_then(Value::as_str).map(|s| s.chars().take(16).collect()),
        conns: num(v, "conns").map(|n| n as u32),
        remaining: num(v, "remaining").map(|n| n as u32),
        p95_ms: num(v, "p95ms").or_else(|| num(v, "p95Ms")),
        mbps: num(v, "mbps"),
        // memRss in bytes (dc:nodes shape) or MB.
        mem_rss_mb: num(v, "memRssMb").or_else(|| num(v, "memRss").map(|b| if b > 1e6 { b / 1048576.0 } else { b })),
        cfg: v.get("cfg").filter(|c| c.is_object()).map(PcCfg::from_value),
        kv_ok: v.get("kv").and_then(|k| k.get("ok")).and_then(Value::as_bool),
    }
}

/// `/api/node/health` answered with `ok: true` (the backend is up and listening).
pub fn health_ok(v: &Value) -> bool {
    v.get("ok").and_then(Value::as_bool) == Some(true)
}

/// Constant-time token comparison (used by the app's own tests of the backend contract).
pub fn token_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status() {
        let s = parse_status(&json!({ "state": "active", "conns": 126, "p95ms": 18.2, "mbps": 18, "memRss": 1_488_978_000u64, "cfg": { "ramMb": 3072 }, "kv": { "ok": true } }));
        assert_eq!(s.state.as_deref(), Some("active"));
        assert_eq!(s.conns, Some(126));
        assert!((s.mem_rss_mb.unwrap() - 1420.0).abs() < 1.0);
        assert_eq!(s.cfg.unwrap().ram_mb, 3072);
        assert_eq!(s.kv_ok, Some(true));
        let empty = parse_status(&json!({ "conns": -1, "p95ms": "x" }));
        assert_eq!(empty, Status::default());
        assert_eq!(parse_status(&json!({ "memRssMb": 512 })).mem_rss_mb, Some(512.0));
    }

    #[test]
    fn bodies_and_urls() {
        assert_eq!(url(3210, DRAIN), "http://127.0.0.1:3210/api/node/local/drain");
        assert_eq!(drain_body("pause")["timeoutMs"], 10_000);
        assert_eq!(state_body("active", true, 1024), json!({ "state": "active", "gameMode": true, "memoryMb": 1024 }));
        assert!(health_ok(&json!({ "ok": true, "nodeId": "pc-1" })));
        assert!(!health_ok(&json!({ "ok": "yes" })));
        assert!(token_eq("abc", "abc") && !token_eq("abc", "abd") && !token_eq("abc", "abcd"));
    }
}
