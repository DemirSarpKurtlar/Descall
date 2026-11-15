"use strict";

/**
 * One way to change system_settings with a reviewable trail (Güvenlik Merkezi, Nov 2026;
 * meant for the Sistem page too):
 *   1. pick the known keys of the patch (lib/systemSettings.pickConfig),
 *   2. apply them to the live config and persist,
 *   3. diff before / after into [{ key, from, to }],
 *   4. store the change in the settings history (lib/settingsHistory.js),
 *   5. append the audit entry with the same old and new values,
 *   6. tell the admin room (admin:update { type: "system_config" } + admin:security).
 * Nothing is recorded when the patch changes nothing.
 */

const supabase = () => require("../db/supabase");
const state = require("../runtime/sharedState");
const { pickConfig, mergeSystemConfig, persistSystemConfig, applySystemConfigToState } = require("./systemSettings");
const sec = require("./securitySettings");
const history = require("./settingsHistory");

function clone(v) {
  return JSON.parse(JSON.stringify(v || {}));
}

/** Owner room "admin" + "admin-security" (admins with the section), one emit each socket. */
function toSecurityAdmins(io) {
  const target = io.to("admin");
  return typeof target.to === "function" ? target.to("admin-security") : target;
}

function emitSecurity(io, payload) {
  if (!io || typeof io.to !== "function") return;
  try {
    io.to("admin").emit("admin:update", { type: "system_config" });
    toSecurityAdmins(io).emit("admin:security", payload);
  } catch {
    /* no sockets */
  }
}

/**
 * @param {object} p
 * @param {object} p.patch      raw config patch (unknown keys are dropped)
 * @param {{id?:string, username?:string}} p.actor  null actor = the system (lock expiry)
 * @param {string} [p.reason]
 * @param {string} [p.source]   "security" | "system" | "lock" | "revert" | ...
 * @param {string} [p.action]   audit action code
 * @param {string} [p.title]    short code the history shows (e.g. "lock.start")
 * @param {object} [p.meta]     extra audit + history meta
 * @param {string} [p.revertOf] history id this change reverts
 * @param {object} [p.io]
 * @param {number} [p.diffAt]   time locks are judged at in the diff (0 = as stored)
 * @returns {Promise<{ changes, entry, config, persisted }>}
 */
async function applySettingsChange({ patch, actor = null, reason = null, source = "security", action = "system_config", title = null, meta = {}, revertOf = null, io = null, client = null, diffAt = undefined }) {
  const picked = pickConfig(patch || {});
  // Both sides normalised the same way, so defaults filled in on first save are not "changes".
  const before = clone(mergeSystemConfig(state.systemConfig));
  if (picked.featureFlags) picked.featureFlags = { ...(state.systemConfig.featureFlags || {}), ...picked.featureFlags };
  Object.assign(state.systemConfig, picked);
  const saved = await persistSystemConfig(client || supabase(), clone(state.systemConfig));
  applySystemConfigToState(state, saved.config);
  const after = clone(mergeSystemConfig(state.systemConfig));
  // diffAt 0 = compare locks as stored (the expiry sweep records the lock it clears).
  const changes = sec.diffConfig(before, after, diffAt === undefined ? Date.now() : diffAt);
  if (!changes.length) return { changes, entry: null, config: state.systemConfig, persisted: Boolean(saved.persisted) };

  const cleanReason = sec.cleanText(reason) || null;
  const entry = await history.record({
    actor,
    source,
    category: sec.categoryOf(changes),
    title: title || (changes.length === 1 ? changes[0].key : "settings"),
    changes,
    reason: cleanReason,
    meta,
    revertOf,
  });
  const who = actor || { id: null, username: "system" };
  state.appendAudit(who.id || null, who.username || "system", action, entry.title, {
    changes,
    reason: cleanReason,
    historyId: entry.id,
    source,
    ...meta,
  });
  emitSecurity(io, { type: "settings", entry });
  return { changes, entry, config: state.systemConfig, persisted: Boolean(saved.persisted) };
}

module.exports = { applySettingsChange, emitSecurity, toSecurityAdmins };
