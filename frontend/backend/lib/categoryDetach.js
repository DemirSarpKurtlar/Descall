"use strict";

/**
 * Keep a channel's effective permissions when it stops inheriting from its category
 * (category deleted, or channel moved out of / to another category). Overwrites are
 * applied category first, then the channel (serverPermissions.resolveChannelPermissions),
 * so detaching used to silently drop the category's rules: a child of a private
 * category became visible to every member (audit 2026-10-18, HIGH).
 *
 * planDetachFromCategory builds the overrides each child needs on its own: a copy of
 * the category's when it has none, otherwise a per-target merge (category, then
 * channel). Every plan is checked by simulation for every role set in the server
 * (each member, a fresh @everyone-only member, each member-override target) against
 * base bits 0 and all-ones, which covers every base because overwrites are bitwise.
 * If any result would differ, a 409 CATEGORY_PERMISSIONS_CONFLICT is thrown and
 * nothing is written, so a detach can never widen (or narrow) access.
 */

const supabase = require("../db/supabase");
const { toPgBigint, fromPgBigint, applyOverwrites } = require("./serverPermissions");

const ONES = (1n << 64n) - 1n;

async function planDetachFromCategory(serverId, categoryId, childIds) {
  const ids = [...new Set((childIds || []).filter(Boolean).map(String))];
  if (!categoryId || ids.length === 0) return [];
  const [{ data: overrides, error: oErr }, { data: roles, error: rErr }, { data: assigned, error: aErr }] =
    await Promise.all([
      supabase
        .from("server_channel_overrides")
        .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
        .in("channel_id", [String(categoryId), ...ids]),
      supabase.from("server_roles").select("id, position, is_everyone").eq("server_id", serverId),
      supabase.from("server_member_roles").select("user_id, role_id").eq("server_id", serverId),
    ]);
  if (oErr) throw oErr;
  if (rErr) throw rErr;
  if (aErr) throw aErr;
  const parentRows = (overrides || []).filter((o) => String(o.channel_id) === String(categoryId));
  if (parentRows.length === 0) return [];

  const everyoneRoleId = (roles || []).find((r) => r.is_everyone)?.id || null;
  const rolePos = new Map((roles || []).map((r) => [String(r.id), Number(r.position) || 0]));
  const decorate = (rows) =>
    rows.map((o) => ({ ...o, _position: o.target_type === "role" ? rolePos.get(String(o.target_id)) || 0 : 0 }));
  const key = (o) => `${o.target_type}:${o.target_id}`;

  const byUser = new Map();
  for (const a of assigned || []) {
    const uid = String(a.user_id);
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    byUser.get(uid).add(String(a.role_id));
  }
  const subjects = [{ userId: "__fresh_member__", roles: new Set() }];
  for (const [uid, set] of byUser) subjects.push({ userId: uid, roles: set });
  for (const o of overrides || []) {
    if (o.target_type === "member" && !byUser.has(String(o.target_id))) {
      subjects.push({ userId: String(o.target_id), roles: new Set() });
    }
  }

  const plan = [];
  const conflicts = [];
  for (const childId of ids) {
    const own = (overrides || []).filter((o) => String(o.channel_id) === childId);
    const merged = new Map();
    for (const o of parentRows) {
      merged.set(key(o), {
        target_type: o.target_type,
        target_id: o.target_id,
        allow: fromPgBigint(o.allow_permissions),
        deny: fromPgBigint(o.deny_permissions),
      });
    }
    for (const o of own) {
      const ca = fromPgBigint(o.allow_permissions);
      const cd = fromPgBigint(o.deny_permissions);
      const prev = merged.get(key(o));
      if (!prev) {
        merged.set(key(o), { target_type: o.target_type, target_id: o.target_id, allow: ca, deny: cd });
      } else {
        // (b & ~pd | pa) & ~cd | ca  ==  b & ~(pd|cd) | ((pa & ~cd) | ca)
        const allow = (prev.allow & ~cd) | ca;
        merged.set(key(o), { ...prev, allow, deny: (prev.deny | cd) & ~allow });
      }
    }
    const rows = [...merged.values()].map((r) => ({
      channel_id: childId,
      target_type: r.target_type,
      target_id: r.target_id,
      allow_permissions: toPgBigint(r.allow),
      deny_permissions: toPgBigint(r.deny),
    }));

    let same = true;
    for (const subj of subjects) {
      const memberRoleIds = new Set(subj.roles);
      if (everyoneRoleId) memberRoleIds.add(String(everyoneRoleId));
      const ctx = { everyoneRoleId, memberRoleIds, userId: subj.userId };
      for (const base of [0n, ONES]) {
        const before = applyOverwrites(applyOverwrites(base, decorate(parentRows), ctx), decorate(own), ctx);
        const after = applyOverwrites(base, decorate(rows), ctx);
        if (before !== after) same = false;
      }
      if (!same) break;
    }
    if (same) plan.push({ channelId: childId, rows });
    else conflicts.push(childId);
  }
  if (conflicts.length) {
    const err = new Error(
      "Detaching these channels from the category would change who can access them. Sync their permissions with the category or edit them first."
    );
    err.status = 409;
    err.code = "CATEGORY_PERMISSIONS_CONFLICT";
    err.channelIds = conflicts;
    throw err;
  }
  return plan;
}

/** Write a plan. Upserts only, never removes an override; harmless while still parented. */
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

module.exports = { planDetachFromCategory, applyDetachPlan };
