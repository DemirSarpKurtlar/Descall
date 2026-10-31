import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSingleActive, HOVER_TOOLBAR_GRACE_MS, AIM_DELAY_MS, AIM_MAX_MS, headingToward } from "./singleActiveHover.js";

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

// Grace leaves time to travel to the pill (3.7.13: 120 ms was too short).
assert.ok(HOVER_TOOLBAR_GRACE_MS >= 300 && HOVER_TOOLBAR_GRACE_MS <= 450);

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

// Aim (3.1): heading toward the open pill across a neighbour does not swap it.
{
  const bar = { left: 500, top: 100, right: 600, bottom: 136 };
  const pts = (...xy) => xy.map(([x, y], i) => ({ x, y, t: i * 20 }));
  assert.equal(headingToward(pts([520, 220], [525, 190], [530, 160]), bar), true, "straight up into the pill");
  assert.equal(headingToward(pts([300, 220], [380, 190], [460, 160]), bar), true, "diagonal toward the pill");
  assert.equal(headingToward(pts([520, 160], [520, 190], [520, 220]), bar), false, "moving away");
  assert.equal(headingToward(pts([520, 180], [521, 180]), bar), false, "still pointer is not aiming");
  assert.equal(headingToward(pts([100, 400], [100, 420]), bar), false, "unrelated movement");
  assert.equal(headingToward(pts([530, 120], [531, 121]), bar), true, "inside the pill");

  let t = 0;
  const timers = (() => {
    let seq = 0; const q = new Map();
    return {
      setTimer: (fn, ms) => { const id = ++seq; q.set(id, { fn, at: t + ms }); return id; },
      clearTimer: (id) => q.delete(id),
      advance(ms) { const end = t + ms; while (true) { const next = [...q].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; q.delete(next[0]); next[1].fn(); } t = end; },
    };
  })();
  const s = createSingleActive({ setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: () => t });
  const open = new Set();
  const mk = (id, rect) => ({
    enter() {
      const ok = s.activate(id, () => open.delete(id), { getRect: () => rect, onGrant: () => open.add(id) });
      if (ok) open.add(id);
    },
    leave() { s.scheduleRelease(id); },
  });
  const a = mk("a", bar);
  const b = mk("b", { left: 500, top: 140, right: 600, bottom: 176 });
  a.enter();
  // Pointer leaves "a" upward and crosses "b" on the way to a's pill.
  s.track(520, 230, t); timers.advance(20); s.track(522, 205, t); a.leave();
  timers.advance(20); s.track(524, 180, t); b.enter();
  assert.deepEqual([...open], ["a"], "neighbour does not take over while aiming");
  assert.equal(s.getPendingId(), "b");
  timers.advance(HOVER_TOOLBAR_GRACE_MS + 10);
  assert.deepEqual([...open], ["a"], "open pill survives its grace while aimed at");
  s.track(526, 130, t); a.enter(); // reached the pill (its own enter)
  assert.equal(s.getPendingId(), null);
  timers.advance(AIM_MAX_MS + 50);
  assert.deepEqual([...open], ["a"], "reaching the pill keeps it");

  // Stopping on the neighbour hands over after the aim delay.
  b.enter();
  s.track(526, 130, t); timers.advance(20); s.track(526, 150, t); timers.advance(20); s.track(526, 150, t);
  timers.advance(AIM_DELAY_MS + 5);
  assert.deepEqual([...open], ["b"], "pointer rests on the neighbour: it takes over");

  // Endless circling toward the pill still hands over after AIM_MAX_MS.
  const c = mk("c", { left: 500, top: 300, right: 600, bottom: 336 });
  const s2 = s;
  let y = 400;
  c.enter(); // a different one is active ("b"); aiming check uses b's rect
  for (let i = 0; i < 60; i++) { y -= 1; s2.track(520, y, t); timers.advance(15); }
  assert.equal(s.getActiveId(), "c", "aiming forever still hands over after AIM_MAX_MS");
  assert.ok(open.has("c") && !open.has("b"));
}

// 3.7.13: leaving the bubble toward the pill keeps it past the grace while aiming,
// bounded by AIM_MAX_MS; a still pointer away from it lets it close.
{
  let t = 0;
  const timers = (() => {
    let seq = 0; const q = new Map();
    return {
      setTimer: (fn, ms) => { const id = ++seq; q.set(id, { fn, at: t + ms }); return id; },
      clearTimer: (id) => q.delete(id),
      advance(ms) { const end = t + ms; while (true) { const next = [...q].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; q.delete(next[0]); next[1].fn(); } t = end; },
    };
  })();
  const s = createSingleActive({ setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: () => t });
  const pill = { left: 500, top: 100, right: 620, bottom: 136 };
  let open = false;
  s.activate("m", () => { open = false; }, { getRect: () => pill });
  open = true;
  s.track(300, 300, t); timers.advance(30); s.track(340, 270, t);
  s.scheduleRelease("m");
  for (let i = 0; i < 12; i++) { timers.advance(30); s.track(340 + i * 12, 270 - i * 10, t); }
  assert.equal(open, true, "slow travel toward the pill keeps it open past the grace");
  s.keep("m"); // reached it
  timers.advance(2000);
  assert.equal(open, true);
  // Moving away: closes after the grace.
  s.track(300, 400, t); timers.advance(30); s.track(280, 450, t);
  s.scheduleRelease("m");
  timers.advance(HOVER_TOOLBAR_GRACE_MS + 5);
  assert.equal(open, false, "moving away closes after the grace");
}

console.log("singleActiveHover.selftest ok");
