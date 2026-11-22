//! The tray popover's view model (Draft A "Tepsi paneli"): every label, number and button the
//! page shows, already formatted for the language (Turkish: "1,42 / 3 GB", "%22", "~1.150").
//! The page only lays it out; it computes nothing but the slider preview, for which it gets
//! the same capacity constants as [`crate::capacity`].

use serde_json::{json, Value};

use crate::capacity;
use crate::cfg::PcCfg;
use crate::game::Reason;
use crate::i18n::{t, tf};
use crate::schedule::{hhmm, range_label, Eval};
use crate::supervisor::{ErrorKind, PauseWhy, Phase};
use crate::tray_icon::{tone, Tone};
use crate::usage::Usage;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Live {
    pub ram_used_mb: Option<f64>,
    /// CPU of the backend job as a share of its granted cores (0..100).
    pub cpu_pct: Option<f64>,
    pub conns: Option<u32>,
    pub p95_ms: Option<f64>,
    pub mbps: Option<f64>,
    pub kv_ok: Option<bool>,
}

pub struct Snapshot<'a> {
    pub lang: &'a str,
    pub phase: Phase,
    pub pause_why: Option<PauseWhy>,
    pub error: Option<ErrorKind>,
    pub retry_in_ms: Option<u64>,
    pub manual_pause: bool,
    pub public_url: &'a str,
    pub version: &'a str,
    pub cfg: &'a PcCfg,
    pub running_share_mb: u32,
    /// The last cfg change reached the backend (false: kept locally for now).
    pub cfg_synced: bool,
    pub applying: bool,
    pub live: &'a Live,
    /// RSS samples (MB), oldest first.
    pub ram_series: &'a [f64],
    pub schedule: &'a Eval,
    pub game_active: bool,
    pub game_reason: Option<Reason>,
    pub game_exe: Option<&'a str>,
    pub gpu_pct: f32,
    pub usage: &'a Usage,
    pub saved_usd_server: Option<f64>,
    pub per_user_mb: Option<f64>,
    pub tunnel_ready: bool,
}

fn tr(lang: &str) -> bool {
    lang.starts_with("tr")
}

/// Decimal with the language's separator.
pub fn dec(lang: &str, v: f64, digits: usize) -> String {
    let s = format!("{v:.digits$}");
    if tr(lang) {
        s.replace('.', ",")
    } else {
        s
    }
}

/// Whole number with thousands separators ("1.150" / "1,150").
pub fn grouped(lang: &str, n: u64) -> String {
    let sep = if tr(lang) { '.' } else { ',' };
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(sep);
        }
        out.push(c);
    }
    out
}

pub fn pct(lang: &str, v: f64) -> String {
    let n = v.round().clamp(0.0, 999.0) as i64;
    if tr(lang) {
        format!("%{n}")
    } else {
        format!("{n}%")
    }
}

/// "3 GB", "1,5 GB".
pub fn gb(lang: &str, mb: u32) -> String {
    let g = mb as f64 / 1024.0;
    if (g - g.round()).abs() < 0.01 {
        format!("{} GB", g.round() as u64)
    } else {
        format!("{} GB", dec(lang, g, 1))
    }
}

/// Slider label: always one decimal ("3,0 GB").
pub fn gb1(lang: &str, mb: u32) -> String {
    format!("{} GB", dec(lang, mb as f64 / 1024.0, 1))
}

/// "25" for ten dollars and more, "7,7" below.
pub fn usd_num(lang: &str, v: f64) -> String {
    if v >= 10.0 {
        format!("{}", v.round() as u64)
    } else {
        dec(lang, v.max(0.0), 1)
    }
}

pub fn usd(lang: &str, v: f64) -> String {
    let n = usd_num(lang, v);
    if tr(lang) {
        format!("~{n}$")
    } else {
        format!("~${n}")
    }
}

