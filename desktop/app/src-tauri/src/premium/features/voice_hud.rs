//! voice_hud (Ultra): who is in the voice session and who is speaking; click-through, always
//! on top.

use super::hud::{HudFeature, HudRef};
use crate::premium::From;

static HUD: HudFeature = HudFeature::new(
    "voice_hud",
    "voice",
    "tl",
    220.0,
    [
        ("premium:voice_hud:open", From::Main),
        ("premium:voice_hud:close", From::Main),
        ("premium:voice_hud:state", From::Main),
        ("premium:voice_hud:config", From::Main),
        ("premium:voice_hud:status", From::Main),
    ],
);

pub(crate) fn get() -> Option<&'static HudFeature> {
    Some(&HUD)
}

pub(crate) fn feature() -> HudRef {
    HudRef(&HUD)
}
