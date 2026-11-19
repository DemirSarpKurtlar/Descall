//! Line protocol between the app and the capture helper process (portable, unit-tested).
//!
//! Why a helper: Windows.Graphics.Capture runs a frame-pool thread inside our process. When
//! the D3D device it presents on is removed (driver update, TDR, GPU switch, or a software
//! adapter reset on a hosted runner), that thread throws an uncaught C++ exception and the
//! whole process dies, with none of our code on the stack. In helper mode the capture and
//! the GPU conversion run in `descall-capture-host.exe`; a crash there only ends the helper.
//! The app restarts it (same shared memory, same share) or ends the share cleanly.
//!
//! Transport: the helper's stdin (commands) and stdout (events), one UTF-8 line each. Frames
//! never go through the pipe: the helper writes the frame ring (ring.rs) into a named
//! file mapping the app created, the app copies each announced frame into the WebView2
//! shared buffer.
//!
//! ```text
//! app -> helper   start {HelperJob}        first line
//!                 update {UpdateRequest}
//!                 stop
//! helper -> app   ready {HelperReady}      capture running
//!                 v <seq>                  video frame <seq> in the mapping
//!                 a <seq>                  audio packet <seq> in the mapping
//!                 stats {StatsSnapshot}    twice a second
//!                 lost {DeviceLost}        the capture device was removed (before "end")
//!                 end <reason>             source-closed | device-lost | stopped
//!                 error <message>          could not start
//! ```

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::bridge::UpdateRequest;
use crate::presets::Quality;
use crate::stats::StatsSnapshot;

/// Argument that turns an exe into the capture helper (`descall-capture-host.exe` needs
/// none; the bench and tests run themselves with it).
pub const HOST_ARG: &str = "--capture-host";

/// Helper exit code after a device loss (the app restarts it).
pub const EXIT_DEVICE_LOST: i32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HelperJob {
    /// Name of the file mapping the app created (`Local\...`).
    pub mapping: String,
    pub bytes: usize,
    pub max_w: u32,
    pub max_h: u32,
    /// "monitor" or "window".
    pub target_kind: String,
    /// HMONITOR or HWND value.
    pub handle: isize,
    pub quality: Quality,
    pub cursor: bool,
    pub audio: bool,
    /// The app's PID: loopback excludes the app's whole process tree (the helper is in it).
    pub exclude_pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct HelperReady {
    pub hdr: bool,
    pub audio: bool,
    pub audio_error: Option<String>,
}

/// One "device removed" observation: the reason and the debug-layer messages before it.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLost {
    /// GetDeviceRemovedReason as hex (0x887A0005 removed, 0x887A0006 hung, 0x887A0007 reset,
    /// 0x887A0020 driver internal error).
    pub reason: String,
    pub adapter: String,
    pub debug_layer: bool,
    pub messages: Vec<String>,
    /// Where it was seen ("watchdog", "frame", "helper exit").
    pub seen_in: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Start(Box<HelperJob>),
    Update(UpdateRequest),
    Stop,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Ready(HelperReady),
    Video(u64),
    Audio(u64),
    Stats(StatsSnapshot),
    Lost(Box<DeviceLost>),
    End(String),
    Error(String),
}

fn split(line: &str) -> (&str, &str) {
    let line = line.trim_end_matches(['\r', '\n']);
    match line.split_once(' ') {
        Some((k, v)) => (k, v),
        None => (line, ""),
    }
}

impl Command {
    pub fn line(&self) -> String {
        match self {
            Command::Start(j) => format!("start {}", serde_json::to_string(j).unwrap_or_default()),
            Command::Update(u) => format!("update {}", serde_json::to_string(u).unwrap_or_default()),
            Command::Stop => "stop".into(),
        }
    }

    pub fn parse(line: &str) -> Option<Command> {
        match split(line) {
            ("start", j) => serde_json::from_str(j).ok().map(|j| Command::Start(Box::new(j))),
            ("update", u) => serde_json::from_str(u).ok().map(Command::Update),
            ("stop", _) => Some(Command::Stop),
            _ => None,
        }
    }
}

impl Event {
    pub fn line(&self) -> String {
        match self {
            Event::Ready(r) => format!("ready {}", serde_json::to_string(r).unwrap_or_default()),
            Event::Video(s) => format!("v {s}"),
            Event::Audio(s) => format!("a {s}"),
            Event::Stats(s) => format!("stats {}", serde_json::to_string(s).unwrap_or_default()),
            Event::Lost(d) => format!("lost {}", serde_json::to_string(d).unwrap_or_default()),
            Event::End(r) => format!("end {}", one_line(r)),
            Event::Error(e) => format!("error {}", one_line(e)),
        }
    }

