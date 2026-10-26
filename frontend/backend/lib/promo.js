"use strict";

/**
 * Promosyon kodları. Every state change runs inside one Postgres function
 * (supabase/migrations/20261026_promo_codes.sql) so redemption is atomic and
 * race-safe; this module only normalises input, builds codes and maps results.
 */

const crypto = require("crypto");
const supabase = require("../db/supabase");

// No O/0 and I/1: the pairs people mix up when they read a code aloud or off a screenshot.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

const USER_ERRORS = new Set([
  "invalid", "expired", "used", "limit", "age", "rate_limited", "unavailable", "badge_owned", "wallet_frozen",
]);

function normalizeCode(raw) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatCode(norm, sep = "-") {
  const v = normalizeCode(norm);
  return v.match(/.{1,4}/g)?.join(sep) || "";
}

function generateCode(randomInt = crypto.randomInt) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Keyed hash of the client address for the per-IP limiter; the address itself is never stored. */
function ipHash(ip) {
  const key = process.env.PROMO_IP_HASH_KEY || process.env.JWT_SECRET || "descall-promo";
  if (!ip) return null;
  return crypto.createHmac("sha256", key).update(String(ip)).digest("hex").slice(0, 32);
}

/**
 * Anti-bot gate default when no risk score exists for the account (or the
 * descoin_risk table from the anti-bot work is not deployed yet).
 * 'allow' (default) or 'withhold'.
 */
function riskUnknownMode() {
  return String(process.env.PROMO_RISK_UNKNOWN || "").toLowerCase() === "withhold" ? "withhold" : "allow";
}

class PromoError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const err = new PromoError("server_error", 500);
    err.cause = error;
    throw err;
  }
  return data;
}

function statusFor(code) {
  if (code === "rate_limited") return 429;
  if (code === "not_found") return 404;
  if (code === "used" || code === "limit" || code === "badge_owned" || code === "code_taken") return 409;
  return 400;
}

async function redeem(userId, rawCode, { ip } = {}) {
  const code = normalizeCode(rawCode);
  const result = await rpc("promo_redeem", {
    p_user_id: userId,
    p_code: code,
    p_ip_hash: ipHash(ip),
    p_risk_unknown: riskUnknownMode(),
  });
  if (!result?.ok) {
    const errCode = USER_ERRORS.has(result?.error) ? result.error : "invalid";
    const extra = {};
    if (errCode === "rate_limited") extra.retryAfter = Number(result.retryAfter) || 600;
    if (errCode === "age") {
      extra.days = result.days;
      extra.availableAt = result.availableAt;
    }
    throw new PromoError(errCode, statusFor(errCode), extra);
  }
  return { codeId: result.codeId, reward: result.reward, balance: result.balance };
}

async function history(userId) {
  const rows = await rpc("promo_history", { p_user_id: userId, p_limit: 50 });
  return Array.isArray(rows) ? rows : [];
}

async function popupFor(userId) {
  return (await rpc("promo_popup_for", { p_user_id: userId })) || null;
}

async function markPopup(userId, codeId, snooze) {
  const res = await rpc("promo_popup_mark", { p_user_id: userId, p_code_id: codeId, p_snooze: Boolean(snooze) });
  if (!res?.ok) throw new PromoError(res?.error || "not_found", statusFor(res?.error || "not_found"));
  return res;
}

const ADMIN_ERRORS = new Set([
  "code_format", "reward_type", "reward_amount", "reward_item", "reward_badge", "badges_unavailable",
  "audience", "targets", "expires_past", "code_taken", "invalid_input", "not_found", "max_below_used",
]);

function adminFail(res) {
  const code = ADMIN_ERRORS.has(res?.error) ? res.error : "invalid_input";
  throw new PromoError(code, statusFor(code));
}

function cleanCreateInput(body = {}) {
  const rewardType = String(body.rewardType || "");
  const code = body.code ? normalizeCode(body.code) : generateCode();
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 140) : "";
  const maxUses = body.maxUses == null || body.maxUses === "" ? null : Math.floor(Number(body.maxUses));
  const age = Math.max(0, Math.min(3650, Math.floor(Number(body.minAccountAgeDays) || 0)));
  const audience = ["none", "all", "active_7d", "selected"].includes(body.popupAudience) ? body.popupAudience : "none";
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new PromoError("invalid_input");
  if (maxUses != null && (!Number.isFinite(maxUses) || maxUses <= 0)) throw new PromoError("invalid_input");
  const targetUserIds = Array.isArray(body.targetUserIds)
    ? [...new Set(body.targetUserIds.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))].slice(0, 500)
    : [];
  return {
    code,
    rewardType,
    rewardAmount: rewardType === "descoin" ? Math.floor(Number(body.rewardAmount)) : null,
    rewardRef: rewardType === "descoin" ? null : String(body.rewardRef || "").slice(0, 120),
    message,
    maxUses,
    minAccountAgeDays: age,
    oncePerUser: body.oncePerUser !== false,
    active: body.active !== false,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    popupAudience: audience,
    targetUserIds,
  };
}

async function adminCreate(adminId, body) {
  const input = cleanCreateInput(body);
  const res = await rpc("promo_admin_create", { p_admin_id: adminId, p: input });
  if (!res?.ok) adminFail(res);
  return { id: res.id, code: res.code, audience: input.popupAudience, targetUserIds: input.targetUserIds, active: input.active };
}

async function adminUpdate(adminId, codeId, body = {}) {
  const patch = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if ("maxUses" in body) {
    const n = body.maxUses == null || body.maxUses === "" ? null : Math.floor(Number(body.maxUses));
    if (n != null && (!Number.isFinite(n) || n <= 0)) throw new PromoError("invalid_input");
    patch.maxUses = n;
  }
  if ("expiresAt" in body) {
    const d = body.expiresAt ? new Date(body.expiresAt) : null;
    if (d && Number.isNaN(d.getTime())) throw new PromoError("invalid_input");
    patch.expiresAt = d ? d.toISOString() : null;
  }
  if ("message" in body) patch.message = String(body.message || "").trim().slice(0, 140);
  if (!Object.keys(patch).length) throw new PromoError("invalid_input");
  const res = await rpc("promo_admin_update", { p_admin_id: adminId, p_code_id: codeId, p: patch });
  if (!res?.ok) adminFail(res);
  return res;
}

async function adminOverview() {
  return rpc("promo_admin_overview", {});
}

async function adminRedemptions(codeId, { q, limit, offset } = {}) {
  return rpc("promo_admin_redemptions", {
    p_code_id: codeId,
    p_q: q ? String(q).slice(0, 60) : null,
    p_limit: Math.max(1, Math.min(200, Number(limit) || 50)),
    p_offset: Math.max(0, Number(offset) || 0),
  });
}

/** Tell the right online clients to ask GET /promo/popup (the payload never carries the code). */
function nudgePopup(io, created) {
  if (!io || !created?.active || !created.audience || created.audience === "none") return;
  if (created.audience === "selected") {
    for (const id of created.targetUserIds || []) io.to(`user:${id}`).emit("promo:popup", { id: created.id });
  } else {
    io.emit("promo:popup", { id: created.id });
  }
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  PromoError,
  normalizeCode,
  formatCode,
  generateCode,
  ipHash,
  riskUnknownMode,
  redeem,
  history,
  popupFor,
  markPopup,
  adminCreate,
  adminUpdate,
  adminOverview,
  adminRedemptions,
  cleanCreateInput,
  nudgePopup,
};
