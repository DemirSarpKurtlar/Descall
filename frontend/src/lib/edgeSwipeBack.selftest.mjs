/**
 * Run: node frontend/src/lib/edgeSwipeBack.selftest.mjs
 * Edge swipe-back gesture state machine: zones, direction lock, thresholds,
 * velocity, springs, disabled states — plus the wiring that keeps exactly one
 * back mechanism on iOS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHASE,
  SWIPE_BACK_DEFAULTS as D,
  classifyStart,
  computeVelocity,
  createSpring,
  createSwipeBackMachine,
  layerFrame,
  lockDirection,
  progressFor,
  releaseDecision,
} from "./edgeSwipeBack.js";

const W = 440; // iPhone 16 Pro Max CSS width

/* ── start zones ── */
assert.equal(classifyStart({ x: 4, width: W }), "edge");
assert.equal(classifyStart({ x: D.edgeWidth, width: W }), "edge");
assert.equal(classifyStart({ x: D.edgeWidth + 1, width: W }), "body");
assert.equal(classifyStart({ x: W * 0.5, width: W }), "body");
assert.equal(classifyStart({ x: W * 0.5 + 1, width: W }), null, "right half never starts a swipe");
assert.equal(classifyStart({ x: 10, width: W, edgeInset: 47 }), "edge");
assert.equal(classifyStart({ x: 70, width: W, edgeInset: 47 }), "edge", "landscape safe-area widens the edge band");
// Horizontal scrollers / sliders / inputs only yield to the very edge.
assert.equal(classifyStart({ x: 120, width: W, onHorizontalScroller: true }), null);
assert.equal(classifyStart({ x: 12, width: W, onHorizontalScroller: true }), "edge");
assert.equal(classifyStart({ x: 120, width: W, onNoSwipeTarget: true }), null);
assert.equal(classifyStart({ x: 12, width: W, onNoSwipeTarget: true }), "edge");
// Disabled states.
assert.equal(classifyStart({ x: 4, width: W, disabled: true }), null, "disabled screen");
assert.equal(classifyStart({ x: 4, width: W, blocked: true }), null, "modal / sheet / call view open");
assert.equal(classifyStart({ x: 4, width: W, hasSelection: true }), null, "text selection owns the drag");
assert.equal(classifyStart({ x: 4, width: 0 }), null);
assert.equal(classifyStart({ x: -3, width: W }), null);
assert.equal(classifyStart({ x: 100, width: W }, { ...D, bodyZoneRatio: 0 }), null, "edge-only mode");

/* ── direction lock ── */
assert.equal(lockDirection(3, 2, "edge"), null, "below slop: undecided");
assert.equal(lockDirection(12, 4, "edge"), "horizontal");
assert.equal(lockDirection(12, 11, "edge"), "horizontal", "edge is lenient (1:1)");
assert.equal(lockDirection(12, 11, "body"), "vertical", "body needs a clearly horizontal swipe");
assert.equal(lockDirection(20, 11, "body"), "horizontal");
assert.equal(lockDirection(2, 14, "edge"), "vertical", "vertical scroll cancels");
assert.equal(lockDirection(-12, 2, "edge"), "reverse", "leftward drag is not a back swipe");
assert.equal(lockDirection(0, -15, "body"), "vertical");

/* ── velocity ── */
assert.equal(computeVelocity([]), 0);
assert.equal(computeVelocity([{ x: 0, t: 0 }]), 0);
assert.equal(computeVelocity([{ x: 0, t: 0 }, { x: 50, t: 50 }]), 1);
// Only the recent window counts: an early slow phase doesn't dilute a flick.
{
  const v = computeVelocity([
    { x: 0, t: 0 },
    { x: 10, t: 300 },
    { x: 40, t: 340 },
    { x: 80, t: 380 },
  ]);
  assert.ok(Math.abs(v - 70 / 80) < 1e-9, `windowed velocity ${v}`);
}

/* ── release decision ── */
assert.equal(releaseDecision({ x: W * 0.37, width: W, velocity: 0 }), "cancel");
assert.equal(releaseDecision({ x: W * 0.39, width: W, velocity: 0 }), "complete");
assert.equal(releaseDecision({ x: 60, width: W, velocity: 0.6 }), "complete", "flick completes a short drag");
assert.equal(releaseDecision({ x: W * 0.8, width: W, velocity: -0.6 }), "cancel", "flick back cancels a long drag");
assert.equal(releaseDecision({ x: W * 0.8, width: W, velocity: -0.2 }), "complete", "slow drift back still completes");
assert.equal(releaseDecision({ x: 0, width: W, velocity: 2 }), "cancel");
assert.ok(D.completeRatio >= 0.35 && D.completeRatio <= 0.4, "threshold ~35–40% of the width");

