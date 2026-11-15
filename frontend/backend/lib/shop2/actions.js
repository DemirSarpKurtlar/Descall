"use strict";

/**
 * The user's shop action log ("İşlem kaydı" in the shop): every purchase, refresh, lock, equip,
 * gift, wishlist and outfit change, with an undo descriptor while undo is still possible.
 * undo: { type, ...args } and undoable_until. Executing an undo lives in lib/shop2/history.js.
 */

const db = require("./db");

async function log(userId, kind, payload = {}, { undo = null, undoMinutes = 0, now = Date.now() } = {}) {
  await db.ready();
  const row = {
    user_id: userId,
    kind,
    payload,
    undo: undo || null,
    undoable_until: undo && undoMinutes > 0 ? new Date(now + undoMinutes * 60_000).toISOString() : null,
    created_at: new Date(now).toISOString(),
  };
  try {
    return await db.one(db.from("shop2_actions").insert(row).select("*").single());
  } catch (err) {
    console.warn("[shop2] action log failed:", err?.message || err);
    return null;
  }
}

function publicAction(r, now = Date.now()) {
  const until = r.undoable_until ? Date.parse(r.undoable_until) : null;
  return {
    id: r.id,
    kind: r.kind,
    at: r.created_at,
    payload: r.payload || {},
    undoable: Boolean(r.undo && !r.undone_at && until && until > now),
    undoUntil: r.undo && !r.undone_at ? r.undoable_until : null,
    undoneAt: r.undone_at || null,
  };
}

async function list(userId, { limit = 50, before = null } = {}) {
  await db.ready();
  let q = db.from("shop2_actions").select("*").eq("user_id", userId);
  if (before) q = q.lt("created_at", before);
  return db.rows(q.order("created_at", { ascending: false }).limit(Math.min(200, Math.max(1, limit))));
}

async function get(userId, id) {
  await db.ready();
  return db.one(db.from("shop2_actions").select("*").eq("id", id).eq("user_id", userId).maybeSingle());
}

async function markUndone(id, now = Date.now()) {
  await db.rows(db.from("shop2_actions").update({ undone_at: new Date(now).toISOString() }).eq("id", id).select("id"));
}

/** Close the undo window of actions pointing at the same target (e.g. a refunded purchase). */
async function closeUndo(userId, match) {
  const rows = await list(userId, { limit: 100 });
  for (const r of rows) {
    if (!r.undo || r.undone_at) continue;
    if (Object.entries(match).every(([k, v]) => String(r.undo[k]) === String(v))) {
      await db.rows(db.from("shop2_actions").update({ undoable_until: new Date().toISOString() }).eq("id", r.id).select("id"));
    }
  }
}

module.exports = { log, list, get, markUndone, closeUndo, publicAction };
