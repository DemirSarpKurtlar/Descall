//! Capacity estimate and saved-cost line, the same numbers as the admin panel's "Sunucu Ağı"
//! tab (`/api/admin/nodes` -> `capacity.estimate`, `capacity.perUserMb`, `savedUsdMonth`).
//! When the primary sends its own values (register answer) the popover shows those; these
//! formulas are the offline fallback and the slider preview, and the server side uses the
//! same constants:
//!
//! * a backend process costs `BASE_MB` before the first user, each connected user `PER_USER_MB`
//!   (measured on Render: ~180 MB idle, ~2.5 MB per socket with presence and caches);
//! * a GB of always-on RAM on Render costs `USD_PER_GB_MONTH` (Standard: $25 for 2 GB), so a
//!   share of `g` GB running `h` hours this month is worth `g * h / HOURS_PER_MONTH * 12.5`.

pub const BASE_MB: f64 = 180.0;
pub const PER_USER_MB: f64 = 2.5;
pub const USD_PER_GB_MONTH: f64 = 12.5;
pub const HOURS_PER_MONTH: f64 = 730.0;

/// Users a share of `ram_mb` holds at the PC's load rule (`pc_high_pct`, default 85 %), rounded
/// down to 10 (the popover writes "~1.150 kullanıcı").
pub fn estimate_users(ram_mb: u32, pc_high_pct: u32, per_user_mb: Option<f64>) -> u32 {
    let per = per_user_mb.filter(|p| p.is_finite() && *p > 0.1).unwrap_or(PER_USER_MB);
    let usable = ram_mb as f64 * (pc_high_pct.clamp(10, 100) as f64 / 100.0) - BASE_MB;
    if usable <= 0.0 {
        return 0;
    }
    ((usable / per) as u32) / 10 * 10
}

/// Raw estimate at 100 % of the share (the admin panel's `capacity.estimate` for a node).
pub fn estimate_users_full(ram_mb: u32) -> u32 {
    estimate_users(ram_mb, 100, None)
}

/// Dollars of Render capacity the PC provided, from the GB-hours it served.
pub fn saved_usd(gb_hours: f64) -> f64 {
    if !gb_hours.is_finite() || gb_hours <= 0.0 {
        return 0.0;
    }
    gb_hours / HOURS_PER_MONTH * USD_PER_GB_MONTH
}

/// GB-hours of `ram_mb` running for `ms`.
pub fn gb_hours(ram_mb: u32, ms: u64) -> f64 {
    ram_mb as f64 / 1024.0 * (ms as f64 / 3_600_000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn three_gb_holds_about_a_thousand() {
        assert_eq!(estimate_users_full(3072), 1150);
        assert_eq!(estimate_users(3072, 85, None), 970);
        assert_eq!(estimate_users(512, 85, None), 100);
        assert_eq!(estimate_users(128, 85, None), 0);
        assert_eq!(estimate_users(3072, 85, Some(5.0)), 480);
        assert_eq!(estimate_users(3072, 85, Some(f64::NAN)), 970);
    }

    #[test]
    fn saved_cost() {
        // 3 GB for 5 h a day over 30 days = 450 GB-h.
        let gbh = gb_hours(3072, 150 * 3_600_000);
        assert!((gbh - 450.0).abs() < 1e-9);
        assert!((saved_usd(gbh) - 7.705).abs() < 0.01);
        // A full month of 3 GB = 1.5 Standard plans = $37.5.
        assert!((saved_usd(gb_hours(3072, 730 * 3_600_000)) - 37.5).abs() < 1e-9);
        assert_eq!(saved_usd(-1.0), 0.0);
        assert_eq!(saved_usd(f64::INFINITY), 0.0);
    }
}
