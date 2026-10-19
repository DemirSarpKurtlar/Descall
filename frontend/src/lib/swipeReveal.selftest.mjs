import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swipeActionsWidth, revealFor, isFullSwipe, trackTransform, FULL_SWIPE_EXTRA, GLASS_SWIPE_SLOT } from "./swipeReveal.js";

// Width fits every action exactly (the 2.10.109 group row had 5 actions in a 226px strip).
assert.equal(swipeActionsWidth(4), 226);
assert.equal(swipeActionsWidth(5), 282);
assert.equal(swipeActionsWidth(0), 0);
for (let n = 1; n <= 6; n++) assert.ok(swipeActionsWidth(n) >= n * GLASS_SWIPE_SLOT);

assert.equal(revealFor(-120), 120);
assert.equal(revealFor(10), 0);
assert.equal(isFullSwipe(-226, 226), false, "full reveal is not a full swipe");
assert.equal(isFullSwipe(-(226 + FULL_SWIPE_EXTRA), 226), true);
assert.equal(isFullSwipe(-500, 0), false);

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const row = read("../components/layout/SwipeRevealRow.jsx");
assert.equal(trackTransform(-120.004), "translate3d(-120px, 0, 0)");
assert.equal(trackTransform(15), "translate3d(0px, 0, 0)");
// One transform frame: the track is the only moving element; row + actions ride it.
assert.match(row, /trackRef\.current\.style\.transform = trackTransform\(x\)/);
assert.match(row, /prefers-reduced-motion: reduce/);
assert.match(row, /reducedMotion,/);
assert.match(row, /rubberBand: true/);
assert.match(row, /onFullSwipe\(\)/);
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.match(sidebar, /const GLASS_SWIPE_WIDTH = swipeActionsWidth\(4\)/);
// Group row: exactly four swipe actions (invite, add, more, leave); rename/photo moved to "More".
const groupRow = sidebar.slice(sidebar.indexOf("function SwipeableGroupRow("), sidebar.indexOf("function GroupRowFront("));
assert.equal((groupRow.match(/className="group-swipe-btn /g) || []).length, 4);
assert.match(groupRow, /group-swipe-btn more/);
assert.match(groupRow, /onFullSwipe=\{\(\) => onAction\?\.\("leave"\)\}/);
const dmRow = sidebar.slice(sidebar.indexOf("function SwipeableDmRow("), sidebar.indexOf("function DmRowFront("));
assert.equal((dmRow.match(/className="group-swipe-btn /g) || []).length, 4);
const css = read("../styles/glass/chat.css");
const actionsRule = css.match(/is-fluid-reveal \.group-swipe-actions \{[^}]*\}/)[0];
assert.match(actionsRule, /left: 100%/, "actions hang off the row's trailing edge");
assert.match(actionsRule, /width: max\(var\(--swipe-width, 0px\), var\(--swipe-reveal, 0px\)\)/, "strip fills rubber-band overshoot");
assert.match(actionsRule, /transition: none/);
const trackRule = css.match(/is-fluid-reveal \.group-swipe-track \{[^}]*\}/)[0];
assert.match(trackRule, /transition: none !important/);
assert.doesNotMatch(trackRule, /transform: none/, "the track must keep its JS transform");
const frontRule = css.match(/is-fluid-reveal \.group-swipe-track > \.group-row-front \{[^}]*\}/)[0];
assert.match(frontRule, /transform: none !important/);
assert.doesNotMatch(frontRule, /transition:[^;]*(all|transform)/, "front must not ease on its own");

console.log("swipeReveal.selftest ok");
