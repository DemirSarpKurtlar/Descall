"use strict";

/**
 * The re-engagement switch: Kapalı / Kuru çalıştırma / Canlı.
 *
 * REENGAGE_ENABLED / REENGAGE_DRY_RUN (lib/reengagePolicy.mode) are the HARD CEILING
 * (integrator decision): the console (owner only, reason required, audited) may store an
 * override in reengage_settings.mode_override, but it can never go above the environment:
 * env off -> only off; env dry run -> off or dry run; env live -> anything. null = follow
 * the environment. "Hepsini duraklat" (paused) stops every send whatever the mode says. The value is cached in memory and
 * refreshed every 15 s so the push hot path never waits for the database.
 */

const P = require("../reengagePolicy");

const MODES = Object.freeze(["off", "dry_run", "live"]);
const RANK = Object.freeze({ off: 0, dry_run: 1, live: 2 });
let override = null;
let paused = false;
let loadedAt = 0;
let timer = null;

function envMode(env = process.env) {
  return P.mode(env);
}

/** Whether the console may choose `mode` under the environment ceiling. */
function allowedByEnv(mode, env = process.env) {
  return MODES.includes(mode) && RANK[mode] <= RANK[envMode(env)];
}

/** Configured mode: the override, capped by the environment (never above it). */
function configuredMode(env = process.env) {
  const ceiling = envMode(env);
  if (!MODES.includes(override)) return ceiling;
  return RANK[override] <= RANK[ceiling] ? override : ceiling;
}

/** What the senders obey: "off" while paused. */
function sendingMode(env = process.env) {
  return paused ? "off" : configuredMode(env);
}

function snapshot(env = process.env) {
  return {
    mode: configuredMode(env),
    sending: sendingMode(env),
    envMode: envMode(env),
    ceiling: envMode(env),
    override,
    // The stored override is above what the environment allows: it is not in effect.
    capped: MODES.includes(override) && RANK[override] > RANK[envMode(env)],
    paused,
    loadedAt: loadedAt ? new Date(loadedAt).toISOString() : null,
  };
}

function apply(value = {}) {
  override = MODES.includes(value.modeOverride) ? value.modeOverride : null;
  paused = Boolean(value.paused);
  loadedAt = Date.now();
}

async function refresh() {
  try {
    const value = await require("./store").getConsole({ fresh: true });
    apply(value);
  } catch {
    /* keep the last known value */
  }
}

function start() {
  if (timer) return;
  void refresh();
  timer = setInterval(() => void refresh(), 15_000);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function __set(value) {
  apply(value || {});
}

module.exports = { MODES, RANK, allowedByEnv, envMode, configuredMode, sendingMode, snapshot, apply, refresh, start, stop, __set };
