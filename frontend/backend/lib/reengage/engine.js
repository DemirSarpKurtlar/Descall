"use strict";

/**
 * Growth 3B scheduler (started by lib/reengage.js start(); hybrid server: the cluster
 * leader only). Every 5 minutes: due campaign waves (each person at their best hour, the
 * digest on its day and hour, streak reminders at 20:00). Every hour: day-7 friend-call
 * suggestions and expiring old ones. Nothing is sent while the mode is "off" or paused.
 */

let timer = null;
let lastHourly = 0;
let busy = false;

function isLeader() {
  try {
    return require("../cluster").isLeader();
  } catch {
    return true;
  }
}

async function runOnce({ now = Date.now(), force = false } = {}) {
  if (busy) return { skipped: "busy" };
  busy = true;
  const out = {};
  try {
    const mode = require("./mode").sendingMode();
    if (force || now - lastHourly >= 60 * 60 * 1000) {
      lastHourly = now;
      const wb = require("./winback");
      out.expired = await wb.expireOld({ now }).catch(() => 0);
      if (mode !== "off") out.suggestions = await wb.findSuggestions({ now: () => now }).catch((e) => ({ error: e?.message || String(e) }));
    }
    out.campaigns = await require("./campaigns").tick().catch((e) => ({ error: e?.message || String(e) }));
    return out;
  } finally {
    busy = false;
  }
}

function start() {
  if (timer) return;
  const run = () => {
    if (isLeader()) void runOnce();
  };
  const first = setTimeout(run, 3 * 60 * 1000);
  const every = setInterval(run, 5 * 60 * 1000);
  first.unref?.();
  every.unref?.();
  timer = { first, every };
}

function stop() {
  if (!timer) return;
  clearTimeout(timer.first);
  clearInterval(timer.every);
  timer = null;
}

module.exports = { start, stop, runOnce };
