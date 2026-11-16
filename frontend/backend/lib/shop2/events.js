"use strict";

/**
 * Socket fan-out for Market 2.0:
 *   shop2:storefront    to user:<id> (refresh, regenerate, purchase) or everyone (daily reset,
 *                       rule switch, night market open / close). Payload { reason, day?, at }.
 *   shop2:gift          to user:<recipient> when a gift is delivered; to user:<sender> on
 *                       opened / equipped / thanked / recalled. Payload { gift } (public shape).
 *   shop2:admin:sale    to the admin room on every sale. Payload { sale }.
 * Routes bind the io instance on each request; the scheduler binds it at start.
 * Live viewer count: users who loaded the storefront in the last 5 minutes (per instance).
 */

let io = null;
const viewers = new Map(); // userId -> last seen ms
const VIEW_MS = 5 * 60_000;

function bind(instance) {
  if (instance && typeof instance.to === "function") io = instance;
}

function toUser(userId, event, payload) {
  try {
    if (io && userId) io.to(`user:${userId}`).emit(event, { ...payload, at: new Date().toISOString() });
  } catch {
    /* io without rooms */
  }
}

function toAll(event, payload) {
  try {
    if (io) io.emit(event, { ...payload, at: new Date().toISOString() });
  } catch {
    /* ignore */
  }
}

function toAdmins(event, payload) {
  try {
    if (io) io.to("admin").emit(event, { ...payload, at: new Date().toISOString() });
  } catch {
    /* ignore */
  }
}

function sawViewer(userId, now = Date.now()) {
  if (!userId) return;
  viewers.set(String(userId), now);
  if (viewers.size > 50_000) {
    for (const [k, t] of viewers) if (now - t > VIEW_MS) viewers.delete(k);
  }
}

function liveViewers(now = Date.now()) {
  let n = 0;
  for (const [k, t] of viewers) {
    if (now - t <= VIEW_MS) n += 1;
    else viewers.delete(k);
  }
  return n;
}

/* Set page "looking now" counter: set key -> Map(userId -> ms). Distinct viewers per set
   (since boot, capped) feed the admin's suggested discount. */
const setViewers = new Map();
const setViewTotals = new Map();
function sawSet(key, userId, now = Date.now()) {
  if (!setViewers.has(key)) setViewers.set(key, new Map());
  setViewers.get(key).set(String(userId), now);
  if (!setViewTotals.has(key)) setViewTotals.set(key, new Set());
  const total = setViewTotals.get(key);
  if (total.size < 100_000) total.add(String(userId));
}
function setViewCount(key) {
  return setViewTotals.get(key)?.size || 0;
}
function setLookingNow(key, now = Date.now()) {
  const m = setViewers.get(key);
  if (!m) return 0;
  let n = 0;
  for (const [k, t] of m) {
    if (now - t <= VIEW_MS) n += 1;
    else m.delete(k);
  }
  return n;
}

module.exports = { bind, toUser, toAll, toAdmins, sawViewer, liveViewers, sawSet, setLookingNow, setViewCount, getIo: () => io };
