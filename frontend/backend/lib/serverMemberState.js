"use strict";

/**
 * Membership state shared by the server routes, slash commands and the join paths
 * (server audit 2026-11-15, membership fixes):
 *  - canonId / sameId: Postgres compares uuid columns case-insensitively, JS strings do
 *    not. An UPPERCASE owner id used to pass `owner_id === param` checks while the DB
 *    write still hit the owner's row (M1). Ids from the URL / body are canonicalised.
 *  - timeouts persisted in server_member_timeouts, so leave + rejoin no longer clears
 *    them (M3 / IM-1). The membership row keeps timeout_until as the fast copy the
 *    message, reaction, typing and voice checks read; the side table survives the row.
 *  - purgeMemberState: role rows and member channel overrides go with the membership
 *    (kick, ban, leave, temporary expiry), so they do not come back on rejoin (DF-1/DF-2).
 *  - voiceEnforce: the voice contract (lib/serverVoiceEnforce.js, owned by the voice
 *    code), loaded lazily and never fatal.
 */

const supabase = require("../db/supabase");

const UUID_LOOSE = /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i;

/**
 * Canonical lowercase hyphenated uuid for anything Postgres would read as the same
 * uuid (upper case, braces, no hyphens). Other values (test ids, slugs) are returned
 * trimmed and unchanged; null/undefined stay null.
 */
function canonId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return "";
  if (!UUID_LOOSE.test(s)) return s;
  const hex = s.replace(/[{}-]/g, "").toLowerCase();
  if (hex.length !== 32) return s;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return canonId(a) === canonId(b);
}

function isMissingTable(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(String(error?.message || ""));
}

function activeUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d <= new Date()) return null;
  return d.toISOString();
}

/** Write-through copy of a timeout that outlives the membership row. Best effort. */
async function saveTimeoutRecord({ serverId, userId, until, reason, moderatorId }) {
  try {
    const { error } = await supabase.from("server_member_timeouts").upsert(
      {
        server_id: serverId,
        user_id: userId,
        until,
        reason: reason || null,
        moderator_id: moderatorId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "server_id,user_id" }
    );
    if (error && !isMissingTable(error)) console.warn("[serverMemberState] timeout save failed:", error.message);
  } catch (err) {
    console.warn("[serverMemberState] timeout save failed:", err?.message || err);
  }
}

async function clearTimeoutRecord(serverId, userId) {
  try {
    const { error } = await supabase
      .from("server_member_timeouts")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId);
    if (error && !isMissingTable(error)) console.warn("[serverMemberState] timeout clear failed:", error.message);
  } catch (err) {
    console.warn("[serverMemberState] timeout clear failed:", err?.message || err);
  }
}

/** { until, reason, moderatorId } of a still-running stored timeout, else null. */
async function activeTimeoutRecord(serverId, userId) {
  try {
    const { data, error } = await supabase
      .from("server_member_timeouts")
      .select("until, reason, moderator_id")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingTable(error)) console.warn("[serverMemberState] timeout read failed:", error.message);
      return null;
    }
    const until = activeUntil(data?.until);
    if (!until) return null;
    return { until, reason: data.reason || null, moderatorId: data.moderator_id || null };
  } catch {
    return null;
  }
}

/** Fields to put on a fresh membership row so a running timeout carries over a rejoin. */
async function timeoutFieldsForJoin(serverId, userId) {
  const t = await activeTimeoutRecord(serverId, userId);
  if (!t) return {};
  return { timeout_until: t.until, timeout_reason: t.reason, timed_out_by: t.moderatorId };
}

/**
 * Remove what belongs to a membership that ended (kick, ban, leave, temporary expiry):
 * role assignments and the member's own channel overrides in this server. The
 * membership row itself is the caller's business. Best effort; returns counts.
 */
async function purgeMemberState(serverId, userId) {
  const out = { roles: 0, overrides: 0 };
  try {
    const { data } = await supabase
      .from("server_member_roles")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .select("role_id");
    out.roles = Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.warn("[serverMemberState] role cleanup failed:", err?.message || err);
  }
  try {
    const { data: chans, error } = await supabase.from("server_channels").select("id").eq("server_id", serverId);
    if (error) throw error;
    const ids = (chans || []).map((c) => c.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase
        .from("server_channel_overrides")
        .delete()
        .eq("target_type", "member")
        .eq("target_id", userId)
        .in("channel_id", ids.slice(i, i + 100))
        .select("id");
      out.overrides += Array.isArray(data) ? data.length : 0;
    }
  } catch (err) {
    console.warn("[serverMemberState] override cleanup failed:", err?.message || err);
  }
  return out;
}

/**
 * The directory's permanent invite (servers.directory_invite_code) goes when the server
 * leaves the directory, is hidden by moderation or has its invites closed (IM-13 /
 * IM-4): it outlived the listing before. Best effort.
 */
