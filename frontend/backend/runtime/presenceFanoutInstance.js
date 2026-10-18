"use strict";

/**
 * Process-wide presence fan-out (lib/presenceFanout.js) bound to the live
 * Socket.IO server. `presenceScoped` feature flag off = legacy global roster.
 */
const supabase = require("../db/supabase");
const { presence, friends, systemConfig } = require("./sharedState");
const { createPresenceFanout } = require("../lib/presenceFanout");
const { buildPresenceEntry } = require("../lib/presenceEntry");

let instance = null;

async function loadMemberships(uid) {
  const [servers, groups] = await Promise.all([
    supabase.from("server_members").select("server_id").eq("user_id", uid),
    supabase.from("group_members").select("group_id").eq("user_id", uid),
  ]);
  const out = [];
  for (const r of servers?.data || []) if (r?.server_id) out.push(`s:${r.server_id}`);
  for (const r of groups?.data || []) if (r?.group_id) out.push(`g:${r.group_id}`);
  return out;
}

function getPresenceFanout(io) {
  if (instance) return instance;
  if (!io) return null;
  const { getCachedPublicUser, publicPresenceStatus } = require("../lib/userProfile");
  instance = createPresenceFanout({
    io,
    presence,
    friends,
    buildEntry: (id) => buildPresenceEntry(id, { getCachedPublicUser, publicPresenceStatus }),
    loadMemberships,
    isEnabled: () => systemConfig?.featureFlags?.presenceScoped !== false,
  });
  instance.attach();
  return instance;
}

/** Mark users changed without needing io (no-op before the socket server exists). */
function markPresenceDirty(...uids) {
  if (!instance) return;
  for (const u of uids) instance.markDirty(u);
}

function refreshPresenceFor(...uids) {
  if (!instance) return;
  instance.refreshUsers(...uids);
}

module.exports = { getPresenceFanout, markPresenceDirty, refreshPresenceFor };
