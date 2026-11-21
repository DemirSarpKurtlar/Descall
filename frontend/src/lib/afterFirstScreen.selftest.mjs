// node src/lib/afterFirstScreen.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterFirstScreen } from "./afterFirstScreen.js";

function fakeEnv() {
  const timers = [];
  const idles = [];
  let splash = true;
  const win = {
    setTimeout: (fn) => timers.push(fn),
    requestIdleCallback: (fn) => idles.push(fn),
  };
  const doc = { getElementById: (id) => (id === "boot-splash" && splash ? {} : null) };
  return { win, doc, timers, idles, dropSplash: () => { splash = false; } };
}

// Waits while the splash is up, then runs once in the next idle period.
{
  const env = fakeEnv();
  let runs = 0;
  afterFirstScreen(() => { runs += 1; }, { win: env.win, doc: env.doc });
  assert.equal(runs, 0);
  assert.equal(env.idles.length, 0, "no idle work while the splash is up");
  assert.equal(env.timers.length, 1, "polls for the splash");
  env.dropSplash();
  env.timers.shift()();
  assert.equal(env.idles.length, 1);
  env.idles.shift()();
  assert.equal(runs, 1);
}

// No splash (marketing / already gone): straight to idle.
{
  const env = fakeEnv();
  env.dropSplash();
  let runs = 0;
  afterFirstScreen(() => { runs += 1; }, { win: env.win, doc: env.doc });
  assert.equal(env.timers.length, 0);
  env.idles.shift()();
  assert.equal(runs, 1);
}

// A stuck splash does not starve the work: maxWaitMs 0 goes to idle at once.
{
  const env = fakeEnv();
  let runs = 0;
  afterFirstScreen(() => { runs += 1; }, { win: env.win, doc: env.doc, maxWaitMs: 0 });
  env.idles.shift()();
  assert.equal(runs, 1);
}

// Wiring: boot warm-ups and the native Sentry load go through it.
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
assert.match(main, /afterFirstScreen\(preloadAppStyles\)/, "main.jsx defers preloadAppStyles");
const sentry = readFileSync(new URL("./sentry.js", import.meta.url), "utf8");
assert.match(sentry, /isNativeShell\(\)\) \{\s*afterFirstScreen\(/, "native Sentry SDK waits for the first screen");

console.log("afterFirstScreen.selftest.mjs: ok");
