import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swipeActionsWidth, revealFor, isFullSwipe, FULL_SWIPE_EXTRA, GLASS_SWIPE_SLOT } from "./swipeReveal.js";

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
assert.match(row, /--swipe-reveal/, "front shrinks instead of sliding off-screen");
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
assert.match(css, /is-fluid-reveal \.group-swipe-actions \{[^}]*width: var\(--swipe-reveal/);

console.log("swipeReveal.selftest ok");
