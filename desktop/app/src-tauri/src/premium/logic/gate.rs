//! Descall+ entitlement gate (port of electron/premium/gate.cjs).
//!
//! Two sources, and a feature is on only when BOTH say so:
//!   1. the renderer's list (`premium:entitlements`), see [`Gate::set_entitlements`];
//!   2. the shell's own read of GET /api/premium/me (see [`Gate::verify_ok`] / [`Gate::verify_err`]).
//! A tampered renderer can only narrow the set, never widen it. Until the shell has verified
//! once, nothing is on. Pure: the clock is passed in, the caller does the HTTP and the timers.

use std::collections::BTreeSet;

use serde_json::{json, Value};

use super::tiers::{features_for_plan, normalize_plan, plan_rank, tier_allows};

pub const REVERIFY_MS: u64 = 30 * 60 * 1000;
pub const MIN_VERIFY_GAP_MS: u64 = 20 * 1000;

/// Retry wait after a network failure: grows with the time since the first failure.
pub fn retry_delay(since_first_failure_ms: u64) -> u64 {
    if since_first_failure_ms < 60 * 1000 {
        5 * 1000
    } else if since_first_failure_ms < 10 * 60 * 1000 {
        30 * 1000
    } else {
        5 * 60 * 1000
    }
}

/// Why a check failed. `Http(0)` is a network failure (no answer at all).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VerifyError {
    NoToken,
    Http(u16),
    Network,
}

pub fn failure_code(err: &VerifyError) -> String {
    match err {
        VerifyError::NoToken => "no-token".into(),
        VerifyError::Http(s) if *s > 0 => format!("http-{s}"),
        _ => "network".into(),
    }
}

/// Server body -> (plan, keys). Unknown keys and keys above the plan are dropped.
pub fn parse_server(body: &Value) -> (Option<&'static str>, BTreeSet<String>) {
    let plan_raw = body.get("plan").and_then(Value::as_str);
    let status = body
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| if plan_raw.is_some() { "active".into() } else { "none".into() });
    let plan = if status == "active" { normalize_plan(plan_raw) } else { None };
    let list: Vec<String> = match body.get("features").and_then(Value::as_array) {
        Some(a) => a.iter().map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).collect(),
        None => features_for_plan(plan).into_iter().map(str::to_string).collect(),
    };
    let keys = list.into_iter().filter(|k| tier_allows(plan, k)).collect();
    (plan, keys)
}

/// Renderer claim ∩ server truth: the lower plan, keys in both lists and allowed by that plan.
pub fn intersect(
    renderer_keys: Option<&BTreeSet<String>>,
    renderer_plan: Option<&str>,
    server_keys: Option<&BTreeSet<String>>,
    server_plan: Option<&str>,
) -> (Option<&'static str>, BTreeSet<String>) {
    let (rp, sp) = (normalize_plan(renderer_plan), normalize_plan(server_plan));
    let (Some(rp), Some(sp), Some(rk), Some(sk)) = (rp, sp, renderer_keys, server_keys) else {
        return (None, BTreeSet::new());
    };
    let plan = if plan_rank(rp) <= plan_rank(sp) { rp } else { sp };
    let keys = rk.iter().filter(|k| sk.contains(*k) && tier_allows(Some(plan), k)).cloned().collect();
    (Some(plan), keys)
}

#[derive(Clone, Debug, Default)]
struct Side {
    keys: Option<BTreeSet<String>>,
    plan: Option<&'static str>,
    at: u64,
}

/// What the caller must do after a gate call.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct GateOutcome {
    /// The effective set changed (reconcile the modules).
    pub changed: bool,
    /// Start a server check now; `Some(true)` = forced.
    pub verify: Option<bool>,
}

#[derive(Debug, Default)]
pub struct Gate {
    renderer: Side,
    server: Side,
    plan: Option<&'static str>,
    keys: BTreeSet<String>,
    last_error: Option<(String, u64)>,
    failures: u32,
    first_failure_at: u64,
    pub verifying: bool,
}

impl Gate {
    pub fn new() -> Self {
        Self::default()
    }

    fn recompute(&mut self) -> bool {
        let (plan, keys) = intersect(self.renderer.keys.as_ref(), self.renderer.plan, self.server.keys.as_ref(), self.server.plan);
        let changed = plan != self.plan || keys != self.keys;
        self.plan = plan;
        self.keys = keys;
        changed
    }

    pub fn has(&self, key: &str) -> bool {
        self.keys.contains(key)
    }

