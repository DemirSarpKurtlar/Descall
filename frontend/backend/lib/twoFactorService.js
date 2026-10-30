"use strict";

/**
 * Two-factor state per account (3.2.0). Authenticator app (TOTP) wins over the
 * older e-mail code; both gate password, Google and Apple sign-in. Columns come
 * from supabase/migrations/20261031_totp_two_factor.sql; until it is applied the
 * TOTP columns read as absent and only the e-mail method exists.
 */

const totp = require("./totp");

const TOTP_COLS = "totp_secret_enc, totp_pending_enc, totp_pending_at, totp_enabled_at, totp_last_counter, totp_recovery_hashes";
const PENDING_TTL_MS = 15 * 60 * 1000;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

function isMissingColumn(err) {
  return err?.code === "42703" || /column .* does not exist|totp_/i.test(String(err?.message || "")) && /does not exist|not find/i.test(String(err?.message || ""));
}

/** TOTP columns for a user, or null when the migration is not applied / no row. */
async function loadTotp(userId) {
  const res = await db().from("users").select(TOTP_COLS).eq("id", userId).maybeSingle();
  if (res?.error) {
    if (isMissingColumn(res.error)) return null;
    throw res.error;
  }
  const row = res?.data || null;
  // PostgREST always returns every selected column (null when empty); a row
  // without the keys means the columns do not exist here yet.
  if (row && !Object.prototype.hasOwnProperty.call(row, "totp_enabled_at")) return null;
  return row;
}

/** "totp" | "email" | null for a users row that may carry two_factor_enabled / email fields. */
function methodFor(user, totpRow) {
  if (totpRow?.totp_enabled_at && totpRow?.totp_secret_enc) return "totp";
  if (user?.two_factor_enabled && user?.email_confirmed_at && user?.email) return "email";
  return null;
}

/**
 * Check an authenticator code or a recovery code for a TOTP account and burn it
 * (counter advance / recovery hash removal) with a conditional update, so two
 * parallel requests cannot both use the same code.
 * @returns {Promise<{ok: true, via: "totp"|"recovery", recoveryLeft: number} | {ok: false, reason: string}>}
 */
async function verifySecondFactor(userId, code, { now = Date.now(), allowRecovery = true, row = null } = {}) {
  const r = row || (await loadTotp(userId));
  if (!r?.totp_enabled_at || !r?.totp_secret_enc) return { ok: false, reason: "not_enabled" };
  let secret;
  try {
    secret = totp.decryptSecret(r.totp_secret_enc);
  } catch {
    return { ok: false, reason: "secret_unreadable" };
  }
  const raw = String(code || "").trim();
  const hashes = Array.isArray(r.totp_recovery_hashes) ? r.totp_recovery_hashes : [];

  if (/^\d[\d\s]*$/.test(raw)) {
    const v = totp.verifyTotp(secret, raw, { now, lastCounter: r.totp_last_counter });
    if (!v.ok) return { ok: false, reason: v.reason };
    let q = db().from("users").update({ totp_last_counter: v.counter }).eq("id", userId);
    q = r.totp_last_counter == null ? q.is("totp_last_counter", null) : q.eq("totp_last_counter", r.totp_last_counter);
    const upd = await q.select("id");
    if (upd?.error || !(upd?.data || []).length) return { ok: false, reason: "replay" };
    return { ok: true, via: "totp", recoveryLeft: hashes.length };
  }

  if (!allowRecovery) return { ok: false, reason: "format" };
  const idx = totp.matchRecovery(raw, hashes);
  if (idx < 0) return { ok: false, reason: "mismatch" };
  const next = hashes.filter((_, i) => i !== idx);
  const upd = await db()
    .from("users")
    .update({ totp_recovery_hashes: next })
    .eq("id", userId)
    .contains("totp_recovery_hashes", [hashes[idx]])
    .select("id");
  if (upd?.error || !(upd?.data || []).length) return { ok: false, reason: "replay" };
  return { ok: true, via: "recovery", recoveryLeft: next.length };
}

/** Start authenticator setup: a fresh secret kept as "pending" until confirmed. */
async function beginSetup(userId, accountName) {
  const secret = totp.generateSecret();
  const upd = await db()
    .from("users")
    .update({ totp_pending_enc: totp.encryptSecret(secret), totp_pending_at: new Date().toISOString() })
    .eq("id", userId);
  if (upd?.error) throw upd.error;
  return { secret, uri: totp.otpauthUri(secret, accountName) };
}

/** Confirm setup with the first code; returns the recovery codes (shown once). */
async function confirmSetup(userId, code, { now = Date.now() } = {}) {
  const r = await loadTotp(userId);
  if (!r?.totp_pending_enc || !r?.totp_pending_at) return { ok: false, reason: "no_pending" };
  if (now - Date.parse(r.totp_pending_at) > PENDING_TTL_MS) return { ok: false, reason: "expired" };
  let secret;
  try {
    secret = totp.decryptSecret(r.totp_pending_enc);
  } catch {
    return { ok: false, reason: "secret_unreadable" };
  }
  const v = totp.verifyTotp(secret, code, { now });
  if (!v.ok) return { ok: false, reason: v.reason };
  const codes = totp.generateRecoveryCodes();
  const upd = await db()
    .from("users")
    .update({
      totp_secret_enc: r.totp_pending_enc,
      totp_pending_enc: null,
      totp_pending_at: null,
      totp_enabled_at: new Date(now).toISOString(),
      totp_last_counter: v.counter,
      totp_recovery_hashes: codes.map(totp.hashRecovery),
      two_factor_enabled: true,
    })
    .eq("id", userId);
  if (upd?.error) throw upd.error;
  return { ok: true, recoveryCodes: codes };
}

async function disableTotp(userId) {
  const upd = await db()
    .from("users")
    .update({
      totp_secret_enc: null,
      totp_pending_enc: null,
      totp_pending_at: null,
      totp_enabled_at: null,
      totp_last_counter: null,
      totp_recovery_hashes: [],
      two_factor_enabled: false,
    })
    .eq("id", userId);
  if (upd?.error) throw upd.error;
}

async function regenerateRecovery(userId) {
  const codes = totp.generateRecoveryCodes();
  const upd = await db().from("users").update({ totp_recovery_hashes: codes.map(totp.hashRecovery) }).eq("id", userId);
  if (upd?.error) throw upd.error;
  return codes;
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  TOTP_COLS,
  PENDING_TTL_MS,
  loadTotp,
  methodFor,
  verifySecondFactor,
  beginSetup,
  confirmSetup,
  disableTotp,
  regenerateRecovery,
  isMissingColumn,
  __setDbForTests,
};
