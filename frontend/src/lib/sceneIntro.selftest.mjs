// lib/sceneIntro.js (play, then settle) and lib/cosmeticMotion.js (off-screen pause).
// Run: node src/lib/sceneIntro.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installSceneIntro, SCENE_LIVE_CLASS, INTRO_MS, RESUME_MS } from "./sceneIntro.js";

const here = dirname(fileURLToPath(import.meta.url));

function fakeWin({ reduced = false } = {}) {
  const classes = new Set();
  const attrs = { "data-theme": "iriscape" };
  const listeners = {};
  let mo = null;
  const timers = new Map();
  let nextId = 1;
  const root = {
    classList: {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
    },
    getAttribute: (k) => attrs[k] ?? null,
  };
  const doc = {
    documentElement: root,
    visibilityState: "visible",
    addEventListener: (ev, fn) => { (listeners[ev] ||= new Set()).add(fn); },
    removeEventListener: (ev, fn) => listeners[ev]?.delete(fn),
  };
  const win = {
    document: doc,
    matchMedia: () => ({ matches: reduced }),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; mo = this; }
      observe() {}
      disconnect() { mo = null; }
    },
  };
  return {
    win,
    classes,
    deps: {
      setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
    fire: (ev) => listeners[ev]?.forEach((fn) => fn()),
    setTheme: (t) => { attrs["data-theme"] = t; mo?.cb([]); },
    lastTimerMs: () => [...timers.values()].at(-1)?.ms,
    flush: () => { const all = [...timers.values()]; timers.clear(); all.forEach((t) => t.fn()); },
    doc,
  };
}

// Boot: live for the intro, then settles.
{
  const f = fakeWin();
  const off = installSceneIntro(f.win, f.deps);
  assert.ok(f.classes.has(SCENE_LIVE_CLASS), "live on launch");
  assert.equal(f.lastTimerMs(), INTRO_MS);
  f.flush();
  assert.ok(!f.classes.has(SCENE_LIVE_CLASS), "settled after the intro");
  // Theme change replays the intro; the same theme does not.
  f.setTheme("iriscape");
  assert.ok(!f.classes.has(SCENE_LIVE_CLASS), "same theme: no replay");
  f.setTheme("chromeveil");
  assert.ok(f.classes.has(SCENE_LIVE_CLASS), "theme change replays");
  f.flush();
  // Back to the foreground: a shorter replay.
  f.fire("resume");
  assert.ok(f.classes.has(SCENE_LIVE_CLASS), "resume replays");
  assert.equal(f.lastTimerMs(), RESUME_MS);
  f.flush();
  f.doc.visibilityState = "hidden";
  f.fire("visibilitychange");
  assert.ok(!f.classes.has(SCENE_LIVE_CLASS), "hidden does not play");
  off();
  assert.ok(!f.classes.has(SCENE_LIVE_CLASS), "cleanup removes the class");
}

// Reduced motion: never live.
{
  const f = fakeWin({ reduced: true });
  installSceneIntro(f.win, f.deps);
  assert.ok(!f.classes.has(SCENE_LIVE_CLASS), "reduced motion stays still");
}

assert.ok(INTRO_MS >= 5000 && INTRO_MS <= 8000, "intro is a few seconds");

// Cosmetic loops: off-screen roots pause through data-cx-off.
const cm = readFileSync(join(here, "cosmeticMotion.js"), "utf8");
const cmCss = readFileSync(join(here, "../styles/cosmetic-motion.css"), "utf8");
for (const sel of [".cosmetic-name-effect", ".cosmetic-avatar-effect", ".cosmetic-presence-flare", ".cosmetic-chat-bubble", ".ui-avatar-frame-overlay", ".s2-badge"]) {
  assert.ok(cm.includes(`"${sel}"`), `watched: ${sel}`);
}
assert.match(cmCss, /\[data-cx-off\] \*::after\s*\{\s*animation-play-state:\s*paused !important;/, "off-screen cosmetics pause");
assert.doesNotMatch(cmCss, /animation:\s*none/, "paused, not removed");
assert.match(readFileSync(join(here, "../main.jsx"), "utf8"), /import\("\.\/lib\/cosmeticMotion\.js"\)\.then\(\(m\) => m\.installCosmeticMotion\(\)\)/, "installed at boot");

console.log("sceneIntro selftest ok");
