"use strict";

/**
 * Helpers shared by the game selftests (not a test file itself).
 */

const C = require("./common");

/**
 * Fake clock with setTimer / clearTimer / advance. Timers run in deadline
 * order (FIFO on ties). advanceAsync also lets promises (async bot moves) settle.
 */
function createFakeClock(start = 1_000_000) {
  let now = start;
  let id = 0;
  const timers = new Map();
  const clock = {
    now: () => now,
    setTimer(fn, ms) {
      const h = ++id;
      timers.set(h, { fn, at: now + Math.max(0, ms), id: h });
      return h;
    },
    clearTimer(h) {
      timers.delete(h);
    },
    pending: () => timers.size,
    nextAt() {
      let best = null;
      for (const t of timers.values()) if (!best || t.at < best.at || (t.at === best.at && t.id < best.id)) best = t;
      return best;
    },
    /** Run every timer due within `ms`; returns the number fired. */
    advance(ms) {
      const until = now + ms;
      let fired = 0;
      for (;;) {
        const t = clock.nextAt();
        if (!t || t.at > until) break;
        timers.delete(t.id);
        now = t.at;
        t.fn();
        fired++;
      }
      now = until;
      return fired;
    },
    async advanceAsync(ms) {
      const until = now + ms;
      let fired = 0;
      for (;;) {
        await flush();
        const t = clock.nextAt();
        if (!t || t.at > until) break;
        timers.delete(t.id);
        now = t.at;
        t.fn();
        fired++;
      }
      await flush();
      now = until;
      return fired;
    },
    /** Jump to the next timer and run it. */
    step() {
      const t = clock.nextAt();
      if (!t) return false;
      timers.delete(t.id);
      now = t.at;
      t.fn();
      return true;
    },
  };
  return clock;
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

/** Drive an engine to the end with its own timers/bots (no table manager). */
function runEngine(E, state, { rng, until, maxSteps = 200000, onStep, now = 0, ctxExtra = {} }) {
  let s = state;
  let steps = 0;
  while (!until(s)) {
    const specs = E.timers(s);
    if (!specs.length) throw new Error(`stuck in phase ${s.phase}`);
    const t = specs[0];
    const ctx = { rng, now, ...ctxExtra };
    let action = t.action;
    let actor = t.playerId;
    if (t.kind === "bot") action = E.botAction(s, t.playerId, ctx);
    if (t.kind === "system") actor = C.SYSTEM;
    const res = E.apply(s, actor, action, ctx);
    if (res.error) throw new Error(`${res.error} for ${JSON.stringify(action)} in ${s.phase}`);
    if (onStep) onStep(s, res, actor, action);
    s = res.state;
    if (++steps > maxSteps) throw new Error("runEngine: too many steps");
  }
  return s;
}

function timeIt(label, fn) {
  const t0 = Date.now();
  const r = fn();
  return { r, ms: Date.now() - t0, label };
}

module.exports = { createFakeClock, flush, runEngine, timeIt, seeded: C.createSeededRng };
