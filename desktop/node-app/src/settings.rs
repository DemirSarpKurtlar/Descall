//! Non-secret settings in settings.json and the usage counters in usage.json.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use descall_node::cfg::PcCfg;
use descall_node::usage::Usage;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Random seed of this install; the node id is `pc-` + its first 6 hex chars.
    pub seed: String,
    /// Last known `dc:cfg:pc` (the node starts with it when the primary is unreachable).
    pub cfg: Option<Value>,
    /// The last cfg change from the popover has not reached the backend yet.
    pub cfg_pending: bool,
    /// Extra game exe names and apps that never count as games.
    pub games: Vec<String>,
    pub ignore: Vec<String>,
    /// Login auto-start was turned on once (the owner's later choice is kept).
    pub autostart_decided: bool,
    pub admin_url: Option<String>,
    pub lang: Option<String>,
    /// When the environment last came from the primary (POST /api/node/bootstrap), ms.
    pub bootstrap_at: Option<u64>,
    /// The owner chose "Sunucudan alma, yalnız elle girdiklerimi kullan".
    pub bootstrap_skip: bool,
}

fn random_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    if getrandom::fill(&mut b).is_err() {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        b = t.to_le_bytes()[..n.min(16)].to_vec();
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// A fresh random token (the per-launch local control token).
pub fn random_token() -> String {
    random_hex(32)
}

impl Settings {
    pub fn load() -> Settings {
        let mut s: Settings = std::fs::read_to_string(crate::paths::settings_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        if s.seed.len() < 6 || !s.seed.bytes().all(|b| b.is_ascii_hexdigit()) {
            s.seed = random_hex(8);
            s.save();
        }
        s
    }

    pub fn save(&self) {
        let p = crate::paths::settings_file();
        if let Some(d) = p.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        if let Ok(t) = serde_json::to_string_pretty(self) {
            let tmp = p.with_extension("json.tmp");
            if std::fs::write(&tmp, t).is_ok() {
                let _ = std::fs::rename(&tmp, &p);
            }
        }
    }

    pub fn node_id(&self) -> String {
        let bytes: Vec<u8> = (0..self.seed.len() / 2).filter_map(|i| u8::from_str_radix(&self.seed[i * 2..i * 2 + 2], 16).ok()).collect();
        descall_node::env::node_id_from_seed(&bytes)
    }

    pub fn cfg(&self) -> PcCfg {
        self.cfg.as_ref().map(PcCfg::from_value).unwrap_or_else(|| PcCfg::from_value(&Value::Null))
    }
}

pub fn load_usage() -> Usage {
    std::fs::read_to_string(crate::paths::usage_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save_usage(u: &Usage) {
    let p = crate::paths::usage_file();
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    if let Ok(t) = serde_json::to_string(u) {
        let _ = std::fs::write(p, t);
    }
}
