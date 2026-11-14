import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldFlipMenuUp } from "./menuFlip.js";

const list = { top: 60, bottom: 700 };
// Room below: stays down.
assert.equal(shouldFlipMenuUp({ bar: { top: 200, bottom: 232 }, list, menuHeight: 220 }), false);
// Newest message near the bottom: flips up.
assert.equal(shouldFlipMenuUp({ bar: { top: 600, bottom: 632 }, list, menuHeight: 220 }), true);
// A floating composer over the list counts as the bottom (the reported bug: list runs under it).
assert.equal(shouldFlipMenuUp({ bar: { top: 300, bottom: 332 }, list, menuHeight: 220, composerTops: [640] }), false);
assert.equal(shouldFlipMenuUp({ bar: { top: 470, bottom: 502 }, list, menuHeight: 220, composerTops: [620] }), true);
// A composer above the bar (another pane) is ignored.
assert.equal(shouldFlipMenuUp({ bar: { top: 200, bottom: 232 }, list, menuHeight: 220, composerTops: [100] }), false);
// Neither side fits: the larger side wins.
assert.equal(shouldFlipMenuUp({ bar: { top: 150, bottom: 182 }, list: { top: 0, bottom: 300 }, menuHeight: 400 }), true);
assert.equal(shouldFlipMenuUp({ bar: { top: 60, bottom: 92 }, list: { top: 0, bottom: 300 }, menuHeight: 400 }), false);
// Bad input never flips.
assert.equal(shouldFlipMenuUp({ bar: null, list, menuHeight: 200 }), false);

// Wiring: MessageList measures and applies the class; CSS places a flipped menu above the bar.
const jsx = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
assert.match(jsx, /shouldFlipMenuUp\(\{/);
assert.match(jsx, /mhb-more\$\{moreFlip \? " flip-up" : ""\}/);
const css = readFileSync(new URL("../styles/reaction-picker.css", import.meta.url), "utf8");
assert.match(css, /\.mhb-more\.flip-up \{[^}]*bottom: calc\(100% \+ 6px\)/);
console.log("menuFlip.selftest.mjs: ok");
