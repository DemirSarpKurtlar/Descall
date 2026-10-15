// Ended-call cards and the date pill are Liquid Glass on every platform.
// Run: node src/styles/call-glass.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

const polish = read("ui-polish.css");
const base = read("base.css");
const bubble = read("../components/chat/CallSummaryBubble.jsx");
const history = read("../lib/callHistoryCache.js");

function block(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const card = block(polish, "/* Ended-call history card:");
assert.match(card, /backdrop-filter:\s*blur\(24px\) saturate\(180%\)/);
assert.match(card, /-webkit-backdrop-filter:\s*blur\(24px\) saturate\(180%\)/);
assert.match(card, /inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.42\)/);
assert.match(card, /inset 0 0 0 0\.5px rgba\(255,\s*255,\s*255,\s*0\.16\)/);
assert.match(card, /0 10px 28px rgba\(0,\s*0,\s*0,\s*0\.28\)/);
assert.equal(card.includes("html.glass-ui"), false);
assert.equal(card.includes("html.glass-desktop"), false);

const icon = block(polish, ".call-summary-icon {");
assert.match(icon, /backdrop-filter:\s*blur\(14px\) saturate\(170%\)/);
assert.match(icon, /inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.5\)/);

const missed = block(polish, ".call-summary-card.is-missed .call-summary-icon {");
assert.match(missed, /color:\s*#ff453a/);
assert.match(missed, /rgba\(255,\s*69,\s*58/);

const reduced = polish.slice(polish.indexOf("@media (prefers-reduced-transparency: reduce)"));
assert.match(reduced, /html\.glass-lite \.call-summary-card/);
assert.match(reduced, /backdrop-filter:\s*none/);
const liteAt = polish.indexOf("html.glass-lite .call-summary-card");
const solidAt = polish.indexOf("html.a11y-solid .call-summary-card");
const reducedAt = polish.indexOf("@media (prefers-reduced-transparency: reduce)");
assert.ok(liteAt < reducedAt && reducedAt < solidAt, "opaque fallbacks follow the cheaper blur");

assert.match(polish, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.call-summary-card[\s\S]*\.message-day-sep span[\s\S]*transition:\s*none/);

const shared = block(polish, ".call-banner-card,\n.call-summary-card {");
assert.match(shared, /blur\(20px\)/);
assert.equal(shared.includes("saturate"), false);

const pill = block(base, ".message-day-sep span {\n  border-color: transparent;");
assert.match(pill, /backdrop-filter:\s*blur\(18px\) saturate\(180%\)/);
assert.match(pill, /inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.46\)/);
assert.equal(pill.includes("html.glass-ui"), false);

const dayReduced = base.slice(base.indexOf("@media (prefers-reduced-transparency: reduce)"));
assert.match(dayReduced, /html\.glass-lite \.message-day-sep span/);
assert.match(dayReduced, /backdrop-filter:\s*none/);
assert.match(base, /html\.a11y-solid \.message-day-sep span[\s\S]*backdrop-filter:\s*none/);

const unread = block(base, ".message-unread-sep span {");
assert.equal(unread.includes("backdrop-filter"), false);
assert.equal(unread.includes("saturate"), false);

assert.match(
  bubble,
  /call-summary-card\$\{summary\.status === "missed" \? " is-missed" : ""\}/,
);
assert.match(history, /hourCycle:\s*"h23"/);

console.log("call-glass.selftest ok");
