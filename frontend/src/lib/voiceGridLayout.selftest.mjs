// Server voice grid with 10-25 people. Run: node src/lib/voiceGridLayout.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOICE_GRID_FIT_FROM,
  VOICE_TILE_MIN,
  avatarSizeFor,
  fitVoiceGrid,
  gridBand,
  sameVoiceGridFit,
} from "./voiceGridLayout.js";

// Bands below 10 are unchanged (CSS sizes them).
assert.equal(gridBand(1), "is-1");
assert.equal(gridBand(2), "is-2");
assert.equal(gridBand(4), "is-4");
assert.equal(gridBand(5), "is-6");
assert.equal(gridBand(9), "is-9");
assert.equal(gridBand(VOICE_GRID_FIT_FROM), "is-many");
assert.equal(gridBand(25), "is-many");

const rowsFit = (fit, h, gap = 12, pad = 16) => fit.rows * fit.tileWidth * 0.75 + (fit.rows - 1) * gap + 2 * pad <= h + 1;
const colsFit = (fit, w, gap = 12, pad = 16) => fit.columns * fit.tileWidth + (fit.columns - 1) * gap + 2 * pad <= w + 1;

// The owner's question: 20 people on a 1440x900 desktop (room ~1180x759).
// Old flex rule: 7 columns of ~154px, half the room empty. Now 5 x 4 of 4:3 tiles that fill it.
const desk20 = fitVoiceGrid({ count: 20, width: 1180, height: 759 });
assert.equal(desk20.columns, 5);
assert.equal(desk20.rows, 4);
assert.ok(desk20.tileWidth >= 210, `20 people desktop tile ${desk20.tileWidth}px`);
assert.equal(desk20.scroll, false);
assert.ok(rowsFit(desk20, 759) && colsFit(desk20, 1180), "20 people fit the desktop room without scrolling");

// Every count 10..25 on the desktop room: one screen, equal tiles, readable.
for (let n = 10; n <= 25; n += 1) {
  const fit = fitVoiceGrid({ count: n, width: 1180, height: 759 });
  assert.equal(fit.scroll, false, `${n} people fit`);
  assert.ok(fit.tileWidth >= VOICE_TILE_MIN, `${n} people: ${fit.tileWidth}px`);
  assert.ok(fit.columns * fit.rows >= n);
  assert.ok(rowsFit(fit, 759) && colsFit(fit, 1180), `${n} people inside the room`);
}

// Phone (390 wide, ~470 tall room, 10px padding / 8px gap): two readable columns, scrolls.
const phone20 = fitVoiceGrid({ count: 20, width: 390, height: 470, gap: 8, padding: 10 });
assert.equal(phone20.columns, 2);
assert.equal(phone20.scroll, true);
assert.ok(phone20.tileWidth >= 170, `phone tile ${phone20.tileWidth}px`);
assert.ok(colsFit(phone20, 390, 8, 10), "phone tiles never overflow sideways");

// iPad portrait room next to the channel list (~550 wide): 3 columns.
const pad20 = fitVoiceGrid({ count: 20, width: 550, height: 940 });
assert.ok(pad20.columns >= 3 && pad20.tileWidth >= VOICE_TILE_MIN && colsFit(pad20, 550));

// Huge room: tiles stop growing at the max; the flow width follows the columns.
const big = fitVoiceGrid({ count: 10, width: 3000, height: 1600 });
assert.ok(big.tileWidth <= 360);
assert.equal(big.flowWidth, big.columns * big.tileWidth + (big.columns - 1) * 12 + 32);

// Nothing to measure yet → null (CSS fallback).
assert.equal(fitVoiceGrid({ count: 20, width: 0, height: 700 }), null);
assert.equal(fitVoiceGrid({ count: 0, width: 900, height: 700 }), null);

assert.equal(sameVoiceGridFit(desk20, { ...desk20 }), true);
assert.equal(sameVoiceGridFit(desk20, phone20), false);
assert.equal(sameVoiceGridFit(null, null), true);

assert.equal(avatarSizeFor(1, false), 112);
assert.equal(avatarSizeFor(20, true), 52);
assert.equal(avatarSizeFor(20, false), 56);
assert.equal(avatarSizeFor(12, false, 300), 72);
assert.equal(avatarSizeFor(25, false, 140), 48);

// The panel uses the fit, and the CSS gives every fitted tile the same width.
const panel = readFileSync(new URL("../components/servers/ServerVoicePanel.jsx", import.meta.url), "utf8");
assert.match(panel, /fitVoiceGrid\(/);
assert.match(panel, /--vg-tile-w/);
const css = readFileSync(new URL("../styles/servers.css", import.meta.url), "utf8");
assert.match(css, /\.server-voice-grid\.is-many\.is-fit \.server-voice-tile \{[^}]*width: var\(--vg-tile-w\)/);
assert.match(css, /\.server-voice-grid\.is-many\.is-fit \.server-voice-grid-flow \{[^}]*var\(--vg-flow-w/);

console.log("voiceGridLayout selftest: ok");
