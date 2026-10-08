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
  project,
  releaseDecision,
  rubberband,
  rubberbandInverse,
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

/* ── momentum projection (apple-design.md §6) ── */
assert.equal(D.decelerationRate, 0.998);
{
  // project(v) = (v/1000) * d / (1 - d), v in px/s.
  const expected = (1000 / 1000) * 0.998 / (1 - 0.998);
  assert.ok(Math.abs(project(1000) - expected) < 1e-9, `project(1000) = ${project(1000)}`);
  assert.ok(Math.abs(project(1000) - 499) < 1e-6);
  assert.ok(Math.abs(project(-300) + 149.7) < 1e-6, "projection keeps the velocity sign");
  assert.equal(project(0), 0);
}

/* ── release decision: velocity sign first, then the projected resting point ── */
assert.equal(releaseDecision({ x: W * 0.37, width: W, velocity: 0 }), "cancel", "resting short of the threshold");
assert.equal(releaseDecision({ x: W * 0.39, width: W, velocity: 0 }), "complete", "resting past the threshold");
assert.equal(releaseDecision({ x: 60, width: W, velocity: 0.6 }), "complete", "60 + project(600 px/s) ≈ 359 px → complete");
assert.equal(releaseDecision({ x: 30, width: W, velocity: 0.2 }), "cancel", "30 + project(200 px/s) ≈ 130 px → short, cancel");
assert.equal(releaseDecision({ x: 70, width: W, velocity: 0.2 }), "complete", "70 + ≈100 px projected → passes 38%");
assert.equal(releaseDecision({ x: W * 0.8, width: W, velocity: -0.6 }), "cancel", "moving back cancels a long drag");
assert.equal(releaseDecision({ x: W * 0.8, width: W, velocity: -0.2 }), "cancel", "any clear backward velocity cancels (sign rule)");
assert.equal(releaseDecision({ x: W * 0.8, width: W, velocity: -0.05 }), "complete", "a resting finger's jitter is not a direction");
assert.equal(releaseDecision({ x: 0, width: W, velocity: 2 }), "cancel");
assert.ok(D.completeRatio >= 0.35 && D.completeRatio <= 0.4, "threshold ~35–40% of the width");
for (let x = 1; x < W; x += 7) {
  for (const v of [-1.5, -0.4, -0.11, 0, 0.05, 0.11, 0.3, 0.8, 2]) {
    const d = releaseDecision({ x, width: W, velocity: v });
    if (v <= -D.restVelocity) assert.equal(d, "cancel", `x=${x} v=${v}: backward → cancel`);
    else {
      const end = v >= D.restVelocity ? x + project(v * 1000) : x;
      assert.equal(d, end >= W * D.completeRatio ? "complete" : "cancel", `x=${x} v=${v}`);
    }
  }
}

/* ── rubber-band (apple-design.md §9) ── */
{
  const expected = (100 * W * 0.55) / (W + 0.55 * 100);
  assert.ok(Math.abs(rubberband(100, W) - expected) < 1e-9, "UIScrollView formula, c = 0.55");
  assert.equal(rubberband(0, W), 0);
  assert.ok(rubberband(10, W) > 5 && rubberband(10, W) < 6, "≈55% follow at first");
  assert.ok(rubberband(2000, W) < W, "never reaches the dimension");
  assert.ok(rubberband(400, W) - rubberband(300, W) < rubberband(100, W) - rubberband(0, W), "resistance grows");
  assert.equal(rubberband(-100, W), -rubberband(100, W));
  for (const o of [1, 37, 120, 333, 900]) assert.ok(Math.abs(rubberbandInverse(rubberband(o, W), W) - o) < 1e-6, "inverse round-trips");
}

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
  assert.ok(r.velocity >= D.restVelocity && r.x + project(r.velocity * 1000) >= W * D.completeRatio);
}
{
  // Long drag, then a quick move back before lifting → velocity sign says cancel.
  const { release } = swipe([[5, 300, 0], [20, 300, 10], [300, 300, 200], [330, 300, 260], [300, 300, 290], [270, 300, 320]]);
  const r = release();
  assert.ok(r.velocity < 0);
  assert.equal(r.type, "cancel");
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
{
  // No previous page: the page follows with rubber-band resistance and always returns.
  const m = createSwipeBackMachine();
  m.begin({ x: 5, y: 300, t: 0, width: W, zone: "edge", canGoBack: false });
  assert.equal(m.move({ x: 20, y: 300, t: 10 }).type, "lock");
  const r1 = m.move({ x: 120, y: 300, t: 60 });
  assert.ok(Math.abs(r1.x - rubberband(100, W)) < 1e-9, "resisted, not 1:1");
  const r2 = m.move({ x: 420, y: 300, t: 200 });
  assert.ok(r2.x < 150, `heavy resistance far out (${r2.x.toFixed(1)}px for 400px of finger)`);
  const end = m.end({ t: 210 });
  assert.equal(end.type, "cancel", "never navigates without a previous page");
  assert.ok(end.velocity > 0 && end.velocity < 2.2, "hands off the resisted page velocity");
  // Grab the rubber-banded page mid-return: continues from the live position.
  m.grab({ x: 200, y: 300, t: 300, width: W, fromX: 80, canGoBack: false });
  assert.ok(Math.abs(m.move({ x: 200.0001, y: 300, t: 316 }).x - 80) < 0.01, "no jump when caught");
  assert.ok(m.move({ x: 260, y: 300, t: 330 }).x > 80);
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
{
  // Velocity handed off as-is: a commit released while drifting slightly back
  // first continues backwards, then turns — no velocity discontinuity.
  const s = createSpring({ from: 300, to: W, velocity: -0.6, response: 300, min: 0, max: W });
  const first = s.step(1);
  assert.ok(first < 300, "keeps the finger's direction for the first instant");
  const r = run(s);
  assert.ok(s.done && s.value === W && r.min >= 0);
  // Critically damped (ζ = 1): from rest it approaches the target monotonically.
  const c = createSpring({ from: 0, to: 200, velocity: 0, response: 350, dampingRatio: 1 });
  let prev = 0;
  while (!c.done) {
    const x = c.step(16.67);
    assert.ok(x >= prev - 1e-9 && x <= 200, "no overshoot / oscillation");
    prev = x;
  }
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

assert.ok(/primeHaptics\(\)/.test(hook) && /function commitFeedback/.test(hook), "haptic primed on lock, fired at commit");
assert.ok(/commitFeedback\(s, decision\);\s*const target/.test(hook), "haptic fires in the release frame, before the spring starts");
assert.ok(!/hapticLight\(\);\s*\/\/ The page is fully/.test(hook), "no late haptic after the animation");
assert.ok(/velocity,\s*response: decision/.test(hook) && /dampingRatio: 1/.test(hook), "release velocity → critically damped spring");
assert.ok(/canGoBack: false/.test(layout), "root tabs rubber-band (no previous page)");
assert.ok(/SPRING_COMPLETE_MS = 3\d\d;/.test(hook) && /SPRING_CANCEL_MS = 3\d\d;/.test(hook), "spring response 0.3–0.4 s");

console.log("edgeSwipeBack.selftest ok");
