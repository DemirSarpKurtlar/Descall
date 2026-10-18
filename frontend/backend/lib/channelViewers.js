"use strict";

/**
 * Fan an event about one server channel out to the sockets of `server:<id>` whose
 * user can VIEW_CHANNEL it (O2, 2026-10-18). Voice channel-state / member-joined /
 * member-left used to go to the whole server room, which leaked hidden voice
 * channel ids and who sits in them to every member.
 *
 * View results are cached for a few seconds per (server, channel, user) because voice
 * state changes often; any permission change clears the cache
 * (serverAccessRealtime.notifyServerAccessChanged). Emits for one channel are queued
 * so they reach clients in call order.
 */

const supabase = require("../db/supabase");
const { Permissions, hasPermission, resolveChannelPermissions } = require("./serverPermissions");

const TTL_MS = 5000;
const cache = new Map(); // `${serverId}|${channelId}|${userId}` -> { ok, at }
const queues = new Map(); // channelId -> Promise

function clearChannelViewCache(serverId = null) {
  if (!serverId) {
    cache.clear();
    return;
  }
  const prefix = `${serverId}|`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

async function canViewChannel(serverId, channelId, userId) {
  const key = `${serverId}|${channelId}|${userId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  let ok = false;
  try {
    const resolved = await resolveChannelPermissions(supabase, serverId, userId, channelId);
    ok = Boolean(resolved.isMember && hasPermission(resolved.bits, Permissions.VIEW_CHANNEL));
  } catch {
    ok = false;
  }
  cache.set(key, { ok, at: Date.now() });
  return ok;
}

async function fanOut(io, serverId, channelId, event, payload) {
  let sockets = [];
  try {
    sockets = await io.in(`server:${serverId}`).fetchSockets();
  } catch {
    return;
  }
  const byUser = new Map();
  for (const s of sockets || []) {
    const uid = s?.user?.id ?? s?.data?.userId;
    if (uid == null) continue;
    if (!byUser.has(String(uid))) byUser.set(String(uid), []);
    byUser.get(String(uid)).push(s);
  }
  for (const [uid, list] of byUser) {
    if (!(await canViewChannel(serverId, channelId, uid))) continue;
    for (const s of list) {
      try {
        s.emit(event, payload);
      } catch {
        /* socket went away */
      }
    }
  }
}

/** Queue an emit of `event` to viewers of channelId in server:serverId. Never throws. */
function emitToChannelViewers(io, serverId, channelId, event, payload) {
  if (!io || !serverId || !channelId || !event) return Promise.resolve();
  const prev = queues.get(channelId) || Promise.resolve();
  const next = prev
    .then(() => fanOut(io, serverId, channelId, event, payload))
    .catch((err) => console.warn("[channelViewers] fan-out failed:", event, err?.message || err));
  queues.set(channelId, next);
  next.then(() => {
    if (queues.get(channelId) === next) queues.delete(channelId);
  });
  return next;
}

module.exports = { emitToChannelViewers, canViewChannel, clearChannelViewCache };