    pub fn plan(&self) -> Option<&'static str> {
        self.plan
    }

    pub fn keys(&self) -> &BTreeSet<String> {
        &self.keys
    }

    /// Renderer claim. A changed claim re-checks at once; a repeated one at most every
    /// MIN_VERIFY_GAP_MS (covers a sign-in as another account with the same plan).
    pub fn set_entitlements(&mut self, keys: &[String], plan: Option<&str>, now: u64) -> GateOutcome {
        let list: BTreeSet<String> = keys.iter().take(256).cloned().collect();
        let p = normalize_plan(plan);
        let claim_changed = self.renderer.plan != p || self.renderer.keys.as_ref() != Some(&list);
        self.renderer = Side { keys: Some(list), plan: p, at: now };
        let changed = self.recompute();
        let verify = if p.is_some() && self.should_verify(claim_changed, now) { Some(claim_changed) } else { None };
        GateOutcome { changed, verify }
    }

    /// Whether a verify call should hit the server now.
    pub fn should_verify(&self, force: bool, now: u64) -> bool {
        if self.verifying {
            return false;
        }
        force || self.server.at == 0 || now.saturating_sub(self.server.at) >= MIN_VERIFY_GAP_MS
    }

    pub fn verify_ok(&mut self, body: &Value, now: u64) -> bool {
        let (plan, keys) = parse_server(body);
        self.server = Side { keys: Some(keys), plan, at: now };
        self.last_error = None;
        self.failures = 0;
        self.verifying = false;
        self.recompute()
    }

    /// Network failure keeps the last verified answer; 401/403/404/405 or no token means free.
    pub fn verify_err(&mut self, err: &VerifyError, now: u64) -> bool {
        self.verifying = false;
        self.last_error = Some((failure_code(err), now));
        let refused = matches!(err, VerifyError::NoToken) || matches!(err, VerifyError::Http(401 | 403 | 404 | 405));
        if refused {
            self.server = Side { keys: Some(BTreeSet::new()), plan: None, at: now };
            self.failures = 0;
        } else {
            if self.failures == 0 {
                self.first_failure_at = now;
            }
            self.failures += 1;
        }
        self.recompute()
    }

    /// Delay until the next scheduled check, or None when signed out (no claim).
    pub fn next_check_in(&self, now: u64) -> Option<u64> {
        self.renderer.plan?;
        Some(if self.failures > 0 { retry_delay(now.saturating_sub(self.first_failure_at)) } else { REVERIFY_MS })
    }

    /// Signed out / token cleared.
    pub fn reset(&mut self) -> bool {
        self.renderer = Side::default();
        self.server = Side::default();
        self.last_error = None;
        self.failures = 0;
        self.recompute()
    }

    pub fn snapshot(&self) -> Value {
        json!({
            "plan": self.plan,
            "keys": self.keys.iter().collect::<Vec<_>>(),
            "verifiedAt": self.server.at,
            "claimed": self.renderer.keys.as_ref().map(|k| k.len()).unwrap_or(0),
            "lastError": self.last_error.as_ref().map(|(code, at)| json!({ "code": code, "at": at })),
            "verifying": self.verifying,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(list: &[&str]) -> BTreeSet<String> {
        list.iter().map(|s| s.to_string()).collect()
    }
    fn keys(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn intersection_lower_plan_wins() {
        let (plan, k) = intersect(Some(&set(&["mini_mode", "desktop_sidebar", "pip_call"])), Some("ultra"), Some(&set(&["mini_mode", "pip_call"])), Some("plus"));
        assert_eq!(plan, Some("plus"));
        assert_eq!(k, set(&["mini_mode", "pip_call"]));
        assert!(intersect(Some(&set(&["mini_mode"])), Some("plus"), None, None).1.is_empty());
        assert!(intersect(Some(&set(&["mini_mode"])), None, Some(&set(&["mini_mode"])), Some("plus")).1.is_empty());
    }

    #[test]
    fn parse_server_active_only() {
        let (_, k) = parse_server(&json!({"plan": "plus", "status": "active", "features": ["mini_mode", "desktop_sidebar", "x"]}));
        assert_eq!(k, set(&["mini_mode"]));
        assert_eq!(parse_server(&json!({"plan": "plus", "status": "expired"})).0, None);
        assert!(parse_server(&json!({"plan": "ultra", "status": "active"})).1.contains("window_layouts"));
    }

    #[test]
    fn nothing_before_verify_and_tampered_claim_is_cut() {
        let mut g = Gate::new();
        let out = g.set_entitlements(&keys(&["mini_mode", "pip_call", "desktop_sidebar", "window_layouts"]), Some("ultra"), 1);
        assert_eq!(out.verify, Some(true));
        assert!(!g.has("mini_mode"), "not before the server answered");
        assert!(g.verify_ok(&json!({"plan": "plus", "status": "active", "features": ["mini_mode", "pip_call"]}), 2));
        assert!(g.has("mini_mode"));
        assert!(!g.has("desktop_sidebar"), "renderer cannot unlock ultra keys");
        assert_eq!(g.plan(), Some("plus"));
        // Narrowing works without the server.
        g.set_entitlements(&keys(&["pip_call"]), Some("plus"), 3);
        assert!(!g.has("mini_mode"));
        assert!(g.has("pip_call"));
    }

    #[test]
    fn refusal_means_free() {
        for err in [VerifyError::Http(401), VerifyError::Http(404), VerifyError::NoToken] {
            let mut g = Gate::new();
            g.set_entitlements(&keys(&["mini_mode"]), Some("plus"), 1);
            g.verify_ok(&json!({"plan": "plus", "status": "active"}), 2);
            assert!(g.has("mini_mode"));
            g.verify_err(&err, 3);
            assert!(!g.has("mini_mode"), "{err:?}");
        }
        let mut g = Gate::new();
        g.set_entitlements(&keys(&["mini_mode"]), Some("plus"), 1);
        g.verify_err(&VerifyError::NoToken, 2);
        assert_eq!(g.snapshot()["lastError"]["code"], "no-token");
        g.verify_err(&VerifyError::Http(401), 3);
        assert_eq!(g.snapshot()["lastError"]["code"], "http-401");
        assert_eq!(failure_code(&VerifyError::Http(502)), "http-502");
    }

    #[test]
    fn network_failure_keeps_last_answer_and_retries_soon() {
        let mut g = Gate::new();
        g.set_entitlements(&keys(&["mini_mode"]), Some("plus"), 0);
        g.verify_ok(&json!({"plan": "plus", "status": "active"}), 1);
        assert!(g.has("mini_mode"));
        assert_eq!(g.next_check_in(1), Some(REVERIFY_MS));
        g.verify_err(&VerifyError::Network, 10);
        g.verify_err(&VerifyError::Network, 20);
        g.verify_err(&VerifyError::Network, 30);
        assert!(g.has("mini_mode"));
        assert_eq!(g.snapshot()["lastError"]["code"], "network");
        assert_eq!(g.next_check_in(40), Some(5000), "several quick failures still retry in 5 s");
        assert_eq!(g.next_check_in(10 + 2 * 60 * 1000), Some(30_000));
        g.verify_ok(&json!({"plan": "plus", "status": "active"}), 50);
        assert_eq!(g.next_check_in(50), Some(REVERIFY_MS), "back to the normal re-check after success");
        assert!(g.snapshot()["lastError"].is_null());
        g.reset();
        assert!(!g.has("mini_mode"));
        assert_eq!(g.next_check_in(60), None);
        assert_eq!(retry_delay(0), 5000);
        assert_eq!(retry_delay(2 * 60 * 1000), 30_000);
        assert_eq!(retry_delay(60 * 60 * 1000), 5 * 60 * 1000);
    }

    #[test]
    fn downgrade_removes_keys_and_repeat_claim_is_throttled() {
        let mut g = Gate::new();
        g.set_entitlements(&keys(&["desktop_sidebar", "mini_mode"]), Some("ultra"), 0);
        g.verify_ok(&json!({"plan": "ultra", "status": "active"}), 1);
        assert!(g.has("desktop_sidebar"));
        g.verify_ok(&json!({"plan": "plus", "status": "active"}), 2);
        assert!(!g.has("desktop_sidebar"));
        assert!(g.has("mini_mode"));
        // Same claim again within 20 s: no check; after 20 s: a check, not forced.
        assert_eq!(g.set_entitlements(&keys(&["desktop_sidebar", "mini_mode"]), Some("ultra"), 1000).verify, None);
        assert_eq!(g.set_entitlements(&keys(&["desktop_sidebar", "mini_mode"]), Some("ultra"), 30_000).verify, Some(false));
        // Signed out: no check at all.
        assert_eq!(g.set_entitlements(&[], None, 40_000).verify, None);
    }
}