async function dropDirectoryInvite(serverId) {
  try {
    const { data: server, error } = await supabase.from("servers").select("*").eq("id", serverId).maybeSingle();
    if (error || !server?.directory_invite_code) return false;
    await supabase.from("server_invites").delete().eq("code", server.directory_invite_code).eq("server_id", serverId);
    await supabase.from("servers").update({ directory_invite_code: null }).eq("id", serverId);
    return true;
  } catch (err) {
    console.warn("[serverMemberState] directory invite cleanup failed:", err?.message || err);
    return false;
  }
}

/**
 * An account being deleted hands each server it owns to the member with the highest
 * role (earliest join on ties) who is not temporary, banned from Descall or being
 * deleted. Owned servers used to stay with an unreachable owner that nobody could
 * replace (M11). Servers without such a member stay as they are. Returns the
 * server ids that changed owner.
 */
async function handOverOwnedServers(userId) {
  const moved = [];
  const { data: owned, error } = await supabase.from("servers").select("id, name, owner_id").eq("owner_id", userId);
  if (error) {
    console.warn("[serverMemberState] owned servers read failed:", error.message);
    return moved;
  }
  for (const server of owned || []) {
    try {
      const { data: members } = await supabase
        .from("server_members")
        .select("user_id, joined_at, temporary")
        .eq("server_id", server.id)
        .order("joined_at", { ascending: true })
        .limit(1000);
      const candidates = (members || []).filter((m) => !sameId(m.user_id, userId) && !m.temporary);
      if (!candidates.length) continue;
      const ids = candidates.map((m) => m.user_id);
      const [{ data: users }, { data: roles }, { data: assigned }] = await Promise.all([
        supabase.from("users").select("*").in("id", ids),
        supabase.from("server_roles").select("id, position").eq("server_id", server.id),
        supabase.from("server_member_roles").select("user_id, role_id").eq("server_id", server.id).in("user_id", ids),
      ]);
      const okUser = new Map(
        (users || [])
          .filter((u) => !u.is_banned && !u.deleted_at && !u.deletion_requested_at)
          .map((u) => [String(u.id), u])
      );
      const pos = new Map((roles || []).map((r) => [String(r.id), Number(r.position) || 0]));
      const top = new Map();
      for (const a of assigned || []) {
        const k = String(a.user_id);
        top.set(k, Math.max(top.get(k) || 0, pos.get(String(a.role_id)) || 0));
      }
      const pick = candidates
        .filter((m) => okUser.has(String(m.user_id)))
        .sort((a, b) => (top.get(String(b.user_id)) || 0) - (top.get(String(a.user_id)) || 0))[0];
      if (!pick) continue;
      const { data: upd } = await supabase
        .from("servers")
        .update({ owner_id: pick.user_id, updated_at: new Date().toISOString() })
        .eq("id", server.id)
        .eq("owner_id", userId)
        .select("id");
      if (!(Array.isArray(upd) ? upd.length : upd)) continue;
      await supabase
        .from("server_members")
        .update({ timeout_until: null, timeout_reason: null, timed_out_by: null })
        .eq("server_id", server.id)
        .eq("user_id", pick.user_id);
      await clearTimeoutRecord(server.id, pick.user_id);
      await supabase.from("server_audit_logs").insert({
        server_id: server.id,
        actor_id: null,
        action: "OWNERSHIP_TRANSFER",
        target_type: "member",
        target_id: String(pick.user_id),
        changes: { from: userId, to: pick.user_id, name: server.name, via: "account_deleted" },
        reason: null,
      });
      moved.push(server.id);
    } catch (err) {
      console.warn("[serverMemberState] ownership hand-over failed:", server.id, err?.message || err);
    }
  }
  return moved;
}

// ---------------------------------------------------------------- voice contract

let voiceOverride = null;
function voiceEnforce() {
  if (voiceOverride) return voiceOverride;
  try {
    return require("./serverVoiceEnforce");
  } catch {
    return null;
  }
}

/** Fire-and-forget call into the voice contract; never throws. */
function callVoice(name, io, args) {
  try {
    const fn = voiceEnforce()?.[name];
    if (typeof fn !== "function") return Promise.resolve(false);
    return Promise.resolve(fn(io, args))
      .then(() => true)
      .catch((err) => {
        console.warn(`[serverMemberState] voice ${name} failed:`, err?.message || err);
        return false;
      });
  } catch (err) {
    console.warn(`[serverMemberState] voice ${name} failed:`, err?.message || err);
    return Promise.resolve(false);
  }
}

function _setVoiceEnforceForTest(stub) {
  voiceOverride = stub || null;
}

module.exports = {
  canonId,
  sameId,
  isMissingTable,
  activeUntil,
  saveTimeoutRecord,
  clearTimeoutRecord,
  activeTimeoutRecord,
  timeoutFieldsForJoin,
  purgeMemberState,
  dropDirectoryInvite,
  handOverOwnedServers,
  voiceEnforce,
  callVoice,
  _setVoiceEnforceForTest,
};
