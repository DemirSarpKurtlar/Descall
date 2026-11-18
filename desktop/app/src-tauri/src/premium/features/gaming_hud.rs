//! gaming_hud (Ultra): clock, ping to Descall / LiveKit, call info and online friends. It never
//! reads the game's FPS: that needs injection into the game or admin-level event tracing, both
//! off limits (anti-cheat, privileges).

use super::hud::{HudFeature, HudRef};
use crate::premium::From;

static HUD: HudFeature = HudFeature::new(
    "gaming_hud",
    "gaming",
    "tr",
    230.0,
    [
        ("premium:gaming_hud:open", From::Main),
        ("premium:gaming_hud:close", From::Main),
        ("premium:gaming_hud:state", From::Main),
        ("premium:gaming_hud:config", From::Main),
        ("premium:gaming_hud:status", From::Main),
    ],
);

pub(crate) fn get() -> Option<&'static HudFeature> {
    Some(&HUD)
}

pub(crate) fn feature() -> HudRef {
    HudRef(&HUD)
}
