"use strict";

/**
 * Passkey storage (supabase/migrations/20261124p_passkeys.sql). Two implementations with
 * the same interface: createSupabaseStore (production) and createMemoryStore (selftests).
 *
 * Every state change that must happen once is a single conditional statement, so two
 * nodes or two requests racing cannot both win:
 *   takeChallenge   DELETE ... WHERE challenge = ? AND purpose = ? RETURNING *
 *   updateCounter   UPDATE ... WHERE id = ? AND sign_count = <expected>
 *   completeHandoff UPDATE ... WHERE id = ? AND status = 'pending'
 *   consumeHandoff  UPDATE ... WHERE id = ? AND status = 'completed'
 */

const crypto = require("crypto");

const T_CRED = "passkey_credentials";
const T_CHAL = "passkey_challenges";
const T_HAND = "passkey_handoffs";

class StoreUnavailableError extends Error {
  constructor(message = "Passkeys are not set up yet.") {
    super(message);
    this.code = "PASSKEYS_UNAVAILABLE";
    this.status = 503;
  }
}

function isMissingTable(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "");
  return code === "42P01" || code === "PGRST205" || code === "PGRST204" || /does not exist|Could not find the table|schema cache/i.test(msg);
}

function createSupabaseStore(dbArg) {
  const db = () => dbArg || require("../../db/supabase");
  let availability = null; // null unknown, true, false (re-checked after a minute)
  let checkedAt = 0;

  function fail(error) {
    if (isMissingTable(error)) {
      availability = false;
      checkedAt = Date.now();
      throw new StoreUnavailableError();
    }
    const err = new Error(error?.message || "Database error.");
    err.code = error?.code || "DB_ERROR";
    throw err;
  }

  async function available() {
    if (availability !== null && Date.now() - checkedAt < 60_000) return availability;
    const { error } = await db().from(T_CRED).select("id").limit(1);
    availability = !error || !isMissingTable(error);
    checkedAt = Date.now();
    return availability;
  }

  return {
    kind: "supabase",
    available,
    async listByUser(userId) {
      const { data, error } = await db().from(T_CRED).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
      if (error) fail(error);
      return data || [];
    },
    async getByCredentialId(credentialId) {
      const { data, error } = await db().from(T_CRED).select("*").eq("credential_id", credentialId).maybeSingle();
      if (error) fail(error);
      return data || null;
    },
    async getById(id) {
      const { data, error } = await db().from(T_CRED).select("*").eq("id", id).maybeSingle();
      if (error) fail(error);
      return data || null;
    },
    async insertCredential(row) {
      const { data, error } = await db().from(T_CRED).insert(row).select("*").single();
      if (error) {
        if (String(error.code) === "23505") {
          const dup = new Error("This passkey is already registered.");
          dup.code = "DUPLICATE";
          throw dup;
        }
        fail(error);
      }
      return data;
    },
    async updateCounter(id, { expected, next, usedAt, platform, useCount }) {
      const { data, error } = await db()
        .from(T_CRED)
        .update({ sign_count: next, last_used_at: usedAt, last_used_platform: platform || null, use_count: useCount })
        .eq("id", id)
        .eq("sign_count", expected)
        .select("id");
      if (error) fail(error);
      return Array.isArray(data) && data.length > 0;
    },
    async setBackupState(id, backupState) {
      const { error } = await db().from(T_CRED).update({ backup_state: Boolean(backupState) }).eq("id", id);
      if (error) fail(error);
    },
    async suspend(id, reason) {
      const { error } = await db().from(T_CRED).update({ suspended_at: new Date().toISOString(), suspended_reason: reason }).eq("id", id).is("suspended_at", null);
      if (error) fail(error);
    },
    async rename(id, userId, name) {
      const { data, error } = await db().from(T_CRED).update({ name }).eq("id", id).eq("user_id", userId).select("*");
      if (error) fail(error);
      return (data && data[0]) || null;
    },
    async remove(id, userId) {
      const { data, error } = await db().from(T_CRED).delete().eq("id", id).eq("user_id", userId).select("*");
      if (error) fail(error);
      return (data && data[0]) || null;
    },
    async putChallenge(row) {
      const { error } = await db().from(T_CHAL).insert(row);
      if (error) fail(error);
    },
    async takeChallenge(challenge, purpose) {
      const { data, error } = await db().from(T_CHAL).delete().eq("challenge", challenge).eq("purpose", purpose).select("*");
      if (error) fail(error);
      return (data && data[0]) || null;
    },
    async pruneChallenges(nowIso) {
      await db().from(T_CHAL).delete().lt("expires_at", nowIso).then(() => {}, () => {});
      // Handoffs: keep a day for support questions, then drop.
      const dayAgo = new Date(Date.parse(nowIso) - 24 * 3600 * 1000).toISOString();
      await db().from(T_HAND).delete().lt("expires_at", dayAgo).then(() => {}, () => {});
    },
    async createHandoff(row) {
      const { data, error } = await db().from(T_HAND).insert(row).select("*").single();
      if (error) fail(error);
      return data;
    },
    async getHandoffByCodeHash(hash) {
      const { data, error } = await db().from(T_HAND).select("*").eq("code_hash", hash).maybeSingle();
      if (error) fail(error);
      return data || null;
    },
    async getHandoffByPollHash(hash) {
      const { data, error } = await db().from(T_HAND).select("*").eq("poll_hash", hash).maybeSingle();
      if (error) fail(error);
      return data || null;
    },
    async completeHandoff(id, patch) {
      const { data, error } = await db().from(T_HAND).update({ ...patch, status: "completed", completed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("*");
      if (error) fail(error);
      return (data && data[0]) || null;
    },
    async consumeHandoff(id) {
      const { data, error } = await db().from(T_HAND).update({ status: "consumed", consumed_at: new Date().toISOString() }).eq("id", id).eq("status", "completed").select("*");
      if (error) fail(error);
      return (data && data[0]) || null;
    },
    async failHandoff(id) {
      const { error } = await db().from(T_HAND).update({ status: "failed" }).eq("id", id).in("status", ["pending", "completed"]);
      if (error) fail(error);
    },
  };
}

/** In-memory twin for selftests (same conditional semantics). */
function createMemoryStore({ unavailable = false } = {}) {
  const creds = new Map();
  const challenges = new Map();
  const handoffs = new Map();
  const guard = () => {
    if (unavailable) throw new StoreUnavailableError();
  };
  const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : x);
  return {
    kind: "memory",
    _creds: creds,
    _challenges: challenges,
    _handoffs: handoffs,
    async available() {
      return !unavailable;
    },
    async listByUser(userId) {
      guard();
      return [...creds.values()].filter((r) => r.user_id === userId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(clone);
    },
    async getByCredentialId(credentialId) {
      guard();
      return clone([...creds.values()].find((r) => r.credential_id === credentialId) || null);
    },
    async getById(id) {
      guard();
      return clone(creds.get(id) || null);
    },
    async insertCredential(row) {
      guard();
      if ([...creds.values()].some((r) => r.credential_id === row.credential_id)) {
        const dup = new Error("This passkey is already registered.");
        dup.code = "DUPLICATE";
        throw dup;
      }
      const full = {
        id: crypto.randomUUID(),
        sign_count: 0,
        transports: [],
        backup_eligible: false,
        backup_state: false,
        created_at: new Date().toISOString(),
        last_used_at: null,
        last_used_platform: null,
        use_count: 0,
        suspended_at: null,
        suspended_reason: null,
        ...row,
      };
      creds.set(full.id, full);
      return clone(full);
    },
    async updateCounter(id, { expected, next, usedAt, platform, useCount }) {
      guard();
      const r = creds.get(id);
      if (!r || Number(r.sign_count) !== Number(expected)) return false;
      Object.assign(r, { sign_count: next, last_used_at: usedAt, last_used_platform: platform || null, use_count: useCount });
      return true;
    },
    async setBackupState(id, backupState) {
      const r = creds.get(id);
      if (r) r.backup_state = Boolean(backupState);
    },
    async suspend(id, reason) {
      const r = creds.get(id);
      if (r && !r.suspended_at) Object.assign(r, { suspended_at: new Date().toISOString(), suspended_reason: reason });
    },
    async rename(id, userId, name) {
      guard();
      const r = creds.get(id);
      if (!r || r.user_id !== userId) return null;
      r.name = name;
      return clone(r);
    },
    async remove(id, userId) {
      guard();
      const r = creds.get(id);
      if (!r || r.user_id !== userId) return null;
      creds.delete(id);
      return clone(r);
    },
    async putChallenge(row) {
      guard();
      challenges.set(row.challenge, { id: crypto.randomUUID(), created_at: new Date().toISOString(), meta: {}, ...row });
    },
    async takeChallenge(challenge, purpose) {
      guard();
      const r = challenges.get(challenge);
      if (!r || r.purpose !== purpose) return null;
      challenges.delete(challenge);
      return clone(r);
    },
    async pruneChallenges(nowIso) {
      for (const [k, r] of challenges) if (r.expires_at < nowIso) challenges.delete(k);
    },
    async createHandoff(row) {
      guard();
      const full = { id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString(), user_verified: false, ...row };
      handoffs.set(full.id, full);
      return clone(full);
    },
    async getHandoffByCodeHash(hash) {
      guard();
      return clone([...handoffs.values()].find((h) => h.code_hash === hash) || null);
    },
    async getHandoffByPollHash(hash) {
      guard();
      return clone([...handoffs.values()].find((h) => h.poll_hash === hash) || null);
    },
    async completeHandoff(id, patch) {
      const h = handoffs.get(id);
      if (!h || h.status !== "pending") return null;
      Object.assign(h, patch, { status: "completed", completed_at: new Date().toISOString() });
      return clone(h);
    },
    async consumeHandoff(id) {
      const h = handoffs.get(id);
      if (!h || h.status !== "completed") return null;
      Object.assign(h, { status: "consumed", consumed_at: new Date().toISOString() });
      return clone(h);
    },
    async failHandoff(id) {
      const h = handoffs.get(id);
      if (h && (h.status === "pending" || h.status === "completed")) h.status = "failed";
    },
  };
}

module.exports = { createSupabaseStore, createMemoryStore, StoreUnavailableError, isMissingTable };