pub fn duration(lang: &str, ms: u64) -> String {
    let mins = ms / 60_000;
    let (h, m) = (mins / 60, mins % 60);
    if h > 0 {
        tf(lang, "dur.hm", &[("h", &h.to_string()), ("m", &m.to_string())])
    } else {
        tf(lang, "dur.m", &[("m", &m.to_string())])
    }
}

/// Polyline points for the draft's 340 x 60 sparkline (y grows down; 0 MB at y 56).
pub fn spark_points(series: &[f64], max_mb: f64, max_points: usize) -> String {
    if series.is_empty() || max_points < 2 {
        return String::new();
    }
    let step = series.len().div_ceil(max_points).max(1);
    let pts: Vec<f64> = series.chunks(step).map(|c| c.iter().copied().fold(0.0, f64::max)).collect();
    // Scale to the series itself (with room above and below) so the trend stays readable;
    // the gauge above shows the absolute value against the share.
    let hi = pts.iter().copied().fold(f64::MIN, f64::max);
    let lo = pts.iter().copied().fold(f64::MAX, f64::min);
    let top = (hi * 1.15).max(lo + 1.0).min(max_mb.max(hi));
    let bottom = (lo * 0.6).min(top - 1.0).max(0.0);
    let n = pts.len();
    pts.iter()
        .enumerate()
        .map(|(i, v)| {
            let x = if n == 1 { 340.0 } else { i as f64 * 340.0 / (n - 1) as f64 };
            let y = 56.0 - ((v.max(0.0) - bottom) / (top - bottom)).clamp(0.0, 1.0) * 50.0;
            format!("{},{}", x.round() as i64, y.round() as i64)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn host(url: &str) -> String {
    url.split("://").nth(1).unwrap_or(url).split(['/', '?', '#']).next().unwrap_or("").to_string()
}

fn state_label(s: &Snapshot) -> String {
    let l = s.lang;
    match s.phase {
        Phase::Active => t(l, "state.active"),
        Phase::Game => t(l, "state.game"),
        Phase::Paused => match s.pause_why {
            Some(PauseWhy::Schedule) => t(l, "state.pausedSchedule"),
            Some(PauseWhy::Game) => t(l, "state.pausedGame"),
            Some(PauseWhy::Suspend) => t(l, "state.pausedSuspend"),
            _ => t(l, "state.paused"),
        },
        Phase::Starting => t(l, "state.starting"),
        Phase::Draining => t(l, "state.draining"),
        Phase::Drained => t(l, "state.drained"),
        Phase::Backoff => tf(l, "state.backoff", &[("s", &s.retry_in_ms.unwrap_or(0).div_ceil(1000).to_string())]),
        Phase::Error => t(l, "state.error"),
        Phase::Setup => t(l, "state.setup"),
        Phase::Stopped => t(l, "state.stopped"),
    }
}

fn button(id: &str, label: String, primary: bool, disabled: bool) -> Value {
    json!({ "id": id, "label": label, "primary": primary, "disabled": disabled })
}

fn buttons(s: &Snapshot) -> Vec<Value> {
    let l = s.lang;
    let admin = button("admin", t(l, "btn.admin"), true, false);
    match s.phase {
        Phase::Setup => vec![button("setup", t(l, "btn.setup"), true, false)],
        Phase::Error if s.error == Some(ErrorKind::KeyRevoked) => vec![button("setup", t(l, "btn.setup"), false, false), button("logs", t(l, "link.logs"), false, false), admin],
        Phase::Error => vec![button("retry", t(l, "btn.retry"), false, false), button("logs", t(l, "link.logs"), false, false), admin],
        Phase::Backoff => vec![button("retry", t(l, "btn.retry"), false, false), button("pause", t(l, "btn.pause"), false, false), admin],
        _ => {
            let first = if s.manual_pause { button("resume", t(l, "btn.resume"), false, false) } else { button("pause", t(l, "btn.pause"), false, s.phase == Phase::Draining) };
            let second = if s.phase == Phase::Drained { button("resume", t(l, "btn.resume"), false, false) } else { button("drain", t(l, "btn.drain"), false, !matches!(s.phase, Phase::Active | Phase::Game)) };
            vec![first, second, admin]
        }
    }
}

fn game_hint(s: &Snapshot) -> String {
    let l = s.lang;
    let g = &s.cfg.game_mode;
    if !g.enabled {
        return t(l, "toggle.gameOff");
    }
    if s.game_active {
        let what = match s.game_reason {
            Some(Reason::Listed) => s.game_exe.unwrap_or("").to_string(),
            Some(Reason::Gpu) => tf(l, "game.reason.gpu", &[("pct", &format!("{}", s.gpu_pct.round() as i64))]),
            _ => t(l, "game.reason.exclusive"),
        };
        return tf(l, "toggle.gameNow", &[("what", &what)]);
    }
    if s.cfg.game_hands_over() {
        t(l, "toggle.gameHandover")
    } else {
        tf(l, "toggle.gameHint", &[("share", &gb(l, s.cfg.effective_mb(true)))])
    }
}

fn schedule_hint(s: &Snapshot) -> String {
    let l = s.lang;
    let sc = &s.cfg.schedule;
    if sc.slots.is_empty() {
        return t(l, "schedule.none");
    }
    if sc.enabled == Some(false) {
        return t(l, "schedule.off");
    }
    match (s.schedule.in_slot, s.schedule.current, s.schedule.next_start) {
        (true, Some((f, to)), _) => tf(l, "schedule.in", &[("range", &range_label(f, to))]),
        (false, _, Some((wd, m))) => tf(l, "schedule.out", &[("day", &t(l, &format!("wd.{wd}"))), ("time", &hhmm(m))]),
        _ => t(l, "schedule.none"),
    }
}

fn footer(s: &Snapshot) -> String {
    let l = s.lang;
    let saved = s.saved_usd_server.unwrap_or_else(|| s.usage.saved_usd_month());
    [
        tf(l, "footer.today", &[("dur", &duration(l, s.usage.active_ms_today))]),
        tf(l, "footer.drops", &[("n", &s.usage.drops_today.to_string())]),
        tf(l, "footer.saved", &[("usd", &usd_num(l, saved))]),
    ]
    .join(" · ")
}

pub fn build(s: &Snapshot) -> Value {
    let l = s.lang;
    let tone_v = tone(s.phase);
    let share = if s.running_share_mb > 0 && matches!(s.phase, Phase::Active | Phase::Game | Phase::Drained | Phase::Draining) { s.running_share_mb } else { s.cfg.effective_mb(s.game_active) };
    let none = t(l, "gauge.none");
    let ram_used = s.live.ram_used_mb;
    let ram_value = match ram_used {
        Some(u) => format!("{} / {}", dec(l, u / 1024.0, 2), gb(l, share)),
        None => format!("{} / {}", none, gb(l, share)),
    };
    let ram_pct = ram_used.map(|u| (u / share.max(1) as f64 * 100.0).clamp(0.0, 100.0)).unwrap_or(0.0);
    let cpu_pct = s.live.cpu_pct.unwrap_or(0.0).clamp(0.0, 100.0);
    let conns_sub = match (s.live.p95_ms, s.live.mbps) {
        (None, None) => none.clone(),
        (p, m) => tf(l, "gauge.connsSub", &[("p95", &p.map(|v| format!("{}", v.round() as i64)).unwrap_or_else(|| none.clone())), ("mbps", &m.map(|v| format!("{}", v.round() as i64)).unwrap_or_else(|| none.clone()))]),
    };
    let per_user = s.per_user_mb.unwrap_or(capacity::PER_USER_MB);
    let error = s.error.map(|e| {
        t(
            l,
            match e {
                ErrorKind::Crashing => "error.crashing",
                ErrorKind::KeyRevoked => "error.keyRevoked",
                ErrorKind::Runtime => "error.runtime",
            },
        )
    });
    let sync_hint = if s.applying {
        t(l, "slider.applying")
    } else if !s.cfg_synced {
        t(l, "slider.local")
    } else {
        String::new()
    };
    json!({
        "lang": l,
        "tone": tone_v.key(),
        "phase": format!("{:?}", s.phase).to_lowercase(),
        "title": t(l, "app.title"),
        "host": tf(l, "host.line", &[("host", &host(s.public_url)), ("version", &s.version.split('.').take(2).collect::<Vec<_>>().join("."))]),
        "pill": { "label": state_label(s), "tone": tone_v.key() },
        "error": error,
        "needsSetup": s.phase == Phase::Setup || s.error == Some(ErrorKind::KeyRevoked),
        "gauges": {
            "ram": { "label": t(l, "gauge.ram"), "value": ram_value, "pct": ram_pct.round() },
            "cpu": { "label": t(l, "gauge.cpu"), "value": s.live.cpu_pct.map(|c| pct(l, c)).unwrap_or(none.clone()), "pct": cpu_pct.round() },
            "conns": { "label": t(l, "gauge.conns"), "value": s.live.conns.map(|c| grouped(l, c as u64)).unwrap_or(none.clone()), "sub": conns_sub },
        },
        "spark": spark_points(s.ram_series, share as f64, 60),
        "sliders": {
            "ramMb": s.cfg.ram_mb,
            "cores": s.cfg.cores,
            "ramLabel": gb1(l, s.cfg.ram_mb),
            "coresLabel": tf(l, "slider.cores", &[("n", &s.cfg.cores.to_string())]),
            "capacityLabel": tf(l, "slider.capacity", &[("n", &grouped(l, capacity::estimate_users(s.cfg.ram_mb, Some(per_user)) as u64))]),
            "capacity": { "baseMb": capacity::BASE_MB, "perUserMb": per_user, "headroom": capacity::HEADROOM },
            "syncHint": sync_hint,
        },
        "game": { "label": t(l, "toggle.game"), "on": s.cfg.game_mode.enabled, "hint": game_hint(s), "active": s.game_active },
        "schedule": { "label": t(l, "toggle.schedule"), "on": s.cfg.schedule.active(), "hint": schedule_hint(s), "inSlot": s.schedule.in_slot },
        "buttons": buttons(s),
        "footer": { "text": footer(s), "badge": t(l, "badge.new") },
        "net": {
            "tunnel": { "label": t(l, "net.tunnel"), "tone": if s.tunnel_ready { "ok" } else if matches!(s.phase, Phase::Paused | Phase::Stopped | Phase::Setup | Phase::Error) { "off" } else { "warn" }, "text": if s.tunnel_ready { t(l, "net.up") } else if matches!(s.phase, Phase::Paused | Phase::Stopped | Phase::Setup | Phase::Error) { t(l, "net.off") } else { t(l, "net.down") } },
            "kv": { "label": t(l, "net.kv"), "tone": match s.live.kv_ok { Some(true) => "ok", Some(false) => "warn", None => "off" }, "text": match s.live.kv_ok { Some(true) => t(l, "net.up"), Some(false) => t(l, "net.down"), None => t(l, "net.off") } },
        },
        "tray": { "tone": tone_v.key(), "tooltip": tf(l, "tray.tooltip", &[("state", &state_label(s))]) },
    })
}

/// Tooltip and icon tone only (the tray updates without the page).
pub fn tray(s: &Snapshot) -> (Tone, String) {
    (tone(s.phase), tf(s.lang, "tray.tooltip", &[("state", &state_label(s))]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cfg::Slot;
    use crate::schedule::evaluate;
    use serde_json::json;

    const SUN_2341: u64 = 1_795_380_060_000;

    fn cfg() -> PcCfg {
        PcCfg::from_value(&json!({ "ramMb": 3072, "cores": 4, "gameMode": { "enabled": true, "shareMb": 1024 }, "schedule": { "slots": [ { "d": 0, "from": "18:00", "to": "02:00" } ] } }))
    }

    fn snap<'a>(c: &'a PcCfg, live: &'a Live, eval: &'a Eval, usage: &'a Usage, series: &'a [f64]) -> Snapshot<'a> {
        Snapshot {
            lang: "tr",
            phase: Phase::Active,
            pause_why: None,
            error: None,
            retry_in_ms: None,
            manual_pause: false,
            public_url: "https://pc.descall.com",
            version: "1.0.0",
            cfg: c,
            running_share_mb: 3072,
            cfg_synced: true,
            applying: false,
            live,
            ram_series: series,
            schedule: eval,
            game_active: false,
            game_reason: None,
            game_exe: None,
            gpu_pct: 0.0,
            usage,
            saved_usd_server: Some(25.0),
            per_user_mb: None,
            tunnel_ready: true,
        }
    }

    #[test]
    fn matches_the_draft_a_copy() {
        let c = cfg();
        let live = Live { ram_used_mb: Some(1.42 * 1024.0), cpu_pct: Some(22.0), conns: Some(126), p95_ms: Some(18.0), mbps: Some(18.0), kv_ok: Some(true) };
        let eval = evaluate(&c.schedule, SUN_2341);
        let usage = Usage { active_ms_today: (3 * 60 + 12) * 60_000, drops_today: 0, ..Usage::default() };
        let series = [400.0, 600.0, 900.0, 1400.0];
        let v = build(&snap(&c, &live, &eval, &usage, &series));
        assert_eq!(v["title"], "Descall Node");
        assert_eq!(v["host"], "pc.descall.com · servis v1.0");
        assert_eq!(v["pill"]["label"], "Aktif");
        assert_eq!(v["pill"]["tone"], "active");
        assert_eq!(v["gauges"]["ram"]["value"], "1,42 / 3 GB");
        assert_eq!(v["gauges"]["ram"]["pct"], 47.0);
        assert_eq!(v["gauges"]["cpu"]["value"], "%22");
        assert_eq!(v["gauges"]["conns"]["value"], "126");
        assert_eq!(v["gauges"]["conns"]["sub"], "18 ms · 18 Mbps");
        assert_eq!(v["sliders"]["ramLabel"], "3,0 GB");
        assert_eq!(v["sliders"]["coresLabel"], "4 çekirdek");
        assert_eq!(v["game"]["hint"], "oyun açılınca 1 GB'a düşer");
        assert_eq!(v["schedule"]["hint"], "şimdi plan içinde (18-02)");
        let labels: Vec<_> = v["buttons"].as_array().unwrap().iter().map(|b| b["label"].as_str().unwrap().to_string()).collect();
        assert_eq!(labels, vec!["Duraklat", "Boşalt", "Admin paneli"]);
        assert_eq!(v["footer"]["text"], "Bugün 3 sa 12 dk çalıştı · 0 kopma · bu ay ~25$ değerinde kapasite");
        assert_eq!(v["footer"]["badge"], "YENİ");
        assert_eq!(v["net"]["tunnel"]["tone"], "ok");
        assert!(v["spark"].as_str().unwrap().starts_with("0,"));
    }

    #[test]
    fn english_and_other_states() {
        let mut c = cfg();
        c.schedule.slots = vec![Slot { d: 1, from: "18:00".into(), to: "02:00".into() }];
        let live = Live::default();
        let eval = evaluate(&c.schedule, SUN_2341);
        let usage = Usage { active_ms_today: 5 * 60_000, drops_today: 2, gb_hours_month: 450.0, ..Usage::default() };
        let mut s = snap(&c, &live, &eval, &usage, &[]);
        s.lang = "en";
        s.phase = Phase::Paused;
        s.pause_why = Some(PauseWhy::Schedule);
        s.saved_usd_server = None;
        s.tunnel_ready = false;
        let v = build(&s);
        assert_eq!(v["pill"]["label"], "Outside schedule");
        assert_eq!(v["pill"]["tone"], "paused");
        assert_eq!(v["schedule"]["hint"], "outside the schedule · next Mon 18:00");
        assert_eq!(v["gauges"]["ram"]["value"], "- / 3 GB");
        assert_eq!(v["footer"]["text"], "Ran 5 min today · 2 drops · ~$7.7 of capacity this month");
        assert_eq!(v["net"]["tunnel"]["tone"], "off");
        assert_eq!(v["spark"], "");
    }

    #[test]
    fn buttons_per_state() {
        let c = cfg();
        let live = Live::default();
        let eval = evaluate(&c.schedule, SUN_2341);
        let usage = Usage::default();
        let ids = |s: &Snapshot| build(s)["buttons"].as_array().unwrap().iter().map(|b| b["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        let mut s = snap(&c, &live, &eval, &usage, &[]);
        s.phase = Phase::Paused;
        s.manual_pause = true;
        assert_eq!(ids(&s), vec!["resume", "drain", "admin"]);
        assert_eq!(build(&s)["buttons"][1]["disabled"], true);
        s.manual_pause = false;
        s.phase = Phase::Drained;
        assert_eq!(ids(&s), vec!["pause", "resume", "admin"]);
        s.phase = Phase::Setup;
        assert_eq!(ids(&s), vec!["setup"]);
        assert_eq!(build(&s)["needsSetup"], true);
        s.phase = Phase::Error;
        s.error = Some(ErrorKind::KeyRevoked);
        assert_eq!(ids(&s), vec!["setup", "logs", "admin"]);
        assert!(build(&s)["error"].as_str().unwrap().contains("iptal"));
        s.error = Some(ErrorKind::Crashing);
        assert_eq!(ids(&s), vec!["retry", "logs", "admin"]);
        s.phase = Phase::Backoff;
        s.error = None;
        s.retry_in_ms = Some(7_200);
        assert_eq!(build(&s)["pill"]["label"], "Yeniden deneniyor (8 sn)");
    }

    #[test]
    fn game_hints() {
        let c = cfg();
        let live = Live::default();
        let eval = evaluate(&c.schedule, SUN_2341);
        let usage = Usage::default();
        let mut s = snap(&c, &live, &eval, &usage, &[]);
        s.phase = Phase::Game;
        s.game_active = true;
        s.game_reason = Some(Reason::Listed);
        s.game_exe = Some("cs2.exe");
        let v = build(&s);
        assert_eq!(v["game"]["hint"], "şimdi oyunda: cs2.exe");
        assert_eq!(v["pill"]["tone"], "game");
        s.game_reason = Some(Reason::Gpu);
        s.gpu_pct = 91.4;
        assert_eq!(build(&s)["game"]["hint"], "şimdi oyunda: GPU %91");
    }

    #[test]
    fn formatting() {
        assert_eq!(grouped("tr", 1150), "1.150");
        assert_eq!(grouped("en", 1234567), "1,234,567");
        assert_eq!(grouped("tr", 12), "12");
        assert_eq!(pct("en", 22.4), "22%");
        assert_eq!(gb("tr", 1536), "1,5 GB");
        assert_eq!(gb1("en", 512), "0.5 GB");
        assert_eq!(usd("tr", 25.4), "~25$");
        assert_eq!(usd("en", 7.66), "~$7.7");
        assert_eq!(duration("tr", 59_000), "0 dk");
        assert_eq!(spark_points(&[0.0, 1024.0], 1024.0, 60), "0,56 340,6");
        assert_eq!(spark_points(&[500.0, 500.0], 3072.0, 60), "0,20 340,20", "flat line stays inside");
        assert_eq!(spark_points(&(0..360).map(|i| i as f64).collect::<Vec<_>>(), 400.0, 60).split(' ').count(), 60);
    }
}