/* ── frames: parallax, dim, shadow, reduced motion ── */
{
  const start = layerFrame(0, W);
  assert.equal(start.surfaceX, 0);
  assert.ok(Math.abs(start.underlayX - -0.3 * W) < 1e-9, "previous screen starts 30% left");
  assert.equal(start.dimOpacity, D.dimOpacity);
  const mid = layerFrame(W / 2, W);
  assert.equal(mid.surfaceX, W / 2, "page follows the finger 1:1");
  assert.ok(Math.abs(mid.underlayX - -0.15 * W) < 1e-9);
  assert.ok(Math.abs(mid.dimOpacity - D.dimOpacity / 2) < 1e-9, "dim fades with progress");
  const end = layerFrame(W, W);
  assert.equal(end.underlayX === 0 || Object.is(end.underlayX, -0), true);
  assert.equal(end.dimOpacity, 0);
  assert.equal(layerFrame(W * 2, W).surfaceX, W, "clamped to the width");
  const reduced = layerFrame(W / 2, W, D, true);
  assert.equal(reduced.surfaceX, 0, "reduced motion: no slide");
  assert.equal(reduced.underlayX, 0, "reduced motion: no parallax");
  assert.equal(reduced.surfaceOpacity, 0.5, "reduced motion: fade");
}
assert.equal(progressFor(110, W), 0.25);
assert.equal(progressFor(-5, W), 0);

/* ── machine: full swipes ── */
function swipe(points, { zone = "edge", width = W } = {}) {
  const m = createSwipeBackMachine();
  const [first, ...rest] = points;
  m.begin({ x: first[0], y: first[1], t: first[2], width, zone });
  const moves = rest.map(([x, y, t]) => m.move({ x, y, t }));
  const lastT = points[points.length - 1][2];
  return { m, moves, release: (opts = {}) => m.end({ t: lastT, ...opts }) };
}

{
  // Slow drag past 40% → complete.
  const pts = [[5, 300, 0]];
  for (let i = 1; i <= 20; i += 1) pts.push([5 + i * 10, 300 + (i % 2), i * 40]);
  const { moves, release } = swipe(pts);
  assert.equal(moves[0].type, "lock", "locks once past the slop");
  assert.equal(moves[0].x, 0, "slop is swallowed (no jump)");
  assert.equal(moves[1].type, "drag");
  const r = release();
  assert.equal(r.type, "complete");
  assert.ok(r.x >= W * 0.38);
}
{
  // Short slow drag → spring back.
  const { release } = swipe([[5, 300, 0], [20, 300, 30], [60, 301, 200], [90, 301, 400], [100, 301, 600]]);
  assert.equal(release().type, "cancel");
}
{
  // Short fast flick → complete.
  const { release } = swipe([[5, 300, 0], [20, 300, 10], [50, 300, 30], [90, 300, 50], [130, 300, 70]]);
  const r = release();
  assert.equal(r.type, "complete");
  assert.ok(r.velocity >= D.flickVelocity);
}
{
  // Finger paused before lifting → no flick velocity.
  const { m } = swipe([[5, 300, 0], [20, 300, 10], [50, 300, 30], [90, 300, 50]]);
  const r = m.end({ t: 50 + D.velocityWindowMs + 50 });
  assert.equal(r.velocity, 0);
  assert.equal(r.type, "cancel");
}
{
  // Vertical scroll → aborts and stays idle.
  const { m, moves } = swipe([[5, 300, 0], [7, 320, 16]]);
  assert.equal(moves[0].type, "abort");
  assert.equal(moves[0].reason, "vertical");
  assert.equal(m.state.phase, PHASE.IDLE);
  assert.equal(m.move({ x: 200, y: 320, t: 40 }).type, "none", "no revival after abort");
  assert.equal(m.end({ t: 50 }).type, "none");
}
{
  // Body-zone diagonal → vertical, edge diagonal → horizontal.
  assert.equal(swipe([[150, 300, 0], [165, 312, 16]], { zone: "body" }).moves[0].type, "abort");
  assert.equal(swipe([[5, 300, 0], [17, 310, 16]], { zone: "edge" }).moves[0].type, "lock");
}
{
  // touchcancel (system took the touch, e.g. Safari's own back swipe) never navigates.
  const { release } = swipe([[5, 300, 0], [20, 300, 10], [300, 300, 200]]);
  assert.equal(release({ cancelled: true }).type, "cancel");
}
{
  // Dragging back to the start and releasing cancels; x never goes negative.
  const { moves, release } = swipe([[5, 300, 0], [20, 300, 10], [200, 300, 100], [0, 300, 400], [-40, 300, 450]]);
  assert.equal(moves[moves.length - 1].x, 0);
  assert.equal(release().type, "cancel");
}
{
  // Tap without movement: nothing.
  const m = createSwipeBackMachine();
  m.begin({ x: 5, y: 300, t: 0, width: W, zone: "edge" });
  assert.equal(m.end({ t: 80 }).type, "none");
}
{
  // Interruptible: grab a settling page at x=250 and keep following the finger.
  const m = createSwipeBackMachine();
  m.grab({ x: 300, y: 400, t: 0, width: W, fromX: 250 });
  assert.equal(m.state.phase, PHASE.DRAGGING);
  assert.equal(m.move({ x: 280, y: 410, t: 16 }).x, 230, "1:1 from the caught position, no axis lock needed");
  assert.equal(m.move({ x: 100, y: 410, t: 200 }).x, 50);
  assert.equal(m.end({ t: 400 }).type, "cancel");
}

