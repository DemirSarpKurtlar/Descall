"use strict";

/**
 * Credit ledger (public.credit_ledger) and !pay transfers (public.credit_transfers).
 * Every change of a game wallet (user_credits) writes one ledger row with the
 * balance after it: hand results (net of the stake), the daily bonus, both sides
 * of a transfer, admin adjustments and resets. Game credits are points only.
 *
 * Writes never block or fail a game: errors are logged, a missing table pauses
 * writes for 10 minutes with one warning (migration
 * supabase/migrations/20261115_games_credit_ledger.sql not applied yet).
 */

const PAUSE_MS = 10 * 60 * 1000;
const KINDS = Object.freeze(["game", "daily", "transfer_in", "transfer_out", "admin", "reset"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let clientOverride = null;
const paused = { credit_ledger: 0, credit_transfers: 0 };
const warned = new Set();

function db() {
  return clientOverride || require("../db/supabase");
}

function isMissingTable(err, table) {
  const msg = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (msg.includes(table) && /does not exist|not find/i.test(msg));
}

function pause(table, err) {
  paused[table] = Date.now() + PAUSE_MS;
  if (!warned.has(table)) {
    warned.add(table);
    console.warn(`[casinoLedger] ${table} missing; apply supabase/migrations/20261115_games_credit_ledger.sql`, err?.message || "");
  }
}

function available(table = "credit_ledger") {
  return Date.now() >= (paused[table] || 0);
}

function uuidOrNull(v) {
  const s = String(v || "");
  return UUID.test(s) ? s : null;
}

function intOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Chat a game ran in, from the casino target (group / server channel / DM). */
function contextOf(target, userId) {
  if (!target || !target.kind) return { context_kind: null, context_id: null };
  if (target.kind === "dm") {
    const other = (target.dmUserIds || []).find((id) => String(id) !== String(userId)) || null;
    return { context_kind: "dm", context_id: other ? String(other) : null };
  }
  if (target.kind === "channel") return { context_kind: "channel", context_id: target.channelId ? String(target.channelId) : null };
  return { context_kind: "group", context_id: target.groupId ? String(target.groupId) : target.roomId ? String(target.roomId) : null };
}

/** Ledger row (pure) from an entry description; null when it cannot be stored. */
function toRow(entry) {
  const userId = uuidOrNull(entry?.userId);
  const kind = KINDS.includes(entry?.kind) ? entry.kind : null;
  const delta = intOrNull(entry?.delta);
  if (!userId || !kind || delta == null) return null;
  const reason = entry.reason ? String(entry.reason).slice(0, 500) : null;
  return {
    user_id: userId,
    kind,
    game_type: entry.gameType || null,
    result: entry.result || null,
    bet: intOrNull(entry.bet),
    delta,
    balance_after: intOrNull(entry.balanceAfter),
    ref_id: entry.refId ? String(entry.refId).slice(0, 80) : null,
    counterparty_id: uuidOrNull(entry.counterpartyId),
    actor_id: uuidOrNull(entry.actor?.id),
    actor_username: entry.actor?.username ? String(entry.actor.username).slice(0, 64) : null,
    reason,
    category: entry.category ? String(entry.category).slice(0, 40) : null,
    context_kind: entry.context?.context_kind || null,
    context_id: entry.context?.context_id || null,
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : null,
    created_at: entry.at || new Date().toISOString(),
  };
}

/** Writes one or more ledger entries. Resolves to the stored count (never throws). */
async function record(entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).map(toRow).filter(Boolean);
  if (!list.length || !available("credit_ledger")) return 0;
  try {
    const { error } = await db().from("credit_ledger").insert(list);
    if (error) {
      if (isMissingTable(error, "credit_ledger")) pause("credit_ledger", error);
      else console.warn("[casinoLedger] insert:", error.message || error);
      return 0;
    }
    return list.length;
  } catch (err) {
    console.warn("[casinoLedger] insert failed:", err?.message || err);
    return 0;
  }
}

/** One !pay transfer. Resolves to the stored row id or null (never throws). */
async function recordTransfer({ fromUserId, toUserId, amount, context }) {
  const from = uuidOrNull(fromUserId);
  const to = uuidOrNull(toUserId);
  const n = intOrNull(amount);
  if (!from || !to || !n || n <= 0 || !available("credit_transfers")) return null;
  try {
    const { data, error } = await db()
      .from("credit_transfers")
      .insert({ from_user_id: from, to_user_id: to, amount: n, context_kind: context?.context_kind || null, context_id: context?.context_id || null, created_at: new Date().toISOString() })
      .select("id")
      .maybeSingle();
    if (error) {
      if (isMissingTable(error, "credit_transfers")) pause("credit_transfers", error);
      else console.warn("[casinoLedger] transfer:", error.message || error);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn("[casinoLedger] transfer failed:", err?.message || err);
    return null;
  }
}

/**
 * Reads a table for the admin page. { ready, rows }: ready=false when the table
 * is missing (the page then falls back to game_history).
 */
async function readTable(table, build) {
  if (!available(table)) return { ready: false, rows: [] };
  try {
    const { data, error } = await build(db().from(table));
    if (error) {
      if (isMissingTable(error, table)) {
        pause(table, error);
        return { ready: false, rows: [] };
      }
      throw error;
    }
    return { ready: true, rows: data || [] };
  } catch (err) {
    if (isMissingTable(err, table)) {
      pause(table, err);
      return { ready: false, rows: [] };
    }
    throw err;
  }
}

function _setClientForTests(client) {
  clientOverride = client;
  paused.credit_ledger = 0;
  paused.credit_transfers = 0;
}

module.exports = { KINDS, contextOf, toRow, record, recordTransfer, readTable, available, isMissingTable, _setClientForTests };
