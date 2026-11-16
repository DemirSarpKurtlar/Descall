"use strict";

/**
 * Market 2.0 background tick (every 30 s, one per instance; every step is idempotent and
 * claims rows with a conditional update, so two instances cannot double-run anything; the
 * 00:00 and night open / close announcements are claimed once in shop2_settings):
 *  - deliver scheduled gifts whose time came (shop2:gift to the recipient)
 *  - run the scheduled change queue (rule version at 00:00, set publish, recall finalize)
 *  - 00:00 Istanbul: shop2:storefront { reason: "daily" } to everyone
 *  - 10 minutes before a night market: reminder to users who asked (night.remindDue)
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

/**
 * One announcement per event across instances: the first instance to insert the shop2_settings
 * row wins (unique key), the others stay quiet. Without the table every instance announces.
 */
async function claimOnce(key, now) {
  try {
    const db = require("./db");
    await db.ready();
    const { error } = await db.from("shop2_settings").insert({ key, value: { at: time.iso(now) }, version: 1, updated_at: time.iso(now) }).select("key").single();
    return !error;
  } catch {
    return true;
  }
}

async function tick({ getIo = null, now = Date.now() } = {}) {
  if (running) return null;
  running = true;
  const out = { delivered: 0, queue: [], daily: false, night: null };
  try {
    if (getIo) events.bind(getIo());
    out.delivered = await require("./gifts").deliverDue({ now }).catch((e) => (console.warn("[shop2] gift delivery:", e?.message || e), 0));
    out.queue = await require("./adminOps").runDue({ now }).catch((e) => (console.warn("[shop2] queue:", e?.message || e), []));
    out.reminder = await require("./night").remindDue({ now, io: getIo ? getIo() : events.getIo() }).catch((e) => (console.warn("[shop2] night reminder:", e?.message || e), null));
    const day = time.dayKey(now);
    if (lastDay && lastDay !== day && (await claimOnce(`announce:daily:${day}`, now))) {
      events.toAll("shop2:storefront", { reason: "daily", day });
      out.daily = true;
    }
    lastDay = day;
    try {
      const { open } = await require("./night").current(now);
      const id = open ? open.id : null;
      if (lastNight !== undefined && id !== lastNight && (await claimOnce(`announce:night:${id || lastNight}:${id ? "open" : "closed"}`, now))) {
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
