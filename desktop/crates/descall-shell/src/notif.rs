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
}
