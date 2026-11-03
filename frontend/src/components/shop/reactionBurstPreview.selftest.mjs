// Run: node src/components/shop/reactionBurstPreview.selftest.mjs
// Shop "Tepkiler" cards show a LIVE preview of the real chat burst (3.7.x):
// no flame/bolt placeholder icons, same ReactionBurstPop the chat plays,
// every catalogue effect_key has its chip effect, previews only run while
// visible, and every store card pins its price row to the bottom.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const read = (p) => readFileSync(new URL(p, here), "utf8");

const panel = read("../settings/ShopPanel.jsx");
const profile = read("../settings/ShopProfilePreview.jsx");
const chat = read("../chat/MessageReactions.jsx");
const preview = read("./ReactionBurstPreview.jsx");
const premium = read("../../styles/cosmetics-premium.css");
const shopCss = read("../../styles/shop.css");
const seed = read("../../../backend/scripts/seedPremiumCategories.js");

// 1. No placeholder icons for reaction bursts anywhere in the store.
const block = (src) => {
  const i = src.indexOf('category === "reaction_burst"');
  return i < 0 ? "" : src.slice(i, src.indexOf("}", src.indexOf("return", i)) + 1);
};
assert.ok(!/<Flame|<Zap/.test(block(panel)), "ShopPanel reaction card still shows Flame/Zap");
assert.match(block(panel), /<ReactionBurstPreview effectKey=\{item\.effect_key\}/);
assert.ok(!/<Flame|<Zap/.test(profile), "ShopProfilePreview still shows Flame/Zap");
assert.match(profile, /<ReactionBurstPreview effectKey=\{reaction\.effect_key\} compact/);

// 2. Shop preview and chat render the same effect code.
assert.match(chat, /import ReactionBurstPop[^\n]*"\.\/ReactionBurstPop\.jsx"/);
assert.match(chat, /<ReactionBurstPop burst=\{burst\} \/>/);
assert.match(chat, /burstChipClass\(burstKey\)/);
assert.match(preview, /import ReactionBurstPop[^\n]*"\.\.\/chat\/ReactionBurstPop\.jsx"/);
assert.match(preview, /burstChipClass\(effectKey\)/);
assert.match(preview, /sharedBurstPreviewLoop\(\)\.observe/);
assert.match(preview, /prefersReducedMotion\(\)/);

// 3. Every reaction item in the catalogue has a chip effect rule.
const keys = [...seed.matchAll(/category: "reaction_burst",[\s\S]*?effect_key: "([a-z0-9-]+)"/g)].map((m) => m[1]);
assert.equal(keys.length, 16, `expected 16 reaction items, got ${keys.length}`);
for (const k of keys) assert.ok(premium.includes(`.burst-chip-${k} {`), `missing .burst-chip-${k}`);

// 4. Cards: body fills, footer pinned to the bottom.
assert.match(shopCss, /\.shop-item-body \{[^}]*flex: 1 1 auto;/);
assert.match(shopCss, /\.shop-item-footer \{[^}]*margin-top: auto;/);

// 5. Loop: one IO, timers only for visible cards, paused while resting.
const { createBurstPreviewLoop, BURST_PREVIEW_PERIOD_MS } = await import("../../lib/burstPreviewLoop.js");
let ioCb = null;
let ioCount = 0;
class FakeIO { constructor(cb) { ioCb = cb; ioCount++; this.obs = new Set(); } observe(e) { this.obs.add(e); } unobserve(e) { this.obs.delete(e); } disconnect() {} }
const timers = new Map();
let tid = 0;
let resting = false;
const loop = createBurstPreviewLoop({
  IO: FakeIO,
  setTimeout: (fn, ms) => { timers.set(++tid, { fn, ms }); return tid; },
  clearTimeout: (id) => timers.delete(id),
  isResting: () => resting,
});
const fired = { a: 0, b: 0 };
const a = {}, b = {};
const offA = loop.observe(a, () => fired.a++);
loop.observe(b, () => fired.b++);
assert.equal(ioCount, 1, "one shared IntersectionObserver");
assert.equal(loop._running(), 0, "nothing runs before a card is visible");
ioCb([{ target: a, isIntersecting: true }]);
assert.equal(loop._running(), 1);
const run = () => { const [id, t] = [...timers][0]; timers.delete(id); t.fn(); return t.ms; };
run();
assert.equal(fired.a, 1);
assert.equal(run(), BURST_PREVIEW_PERIOD_MS);
assert.equal(fired.a, 2);
resting = true; run(); assert.equal(fired.a, 2, "paused while the app rests"); resting = false;
ioCb([{ target: a, isIntersecting: false }]);
assert.equal(loop._running(), 0, "offscreen card stops");
offA();
assert.equal(loop._size(), 1);
assert.equal(fired.b, 0);

console.log(`reactionBurstPreview selftest ok (${keys.length} reaction items)`);
