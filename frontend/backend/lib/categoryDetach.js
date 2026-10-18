"use strict";

/**
 * Keep a channel's effective permissions when it stops inheriting from its category
 * (category deleted, or channel moved out of / to another category), audit 2026-10-18.
 *
 * A channel without overrides of its own is "synced": it uses its category's
 * overwrites (serverPermissions.effectiveOverwrites). Detaching it used to drop them,
 * so a child of a private category became visible to every member. Now the category's
 * overwrites are copied onto each synced child first. A child with its own overwrites
 * never used the category's, so nothing changes for it. Effective permissions are
 * identical before and after by construction.
 *
 * The copy is written while the channel is still parented (a no-op for its
 * permissions), so a failure later (unparent / delete) never widens access.
 */

const supabase = require("../db/supabase");

/** Returns [{ channelId, rows }] to write with applyDetachPlan. */
async function planDetachFromCategory(serverId, categoryId, childIds) {
  void serverId;
  const ids = [...new Set((childIds || []).filter(Boolean).map(String))];
  if (!categoryId || ids.length === 0) return [];
  const { data: overrides, error } = await supabase
    .from("server_channel_overrides")
    .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
    .in("channel_id", [String(categoryId), ...ids]);
  if (error) throw error;
  const parentRows = (overrides || []).filter((o) => String(o.channel_id) === String(categoryId));
  if (parentRows.length === 0) return [];
  const withOwn = new Set(
    (overrides || []).filter((o) => String(o.channel_id) !== String(categoryId)).map((o) => String(o.channel_id))
  );
  return ids
    .filter((id) => !withOwn.has(id))
    .map((channelId) => ({
      channelId,
      rows: parentRows.map((o) => ({
        channel_id: channelId,
        target_type: o.target_type,
        target_id: o.target_id,
        allow_permissions: o.allow_permissions,
        deny_permissions: o.deny_permissions,
      })),
    }));
}

/** Write a plan. Upserts only; never removes an override. */
async function applyDetachPlan(plan) {
  for (const step of plan || []) {
    for (const row of step.rows) {
      const { error } = await supabase
        .from("server_channel_overrides")
        .upsert(row, { onConflict: "channel_id,target_type,target_id" });
      if (error) throw error;
    }
  }
}

/**
 * Before the first own override is written on a synced channel, copy its category's
 * overwrites onto it, so editing one permission does not silently drop the category's
 * rules (e.g. its privacy). Discord does the same when you edit a synced channel.
 */
async function materializeIfSynced(channel) {
  if (!channel?.id || !channel.parent_id) return false;
  const { data: own, error } = await supabase
    .from("server_channel_overrides")
    .select("id")
    .eq("channel_id", channel.id)
    .limit(1);
  if (error) throw error;
  if ((own || []).length) return false;
  const plan = await planDetachFromCategory(channel.server_id, channel.parent_id, [channel.id]);
  await applyDetachPlan(plan);
  return plan.length > 0;
}

module.exports = { planDetachFromCategory, applyDetachPlan, materializeIfSynced };
