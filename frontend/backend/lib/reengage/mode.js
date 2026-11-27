"use strict";

/**
 * The re-engagement switch: Kapalı / Kuru çalıştırma / Canlı.
 *
 * REENGAGE_ENABLED / REENGAGE_DRY_RUN (lib/reengagePolicy.mode) stay the default. The
 * console (owner only, reason required, audited) may store an override in
 * reengage_settings.mode_override; null = follow the environment. "Hepsini duraklat"
 * (paused) stops every send whatever the mode says. The value is cached in memory and
 * refreshed every 15 s so the push hot path never waits for the database.
 */

const P = require("../reengagePolicy");

const MODES = Object.freeze(["off", "dry_run", "live"]);
let override = null;
let paused = false;
let loadedAt = 0;
let timer = null;

function envMode(env = process.env) {
  return P.mode(env);
}

/** Configured mode (override, else environment). */
function configuredMode(env = process.env) {
  return MODES.includes(override) ? override : envMode(env);
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
    override,
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

module.exports = { MODES, envMode, configuredMode, sendingMode, snapshot, apply, refresh, start, stop, __set };
