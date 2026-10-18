import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIGHTBOX_CLOSE_GUARD_MS,
  MESSAGE_MENU_LONG_PRESS_MS,
  attachMenuPress,
  createMediaPressGate,
  liftLayout,
  liftMediaBox,
  menuHeight,
  messageMenuOpensOnTap,
  reactBarWidth,
  pressToActivate,
  visualMediaPreview,
} from "./glassMessageMenu.js";

assert.equal(messageMenuOpensOnTap(false), true);
assert.equal(messageMenuOpensOnTap(true), false);
assert.ok(MESSAGE_MENU_LONG_PRESS_MS >= 350 && MESSAGE_MENU_LONG_PRESS_MS <= 600);

function click() {
  return {
    defaulted: false,
    stopped: false,
    preventDefault() { this.defaulted = true; },
    stopPropagation() { this.stopped = true; },
  };
}

const ran = [];
const row = pressToActivate(() => ran.push("edit"));
const leaked = click();
row.onClick(leaked);
assert.equal(ran.length, 0);
assert.equal(leaked.defaulted, true);
assert.equal(leaked.stopped, true);

row.onPointerDown({ button: 0 });
row.onClick(click());
assert.deepEqual(ran, ["edit"]);

row.onClick(click());
assert.equal(ran.length, 1);

const right = pressToActivate(() => ran.push("right"));
right.onPointerDown({ button: 2 });
right.onClick(click());
assert.equal(ran.length, 1);

assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/a.jpg", mediaType: "image" })?.src, "https://cdn.example/a.jpg");
assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/a.jpg", mediaType: "image" })?.isGif, false);
assert.equal(visualMediaPreview({ mediaUrl: "https://media.giphy.com/x", mediaType: "gif" })?.isGif, true);
assert.equal(
  visualMediaPreview({ mediaUrl: "https://cdn.example/sign/abc?token=1", mediaType: "image" })?.src,
  "https://cdn.example/sign/abc?token=1"
);
assert.equal(
  visualMediaPreview({ mediaUrl: "https://cdn.example/file.bin", mediaType: "file", originalName: "shot.png" })?.src,
  "https://cdn.example/file.bin"
);
assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/notes.pdf", mediaType: "document" }), null);
assert.equal(visualMediaPreview({ mediaUrl: "", mediaType: "image" }), null);
assert.deepEqual(liftMediaBox({ width: 180, height: 120 }, { width: 200 }), { width: 180, height: 120 });
assert.equal(liftMediaBox({ width: 0, height: 0 }, { width: 220 }).width >= 160, true);

const list = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
const chatCss = readFileSync(new URL("../styles/glass/chat.css", import.meta.url), "utf8");

