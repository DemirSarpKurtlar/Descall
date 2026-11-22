//! Notification capsule sizing and stacking. Port of electron/notificationStack.cjs and the
//! size constants / cardHeightFor of electron/notificationCard.cjs. The capsule markup
//! itself is the Electron renderer code (notificationCard.cjs), run inside the capsule
//! window by the shell page, so only placement lives here.

use serde::Serialize;

pub const NOTIF_WIDTH: f64 = 480.0;
pub const NOTIF_HEIGHT: f64 = 66.0;
pub const NOTIF_HEIGHT_CALL: f64 = 66.0;
pub const NOTIF_HEIGHT_NOTICE: f64 = 76.0;
pub const MAX_VISIBLE: usize = 3;
pub const SHADOW_PAD: f64 = 28.0;
pub const NOTIF_MARGIN: f64 = 10.0;
pub const NOTIF_GAP: f64 = 12.0;
pub const DEFAULT_DURATION_MS: u64 = 5000;
pub const SAFETY_GRACE_MS: u64 = 1500;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A monitor work area for the stack: `rect` in that monitor's logical px (physical / scale),
/// plus what turns a laid-out logical point back into the screen's physical px.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Anchor {
    pub rect: Rect,
    pub origin_px: (i32, i32),
    pub scale: f64,
}

