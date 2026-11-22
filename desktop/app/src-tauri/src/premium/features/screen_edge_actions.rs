//! screen_edge_actions (Ultra): reveal the desktop sidebar when the pointer rests on the chosen
//! screen edge. Reads GetCursorPos at a low rate (120 ms), only while this feature runs (off by
//! default) and the sidebar feature is available. Settings: edge 'left'|'right' (default: the
//! sidebar's edge), delay in ms (default 250). A tick with a resting pointer does nothing else;
//! display bounds and settings are read only when it moved (logic::geom::EdgeDwell).

use serde_json::Value;

use super::Poll;
use crate::premium::logic::geom::{at_edge, EdgeDisplay, EdgeDwell};
use crate::premium::logic::rules::num;
use crate::premium::{now_ms, platform, wins, Bus, Caller, Feature, From, Host};

#[derive(Default)]
pub struct F {
    poll: Poll,
    state: std::sync::Mutex<(EdgeDwell, EdgeDisplay)>,
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
        *crate::premium::lock(&self.state) = Default::default();
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
        let now = now_ms();
        let mut state = crate::premium::lock(&self.state);
        let (dwell, display) = &mut *state;
        let fire = dwell.tick(
            (x, y),
            now,
            || display.get(x, y, now, || wins::display_at(h, x, y).map(|(b, _)| b)).is_some_and(|b| at_edge(x, y, b, &edge(h))),
            || num(h.store().get("features.screen_edge_actions.delay").as_ref()).unwrap_or(250.0).clamp(0.0, 1500.0) as u64,
        );
        drop(state);
        if fire {
            h.bus(Bus::SidebarReveal(Some((x, y))));
        }
    }
}