/* ── springs ── */
function run(spring, maxMs = 2000) {
  let t = 0;
  let max = -Infinity;
  let min = Infinity;
  while (!spring.done && t < maxMs) {
    const v = spring.step(16.67);
    max = Math.max(max, v);
    min = Math.min(min, v);
    t += 16.67;
  }
  return { t, max, min };
}
{
  const s = createSpring({ from: 200, to: W, velocity: 0, response: 300 });
  const r = run(s);
  assert.ok(s.done && s.value === W, "complete spring lands exactly on the width");
  assert.ok(r.t < 700, `complete settles quickly (${r.t.toFixed(0)}ms)`);
  assert.ok(r.max <= W, "never overshoots past the edge");
}
{
  const s = createSpring({ from: 120, to: 0, velocity: 0, response: 340 });
  const r = run(s);
  assert.ok(s.done && s.value === 0, "cancel spring lands on 0");
  assert.ok(r.min >= 0, "spring-back never shows a gap on the right");
  assert.ok(r.t < 800, `cancel settles (${r.t.toFixed(0)}ms)`);
}
{
  // A hard flick carries velocity and still clamps at the target.
  const s = createSpring({ from: 150, to: W, velocity: 3, response: 300 });
  const r = run(s);
  assert.ok(s.done && r.max <= W);
  // 60fps: the first frame already moves (velocity continuity).
  const s2 = createSpring({ from: 150, to: W, velocity: 1.2, response: 300 });
  assert.ok(s2.step(16.67) > 150 + 10);
}
{
  const s = createSpring({ from: 0, to: 0 });
  assert.equal(s.done, true, "nothing to animate");
}

/* ── wiring: one back mechanism, reuse of the nav-hidden logic ── */
const root = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(root, rel), "utf8");
const layout = read("../components/layout/AppLayout.jsx");
const panel = read("../components/layout/UserPanel.jsx");
const lfg = read("../components/lfg/LfgWorkspace.jsx");
const hook = read("../hooks/useEdgeSwipeBack.js");
const bridge = read("../../ios/App/App/DescallBridgeViewController.swift");

assert.ok(/\{showMobileTabBar && \(\s*<nav/.test(layout), "tab bar and swipe-back share one nav-visibility flag");
assert.ok(/onBack: isPlayPage \? closePlay : handleMobileBack/.test(layout), "conversation swipe runs the ‹ back handler");
assert.ok(/onClose=\{closePlay\}/.test(layout), "Play swipe and ‹ Descall share closePlay");
assert.ok(/onBack: backToMenu/.test(panel) && /onBack: onClose/.test(panel), "settings swipe uses its ‹ / ✕ handlers");
assert.ok(/onBack: clearLobbySelection/.test(lfg), "LFG detail swipe uses Back to list");
assert.ok(!/history\.back\(\)/.test(hook), "swipe-back never calls history.back() itself");
assert.ok(/allowsBackForwardNavigationGestures = false/.test(bridge), "WKWebView history swipe stays off on iOS");
assert.ok(/getPlatform\(\) === "android"/.test(hook), "Android app keeps the system back gesture only");
assert.ok(/electronAPI\?\.isElectron/.test(hook), "Electron never installs touch listeners");
assert.ok(/\[data-call-overlay\]/.test(hook) && /aria-modal='true'/.test(hook), "call view and modals block the swipe");

console.log("edgeSwipeBack.selftest ok");
