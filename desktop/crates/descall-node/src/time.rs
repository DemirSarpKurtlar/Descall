//! Wall-clock helpers without a time zone database. The node's schedule is in
//! Europe/Istanbul, which has been a fixed UTC+03:00 with no daylight saving since
//! 2016-09-07, so a fixed offset is exact for every date this app will see. `UTC`,
//! `Etc/UTC` and explicit `+HH:MM` / `-HH:MM` offsets are accepted too; anything else falls
//! back to Istanbul (the owner's zone) and says so.

pub const ISTANBUL: &str = "Europe/Istanbul";
const ISTANBUL_OFFSET_MIN: i32 = 180;

/// Minutes east of UTC for `tz` and whether the name was understood.
pub fn offset_minutes(tz: &str) -> (i32, bool) {
    let t = tz.trim();
    match t {
        "Europe/Istanbul" | "Asia/Istanbul" | "Turkey" | "Turkey Standard Time" | "+03:00" => (ISTANBUL_OFFSET_MIN, true),
        "UTC" | "Etc/UTC" | "GMT" | "Z" | "+00:00" => (0, true),
        _ => match parse_fixed(t) {
            Some(m) => (m, true),
            None => (ISTANBUL_OFFSET_MIN, false),
        },
    }
}

fn parse_fixed(t: &str) -> Option<i32> {
    let (sign, rest) = match t.as_bytes().first()? {
        b'+' => (1, &t[1..]),
        b'-' => (-1, &t[1..]),
        _ => return None,
    };
    let (h, m) = rest.split_once(':')?;
    let (h, m): (i32, i32) = (h.parse().ok()?, m.parse().ok()?);
    if !(0..=14).contains(&h) || !(0..60).contains(&m) {
        return None;
    }
    Some(sign * (h * 60 + m))
}

/// Local wall clock of a Unix time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Local {
    pub year: i64,
    pub month: u32,
    pub day: u32,
    /// 0 = Sunday ... 6 = Saturday (JavaScript `getDay()`, the `d` of a schedule slot).
    pub weekday: u32,
    /// Minutes since local midnight.
    pub minute_of_day: u32,
    /// Days since 1970-01-01 in local time (a stable "day key").
    pub day_index: i64,
}

impl Local {
    /// `2026-11` style month key.
    pub fn month_key(&self) -> String {
        format!("{:04}-{:02}", self.year, self.month)
    }
    /// `2026-11-22` style day key.
    pub fn day_key(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

/// Civil date of a day count since 1970-01-01 (Howard Hinnant's algorithm).
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        _ => 28,
    }
}

/// Local time of `unix_ms` at `offset_min` minutes east of UTC.
pub fn local(unix_ms: u64, offset_min: i32) -> Local {
    let secs = (unix_ms / 1000) as i64 + offset_min as i64 * 60;
    let day_index = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(day_index);
    Local { year, month, day, weekday: (day_index + 4).rem_euclid(7) as u32, minute_of_day: (rem / 60) as u32, day_index }
}

/// Unix ms of local midnight that starts `day_index`.
pub fn midnight_ms(day_index: i64, offset_min: i32) -> i64 {
    (day_index * 86_400 - offset_min as i64 * 60) * 1000
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-22 20:41:00 UTC = 23:41 in Istanbul, a Sunday.
    const T: u64 = 1_795_380_060_000;

    #[test]
    fn istanbul_is_utc_plus_three() {
        assert_eq!(offset_minutes("Europe/Istanbul"), (180, true));
        let l = local(T, 180);
        assert_eq!((l.year, l.month, l.day), (2026, 11, 22));
        assert_eq!(l.minute_of_day, 23 * 60 + 41);
        assert_eq!(l.weekday, 0, "Sunday");
        assert_eq!(l.day_key(), "2026-11-22");
        assert_eq!(l.month_key(), "2026-11");
    }

    #[test]
    fn crossing_midnight_changes_the_local_day_before_utc() {
        // 21:30 UTC is already 00:30 Monday in Istanbul.
        let l = local(T + 49 * 60_000, 180);
        assert_eq!((l.day, l.weekday, l.minute_of_day), (23, 1, 30));
        let u = local(T + 49 * 60_000, 0);
        assert_eq!((u.day, u.weekday), (22, 0));
    }

    #[test]
    fn offsets_and_fallback() {
        assert_eq!(offset_minutes("UTC"), (0, true));
        assert_eq!(offset_minutes("+05:30"), (330, true));
        assert_eq!(offset_minutes("-04:00"), (-240, true));
        assert_eq!(offset_minutes("Mars/Olympus"), (180, false));
        assert_eq!(offset_minutes("+99:00"), (180, false));
    }

    #[test]
    fn midnight_round_trips() {
        let l = local(T, 180);
        let m = midnight_ms(l.day_index, 180);
        assert_eq!(local(m as u64, 180).minute_of_day, 0);
        assert_eq!(local(m as u64, 180).day_index, l.day_index);
        assert_eq!(days_in_month(2028, 2), 29);
        assert_eq!(days_in_month(2100, 2), 28);
        assert_eq!(days_in_month(2026, 11), 30);
    }
}
