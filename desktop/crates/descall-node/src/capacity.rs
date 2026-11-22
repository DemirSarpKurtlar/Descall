//! Capacity estimate and saved-cost line, the same numbers as the admin panel's "Sunucu Ağı"
//! tab (`/api/admin/nodes` -> `capacity.estimate`, `capacity.perUserMb`, `savedUsdMonth`).
//! One formula on every side (backend `lib/nodeKeys/model.js`, admin
//! `src/components/admin/nodes/nodeModel.js`, this crate and the popover script):
//!
//! * users = floor((share MB * `HEADROOM` - `BASE_MB`) / per-user MB); a backend process costs
//!   `BASE_MB` before the first user, each connected user `PER_USER_MB` (measured on Render:
//!   ~180 MB idle, ~2.5 MB per socket with presence and caches; the primary sends the measured
//!   value in the register answer) and no node is planned above 85 % of its memory;
//! * a GB of always-on RAM on Render costs `USD_PER_GB_MONTH` (Standard: $25 for 2 GB), so a
//!   share of `g` GB running `h` hours this month is worth `g * h / HOURS_PER_MONTH * 12.5`.

pub const BASE_MB: f64 = 180.0;
pub const PER_USER_MB: f64 = 2.5;
/// Never plan above 85 % of a node's memory (backend `HEADROOM`).
pub const HEADROOM: f64 = 0.85;
pub const USD_PER_GB_MONTH: f64 = 12.5;
pub const HOURS_PER_MONTH: f64 = 730.0;

/// Users a share of `ram_mb` holds (the popover writes "~972 kullanıcı"; the admin panel shows
/// the same number for the same share and per-user figure).
pub fn estimate_users(ram_mb: u32, per_user_mb: Option<f64>) -> u32 {
    let per = per_user_mb.filter(|p| p.is_finite() && *p > 0.1).unwrap_or(PER_USER_MB);
    let usable = ram_mb as f64 * HEADROOM - BASE_MB;
    if usable <= 0.0 {
        return 0;
    }
    (usable / per).floor() as u32
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
    fn same_numbers_as_the_admin_panel() {
        // floor((3072 * 0.85 - 180) / 2.5) = floor(972.48)
        assert_eq!(estimate_users(3072, None), 972);
        assert_eq!(estimate_users(2048, None), 624);
        assert_eq!(estimate_users(512, None), 102);
        assert_eq!(estimate_users(128, None), 0);
        assert_eq!(estimate_users(3072, Some(5.0)), 486);
        assert_eq!(estimate_users(3072, Some(f64::NAN)), 972);
        // admin test fixture: measured 2.28 MB per user, 2 GB share
        assert_eq!(estimate_users(2048, Some(2.28)), 684);
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
