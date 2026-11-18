//! The contract between the page shim (desktop/app/shim/native-screen-share.js) and the
//! Tauri commands that wrap this crate. Portable, so the JSON shapes are unit-tested on any
//! host. Command names the shim invokes:
//!
//! | command                     | args                          | returns            |
//! |-----------------------------|-------------------------------|--------------------|
//! | `screen_sources`            | `{ thumbnails?: bool }`       | `SourceInfo[]`     |
//! | `screen_thumbnails`         | `{ ids: string[] }`           | `ThumbnailInfo[]`  |
//! | `screen_share_caps`         | -                             | `caps::Caps`       |
//! | `screen_share_start`        | `{ req: StartRequest }`       | `StartInfo`        |
//! | `screen_share_update`       | `{ req: UpdateRequest }`      | `bool`             |
//! | `screen_share_stop`         | -                             | -                  |
//! | `screen_share_stats`        | -                             | `StatsSnapshot?`   |
//!
//! Source ids keep the Electron shape (`screen:<n>:0`, `window:<hwnd>:0`) so
//! frontend/src/lib/webrtcScreenShare.js and its picker keep working unchanged.

use serde::{Deserialize, Serialize};

use crate::presets::{clamp_request, preset, ContentHint, Quality};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceId {
    /// Index into the monitor list (primary first, then left-to-right, top-to-bottom).
    Screen(usize),
    /// HWND value.
    Window(isize),
}

impl SourceId {
    pub fn parse(id: &str) -> Option<SourceId> {
        let mut parts = id.split(':');
        let kind = parts.next()?;
        let value = parts.next()?;
        // Electron ids carry a third field ("0"); tolerate its absence, refuse anything else.
        match parts.next() {
            None | Some("0") => {}
            Some(_) => return None,
        }
        if parts.next().is_some() {
            return None;
        }
        match kind {
            "screen" => value.parse().ok().map(SourceId::Screen),
            "window" => value.parse::<isize>().ok().filter(|h| *h != 0).map(SourceId::Window),
            _ => None,
        }
    }

    pub fn format(&self) -> String {
        match self {
            SourceId::Screen(n) => format!("screen:{n}:0"),
            SourceId::Window(h) => format!("window:{h}:0"),
        }
    }

    /// `MediaTrackSettings.displaySurface` the page's guards look at.
    pub fn display_surface(&self) -> &'static str {
        match self {
            SourceId::Screen(_) => "monitor",
            SourceId::Window(_) => "window",
        }
    }
}

/// One picker tile. `thumbnail_data_url` uses the Electron field name the picker reads.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
    pub hdr: bool,
    pub process_id: u32,
    pub exe: Option<String>,
    #[serde(rename = "thumbnailDataURL")]
    pub thumbnail_data_url: Option<String>,
    #[serde(rename = "appIconDataURL")]
    pub app_icon_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailInfo {
    pub id: String,
    #[serde(rename = "thumbnailDataURL")]
    pub thumbnail_data_url: Option<String>,
    /// false: the source is gone (window closed, monitor removed).
    pub alive: bool,
}

#[derive(Debug, Clone, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StartRequest {
    pub source_id: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    /// Named preset ("high", "hfr1440", ...); wins over width/height/fps when known.
    pub preset: Option<String>,
    pub content_hint: Option<String>,
    /// Default true; the page's `cursor: "never"` turns it off.
    pub cursor: Option<bool>,
    /// System audio (process loopback, excluding Descall). Default false.
    pub audio: Option<bool>,
}

impl StartRequest {
    pub fn source(&self) -> Option<SourceId> {
        SourceId::parse(&self.source_id)
    }

    pub fn hint(&self) -> ContentHint {
        match self.content_hint.as_deref() {
            Some("detail") | Some("text") => ContentHint::Detail,
            _ => ContentHint::Motion,
        }
    }

    pub fn quality(&self) -> Quality {
        if let Some(p) = self.preset.as_deref().filter(|p| crate::presets::PRESET_IDS.contains(p)) {
            return preset(p);
        }
        clamp_request(self.width, self.height, self.fps, self.hint())
    }

    pub fn cursor(&self) -> bool {
        self.cursor.unwrap_or(true)
    }

    pub fn audio(&self) -> bool {
        self.audio.unwrap_or(false)
    }
}

/// Mid-share change (track.applyConstraints, the cursor toggle in the share bar).
#[derive(Debug, Clone, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateRequest {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub cursor: Option<bool>,
}

