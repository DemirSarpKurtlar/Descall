//! Node -> primary: `POST /api/node/register` with `Authorization: Bearer dsk_node_...`.
//! Sent at start and then every [`INTERVAL_MS`] as the app's heartbeat; the answer carries
//! the current `dc:cfg:pc`, so the register loop is also the cfg poll that works while the
//! local backend is stopped (paused, schedule, game handover). `POST /api/node/drain-done`
//! tells the primary a drain finished. A 401 / 403 means the key was revoked in the admin
//! panel: the app stops serving and asks for a new key.

use serde_json::{json, Value};

use crate::cfg::PcCfg;

pub const REGISTER: &str = "/api/node/register";
pub const DRAIN_DONE: &str = "/api/node/drain-done";
pub const INTERVAL_MS: u64 = 30_000;
pub const MAX_BACKOFF_MS: u64 = 5 * 60_000;

#[derive(Debug, Clone, PartialEq)]
pub struct Beat<'a> {
    pub id: &'a str,
    pub url: &'a str,
    pub version: &'a str,
    pub memory_mb: u32,
    pub cores: u32,
    /// Contract node state: active | draining | paused | down.
    pub state: &'a str,
    pub game_mode: bool,
    pub phase: &'a str,
    pub uptime_sec: u64,
    pub restarts_today: u32,
    pub machine_mb: u32,
    pub logical_cpus: u32,
}

/// Register body: the contract fields first (`id, url, version, memoryMb, cores`), then the
/// supervisor's own view (extra fields are ignored by a primary that does not know them).
pub fn register_body(b: &Beat) -> Value {
    json!({
        "id": b.id,
        "url": b.url,
        "version": b.version,
        "memoryMb": b.memory_mb,
        "cores": b.cores,
        "state": b.state,
        "gameMode": b.game_mode,
        "supervisor": {
            "phase": b.phase,
            "uptimeSec": b.uptime_sec,
            "restartsToday": b.restarts_today,
            "machineMb": b.machine_mb,
            "logicalCpus": b.logical_cpus,
        }
    })
}

pub fn drain_done_body(id: &str) -> Value {
    json!({ "id": id })
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Reply {
    pub ok: bool,
    pub cfg: Option<PcCfg>,
    pub saved_usd_month: Option<f64>,
    pub capacity_estimate: Option<u32>,
    pub per_user_mb: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
#[allow(clippy::large_enum_variant)] // one per 30 s, moved once
pub enum Outcome {
    Ok(Reply),
    /// 401 / 403: the node key is wrong or revoked.
    Revoked,
    /// Network error, 5xx, 429 or a body that is not the contract's.
    Retry,
}

pub fn parse_reply(status: u16, body: &Value) -> Outcome {
    match status {
        401 | 403 => Outcome::Revoked,
        200..=299 => {
            let ok = body.get("ok").and_then(Value::as_bool).unwrap_or(false);
            if !ok {
                return Outcome::Retry;
            }
            let f = |k: &str| body.get(k).and_then(Value::as_f64).filter(|n| n.is_finite() && *n >= 0.0);
            let cap = body.get("capacity");
            Outcome::Ok(Reply {
                ok,
                cfg: body.get("cfg").filter(|c| c.is_object()).map(PcCfg::from_value),
                saved_usd_month: f("savedUsdMonth"),
                capacity_estimate: cap.and_then(|c| c.get("estimate")).and_then(Value::as_f64).map(|n| n as u32),
                per_user_mb: cap.and_then(|c| c.get("perUserMb")).and_then(Value::as_f64).filter(|n| *n > 0.0),
            })
        }
        _ => Outcome::Retry,
    }
}

/// Delay before the next register: the interval while it works, doubling on failures.
pub fn next_delay_ms(failures: u32) -> u64 {
    if failures == 0 {
        return INTERVAL_MS;
    }
    (5_000u64 << failures.min(6)).min(MAX_BACKOFF_MS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_has_the_contract_fields() {
        let b = Beat { id: "pc-a1b2c3", url: "https://pc.descall.com", version: "1.0.0", memory_mb: 3072, cores: 4, state: "active", game_mode: false, phase: "active", uptime_sec: 60, restarts_today: 0, machine_mb: 32768, logical_cpus: 16 };
        let v = register_body(&b);
        for k in ["id", "url", "version", "memoryMb", "cores"] {
            assert!(v.get(k).is_some(), "{k}");
        }
        assert_eq!(v["memoryMb"], 3072);
        assert!(!v.to_string().contains("dsk_node_"), "the key goes in the header only");
        assert_eq!(drain_done_body("pc-1"), json!({ "id": "pc-1" }));
    }

    #[test]
    fn replies() {
        let r = parse_reply(200, &json!({ "ok": true, "cfg": { "ramMb": 4096, "cores": 6 }, "savedUsdMonth": 7.7, "capacity": { "estimate": 1150, "perUserMb": 2.5 } }));
        let Outcome::Ok(r) = r else { panic!() };
        assert_eq!(r.cfg.unwrap().ram_mb, 4096);
        assert_eq!(r.saved_usd_month, Some(7.7));
        assert_eq!(r.capacity_estimate, Some(1150));
        assert_eq!(parse_reply(401, &Value::Null), Outcome::Revoked);
        assert_eq!(parse_reply(403, &json!({ "error": "revoked" })), Outcome::Revoked);
        assert_eq!(parse_reply(503, &Value::Null), Outcome::Retry);
        assert_eq!(parse_reply(200, &json!({ "ok": false })), Outcome::Retry);
        assert_eq!(parse_reply(200, &json!({ "ok": true })), Outcome::Ok(Reply { ok: true, ..Reply::default() }));
    }

    #[test]
    fn backoff() {
        assert_eq!(next_delay_ms(0), 30_000);
        assert_eq!(next_delay_ms(1), 10_000);
        assert_eq!(next_delay_ms(3), 40_000);
        assert_eq!(next_delay_ms(30), MAX_BACKOFF_MS);
    }
}
