// Glass volume slider geometry and gesture. Run: node src/lib/glassVolume.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fillAndThumbPx,
  nextMuteValue,
  snapVolume,
  volumeFraction,
  volumeFromPointer,
  volumeIconTier,
  volumeVisualCss,
} from "./glassVolume.js";

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

assert.equal(snapVolume(100.4, 0, 200, 1), 100);
assert.equal(snapVolume(-4, 0, 200, 1), 0);
assert.equal(snapVolume(240, 0, 200, 1), 200);
assert.equal(volumeFraction(100, 0, 200), 0.5);
assert.equal(volumeFraction(200, 0, 200), 1);
assert.equal(volumeFraction(0, 0, 200), 0);

assert.equal(volumeIconTier(0, 0, 200), "mute");
assert.equal(volumeIconTier(40, 0, 200), "low");
assert.equal(volumeIconTier(100, 0, 200), "high");
assert.equal(volumeIconTier(200, 0, 200), "high");
assert.equal(volumeIconTier(0.2, 0, 1), "low");
assert.equal(volumeIconTier(0.8, 0, 1), "high");

assert.equal(nextMuteValue(80, 0, 200, null), 0);
assert.equal(nextMuteValue(0, 0, 200, 80), 80);
assert.equal(nextMuteValue(0, 0, 200, null), 100);
assert.equal(nextMuteValue(0, 0, 1, null, 0.1), 1);

const track = 122;
const thumb = 22;
const atMax = fillAndThumbPx(1, track, thumb);
assert.equal(atMax.fill, track, "fill reaches the right edge at max");
assert.equal(atMax.thumbLeft + thumb, track, "thumb's right edge is flush at max");
assert.equal(atMax.fill - (atMax.thumbLeft + thumb), 0, "no gap between fill and thumb");

const atUnity = fillAndThumbPx(0.5, track, thumb);
assert.equal(atUnity.fill, atUnity.thumbLeft + thumb);
assert.ok(atUnity.fill < track);

const atZero = fillAndThumbPx(0, track, thumb);
assert.equal(atZero.thumbLeft, 0);
assert.equal(atZero.fill, thumb);

const css = volumeVisualCss(1, thumb);
assert.match(css.fill, /100% - 22px\) \+ 22px/);

// 1:1 inside the track. Travel is 100px. Grab the thumb 8px from its left.
const inside = volumeFromPointer({
  pointerX: 58,
  trackLeft: 0,
  trackWidth: track,
  thumb,
  min: 0,
  max: 200,
  grabOffset: 8,
});
near(inside.visualFraction, 0.5, 0.001, "thumb follows the grab offset 1:1");
assert.equal(inside.value, 100);

// Past the right end: value clamps, the thumb resists instead of stopping dead.
const past = volumeFromPointer({
  pointerX: 400,
  trackLeft: 0,
  trackWidth: track,
  thumb,
  min: 0,
  max: 200,
  grabOffset: 11,
});
assert.equal(past.value, 200);
assert.ok(past.visualFraction > 1, "rubber-band past the end");
assert.ok(past.visualFraction < 2, `resistance grows (${past.visualFraction})`);
const rawFraction = (400 - 11) / (track - thumb);
assert.ok(past.visualFraction < rawFraction / 2, "past the end follows less than the finger");

const before = volumeFromPointer({
  pointerX: -80,
  trackLeft: 10,
  trackWidth: track,
  thumb,
  min: 0,
  max: 200,
  grabOffset: 11,
});
assert.equal(before.value, 0);
assert.ok(before.visualFraction < 0);

// A track tap centers the thumb on the finger.
const tap = volumeFromPointer({
  pointerX: 50,
  trackLeft: 0,
  trackWidth: track,
  thumb,
  min: 0,
  max: 100,
  grabOffset: null,
});
near(tap.visualFraction, (50 - thumb / 2) / (track - thumb), 0.001, "track tap");

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../styles/glass-volume.css"), "utf8");
assert.match(cssSrc, /\.g-vol-slider:focus/);
assert.match(cssSrc, /outline:\s*none/);
assert.doesNotMatch(cssSrc, /accent-color/);
assert.doesNotMatch(cssSrc, /html\.glass-ui/, "volume slider is every platform");

const overlay = readFileSync(join(here, "../components/CallOverlay.jsx"), "utf8");
const menu = readFileSync(join(here, "../components/servers/VoiceMemberContextMenu.jsx"), "utf8");
const server = readFileSync(join(here, "../components/servers/ServerVoicePanel.jsx"), "utf8");
assert.equal((overlay.match(/GlassVolumeSlider/g) || []).length >= 2, true);
assert.equal((menu.match(/GlassVolumeSlider/g) || []).length >= 2, true);
assert.equal((server.match(/GlassVolumeSlider/g) || []).length >= 3, true);
assert.doesNotMatch(overlay, /Screen share volume[\s\S]{0,400}type="range"/);
assert.doesNotMatch(menu, /type="range"/);
assert.doesNotMatch(server, /type="range"/);

console.log("glassVolume.selftest ok");