/// Which lane the page ends up on (also the telemetry dimension).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum Lane {
    /// Native video + process-loopback audio that excludes Descall.
    L1,
    /// Native video only (loopback unavailable or not requested).
    L2,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInfo {
    pub id: u32,
    pub bytes: usize,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub display_surface: &'static str,
    pub hdr: bool,
    pub cursor: bool,
    pub audio: bool,
    pub audio_error: Option<String>,
    pub lane: Lane,
}

/// Additional data posted with the shared buffer (`e.additionalData` in the page).
pub fn shared_buffer_meta(id: u32, bytes: usize) -> String {
    format!("{{\"descallShare\":{id},\"bytes\":{bytes},\"version\":{}}}", crate::ring::VERSION)
}

/// Wake-up message posted per frame / audio batch: `descall-share:<id>:<v|a>:<seq>`, and
/// `descall-share:<id>:end:<reason>` when the share ends.
pub fn wake_message(id: u32, kind: char, seq: u64) -> String {
    format!("descall-share:{id}:{kind}:{seq}")
}

pub fn end_message(id: u32, reason: &str) -> String {
    format!("descall-share:{id}:end:{reason}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_ids_round_trip_in_electron_shape() {
        assert_eq!(SourceId::parse("screen:1:0"), Some(SourceId::Screen(1)));
        assert_eq!(SourceId::parse("window:132456:0"), Some(SourceId::Window(132456)));
        assert_eq!(SourceId::parse("window:-5:0"), Some(SourceId::Window(-5)));
        assert_eq!(SourceId::parse("screen:2"), Some(SourceId::Screen(2)));
        for bad in ["", "screen", "screen:x:0", "window:0:0", "tab:1:0", "screen:1:1", "screen:1:0:0", "window:1e3:0"] {
            assert_eq!(SourceId::parse(bad), None, "{bad}");
        }
        assert_eq!(SourceId::Window(77).format(), "window:77:0");
        assert_eq!(SourceId::parse(&SourceId::Screen(3).format()), Some(SourceId::Screen(3)));
        assert_eq!(SourceId::Screen(0).display_surface(), "monitor");
    }

    #[test]
    fn start_request_from_page_json() {
        let r: StartRequest = serde_json::from_str(r#"{"sourceId":"screen:0:0","width":2560,"height":1440,"fps":60,"audio":true,"cursor":false}"#).unwrap();
        let q = r.quality();
        assert_eq!((q.width, q.height, q.fps), (2560, 1440, 60));
        assert!(r.audio() && !r.cursor());
        let r: StartRequest = serde_json::from_str(r#"{"sourceId":"window:5:0","preset":"hfr1080","width":10}"#).unwrap();
        assert_eq!(r.quality(), preset("hfr1080"));
        assert!(!r.audio() && r.cursor());
        let r: StartRequest = serde_json::from_str(r#"{"sourceId":"window:5:0","preset":"bogus","contentHint":"text"}"#).unwrap();
        assert_eq!(r.quality().hint, ContentHint::Detail);
        assert_eq!(r.quality().width, 1920);
        let u: UpdateRequest = serde_json::from_str(r#"{"fps":24}"#).unwrap();
        assert_eq!(u, UpdateRequest { fps: Some(24), ..Default::default() });
    }

    #[test]
    fn json_shapes_for_the_shim() {
        let s = SourceInfo { id: "screen:0:0".into(), thumbnail_data_url: Some("data:x".into()), ..Default::default() };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v["thumbnailDataURL"], "data:x");
        assert!(v.get("appIconDataURL").is_some());
        assert!(v.get("processId").is_some());
        let info = StartInfo { id: 3, bytes: 10, width: 1, height: 1, fps: 60, display_surface: "monitor", hdr: false, cursor: true, audio: false, audio_error: Some("x".into()), lane: Lane::L2 };
        let v = serde_json::to_value(&info).unwrap();
        assert_eq!(v["displaySurface"], "monitor");
        assert_eq!(v["audioError"], "x");
        assert_eq!(v["lane"], "L2");
        let meta: serde_json::Value = serde_json::from_str(&shared_buffer_meta(7, 99)).unwrap();
        assert_eq!(meta["descallShare"], 7);
        assert_eq!(meta["version"], crate::ring::VERSION);
        assert_eq!(wake_message(7, 'v', 12), "descall-share:7:v:12");
        assert_eq!(end_message(7, "source-closed"), "descall-share:7:end:source-closed");
    }
}
