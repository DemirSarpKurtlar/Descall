// Set carousel swipe / key helpers (featured banner, phone set page).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { swipeStep, wrapIndex, keyStep, SWIPE_MIN_PX } from "./shop2Swipe.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(swipeStep(-80, 5), 1, "finger left = next set");
assert.equal(swipeStep(80, -5), -1, "finger right = previous set");
assert.equal(swipeStep(-(SWIPE_MIN_PX - 1), 0), 0, "short drags are taps");
assert.equal(swipeStep(-60, 80), 0, "a mostly vertical move scrolls the page");
assert.equal(swipeStep(NaN, 0), 0);
assert.equal(wrapIndex(2, 1, 3), 0);
assert.equal(wrapIndex(0, -1, 3), 2);
assert.equal(wrapIndex(5, 0, 0), 0);
assert.equal(keyStep("ArrowRight", 0, 3), 1);
assert.equal(keyStep("ArrowLeft", 0, 3), 2);
assert.equal(keyStep("End", 0, 3), 2);
assert.equal(keyStep("Enter", 0, 3), null);

// Wiring: the featured banner and the phone set page swipe, page and take arrow keys.
const vitrin = readFileSync(join(src, "components/shop2/Shop2Vitrin.jsx"), "utf8");
assert.match(vitrin, /useShop2Swipe\(/, "featured banner swipes");
assert.match(vitrin, /s2-banner-nav/, "featured banner has prev / next buttons");
assert.match(vitrin, /keyStep\(/, "featured banner takes arrow keys");
const sets = readFileSync(join(src, "components/shop2/Shop2Sets.jsx"), "utf8");
assert.match(sets, /useShop2Swipe\(/, "phone set page swipes");
assert.match(sets, /s2-pset-nav/, "phone set page has prev / next buttons");
assert.match(sets, /activeKey=\{active\} onKeyDown=\{onKeyDown\}/, "desktop set switcher takes arrow keys");

// The category chip strip mounts after the shop is ready (only on the Tumu tab): its hook must
// use callback refs, or its drag / wheel / arrow listeners are never attached.
const hook = readFileSync(join(src, "hooks/useShopChipScroll.js"), "utf8");
assert.match(hook, /const viewportRef = useCallback\(/, "chip strip viewport is a callback ref");
assert.match(hook, /\[animateTo, measure, publish, ready, stop, viewportEl, trackEl\]/, "listeners re-attach when the strip mounts");

console.log("shop2Swipe ok");
