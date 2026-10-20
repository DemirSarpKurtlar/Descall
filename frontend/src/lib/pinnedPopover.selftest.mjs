// 2.10.109: pinned messages open as a glass popover anchored under the header
// pin button (was a panel detached at the bottom-left on desktop), and the
// in-chat search bar is a glass capsule (was an opaque strip).
// Run from frontend/: node src/lib/pinnedPopover.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAnchoredPopover, isOutside } from "./anchoredPopover.js";

// Wide window: right edge aligned with the pin button, just below it.
{
  const anchor = { left: 1180, right: 1220, top: 20, bottom: 60 };
  const p = computeAnchoredPopover({ anchor, viewportWidth: 1280, viewportHeight: 860 });
  assert.equal(p.top, 68);
  assert.equal(p.width, 360);
  assert.equal(p.left + p.width, 1220, "right-aligned with the button");
  assert.equal(p.originX, 340, "grows from the button centre");
  assert.equal(p.maxHeight, 480);
}
// Anchor near the right edge: clamped inside the 12px margin.
{
  const p = computeAnchoredPopover({ anchor: { left: 1250, right: 1290, top: 0, bottom: 40 }, viewportWidth: 1280, viewportHeight: 860 });
  assert.equal(p.left + p.width, 1268);
}
// Phone: full width minus margins, never off-screen.
{
  const p = computeAnchoredPopover({ anchor: { left: 300, right: 340, top: 50, bottom: 94 }, viewportWidth: 390, viewportHeight: 844 });
  assert.equal(p.width, 366);
  assert.equal(p.left, 12);
  assert.ok(p.originX > 0 && p.originX <= p.width);
}
// Short window: the list scrolls instead of overflowing.
{
  const p = computeAnchoredPopover({ anchor: { left: 900, right: 940, top: 10, bottom: 50 }, viewportWidth: 1280, viewportHeight: 300 });
  assert.equal(p.maxHeight, 300 - 58 - 12);
}
// Missing anchor still lands top-right on screen.
{
  const p = computeAnchoredPopover({ anchor: null, viewportWidth: 1000, viewportHeight: 700 });
  assert.equal(p.placement, "fallback");
  assert.equal(p.left + p.width, 988);
}
{
  const inner = {};
  const panel = { contains: (n) => n === inner };
  assert.equal(isOutside(inner, panel), false);
  assert.equal(isOutside({}, panel, null), true);
}

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
{
  const chat = read("../components/layout/ChatPanel.jsx");
  assert.match(chat, /<PinnedMessagesPopover/);
  assert.match(chat, /ref=\{pinButtonRef\}/);
  assert.match(chat, /aria-expanded=\{showPinned\}/);
  assert.doesNotMatch(chat, /members-panel pinned-panel/, "old docked/side panel is gone");
  assert.match(chat, /className="chat-search-bar"[\s\S]{0,80}role="search"/);
  assert.match(chat, /e\.key === "Escape"/, "Esc closes the message search");

  const pop = read("../components/layout/PinnedMessagesPopover.jsx");
  assert.match(pop, /createPortal\(/, "portaled out of the chat shell");
  assert.match(pop, /useReducedMotion/);
  assert.match(pop, /type: "spring", bounce: 0/);
  assert.match(pop, /"Escape"/);
  assert.match(pop, /pointerdown/);
  assert.match(pop, /No pinned messages yet/);

  const css = read("../components/layout/PinnedMessagesPopover.css");
  assert.match(css, /position: fixed/);
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /border-radius: (?:22px|var\(--r-xl\))/);
  assert.match(css, /prefers-reduced-transparency: reduce/);

  const tr = read("../i18n/locales/tr.js");
  assert.match(tr, /"No pinned messages yet": "Henüz sabitlenmiş mesaj yok"/);
  assert.match(tr, /"Pin important messages from the message menu to find them here\.": "/);

  const gd = read("../styles/glass-desktop/chat.css");
  assert.match(gd, /html\.glass-desktop \.chat-search-field \{[\s\S]*?background: var\(--gd-glass-fill\)/);
  assert.match(gd, /html\.glass-desktop \.chat-search-bar \{[\s\S]*?background: transparent !important/);
  const msg = read("../styles/messages.css");
  const bar = msg.slice(msg.indexOf(".chat-search-bar {"), msg.indexOf("}", msg.indexOf(".chat-search-bar {")));
  assert.doesNotMatch(bar, /var\(--surface-0\)/, "no opaque strip behind the search field");
}

console.log("pinnedPopover.selftest ok");
