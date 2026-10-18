// React removes the boot splash itself when index.html's inline scripts never ran (2.11.11).
import assert from "node:assert/strict";
import { dismissBootSplashFromApp, removeBootSplashNow, rootHasPainted, reportBootPhase } from "./bootSplashDirect.js";

function fakeEnv({ splashes = 1, painted = true, inline = false, holds = 0 } = {}) {
  const sent = [];
  const timers = [];
  const nodes = [];
  const body = { children: nodes, removeChild(n) { const i = nodes.indexOf(n); if (i >= 0) nodes.splice(i, 1); } };
  for (let i = 0; i < splashes; i++) {
    const cls = new Set();
    nodes.push({ id: "boot-splash", parentNode: body, classList: { add: (c) => cls.add(c), contains: (c) => cls.has(c) }, getAttribute: () => null, cls });
  }
  const root = { firstElementChild: painted ? {} : null, innerText: painted ? "Sohbetler" : "", getBoundingClientRect: () => ({ height: painted ? 860 : 0 }) };
  const doc = { querySelectorAll: (sel) => (sel === "#boot-splash" ? nodes.slice() : []), getElementById: (id) => (id === "root" ? root : id === "boot-splash" ? nodes[0] || null : null) };
  const win = {
    __descallBootHolds: holds,
    electronAPI: { bootState: (phase, ms) => sent.push({ phase, ms }) },
    performance: { now: () => 1234 },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  };
  if (inline) {
    win.dismissCalls = [];
    win.__descallDismissBootSplash = (opts) => win.dismissCalls.push(opts);
    win.__descallReportBoot = (phase) => sent.push({ phase, via: "inline" });
  }
  const runTimers = () => { while (timers.length) timers.shift().fn(); };
  return { win, doc, nodes, sent, timers, runTimers };
}

// 1. Inline scripts missing (CSP): splash removed at once, main told.
{
  const e = fakeEnv({ inline: false });
  dismissBootSplashFromApp({ win: e.win, doc: e.doc });
  e.runTimers();
  assert.equal(e.nodes.length, 0, "splash removed without index.html");
  assert.deepEqual(e.sent.map((s) => s.phase), ["inline-missing", "painted"]);
}
// 2. Inline scripts present: their dismiss is used, nothing forced while it works.
{
  const e = fakeEnv({ inline: true });
  dismissBootSplashFromApp({ win: e.win, doc: e.doc, minMs: 450, maxMs: 1800 });
  assert.deepEqual(e.win.dismissCalls, [{ minMs: 450, maxMs: 1800 }]);
  e.nodes.length = 0; // index.html removed it
  e.runTimers();
  assert.deepEqual(e.sent, [], "no forced dismiss when the splash went away normally");
}
// 3. Inline dismiss exists but did nothing while the app painted: forced after maxMs+grace.
{
  const e = fakeEnv({ inline: true });
  dismissBootSplashFromApp({ win: e.win, doc: e.doc, maxMs: 1800, graceMs: 1200 });
  assert.equal(e.timers[0].ms, 3000);
  e.runTimers();
  assert.equal(e.nodes.length, 0);
  assert.ok(e.sent.some((s) => s.phase === "forced-dismiss"));
  assert.ok(e.sent.some((s) => s.phase === "painted"));
}
// 4. Mobile boot hold keeps the splash.
{
  const e = fakeEnv({ inline: false, holds: 1 });
  dismissBootSplashFromApp({ win: e.win, doc: e.doc });
  e.runTimers();
  assert.equal(e.nodes.length, 1, "held splash stays");
}
// 5. Not painted yet: not forced (index.html's own watchdog shows Tekrar dene).
{
  const e = fakeEnv({ inline: true, painted: false });
  dismissBootSplashFromApp({ win: e.win, doc: e.doc });
  for (let i = 0; i < 5 && e.timers.length; i++) e.timers.shift().fn();
  assert.equal(e.nodes.length, 1);
}
// helpers
{
  const e = fakeEnv({ splashes: 2 });
  assert.equal(rootHasPainted(e.doc), true);
  assert.equal(removeBootSplashNow({ win: e.win, doc: e.doc, fadeMs: 0 }), true);
  assert.equal(e.nodes.length, 0, "every splash node goes");
  const n = fakeEnv({ inline: true });
  reportBootPhase("app-mounted", n.win);
  assert.deepEqual(n.sent, [{ phase: "app-mounted", via: "inline" }]);
}
console.log("bootSplashDirect selftest ok");