impl Anchor {
    /// A point of the stack layout (logical px of this monitor) in physical screen px.
    /// Windows' LogicalPosition uses the scale of the monitor the window is on *now*, so on a
    /// second monitor with another DPI a logical position lands somewhere else (a 150 %
    /// monitor right of a 100 % one: x 1920 px is logical 1280, which a window still on the
    /// first monitor reads as 1280 px, on the wrong screen). Physical px are unambiguous.
    pub fn to_physical(&self, x: f64, y: f64) -> (i32, i32) {
        let s = if self.scale > 0.0 { self.scale } else { 1.0 };
        (self.origin_px.0 + ((x - self.rect.x) * s).round() as i32, self.origin_px.1 + ((y - self.rect.y) * s).round() as i32)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Message,
    Call,
    Online,
    Notice,
}

/// describeNotification's `kind` from the payload's data.type (only what sizing needs).
pub fn kind_of(data_type: &str) -> Kind {
    match data_type {
        "call" | "group-call" => Kind::Call,
        "dm" | "group" | "server-message" | "mention" | "missed-call" => Kind::Message,
        "friend-online" => Kind::Online,
        _ => Kind::Notice,
    }
}

pub fn is_call(data_type: &str) -> bool {
    kind_of(data_type) == Kind::Call
}

pub fn card_height(is_call: bool, kind: Kind) -> f64 {
    if is_call || kind == Kind::Call {
        NOTIF_HEIGHT_CALL
    } else if kind == Kind::Notice {
        NOTIF_HEIGHT_NOTICE
    } else {
        NOTIF_HEIGHT
    }
}

/// main.cjs showAppNotification: with Descall in front the in-app UI already shows a call
/// and any message that does not ask for interaction, so the shell shows nothing (no reply
/// toast, no capsule, no taskbar flash).
pub fn skip_in_front(main_in_front: bool, call: bool, require_interaction: bool) -> bool {
    main_in_front && (call || !require_interaction)
}

/// Mentions, DMs and calls flash the taskbar button while Descall is not in front.
pub fn flashes_taskbar(data_type: &str) -> bool {
    matches!(data_type, "mention" | "dm" | "call" | "group-call")
}

/// Title and text of a quick reply toast (main.cjs: data.from || title, data.preview || body).
pub fn reply_toast_text(title: &str, body: &str, data: &serde_json::Value) -> (String, String) {
    let pick = |key: &str, fallback: &str| {
        data.get(key).and_then(serde_json::Value::as_str).filter(|s| !s.is_empty()).unwrap_or(fallback).to_string()
    };
    (pick("from", title), pick("preview", body))
}

/// Capsule width for a work area: 480 DIPs, narrower on very small screens.
pub fn capsule_width(area_width: f64) -> f64 {
    NOTIF_WIDTH.min((area_width - 24.0).floor()).max(300.0)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Entry {
    pub id: u64,
    pub call: bool,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placed {
    pub entry: Entry,
    /// Window origin (capsule minus the shadow pad), whole DIPs.
    pub x: f64,
    pub y: f64,
    pub width: f64,
}

/// Top centre of the work area, stacking down; calls always on top.
pub fn stack_positions(area: Rect, entries: &[Entry]) -> Vec<Placed> {
    let w = capsule_width(area.width);
    let mut ordered: Vec<Entry> = entries.to_vec();
    ordered.sort_by_key(|e| !e.call); // stable: calls first, then insertion order
    let mut card_y = area.y + NOTIF_MARGIN;
    ordered
        .into_iter()
        .map(|entry| {
            let p = Placed { entry, x: (area.x + (area.width - w) / 2.0 - SHADOW_PAD).round(), y: (card_y - SHADOW_PAD).round(), width: w };
            card_y += entry.height + NOTIF_GAP;
            p
        })
        .collect()
}

/// Which toasts to dismiss so at most `max` are visible after adding one more. Oldest
/// non-call toasts go first; calls are never evicted.
pub fn evictions(entries: &[Entry], max: usize) -> Vec<Entry> {
    let overflow = (entries.len() + 1).saturating_sub(max);
    if overflow == 0 {
        return Vec::new();
    }
    entries.iter().filter(|e| !e.call).take(overflow).copied().collect()
}

#[cfg(test)]
mod tests {
    //! notificationCallCard.selftest.mjs sections 6 and 7.
    use super::*;

    #[test]
    fn stack_top_centre_calls_first_whole_dips() {
        let area = Rect { x: -1280.0, y: 0.0, width: 1280.0, height: 984.0 };
        let pos = stack_positions(area, &[Entry { id: 1, call: false, height: 66.0 }, Entry { id: 2, call: true, height: 66.0 }]);
        assert!(pos[0].entry.call);
        for p in &pos {
            assert_eq!(p.x, p.x.round());
            assert_eq!(p.width, 480.0);
            assert_eq!(p.x + SHADOW_PAD + p.width / 2.0, area.x + area.width / 2.0, "centred");
        }
        assert_eq!(pos[0].y, area.y + NOTIF_MARGIN - SHADOW_PAD);
        assert_eq!(pos[1].y - pos[0].y, 66.0 + NOTIF_GAP);
        let scaled = stack_positions(Rect { x: 0.0, y: 0.0, width: 1536.8, height: 816.4 }, &[Entry { id: 1, call: false, height: 66.0 }]);
        assert_eq!(scaled[0].x, scaled[0].x.round(), "125 % work areas round to whole DIPs");
        assert_eq!(capsule_width(400.0), 376.0, "narrow screens");
    }

    #[test]
    fn no_wall_of_toasts() {
        let e = |call, id| Entry { id, call, height: 66.0 };
        assert!(evictions(&[e(false, 1), e(false, 2)], MAX_VISIBLE).is_empty());
        assert_eq!(evictions(&[e(true, 0), e(false, 1), e(false, 2)], MAX_VISIBLE).iter().map(|x| x.id).collect::<Vec<_>>(), vec![1]);
        assert!(evictions(&[e(true, 0), e(true, 1), e(true, 2)], MAX_VISIBLE).is_empty());
    }

    #[test]
    fn heights_follow_card_height_for() {
        assert_eq!(card_height(false, kind_of("dm")), NOTIF_HEIGHT);
        assert_eq!(card_height(false, kind_of("group-call")), NOTIF_HEIGHT_CALL);
        assert_eq!(card_height(false, kind_of("announcement")), NOTIF_HEIGHT_NOTICE);
        assert_eq!(card_height(true, Kind::Notice), NOTIF_HEIGHT_CALL);
        assert_eq!(kind_of("friend-online"), Kind::Online);
    }

    #[test]
    fn in_front_order_flash_and_reply_text() {
        assert!(skip_in_front(true, false, false), "a DM while Descall is in front: nothing");
        assert!(skip_in_front(true, true, true), "a call while in front: the in-app card");
        assert!(!skip_in_front(true, false, true), "a mention asks for interaction: capsule");
        assert!(!skip_in_front(false, false, false));
        assert!(flashes_taskbar("mention") && flashes_taskbar("dm") && flashes_taskbar("call") && flashes_taskbar("group-call"));
        assert!(!flashes_taskbar("friend-online") && !flashes_taskbar("group") && !flashes_taskbar(""));
        let data = serde_json::json!({ "from": "Mert", "preview": "kaleci kim?" });
        assert_eq!(reply_toast_text("Hafta Sonu Ekibi", "Mert: kaleci kim?", &data), ("Mert".to_string(), "kaleci kim?".to_string()));
        let bare = serde_json::json!({ "from": "" });
        assert_eq!(reply_toast_text("Ayşe", "selam", &bare), ("Ayşe".to_string(), "selam".to_string()));
    }
    #[test]
    fn second_monitor_with_another_dpi_maps_to_its_own_pixels() {
        // 1920x1040 work area at 100 %, then a 150 % monitor to its right (2560x1400 px).
        let primary = Anchor { rect: Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 }, origin_px: (0, 0), scale: 1.0 };
        assert_eq!(primary.to_physical(1500.0, 20.0), (1500, 20));
        let s = 1.5;
        let second = Anchor { rect: Rect { x: 1920.0 / s, y: 0.0, width: 2560.0 / s, height: 1400.0 / s }, origin_px: (1920, 0), scale: s };
        let placed = stack_positions(second.rect, &[Entry { id: 1, call: true, height: card_height(true, Kind::Call) }]);
        let (px, py) = second.to_physical(placed[0].x, placed[0].y);
        // On the second monitor, top centre of its work area (not on the first screen).
        assert!(px >= 1920 && px < 1920 + 2560, "x {px}");
        let mid = px as f64 + (placed[0].width + 2.0 * SHADOW_PAD) * s / 2.0;
        assert!((mid - (1920.0 + 1280.0)).abs() <= 2.0, "centre {mid}");
        assert!((0..1400).contains(&py), "y {py}");
        // The left edge of the area is the monitor origin.
        assert_eq!(second.to_physical(second.rect.x, second.rect.y), (1920, 0));
    }
}
