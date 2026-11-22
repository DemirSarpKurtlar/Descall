//! When the PC may serve users: the slots of `dc:cfg:pc.schedule`, evaluated in the schedule's
//! zone (Europe/Istanbul). A slot starts on weekday `d` at `from` and ends at `to`; a `to` at or
//! before `from` runs past midnight into the next day ("18:00"-"02:00" on Friday ends Saturday
//! 02:00, and Saturday 6 -> Sunday 0 wraps the week). Outside every slot the node is paused.

use crate::cfg::{parse_hhmm, Schedule};
use crate::time;

const WEEK_MIN: u32 = 7 * 1440;

/// A slot as a half-open range of week minutes `[start, start + len)`, `start` < WEEK_MIN.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: u32,
    pub len: u32,
    pub from_min: u32,
    pub to_min: u32,
}

impl Span {
    fn covers(&self, wm: u32) -> bool {
        let off = (wm + WEEK_MIN - self.start) % WEEK_MIN;
        off < self.len
    }
}

pub fn spans(s: &Schedule) -> Vec<Span> {
    s.slots
        .iter()
        .filter_map(|sl| {
            let f = parse_hhmm(&sl.from)?;
            let t = parse_hhmm(&sl.to)?;
            if sl.d > 6 || f >= 1440 {
                return None;
            }
            let len = if t > f { t - f } else { 1440 - f + t };
            Some(Span { start: sl.d * 1440 + f, len: len.min(WEEK_MIN), from_min: f, to_min: t % 1440 })
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Eval {
    /// The schedule limits the node at all (switched on, has slots).
    pub limits: bool,
    /// The node may run now (always true when the schedule does not limit).
    pub in_slot: bool,
    /// The slot that covers now, as local "HH:MM" minutes (from, to).
    pub current: Option<(u32, u32)>,
    /// Unix ms of the next flip of `in_slot` (None: never flips).
    pub next_change_ms: Option<u64>,
    /// Local start (weekday, minute) of the next slot when outside.
    pub next_start: Option<(u32, u32)>,
}

fn week_minute(now_ms: u64, offset: i32) -> (u32, u64) {
    let l = time::local(now_ms, offset);
    let wm = l.weekday * 1440 + l.minute_of_day;
    // ms into the current minute, so boundaries land on the exact minute.
    let into = (now_ms as i64 + offset as i64 * 60_000).rem_euclid(60_000) as u64;
    (wm, into)
}

pub fn evaluate(s: &Schedule, now_ms: u64) -> Eval {
    let sp = spans(s);
    if !s.active() || sp.is_empty() {
        return Eval { limits: false, in_slot: true, current: None, next_change_ms: None, next_start: None };
    }
    let (offset, _) = time::offset_minutes(&s.tz);
    let (wm, into) = week_minute(now_ms, offset);
    let covering = |m: u32| sp.iter().find(|x| x.covers(m % WEEK_MIN));
    let cur = covering(wm);
    let in_slot = cur.is_some();
    // Walk the boundaries ahead (starts and ends) and stop at the first one that flips.
    let mut bounds: Vec<u32> = sp.iter().flat_map(|x| [(x.start + WEEK_MIN - wm) % WEEK_MIN, (x.start + x.len + WEEK_MIN - wm) % WEEK_MIN]).filter(|d| *d > 0).collect();
    bounds.sort_unstable();
    bounds.dedup();
    let next = bounds.into_iter().find(|d| covering(wm + d).is_some() != in_slot);
    let next_change_ms = next.map(|d| now_ms - into + d as u64 * 60_000);
    let next_start = if in_slot {
        None
    } else {
        next.map(|d| {
            let m = (wm + d) % WEEK_MIN;
            (m / 1440, m % 1440)
        })
    };
    Eval { limits: true, in_slot, current: cur.map(|c| (c.from_min, c.to_min)), next_change_ms, next_start }
}

/// "18-02" for whole hours, "18:30-02:00" otherwise.
pub fn range_label(from_min: u32, to_min: u32) -> String {
    if from_min % 60 == 0 && to_min % 60 == 0 {
        format!("{:02}-{:02}", from_min / 60, to_min / 60)
    } else {
        format!("{}-{}", hhmm(from_min), hhmm(to_min))
    }
}

pub fn hhmm(m: u32) -> String {
    format!("{:02}:{:02}", (m / 60) % 24, m % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cfg::Slot;

    // Sunday 2026-11-22 23:41 Istanbul.
    const SUN_2341: u64 = 1_795_380_060_000;
    const MIN: u64 = 60_000;

    fn sched(slots: &[(u32, &str, &str)]) -> Schedule {
        Schedule { slots: slots.iter().map(|(d, f, t)| Slot { d: *d, from: f.to_string(), to: t.to_string() }).collect(), ..Schedule::default() }
    }

    #[test]
    fn no_schedule_never_limits() {
        let e = evaluate(&Schedule::default(), SUN_2341);
        assert!(!e.limits && e.in_slot && e.next_change_ms.is_none());
        let mut off = sched(&[(0, "18:00", "02:00")]);
        off.enabled = Some(false);
        assert!(evaluate(&off, SUN_2341).in_slot);
    }

    #[test]
    fn evening_slot_across_midnight() {
        let s = sched(&[(0, "18:00", "02:00")]);
        let e = evaluate(&s, SUN_2341);
        assert!(e.in_slot);
        assert_eq!(e.current, Some((18 * 60, 120)));
        assert_eq!(range_label(18 * 60, 120), "18-02");
        // Ends Monday 02:00 Istanbul = 2h19m after 23:41.
        assert_eq!(e.next_change_ms, Some(SUN_2341 + 139 * MIN));
        // Monday 01:59 still inside, 02:00 outside.
        assert!(evaluate(&s, SUN_2341 + 138 * MIN).in_slot);
        let after = evaluate(&s, SUN_2341 + 139 * MIN);
        assert!(!after.in_slot);
        assert_eq!(after.next_start, Some((0, 18 * 60)), "next Sunday 18:00");
    }

    #[test]
    fn saturday_to_sunday_wraps_the_week() {
        let s = sched(&[(6, "22:00", "03:00")]);
        // Sunday 02:00 Istanbul = SUN_2341 - (21h41m).
        let sun_0200 = SUN_2341 - (21 * 60 + 41) * MIN;
        assert!(evaluate(&s, sun_0200).in_slot);
        assert!(!evaluate(&s, sun_0200 + 60 * MIN).in_slot, "03:00 ends it");
    }

    #[test]
    fn outside_reports_next_start() {
        let s = sched(&[(1, "18:00", "02:00"), (2, "18:00", "02:00")]);
        let e = evaluate(&s, SUN_2341);
        assert!(!e.in_slot);
        // Monday 18:00 = 18h19m ahead.
        assert_eq!(e.next_change_ms, Some(SUN_2341 + (18 * 60 + 19) * MIN));
        assert_eq!(e.next_start, Some((1, 18 * 60)));
    }

    #[test]
    fn back_to_back_slots_do_not_flip_in_between() {
        // Monday 18:00 -> Tuesday 02:00, then Tuesday 02:00 -> 10:00: one stretch.
        let s = sched(&[(1, "18:00", "02:00"), (2, "02:00", "10:00")]);
        let mon_1900 = SUN_2341 + (19 * 60 + 19) * MIN;
        let e = evaluate(&s, mon_1900);
        assert!(e.in_slot);
        assert_eq!(e.next_change_ms, Some(mon_1900 + 15 * 60 * MIN), "ends Tuesday 10:00");
    }

    #[test]
    fn equal_from_and_to_is_a_whole_day() {
        let s = sched(&[(0, "00:00", "00:00")]);
        assert!(evaluate(&s, SUN_2341).in_slot);
        let all_week = sched(&[(0, "00:00", "00:00"), (1, "00:00", "00:00"), (2, "00:00", "00:00"), (3, "00:00", "00:00"), (4, "00:00", "00:00"), (5, "00:00", "00:00"), (6, "00:00", "00:00")]);
        let e = evaluate(&all_week, SUN_2341);
        assert!(e.in_slot && e.next_change_ms.is_none());
    }

    #[test]
    fn utc_zone_shifts_the_slot() {
        let mut s = sched(&[(0, "18:00", "21:00")]);
        s.tz = "UTC".into();
        // 20:41 UTC Sunday: inside in UTC.
        assert!(evaluate(&s, SUN_2341).in_slot);
        s.tz = "Europe/Istanbul".into();
        assert!(!evaluate(&s, SUN_2341).in_slot, "23:41 Istanbul is after 21:00");
        assert_eq!(range_label(18 * 60 + 30, 2 * 60), "18:30-02:00");
    }
}
