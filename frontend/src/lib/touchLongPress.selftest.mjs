// Touch long-press for desktop-layout rows on tablets (no permanent row ⋯ on touch).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { touchLongPressHandlers, resetTouchLongPress, LONG_PRESS_MS } from "./touchLongPress.js";

const timers = [];
const setTimer = (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; };
const clearTimer = (id) => { if (timers[id]) timers[id].live = false; };
const runTimers = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });
const ev = (over = {}) => ({ pointerType: "touch", button: 0, isPrimary: true, clientX: 100, clientY: 200, currentTarget: "row", prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...over });

let fired = [];
const h = () => touchLongPressHandlers((p) => fired.push(p), { setTimer, clearTimer });

// Hold fires at the finger, the lifting click is swallowed.
resetTouchLongPress(); fired = []; timers.length = 0;
let a = h();
a.onPointerDown(ev());
assert.equal(timers[0].ms, LONG_PRESS_MS);
runTimers();
assert.deepEqual(fired, [{ clientX: 100, clientY: 200, target: "row" }]);
a.onPointerUp(ev());
const click = ev();
a.onClickCapture(click);
assert.ok(click.prevented && click.stopped, "click after a fired hold must not open the chat");
const next = ev();
a.onClickCapture(next);
assert.ok(!next.prevented, "only one click is swallowed");

// A short tap never fires and its click goes through.
resetTouchLongPress(); fired = []; timers.length = 0;
a = h();
a.onPointerDown(ev());
a.onPointerUp(ev());
runTimers();
assert.equal(fired.length, 0);
const tap = ev(); a.onClickCapture(tap); assert.ok(!tap.prevented);

// Scrolling (move > slop) cancels.
resetTouchLongPress(); fired = []; timers.length = 0;
a = h();
a.onPointerDown(ev());
a.onPointerMove(ev({ clientY: 215 }));
runTimers();
assert.equal(fired.length, 0, "a scroll is not a long-press");

// Re-render mid-hold: new handler objects still cancel the running hold.
resetTouchLongPress(); fired = []; timers.length = 0;
h().onPointerDown(ev());
h().onPointerUp(ev());
runTimers();
assert.equal(fired.length, 0, "row re-render must not leave a stray timer");

// Mouse / trackpad never start a hold (right-click and hover stay).
resetTouchLongPress(); fired = []; timers.length = 0;
h().onPointerDown(ev({ pointerType: "mouse" }));
assert.equal(timers.length, 0);

// Android fires its own contextmenu during the hold: ours is dropped.
resetTouchLongPress(); fired = []; timers.length = 0;
a = h();
a.onPointerDown(ev());
a.onContextMenuCapture(ev());
runTimers();
assert.equal(fired.length, 0, "never two menus");

// Wiring: DM and group rows of the desktop list use it; CSS hides the per-row ⋯ on touch.
const sidebar = readFileSync(new URL("../components/layout/ServerSidebar.jsx", import.meta.url), "utf8");
assert.ok((sidebar.match(/touchLongPressHandlers\(/g) || []).length >= 2, "DM and group rows hold-to-open");
const css = readFileSync(new URL("../styles/conv-rows.css", import.meta.url), "utf8");
assert.match(css, /@media \(hover: none\), \(pointer: coarse\) \{[\s\S]*?\.conv-group-wrap\.is-desktop:not\(\.is-active-row\):not\(\.menu-open\) > \.conv-more-btn \{\s*display: none/);
assert.match(css, /-webkit-touch-callout: none/);

console.log("touchLongPress selftest ok");
