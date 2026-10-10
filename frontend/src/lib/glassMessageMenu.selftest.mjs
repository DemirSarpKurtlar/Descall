import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIGHTBOX_CLOSE_GUARD_MS,
  MESSAGE_MENU_LONG_PRESS_MS,
  attachMenuPress,
  createMediaPressGate,
  liftMediaBox,
  messageMenuOpensOnTap,
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

assert.match(list, /preview=\{mediaPreview\}/);
assert.match(list, /visualMediaPreview\(message\)/);
assert.match(list, /img\.message-image, \.message-media img/);
assert.match(list, /liftMediaBox/);
assert.match(list, /width: shot\.width, height: shot\.height/);
assert.match(list, /g-lift-media/);
assert.match(list, /preview\?\.src/);
assert.match(list, /caption \? <div className=\{`g-lift-bub/);
assert.match(list, /fromMedia: true/);
assert.match(list, /suppressMediaClickUntil/);
assert.match(list, /beginMenuPress\(e, \{ pressed: true \}\)/);
assert.doesNotMatch(list, /className=\{`g-lift-bub \$\{isOwn \? "own" : "other"\}`\}>\{text\}<\/div>/);

assert.match(chatCss, /html\.glass-ui \.g-lift-media \{/);
assert.match(chatCss, /html\.glass-ui \.g-lift-media img \{[\s\S]*width: 100%;/);
assert.match(chatCss, /html\.glass-ui \.g-lift-bub:empty/);
assert.match(chatCss, /html\.glass-ui \.message-bubble\.menu-open \{\s*visibility: hidden/);
assert.match(chatCss, /max-height: 240px;/);

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