    pub fn parse(line: &str) -> Option<Event> {
        match split(line) {
            ("ready", j) => serde_json::from_str(j).ok().map(Event::Ready),
            ("v", s) => s.parse().ok().map(Event::Video),
            ("a", s) => s.parse().ok().map(Event::Audio),
            ("stats", j) => serde_json::from_str(j).ok().map(Event::Stats),
            ("lost", j) => serde_json::from_str(j).ok().map(|d| Event::Lost(Box::new(d))),
            ("end", r) if !r.is_empty() => Some(Event::End(r.to_string())),
            ("error", e) => Some(Event::Error(e.to_string())),
            _ => None,
        }
    }
}

fn one_line(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}

/// How often a share may restart its helper: at most `max` restarts within `window`.
/// A device that keeps dying (or a helper that crashes on start) ends the share instead of
/// looping.
#[derive(Debug, Clone)]
pub struct RestartPolicy {
    pub max: usize,
    pub window: Duration,
    recent: Vec<Instant>,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        RestartPolicy { max: 3, window: Duration::from_secs(60), recent: Vec::new() }
    }
}

impl RestartPolicy {
    /// May the helper be restarted now? Records the restart when yes.
    pub fn allow(&mut self, now: Instant) -> bool {
        let window = self.window;
        self.recent.retain(|t| now.saturating_duration_since(*t) < window);
        if self.recent.len() >= self.max {
            return false;
        }
        self.recent.push(now);
        true
    }
}

/// Why a share whose helper went away ends, from what the helper said last.
/// `None`: restart it (device lost, or the helper died without saying anything).
pub fn end_reason_after_exit(last_end: Option<&str>) -> Option<&'static str> {
    match last_end {
        Some("source-closed") => Some("source-closed"),
        Some("stopped") => Some("stopped"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::presets::preset;

    fn job() -> HelperJob {
        HelperJob { mapping: "Local\\DescallCapture-1-2".into(), bytes: 1234, max_w: 1920, max_h: 1080, target_kind: "window".into(), handle: -77, quality: preset("hfr1080"), cursor: true, audio: false, exclude_pid: 4242 }
    }

    #[test]
    fn commands_round_trip() {
        for c in [Command::Start(Box::new(job())), Command::Update(UpdateRequest { fps: Some(24), cursor: Some(false), ..Default::default() }), Command::Stop] {
            assert_eq!(Command::parse(&format!("{}\r\n", c.line())), Some(c.clone()), "{}", c.line());
        }
        assert_eq!(Command::parse("start {not json"), None);
        assert_eq!(Command::parse("jump"), None);
    }

    #[test]
    fn events_round_trip() {
        let stats = StatsSnapshot { frames_written: 9, helper_restarts: 1, ..Default::default() };
        let lost = DeviceLost { reason: "0x887A0005".into(), adapter: "Microsoft Basic Render Driver".into(), debug_layer: true, messages: vec!["[sev 1] CORRUPTION".into()], seen_in: "watchdog".into() };
        for e in [
            Event::Ready(HelperReady { hdr: true, audio: false, audio_error: Some("no device".into()) }),
            Event::Video(42),
            Event::Audio(7),
            Event::Stats(stats),
            Event::Lost(Box::new(lost)),
            Event::End("source-closed".into()),
            Event::Error("WGC unsupported".into()),
        ] {
            assert_eq!(Event::parse(&e.line()), Some(e.clone()), "{}", e.line());
        }
        assert_eq!(Event::End("a\nb".into()).line(), "end a b");
        assert_eq!(Event::parse("v x"), None);
        assert_eq!(Event::parse("end"), None);
        assert_eq!(Event::parse(""), None);
    }

    #[test]
    fn restarts_are_bounded_per_window() {
        let mut p = RestartPolicy::default();
        let t0 = Instant::now();
        assert!(p.allow(t0));
        assert!(p.allow(t0 + Duration::from_secs(1)));
        assert!(p.allow(t0 + Duration::from_secs(2)));
        assert!(!p.allow(t0 + Duration::from_secs(3)), "fourth restart within a minute");
        assert!(p.allow(t0 + Duration::from_secs(61)), "the window slides");
    }

    #[test]
    fn end_reasons() {
        assert_eq!(end_reason_after_exit(Some("source-closed")), Some("source-closed"));
        assert_eq!(end_reason_after_exit(Some("stopped")), Some("stopped"));
        assert_eq!(end_reason_after_exit(Some("device-lost")), None);
        assert_eq!(end_reason_after_exit(None), None);
    }
}
