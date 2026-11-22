//! `dc:cfg:pc`: the PC node's share and rules, the one source of truth for the admin panel
//! ("Sunucu Ağı") and this tray app. The primary returns it from `/api/node/register`, the
//! local backend from `/api/node/local/status`; the popover writes changes through the local
//! backend ([`crate::local_api`]) so the admin panel sees them at once.
//!
//! Unknown fields (anything the other side adds later) survive a round trip (`extra`).

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const RAM_MIN_MB: u32 = 512;
pub const RAM_MAX_MB: u32 = 8192;
pub const RAM_STEP_MB: u32 = 512;
pub const CORES_MIN: u32 = 1;
pub const CORES_MAX: u32 = 8;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LoadRule {
    pub render_high_pct: u32,
    pub pc_high_pct: u32,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for LoadRule {
    fn default() -> Self {
        LoadRule { render_high_pct: 60, pc_high_pct: 85, extra: Map::new() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GameMode {
    pub enabled: bool,
    /// RAM share while a game runs (0 = hand every user over to Render).
    pub share_mb: u32,
    /// Hand every user over and pause the node while a game runs.
    pub full_handover: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for GameMode {
    fn default() -> Self {
        GameMode { enabled: true, share_mb: 1024, full_handover: false, extra: Map::new() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Slot {
    /// Local weekday the slot starts on, 0 = Sunday ... 6 = Saturday (JS getDay()).
    pub d: u32,
    /// "HH:MM" local start.
    pub from: String,
    /// "HH:MM" local end; at or before `from` the slot runs past midnight into the next day.
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Schedule {
    pub tz: String,
    pub slots: Vec<Slot>,
    /// The popover's "Zaman planı" switch. Absent: on when there are slots.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Schedule {
    fn default() -> Self {
        Schedule { tz: crate::time::ISTANBUL.into(), slots: Vec::new(), enabled: None, extra: Map::new() }
    }
}

impl Schedule {
    /// The schedule limits the node only when switched on and it has slots.
    pub fn active(&self) -> bool {
        self.enabled.unwrap_or(true) && !self.slots.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Alerts {
    pub pc_down: bool,
    pub kv_full: bool,
    pub render90: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Alerts {
    fn default() -> Self {
        Alerts { pc_down: true, kv_full: true, render90: true, extra: Map::new() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PcCfg {
    pub ram_mb: u32,
    pub cores: u32,
    pub load_rule: LoadRule,
    pub game_mode: GameMode,
    pub schedule: Schedule,
    pub alerts: Alerts,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for PcCfg {
    fn default() -> Self {
        PcCfg { ram_mb: 2048, cores: 2, load_rule: LoadRule::default(), game_mode: GameMode::default(), schedule: Schedule::default(), alerts: Alerts::default(), extra: Map::new() }
    }
}

/// "HH:MM" (or "24:00") to minutes since midnight.
pub fn parse_hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    if m >= 60 || h > 24 || (h == 24 && m != 0) {
        return None;
    }
    Some(h * 60 + m)
}

impl PcCfg {
    /// Parse whatever the server sent; bad or missing fields take their defaults, numbers are
    /// clamped into the ranges the admin panel offers.
    pub fn from_value(v: &Value) -> PcCfg {
        let mut c: PcCfg = serde_json::from_value(v.clone()).unwrap_or_else(|_| Self::lenient(v));
        c.clamp();
        c
    }

    /// Field-by-field parse when one field has the wrong type (the rest still counts).
    fn lenient(v: &Value) -> PcCfg {
        let mut c = PcCfg::default();
        let Some(o) = v.as_object() else { return c };
        if let Some(n) = o.get("ramMb").and_then(Value::as_f64) {
            c.ram_mb = n.max(0.0) as u32;
        }
        if let Some(n) = o.get("cores").and_then(Value::as_f64) {
            c.cores = n.max(0.0) as u32;
        }
        if let Some(x) = o.get("loadRule").and_then(|x| serde_json::from_value(x.clone()).ok()) {
            c.load_rule = x;
        }
        if let Some(x) = o.get("gameMode").and_then(|x| serde_json::from_value(x.clone()).ok()) {
            c.game_mode = x;
        }
        if let Some(x) = o.get("schedule").and_then(|x| serde_json::from_value(x.clone()).ok()) {
            c.schedule = x;
        }
        if let Some(x) = o.get("alerts").and_then(|x| serde_json::from_value(x.clone()).ok()) {
            c.alerts = x;
        }
        c
    }

    pub fn clamp(&mut self) {
        let r = self.ram_mb.clamp(RAM_MIN_MB, RAM_MAX_MB);
        // 0.5 GB steps, like the sliders.
        self.ram_mb = ((r + RAM_STEP_MB / 2) / RAM_STEP_MB * RAM_STEP_MB).clamp(RAM_MIN_MB, RAM_MAX_MB);
        self.cores = self.cores.clamp(CORES_MIN, CORES_MAX);
        self.load_rule.render_high_pct = self.load_rule.render_high_pct.clamp(10, 95);
        self.load_rule.pc_high_pct = self.load_rule.pc_high_pct.clamp(10, 98);
        self.game_mode.share_mb = self.game_mode.share_mb.min(self.ram_mb);
        self.schedule.slots.retain(|s| s.d <= 6 && parse_hhmm(&s.from).is_some_and(|f| f < 24 * 60) && parse_hhmm(&s.to).is_some());
        self.schedule.slots.truncate(64);
        if self.schedule.tz.trim().is_empty() {
            self.schedule.tz = crate::time::ISTANBUL.into();
        }
    }

    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    /// RAM share the backend runs with right now (game mode lowers it).
    pub fn effective_mb(&self, game_active: bool) -> u32 {
        if game_active && self.game_mode.enabled && !self.game_mode.full_handover && self.game_mode.share_mb > 0 {
            self.game_mode.share_mb.clamp(256, self.ram_mb)
        } else {
            self.ram_mb
        }
    }

    /// A game hands everything to Render (pause) instead of running on a smaller share.
    pub fn game_hands_over(&self) -> bool {
        self.game_mode.enabled && (self.game_mode.full_handover || self.game_mode.share_mb == 0)
    }
}

/// Merge a partial update (the popover sends only what changed) into `base`, deep for objects.
pub fn merge(base: &PcCfg, partial: &Value) -> PcCfg {
    let mut v = base.to_value();
    deep_merge(&mut v, partial);
    PcCfg::from_value(&v)
}

fn deep_merge(into: &mut Value, from: &Value) {
    match (into, from) {
        (Value::Object(a), Value::Object(b)) => {
            for (k, bv) in b {
                match a.get_mut(k) {
                    Some(av) if av.is_object() && bv.is_object() => deep_merge(av, bv),
                    _ => {
                        a.insert(k.clone(), bv.clone());
                    }
                }
            }
        }
        (slot, v) => *slot = v.clone(),
    }
}

/// The only fields the popover may change (sliders and the two switches); anything else in a
/// page request is dropped before it is sent to the backend.
pub fn popover_patch(raw: &Value) -> Option<Value> {
    let o = raw.as_object()?;
    let mut out = Map::new();
    if let Some(n) = o.get("ramMb").and_then(Value::as_f64) {
        out.insert("ramMb".into(), Value::from((n.max(0.0) as u32).clamp(RAM_MIN_MB, RAM_MAX_MB)));
    }
    if let Some(n) = o.get("cores").and_then(Value::as_f64) {
        out.insert("cores".into(), Value::from((n.max(0.0) as u32).clamp(CORES_MIN, CORES_MAX)));
    }
    if let Some(b) = o.get("gameModeEnabled").and_then(Value::as_bool) {
        out.insert("gameMode".into(), serde_json::json!({ "enabled": b }));
    }
    if let Some(b) = o.get("scheduleEnabled").and_then(Value::as_bool) {
        out.insert("schedule".into(), serde_json::json!({ "enabled": b }));
    }
    if out.is_empty() {
        None
    } else {
        Some(Value::Object(out))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_the_contract_shape() {
        let v = json!({
            "ramMb": 3072, "cores": 4,
            "loadRule": { "renderHighPct": 60, "pcHighPct": 85 },
            "gameMode": { "enabled": true, "shareMb": 1024, "fullHandover": false },
            "schedule": { "tz": "Europe/Istanbul", "slots": [{ "d": 1, "from": "18:00", "to": "02:00" }] },
            "alerts": { "pcDown": true, "kvFull": false, "render90": true },
            "futureField": { "x": 1 }
        });
        let c = PcCfg::from_value(&v);
        assert_eq!((c.ram_mb, c.cores), (3072, 4));
        assert_eq!(c.game_mode.share_mb, 1024);
        assert_eq!(c.schedule.slots.len(), 1);
        assert!(c.schedule.active());
        assert!(!c.alerts.kv_full);
        // Unknown fields round-trip.
        assert_eq!(c.to_value()["futureField"]["x"], 1);
        assert!(c.to_value().get("schedule").unwrap().get("enabled").is_none());
    }

    #[test]
    fn clamps_to_panel_ranges() {
        let c = PcCfg::from_value(&json!({ "ramMb": 100, "cores": 64, "gameMode": { "shareMb": 99999 } }));
        assert_eq!((c.ram_mb, c.cores), (512, 8));
        assert_eq!(c.game_mode.share_mb, 512);
        let c = PcCfg::from_value(&json!({ "ramMb": 3300 }));
        assert_eq!(c.ram_mb, 3072, "0.5 GB steps, nearest");
        let c = PcCfg::from_value(&json!({ "ramMb": 20000 }));
        assert_eq!(c.ram_mb, 8192);
    }

    #[test]
    fn a_bad_field_does_not_lose_the_rest() {
        let c = PcCfg::from_value(&json!({ "ramMb": 4096, "cores": "many", "gameMode": { "enabled": false } }));
        assert_eq!(c.ram_mb, 4096);
        assert_eq!(c.cores, PcCfg::default().cores);
        assert!(!c.game_mode.enabled);
        assert_eq!(PcCfg::from_value(&Value::Null), { let mut d = PcCfg::default(); d.clamp(); d });
    }

    #[test]
    fn drops_bad_slots() {
        let c = PcCfg::from_value(&json!({ "schedule": { "slots": [
            { "d": 7, "from": "18:00", "to": "02:00" },
            { "d": 2, "from": "25:00", "to": "02:00" },
            { "d": 2, "from": "24:00", "to": "02:00" },
            { "d": 3, "from": "09:00", "to": "24:00" }
        ] } }));
        assert_eq!(c.schedule.slots, vec![Slot { d: 3, from: "09:00".into(), to: "24:00".into() }]);
    }

    #[test]
    fn schedule_switch() {
        let mut s = Schedule::default();
        assert!(!s.active(), "no slots: never limits");
        s.slots.push(Slot { d: 0, from: "10:00".into(), to: "11:00".into() });
        assert!(s.active());
        s.enabled = Some(false);
        assert!(!s.active());
    }

    #[test]
    fn merge_is_deep() {
        let base = PcCfg::from_value(&json!({ "ramMb": 3072, "gameMode": { "enabled": true, "shareMb": 1024 } }));
        let m = merge(&base, &json!({ "gameMode": { "enabled": false } }));
        assert!(!m.game_mode.enabled);
        assert_eq!(m.game_mode.share_mb, 1024);
        assert_eq!(m.ram_mb, 3072);
    }

    #[test]
    fn effective_share() {
        let c = PcCfg::from_value(&json!({ "ramMb": 3072, "gameMode": { "enabled": true, "shareMb": 1024 } }));
        assert_eq!(c.effective_mb(false), 3072);
        assert_eq!(c.effective_mb(true), 1024);
        assert!(!c.game_hands_over());
        let h = PcCfg::from_value(&json!({ "gameMode": { "enabled": true, "shareMb": 0 } }));
        assert!(h.game_hands_over());
        let off = PcCfg::from_value(&json!({ "ramMb": 3072, "gameMode": { "enabled": false, "shareMb": 1024 } }));
        assert_eq!(off.effective_mb(true), 3072);
        assert!(!off.game_hands_over());
    }

    #[test]
    fn popover_patch_only_carries_its_fields() {
        let p = popover_patch(&json!({ "ramMb": 3072.0, "cores": 99, "scheduleEnabled": false, "alerts": { "pcDown": false }, "loadRule": {} })).unwrap();
        assert_eq!(p, json!({ "ramMb": 3072, "cores": 8, "schedule": { "enabled": false } }));
        assert_eq!(popover_patch(&json!({ "alerts": {} })), None);
        assert_eq!(popover_patch(&json!("x")), None);
        assert_eq!(parse_hhmm("24:00"), Some(1440));
        assert_eq!(parse_hhmm("7:5"), Some(425));
        assert_eq!(parse_hhmm("x"), None);
    }
}