// 2.11.17: the lifted preview is a clone of the real bubble, not a text copy.
assert.match(list, /visualMediaPreview\(message\)/);
assert.match(list, /buildLiftedBubble\(el\)/);
assert.match(list, /liftLayout\(\{/);
assert.match(list, /className="g-lift"/);
assert.match(list, /className="g-lift-shadow"/);
assert.doesNotMatch(list, /g-lift-bub/);
assert.doesNotMatch(list, /text=\{String\(message\.text \|\| ""\)\.slice\(0, 280\)\}/);
assert.match(list, /fromMedia: true/);
assert.match(list, /suppressMediaClickUntil/);
assert.match(list, /beginMenuPress\(e, \{ pressed: true \}\)/);
// Haptic on the fire frame; bridge primed on press-down.
assert.match(list, /onFire: \(\) => \{\s*hapticImpactMedium\(\);/);
assert.match(list, /primeHaptics\(\);\s*pressDetach\.current\?\.\(\);/);
// Reduced motion: fade, no spring travel.
assert.match(list, /REDUCED_MOTION_FADE/);
// Bar and menu are separate frosted surfaces inside a box-less layer.
assert.match(list, /className="g-react-bar g-glass g-heavy g-materialize"/);
assert.match(list, /className="g-menu g-glass g-heavy g-materialize"/);

assert.match(chatCss, /html\.glass-ui \.g-msg-pop \{[^}]*position: fixed;[^}]*inset: 0;[^}]*background: none;/);
assert.doesNotMatch(chatCss.match(/html\.glass-ui \.g-msg-pop \{[^}]*\}/)[0], /backdrop-filter|transform|opacity|filter/);
assert.match(chatCss, /html\.glass-ui \.g-scrim\.g-msg-scrim \{[^}]*backdrop-filter: blur\(28px\)/);
assert.match(chatCss, /html\.glass-ui \.g-lift-shadow \{[^}]*background: transparent;/);
assert.match(chatCss, /html\.glass-ui \.message-bubble\.menu-open \{\s*visibility: hidden/);
assert.match(chatCss, /\.message-bubble\[data-pressed\] \{\s*scale: 0\.97;/);
assert.doesNotMatch(chatCss, /g-lift-bub/);

const frost = readFileSync(new URL("../styles/frost.css", import.meta.url), "utf8");
assert.doesNotMatch(frost, /\.g-msg-pop,/);
assert.match(frost, /\.g-react-bar,/);

// Layout: bubble stays put when the stack fits.
{
  const rect = { left: 227, top: 377, width: 152, height: 83 };
  const l = liftLayout({ rect, vw: 393, vh: 852, isOwn: true, barW: reactBarWidth(5), menuH: menuHeight({ rows: 5, separators: 1 }) });
  assert.equal(l.liftTop, 377);
  assert.equal(l.dy, 0);
  assert.equal(l.liftScale, 1);
  assert.equal(l.barTop, 377 - 10 - 56);
  assert.equal(l.menuTop, 377 + 83 + 10);
  assert.ok(l.barLeft >= 12 && l.barLeft + l.barW <= 393 - 12, "bar on screen");
  assert.ok(l.menuLeft + l.menuW <= 393 - 12 && l.menuLeft + l.menuW >= 379 - 1, "own: right-aligned to the bubble");
  assert.equal(l.origin, "100% 0%");
}
// Near the bottom: moves up just enough for the menu.
{
  const rect = { left: 227, top: 700, width: 152, height: 83 };
  const menuH = menuHeight({ rows: 5, separators: 1 });
  const l = liftLayout({ rect, vw: 393, vh: 852, isOwn: true, barW: 296, menuH });
  assert.equal(l.menuTop + menuH, 852 - 34);
  assert.ok(l.dy > 0);
}
// Near the top: moves down so the bar clears the safe area.
{
  const l = liftLayout({ rect: { left: 60, top: 70, width: 200, height: 40 }, vw: 393, vh: 852, isOwn: false, barW: 296, menuH: 300 });
  assert.equal(l.barTop, 62);
  assert.equal(l.menuLeft, 60);
  assert.equal(l.origin, "0% 0%");
}
// Taller than the room left: scaled down, never clipped.
{
  const menuH = menuHeight({ rows: 4, separators: 1 });
  const l = liftLayout({ rect: { left: 60, top: 0, width: 243, height: 1500 }, vw: 393, vh: 852, isOwn: false, barW: 296, menuH });
  assert.ok(l.liftScale < 1 && l.liftScale >= 0.1);
  assert.ok(l.barTop >= 62 && l.menuTop + menuH <= 852 - 34 + 1);
}
// Narrow phone: the bar is clamped inside the screen for a left bubble.
{
  const l = liftLayout({ rect: { left: 200, top: 300, width: 100, height: 40 }, vw: 320, vh: 640, isOwn: false, barW: 296, menuH: 250 });
  assert.ok(l.barLeft >= 12 && l.barLeft + l.barW <= 320 - 12);
}

const menuSrc = readFileSync(new URL("./glassMessageMenu.js", import.meta.url), "utf8");
const lightbox = readFileSync(new URL("../components/chat/MessageMediaLightbox.jsx", import.meta.url), "utf8");
assert.match(menuSrc, /visibilitychange/);
assert.match(menuSrc, /pointercancel/);
assert.match(menuSrc, /win\.addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\)/);
assert.match(menuSrc, /win\.removeEventListener\("scroll", onScroll, true\)/);
assert.match(list, /attachMenuPress/);
assert.match(list, /noteLightbox\(true\)/);
assert.match(list, /noteLightbox\(false\)/);
assert.match(list, /pressGate\.current\.accepts\(\)/);
assert.match(list, /openLightbox\(\)/);
assert.match(list, /onClose=\{closeLightbox\}/);
assert.match(lightbox, /onPointerDown=\{seal\}/);
assert.match(lightbox, /onPointerUp=\{seal\}/);
assert.match(lightbox, /onTouchEnd=\{seal\}/);
assert.match(lightbox, /event\.stopPropagation\(\)/);

function makeTarget() {
  const listeners = [];
  return {
    addEventListener(type, fn, capture) {
      listeners.push({ type, fn, capture: Boolean(capture) });
    },
    removeEventListener(type, fn, capture) {
      const cap = Boolean(capture);
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === cap);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatch(type, event) {
      for (const l of listeners.filter((row) => row.type === type)) l.fn(event);
    },
    setAttribute() {},
    removeAttribute() {},
  };
}

function harness() {
  let now = 10_000;
  const queue = [];
  const gate = createMediaPressGate({ now: () => now });
  const el = makeTarget();
  const win = makeTarget();
  const doc = makeTarget();
  doc.hidden = false;
  const fired = [];
  const api = {
    gate,
    el,
    win,
    doc,
    fired,
    get now() { return now; },
    advance(ms) {
      now += ms;
      for (const item of queue) {
        if (!item.dead && item.at <= now) {
          item.dead = true;
          item.fn();
        }
      }
    },
    press(extra = {}) {
      return attachMenuPress({
        gate,
        event: { clientX: 10, clientY: 10, pointerId: 1, button: 0, type: "pointerdown", ...extra },
        el,
        win,
        doc,
        delay: MESSAGE_MENU_LONG_PRESS_MS,
        schedule(fn, delay) {
          const item = { fn, at: now + delay, dead: false };
          queue.push(item);
          return item;
        },
        cancelTimer(item) {
          if (item) item.dead = true;
        },
        onFire() { fired.push("menu"); },
      });
    },
  };
  return api;
}

{
  let now = 5_000;
  const gate = createMediaPressGate({ now: () => now });
  assert.equal(gate.noteLightbox(false), false);
  const id = gate.arm();
  assert.ok(id);
  assert.equal(gate.armed(id), true);
  gate.cancel();
  assert.equal(gate.armed(id), false);
  const again = gate.arm();
  assert.equal(gate.armed(again), true);
  now += MESSAGE_MENU_LONG_PRESS_MS;
  assert.equal(gate.armed(again), true);
  assert.equal(gate.noteLightbox(true), true);
  assert.equal(gate.armed(again), false);
  assert.equal(gate.arm(), 0);
  assert.equal(gate.accepts(), false);
  const closedAt = now;
  assert.equal(gate.noteLightbox(false), true);
  assert.equal(gate.arm(), 0);
  assert.equal(gate.accepts(), false);
  now = closedAt + LIGHTBOX_CLOSE_GUARD_MS - 1;
  assert.equal(gate.arm(), 0);
  gate.noteLightbox(false);
  now = closedAt + LIGHTBOX_CLOSE_GUARD_MS;
  const after = gate.arm();
  assert.ok(after);
  assert.equal(gate.armed(after), true);
}

{
  const h = harness();
  const session = h.press();
  assert.ok(session);
  h.win.dispatch("pointerup", { type: "pointerup", pointerId: 1 });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
  assert.equal(h.gate.accepts(), true);
  h.gate.noteLightbox(true);
  assert.equal(h.gate.accepts(), false);
}

{
  const h = harness();
  const session = h.press();
  assert.ok(session);
  h.win.dispatch("pointerup", { type: "pointerup", pointerId: 7 });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, ["menu"]);
}

