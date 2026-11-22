//! Today's uptime, today's drops and this month's GB-hours (the popover footer "Bugün 3 sa
//! 12 dk çalıştı · 0 kopma · bu ay ~7$ değerinde kapasite"). Days and months are Istanbul
//! days and months. Saved to usage.json by the app; a gap longer than [`MAX_STEP_MS`]
//! between two ticks (sleep, a crash of the app) does not count as serving time.

use serde::{Deserialize, Serialize};

use crate::time;

pub const MAX_STEP_MS: u64 = 60_000;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Usage {
    pub day: String,
    pub active_ms_today: u64,
    pub drops_today: u32,
    pub month: String,
    pub active_ms_month: u64,
    pub gb_hours_month: f64,
    pub last_ms: Option<u64>,
}

impl Usage {
    fn roll(&mut self, now: u64, offset: i32) {
        let l = time::local(now, offset);
        let (day, month) = (l.day_key(), l.month_key());
        if self.day != day {
            self.day = day;
            self.active_ms_today = 0;
            self.drops_today = 0;
        }
        if self.month != month {
            self.month = month;
            self.active_ms_month = 0;
            self.gb_hours_month = 0.0;
        }
    }

    /// Called every few seconds; `serving_mb` is the share while users can be served.
    pub fn tick(&mut self, now: u64, offset: i32, serving_mb: Option<u32>) {
        let prev = self.last_ms.replace(now);
        self.roll(now, offset);
        let (Some(prev), Some(mb)) = (prev, serving_mb) else { return };
        if now <= prev || now - prev > MAX_STEP_MS {
            return;
        }
        let mut step = now - prev;
        // Only the part after local midnight belongs to today.
        let midnight = time::midnight_ms(time::local(now, offset).day_index, offset).max(0) as u64;
        if prev < midnight {
            step = now - midnight;
        }
        self.active_ms_today += step;
        self.active_ms_month += step;
        self.gb_hours_month += crate::capacity::gb_hours(mb, step);
    }

    pub fn add_drop(&mut self, now: u64, offset: i32) {
        self.roll(now, offset);
        self.drops_today += 1;
    }

    pub fn saved_usd_month(&self) -> f64 {
        crate::capacity::saved_usd(self.gb_hours_month)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUN_2341: u64 = 1_795_380_060_000;

    #[test]
    fn counts_serving_time_and_rolls_at_istanbul_midnight() {
        let mut u = Usage::default();
        u.tick(SUN_2341, 180, Some(3072));
        for i in 1..=18 {
            u.tick(SUN_2341 + i * 10_000, 180, Some(3072));
        }
        assert_eq!(u.active_ms_today, 180_000);
        u.add_drop(SUN_2341 + 180_000, 180);
        assert_eq!(u.drops_today, 1);
        // 23:59:30 -> 00:00:20: only 20 s on the new day.
        let before = SUN_2341 + (18 * 60 + 30) * 1000;
        u.tick(before, 180, None);
        u.tick(before + 50_000, 180, Some(1024));
        assert_eq!(u.day, "2026-11-23");
        assert_eq!(u.active_ms_today, 20_000);
        assert_eq!(u.drops_today, 0);
        assert_eq!(u.month, "2026-11");
        assert_eq!(u.active_ms_month, 200_000);
    }

    #[test]
    fn gaps_and_paused_time_do_not_count() {
        let mut u = Usage::default();
        u.tick(SUN_2341, 180, Some(2048));
        u.tick(SUN_2341 + 3_600_000, 180, Some(2048));
        assert_eq!(u.active_ms_today, 0, "an hour asleep");
        u.tick(SUN_2341 + 3_610_000, 180, None);
        assert_eq!(u.active_ms_today, 0, "paused");
        u.tick(SUN_2341 + 3_620_000, 180, Some(2048));
        assert_eq!(u.active_ms_today, 10_000);
        assert!(u.gb_hours_month > 0.0 && u.saved_usd_month() > 0.0);
    }

    #[test]
    fn month_rolls() {
        let mut u = Usage { month: "2026-10".into(), gb_hours_month: 99.0, ..Usage::default() };
        u.tick(SUN_2341, 180, None);
        assert_eq!((u.month.as_str(), u.gb_hours_month), ("2026-11", 0.0));
        let s = serde_json::to_string(&u).unwrap();
        assert_eq!(serde_json::from_str::<Usage>(&s).unwrap(), u);
    }
}
