"use strict";

/**
 * Market 2.0 background tick (every 30 s, one per instance; every step is idempotent and
 * claims rows with a conditional update, so two instances cannot double-run anything):
 *  - deliver scheduled gifts whose time came (shop2:gift to the recipient)
 *  - run the scheduled change queue (rule version at 00:00, set publish, recall finalize)
 *  - 00:00 Istanbul: shop2:storefront { reason: "daily" } to everyone
 *  - night market opened / closed: shop2:storefront { reason: "night_open" | "night_closed" }
 * server.js: require("./lib/shop2/scheduler").start({ getIo: () => app.get("io") })
 */

const time = require("./time");
const events = require("./events");

const TICK_MS = 30_000;
let timer = null;
let lastDay = null;
let lastNight = undefined;
let running = false;

async function tick({ getIo = null, now = Date.now() } = {}) {
  if (running) return null;
  running = true;
  const out = { delivered: 0, queue: [], daily: false, night: null };
  try {
    if (getIo) events.bind(getIo());
    out.delivered = await require("./gifts").deliverDue({ now }).catch((e) => (console.warn("[shop2] gift delivery:", e?.message || e), 0));
    out.queue = await require("./adminOps").runDue({ now }).catch((e) => (console.warn("[shop2] queue:", e?.message || e), []));
    const day = time.dayKey(now);
    if (lastDay && lastDay !== day) {
      events.toAll("shop2:storefront", { reason: "daily", day });
      out.daily = true;
    }
    lastDay = day;
    try {
      const { open } = await require("./night").current(now);
      const id = open ? open.id : null;
      if (lastNight !== undefined && id !== lastNight) {
        events.toAll("shop2:storefront", { reason: id ? "night_open" : "night_closed", nightId: id || lastNight });
        out.night = id ? "open" : "closed";
      }
      lastNight = id;
    } catch {
      /* night market optional */
    }
  } finally {
    running = false;
  }
  return out;
}

function start({ getIo } = {}) {
  if (timer) return;
  timer = setInterval(() => {
    tick({ getIo }).catch((e) => console.warn("[shop2] tick failed:", e?.message || e));
  }, TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, TICK_MS };