{
  const h = harness();
  h.press();
  h.advance(MESSAGE_MENU_LONG_PRESS_MS - 1);
  assert.deepEqual(h.fired, []);
  h.advance(1);
  assert.deepEqual(h.fired, ["menu"]);
}

{
  const h = harness();
  const session = h.press();
  h.gate.noteLightbox(true);
  session.detach();
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
  assert.equal(h.press(), null);
  h.gate.noteLightbox(false);
  assert.equal(h.press(), null);
  assert.equal(h.gate.accepts(), false);
  h.advance(LIGHTBOX_CLOSE_GUARD_MS);
  const held = h.press();
  assert.ok(held);
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, ["menu"]);
}

{
  const h = harness();
  h.press();
  h.win.dispatch("pointercancel", { type: "pointercancel", pointerId: 1 });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
}

{
  const h = harness();
  h.press();
  h.win.dispatch("touchend", { type: "touchend" });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
}

{
  const h = harness();
  h.press();
  h.win.dispatch("scroll", {});
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
  assert.ok(h.press());
}

{
  const h = harness();
  h.press();
  h.doc.hidden = false;
  h.doc.dispatch("visibilitychange", {});
  h.advance(MESSAGE_MENU_LONG_PRESS_MS - 1);
  assert.deepEqual(h.fired, []);
  h.doc.hidden = true;
  h.doc.dispatch("visibilitychange", {});
  h.advance(1);
  assert.deepEqual(h.fired, []);
}

{
  const h = harness();
  h.press();
  h.el.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientX: 40, clientY: 10 });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, []);
}

{
  const h = harness();
  h.press();
  h.el.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientX: 20, clientY: 10 });
  h.advance(MESSAGE_MENU_LONG_PRESS_MS);
  assert.deepEqual(h.fired, ["menu"]);
}

console.log("glassMessageMenu.selftest ok");
