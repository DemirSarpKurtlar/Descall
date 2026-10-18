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

// 2.11.3: safe insets — Electron title bar, macOS traffic lights, margin.
assert.deepEqual(D.dockInsets({}), { top: 16, right: 16, bottom: 16, left: 16 }, "web: margin only");
const win = D.dockInsets({ electron: true, platform: "win32", titlebarH: 40 });
assert.equal(win.top, 56, "Electron: 40px title bar + 16px margin");
assert.equal(D.dockInsets({ electron: true, platform: "win32" }).top, 56, "unmeasured bar falls back to 40");
assert.equal(D.dockInsets({ electron: true, platform: "darwin", titlebarH: 0 }).top, 56, "mac fallback");
assert.ok(D.dockInsets({ electron: true, platform: "darwin", titlebarH: 20 }).top >= D.MAC_TRAFFIC_LIGHTS_BOTTOM + 16, "mac: never above the traffic lights");
assert.equal(D.dockInsets({ electron: true, platform: "win32", titlebarH: 40, bottom: 48 }).bottom, 64, "taskbar overlap");
// Top-left snap stays fully below the title bar (the Xest bug).
const tl = D.anchorPoint("top-left", vp, card, [], win);
assert.deepEqual(tl, { x: 16, y: 56 });
assert.ok(tl.y >= D.ELECTRON_TITLEBAR_H + D.DOCK_MARGIN, "card top clears the 40px bar + margin");
assert.ok(D.anchorPoint("top-right", vp, card, [], win).y >= 56);
assert.ok(D.anchorPoint("mid-left", { w: 1280, h: 200 }, card, [], win).y >= 56, "mid anchor in a short window");
// Snap math with insets: a flick up-left lands top-left, still clear of the bar.
const brI = D.anchorPoint("bottom-right", vp, card, [], win);
const snapped = D.nearestAnchor(brI, { x: -2.5, y: -3 }, vp, card, [], win);
assert.equal(snapped, "top-left");
assert.ok(D.anchorPoint(snapped, vp, card, [], win).y >= 56);
// Clamp: saved/old positions under the bar or off-screen come back fully inside.
assert.deepEqual(D.clampDockPosition({ x: 16, y: 16 }, vp, card, win), { x: 16, y: 56 }, "2.11.1 top-left (y=16) is pushed below the bar");
assert.deepEqual(D.clampDockPosition({ x: 5000, y: 5000 }, vp, card, win), { x: 964, y: 712 });
assert.deepEqual(D.clampDockPosition({ x: NaN, y: undefined }, vp, card, win), { x: 16, y: 56 });
// Resize: shrinking the window re-clamps; a window shorter than the card keeps the top (name/status) visible.
const small = { w: 360, h: 100 };
const sp = D.anchorPoint("bottom-right", small, card, [], win);
assert.ok(sp.y >= 56 && sp.x >= 16, "tiny window: top-left edge wins");
for (const a of D.ANCHORS) {
  for (const v of [{ w: 1280, h: 800 }, { w: 800, h: 500 }, { w: 420, h: 300 }]) {
    const p = D.anchorPoint(a, v, card, [composer], win);
    assert.ok(p.y >= win.top && p.x >= win.left, `${a} ${v.w}x${v.h} top/left inside`);
    if (v.h - win.top - win.bottom >= card.h) assert.ok(p.y + card.h <= v.h - win.bottom, `${a} ${v.w}x${v.h} bottom inside`);
  }
}
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
for (const n of ["setPointerCapture", "nearestAnchor", "springStep", "bandAxis", "writeDockAnchor", "prefers-reduced-motion", "onReturn", "onToggleMute", "onToggleDeafen", "onHangUp", "safeInsets", "clampDockPosition", ".titlebar", "--electron-titlebar-h", "electronAPI"]) assert.ok(comp.includes(n), n);
const css = readFileSync(new URL("../styles/mini-call-card.css", import.meta.url), "utf8");
assert.match(css, /backdrop-filter:\s*blur\(4\d?px/);
assert.match(css, /prefers-reduced-transparency/);
// Name and status ellipsize instead of overflowing.
assert.match(css, /\.mcc-title\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/);
assert.match(css, /\.mcc-sub-text\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/);
console.log("miniCallDock selftest OK");
