import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "./miniCallDock.js";

const vp = { w: 1280, h: 800 }, card = { w: 300, h: 72 };
// Momentum projection: flick right at 1.5 px/ms travels ~750 px.
assert.ok(Math.abs(D.project(1.5) - 748.5) < 1);
assert.equal(D.project(0), 0);
// Rubber band: diminishing, always less than the overshoot, bounded by d.
assert.equal(D.rubberband(0, 300), 0);
assert.ok(D.rubberband(50, 300) < 50 && D.rubberband(50, 300) > 0);
assert.ok(D.rubberband(1e6, 300) < 300);
assert.ok(D.rubberband(100, 300) - D.rubberband(50, 300) < D.rubberband(50, 300));
assert.equal(D.bandAxis(100, 16, 900, 300), 100); // 1:1 inside
assert.ok(D.bandAxis(-100, 16, 900, 300) > -100 && D.bandAxis(-100, 16, 900, 300) < 16);
// Anchors.
assert.deepEqual(D.anchorPoint("bottom-right", vp, card), { x: 964, y: 712 });
assert.deepEqual(D.anchorPoint("top-left", vp, card), { x: 16, y: 16 });
// Keep-out: composer across the bottom pushes the card above it.
const composer = { x: 300, y: 720, w: 980, h: 80 };
const br = D.anchorPoint("bottom-right", vp, card, [composer]);
assert.ok(br.y + card.h <= composer.y);
// Bottom-left user panel.
const panel = { x: 0, y: 640, w: 330, h: 160 };
const bl = D.anchorPoint("bottom-left", vp, card, [panel]);
assert.ok(bl.y + card.h <= panel.y);
// Snap uses projection: slow release near bottom-right stays; flick left goes left.
const here = D.anchorPoint("bottom-right", vp, card);
assert.equal(D.nearestAnchor(here, { x: 0, y: 0 }, vp, card), "bottom-right");
assert.equal(D.nearestAnchor(here, { x: -2.5, y: 0 }, vp, card), "bottom-left");
assert.equal(D.nearestAnchor(here, { x: -2.5, y: -3 }, vp, card), "top-left");
assert.equal(D.nearestAnchor({ x: 964, y: 360 }, { x: 0, y: 0 }, vp, card), "mid-right");
// Spring with velocity handoff converges, and initial velocity carries it.
let s = { x: 0, v: 2 }, steps = 0;
const s1 = D.springStep(s, 0, 16);
assert.ok(s1.x > 0, "release velocity continues into the spring");
while (!D.springSettled(s, 500) && steps < 2000) { s = D.springStep(s, 500, 16); steps += 1; }
assert.ok(steps < 200, `spring settles (${steps})`);
// Velocity estimate.
assert.deepEqual(D.releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 50, y: 10, t: 50 }]), { x: 1, y: 0.2 });
assert.deepEqual(D.releaseVelocity([]), { x: 0, y: 0 });
// Persistence.
const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.equal(D.readDockAnchor(st), "bottom-right");
D.writeDockAnchor("top-left", st); assert.equal(D.readDockAnchor(st), "top-left");
D.writeDockAnchor("nope", st); assert.equal(D.readDockAnchor(st), "top-left");

const comp = readFileSync(new URL("../components/call/MiniCallCard.jsx", import.meta.url), "utf8");
for (const n of ["setPointerCapture", "nearestAnchor", "springStep", "bandAxis", "writeDockAnchor", "prefers-reduced-motion", "onReturn", "onToggleMute", "onToggleDeafen", "onHangUp"]) assert.ok(comp.includes(n), n);
const css = readFileSync(new URL("../styles/mini-call-card.css", import.meta.url), "utf8");
assert.match(css, /backdrop-filter:\s*blur\(4\d?px/);
assert.match(css, /prefers-reduced-transparency/);
console.log("miniCallDock selftest OK");
