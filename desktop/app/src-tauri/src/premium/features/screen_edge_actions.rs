//! screen_edge_actions (Ultra): reveal the desktop sidebar when the pointer rests on the chosen
//! screen edge. Reads GetCursorPos at a low rate (120 ms), only while this feature runs (off by
//! default) and the sidebar feature is available. Settings: edge 'left'|'right' (default: the
//! sidebar's edge), delay in ms (default 250).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use serde_json::Value;

use super::Poll;
use crate::premium::logic::geom::at_edge;
use crate::premium::logic::rules::num;
use crate::premium::{now_ms, platform, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    poll: Poll,
    since: AtomicU64,
    fired: AtomicBool,
}

fn edge(h: &Host) -> String {
    match h.store().get("features.screen_edge_actions.edge").and_then(|v| v.as_str().map(str::to_string)) {
        Some(e) if e == "left" || e == "right" => e,
        _ => wins::sidebar_edge(h),
    }
}

impl Feature for F {
    fn key(&self) -> &'static str {
        "screen_edge_actions"
    }
    fn channels(&self) -> &'static [(&'static str, From)] {
        &[]
    }
    fn start(&self, h: &Host) {
        self.since.store(0, Ordering::Relaxed);
        self.fired.store(false, Ordering::Relaxed);
        self.poll.start(h, "screen_edge_actions", "poll", 120);
    }
    fn stop(&self, _h: &Host) {
        self.poll.stop();
    }
    fn call(&self, _h: &Host, _ch: &str, _a: &[Value], _c: &Caller) -> Result<Value, String> {
        Ok(crate::premium::fail("locked"))
    }
    fn on_bus(&self, h: &Host, ev: &Bus) {
        if !matches!(ev, Bus::Tick { key: "screen_edge_actions", tag: "poll", .. }) || !h.has("desktop_sidebar") {
            return;
        }
        let Some((x, y)) = platform::cursor_pos() else { return };
        let Some((bounds, _)) = wins::display_at(h, x, y) else { return };
        let delay = num(h.store().get("features.screen_edge_actions.delay").as_ref()).unwrap_or(250.0).clamp(0.0, 1500.0) as u64;
        if at_edge(x, y, bounds, &edge(h)) {
            let now = now_ms();
            let since = match self.since.load(Ordering::Relaxed) {
                0 => {
                    self.since.store(now, Ordering::Relaxed);
                    now
                }
                s => s,
            };
            if !self.fired.load(Ordering::Relaxed) && now - since >= delay {
                self.fired.store(true, Ordering::Relaxed);
                h.bus(Bus::SidebarReveal(Some((x, y))));
            }
        } else {
            self.since.store(0, Ordering::Relaxed);
            self.fired.store(false, Ordering::Relaxed);
        }
    }
}
