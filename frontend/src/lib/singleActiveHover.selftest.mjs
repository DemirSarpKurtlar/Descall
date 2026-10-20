import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSingleActive, HOVER_TOOLBAR_GRACE_MS } from "./singleActiveHover.js";

function fakeTimers() {
  let now = 0; let seq = 0; const q = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; q.set(id, { fn, at: now + ms }); return id; },
    clearTimer: (id) => q.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, t] of [...q]) if (t.at <= now) { q.delete(id); t.fn(); }
    },
    pending: () => q.size,
  };
}

function setup() {
  const timers = fakeTimers();
  const s = createSingleActive({ setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  const open = new Set();
  const bubble = (id) => ({
    enter() { if (s.activate(id, () => open.delete(id))) open.add(id); },
    leave() { s.scheduleRelease(id); },
  });
  return { s, timers, open, bubble };
}

// Grace is quick (100-150 ms).
assert.ok(HOVER_TOOLBAR_GRACE_MS >= 100 && HOVER_TOOLBAR_GRACE_MS <= 150);

// Sweeping across many messages leaves exactly one toolbar open.
{
  const { s, timers, open, bubble } = setup();
  const bs = ["a", "b", "c", "d", "e", "f"].map(bubble);
  for (const b of bs) { b.enter(); timers.advance(10); b.leave(); timers.advance(10); }
  assert.ok(open.size <= 1, `stacked toolbars: ${[...open]}`);
  bs[5].enter();
  assert.deepEqual([...open], ["f"]);
  assert.equal(s.getActiveId(), "f");
}

// A new hover replaces the previous one instantly (no waiting for grace).
{
  const { open, bubble } = setup();
  const a = bubble("a"), b = bubble("b");
  a.enter(); a.leave(); b.enter();
  assert.deepEqual([...open], ["b"]);
}

// Leaving closes after the grace period; re-entering (onto the toolbar) keeps it.
{
  const { s, timers, open, bubble } = setup();
  const a = bubble("a");
  a.enter(); a.leave();
  timers.advance(HOVER_TOOLBAR_GRACE_MS - 20);
  a.enter(); // pointer reached the toolbar
  timers.advance(500);
  assert.deepEqual([...open], ["a"]);
  a.leave(); timers.advance(HOVER_TOOLBAR_GRACE_MS);
  assert.equal(open.size, 0);
  assert.equal(s.getActiveId(), null);
  s.keep("a");
}

// Picker/menu open locks the toolbar: no close on leave, no replacement.
{
  const { s, timers, open, bubble } = setup();
  const a = bubble("a"), b = bubble("b");
  a.enter(); s.setLocked("a", true); a.leave(); timers.advance(2000);
  b.enter();
  assert.deepEqual([...open], ["a"]);
  s.setLocked("a", false); b.enter();
  assert.deepEqual([...open], ["b"]);
}

// forget() (bubble closed itself / unmounted) clears ownership without calling close.
{
  const { s, open, bubble } = setup();
  const a = bubble("a");
  a.enter(); open.delete("a"); s.forget("a");
  assert.equal(s.getActiveId(), null);
  bubble("b").enter();
  assert.deepEqual([...open], ["b"]);
}

// Wiring: MessageList bubbles use the shared owner, fast exit.
{
  const src = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
  assert.match(src, /messageHoverToolbar\.activate\(/);
  assert.match(src, /messageHoverToolbar\.scheduleRelease\(/);
  assert.match(src, /messageHoverToolbar\.setLocked\(hoverKey\.current, pickerOpen(?: \|\| moreOpen)?\)/);
  assert.match(src, /messageHoverToolbar\.forget\(/);
  assert.doesNotMatch(src, /setTimeout\(\(\) => \{\s*setMenuOpen\(false\);\s*setPickerOpen\(false\);\s*\}, 180\)/);
}

console.log("singleActiveHover.selftest ok");
