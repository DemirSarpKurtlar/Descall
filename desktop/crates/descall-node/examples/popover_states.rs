//! Prints the popover state (view model, strings, setup status) for a few situations as JSON,
//! from the same code the app uses. Used to render the popover page outside Tauri
//! (screenshots, page tests): `cargo run -p descall-node --example popover_states > states.json`.

use descall_node::cfg::PcCfg;
use descall_node::game::Reason;
use descall_node::schedule::evaluate;
use descall_node::secrets;
use descall_node::supervisor::{ErrorKind, PauseWhy, Phase};
use descall_node::usage::Usage;
use descall_node::view::{build, Live, Snapshot};
use serde_json::{json, Map, Value};

// Sunday 2026-11-22 23:41 Istanbul, as in the draft's taskbar clock.
const NOW: u64 = 1_795_380_060_000;

fn series(level: f64) -> Vec<f64> {
    (0..90).map(|i| level * (0.55 + 0.45 * (i as f64 / 89.0)) + ((i * 37 % 11) as f64 - 5.0) * 9.0).collect()
}

fn main() {
    let cfg = PcCfg::from_value(&json!({
        "ramMb": 3072, "cores": 4,
        "gameMode": { "enabled": true, "shareMb": 1024, "fullHandover": false },
        "schedule": { "tz": "Europe/Istanbul", "slots": [
            { "d": 1, "from": "18:00", "to": "02:00" }, { "d": 2, "from": "18:00", "to": "02:00" }, { "d": 3, "from": "18:00", "to": "02:00" },
            { "d": 4, "from": "18:00", "to": "02:00" }, { "d": 5, "from": "18:00", "to": "02:00" }, { "d": 6, "from": "12:00", "to": "03:00" },
            { "d": 0, "from": "18:00", "to": "02:00" } ] }
    }));
    let eval = evaluate(&cfg.schedule, NOW);
    let usage = Usage { active_ms_today: (3 * 60 + 12) * 60_000, drops_today: 0, gb_hours_month: 1460.0, ..Usage::default() };
    let live = Live { ram_used_mb: Some(1.42 * 1024.0), cpu_pct: Some(22.0), conns: Some(126), p95_ms: Some(18.0), mbps: Some(18.0), kv_ok: Some(true) };
    let active_series = series(1454.0);
    let base = |lang: &'static str| Snapshot {
        lang,
        phase: Phase::Active,
        pause_why: None,
        error: None,
        retry_in_ms: None,
        manual_pause: false,
        public_url: "https://pc.descall.com",
        version: descall_node::SERVICE_VERSION,
        cfg: &cfg,
        running_share_mb: 3072,
        cfg_synced: true,
        applying: false,
        live: &live,
        ram_series: &active_series,
        schedule: &eval,
        game_active: false,
        game_reason: None,
        game_exe: None,
        gpu_pct: 0.0,
        usage: &usage,
        saved_usd_server: Some(25.0),
        per_user_mb: None,
        tunnel_ready: true,
    };

    let all_set = |id: &str| -> Option<String> {
        match id {
            "primaryUrl" => Some("https://des-call.onrender.com".into()),
            "supabaseUrl" => Some("https://abcdefghijkl.supabase.co".into()),
            "livekitUrl" => Some("wss://descall.livekit.cloud".into()),
            "publicUrl" | "redisUrl" => None,
            "extraEnv" => Some("TOTP_ENC_KEY=x\nMEDIA_URL_SECRET=y\nWEB_PUSH_PRIVATE_KEY=z".into()),
            _ => Some("set".into()),
        }
    };
    let first_run = |id: &str| -> Option<String> {
        match id {
            "primaryUrl" => Some("https://des-call.onrender.com".into()),
            "nodeKey" => Some("set".into()),
            _ => None,
        }
    };

    let mut out = Map::new();
    let mut put = |name: &str, s: Snapshot, setup: Value, extra: Value| {
        let mut st = json!({ "view": build(&s), "strings": descall_node::i18n::strings(s.lang), "setup": setup, "autostart": true, "configuredOnce": true });
        if let (Some(o), Some(e)) = (st.as_object_mut(), extra.as_object()) {
            for (k, v) in e {
                o.insert(k.clone(), v.clone());
            }
        }
        out.insert(name.to_string(), st);
    };

    put("active", base("tr"), secrets::status_json(&all_set), json!({}));
    put("active-en", base("en"), secrets::status_json(&all_set), json!({}));

    let game_live = Live { ram_used_mb: Some(612.0), cpu_pct: Some(9.0), conns: Some(41), p95_ms: Some(21.0), mbps: Some(6.0), kv_ok: Some(true) };
    let game_series = series(600.0);
    let mut g = base("tr");
    g.phase = Phase::Game;
    g.running_share_mb = 1024;
    g.live = &game_live;
    g.ram_series = &game_series;
    g.game_active = true;
    g.game_reason = Some(Reason::Exclusive);
    put("game", g, secrets::status_json(&all_set), json!({}));

    let none = Live { kv_ok: Some(true), ..Live::default() };
    let mut p = base("tr");
    p.phase = Phase::Paused;
    p.pause_why = Some(PauseWhy::Manual);
    p.manual_pause = true;
    p.live = &none;
    p.ram_series = &[];
    p.tunnel_ready = false;
    put("paused", p, secrets::status_json(&all_set), json!({}));

    let mut e = base("tr");
    e.phase = Phase::Error;
    e.error = Some(ErrorKind::KeyRevoked);
    e.live = &none;
    e.ram_series = &[];
    e.tunnel_ready = false;
    put("revoked", e, secrets::status_json(&all_set), json!({}));

    let mut s = base("tr");
    s.phase = Phase::Setup;
    s.live = &none;
    s.ram_series = &[];
    s.tunnel_ready = false;
    put("setup", s, secrets::status_json(&first_run), json!({ "configuredOnce": false, "openView": "setup" }));

    let logs: Vec<&str> = vec![
        "[2026-11-22 22:05:11.430] [warn] [app] game mode: full-screen game, share 3072 -> 1024 MB, draining 42 users",
        "[2026-11-22 23:40:51.102] [info] [app] Descall Node 1.0.0 starting (pc-a1b2c3)",
        "[2026-11-22 23:40:51.240] [info] [app] runtime verified: node v24.22.3, cloudflared",
        "[2026-11-22 23:40:51.611] [info] [tunnel] Starting tunnel tunnelID=[gizli]",
        "[2026-11-22 23:40:52.904] [info] [tunnel] Registered tunnel connection connIndex=0 location=ist01 protocol=quic",
        "[2026-11-22 23:40:53.377] [info] [backend] Server listening on port 3210",
        "[2026-11-22 23:40:53.380] [info] [backend] [cluster] node pc-a1b2c3 secondary, KV ok",
        "[2026-11-22 23:40:54.015] [info] [app] registered with https://des-call.onrender.com (key dsk_node_[gizli])",
        "[2026-11-22 23:40:54.016] [info] [app] state active, share 3072 MB, 4 cores, job limit 3584 MB",
        "[2026-11-22 23:41:00.002] [info] [backend] [sockets] 126 connected, p95 18 ms",
    ];
    out.insert("logs".into(), json!(logs));
    println!("{}", serde_json::to_string_pretty(&Value::Object(out)).unwrap());
}
