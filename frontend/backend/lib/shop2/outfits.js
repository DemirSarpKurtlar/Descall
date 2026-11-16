"use strict";

/**
 * Saved outfits ("Görünüm kaydet") and the wishlist. An outfit is a snapshot of the equip
 * slots ({ category: itemId|null }); kind "saved" (named by the user) or "previous" (kept
 * automatically before "equip all", newest 5).
 */

const db = require("./db");
const people = require("./people");
const actions = require("./actions");
const config = require("./config");
const catalog = require("./catalog");
const { shopError } = require("./storefrontService");

const MAX_SAVED = 30;
const MAX_PREVIOUS = 5;
const MAX_WISHLIST = 200;

function publicOutfit(r) {
  return { id: r.id, name: r.name || null, kind: r.kind || "saved", look: r.look || {}, createdAt: r.created_at };
}

async function list(userId) {
  await db.ready();
  return db.rows(db.from("shop2_outfits").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(60));
}

async function saveSnapshot(userId, look, { name = null, kind = "saved" } = {}) {
  await db.ready();
  const all = await list(userId);
  const same = all.filter((o) => (o.kind || "saved") === kind);
  const max = kind === "previous" ? MAX_PREVIOUS : MAX_SAVED;
  if (same.length >= max) {
    if (kind !== "previous") throw shopError("outfit_limit", 409, { max });
    for (const old of same.slice(max - 1)) await db.rows(db.from("shop2_outfits").delete().eq("id", old.id).select("id"));
  }
  const row = { user_id: userId, name: name ? String(name).trim().slice(0, 40) : null, kind, look, created_at: new Date().toISOString() };
  return db.one(db.from("shop2_outfits").insert(row).select("*").single());
}

/** Save the current look (or `look`) under `name`. */
async function save(userId, { name, look = null, kind = "saved" } = {}) {
  const snapshot = look && typeof look === "object" ? people.cleanLook(look) : await people.equippedSnapshot(userId);
  // "previous": the look kept automatically before "Hepsini kuşan" (newest 5, unnamed, not
  // counted against the 30 saved looks and not logged as an undoable save).
  if (kind === "previous") return saveSnapshot(userId, snapshot, { name: null, kind: "previous" });
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) throw shopError("outfit_name_required", 400);
  const row = await saveSnapshot(userId, snapshot, { name: n, kind: "saved" });
  const limits = await config.getLimits();
  await actions.log(userId, "outfit_save", { outfitId: row.id, name: row.name }, { undo: { type: "outfit_delete", outfitId: row.id }, undoMinutes: limits.purchases.actionUndoMinutes });
  return row;
}

/** Wear a saved outfit; the current look becomes a "previous" outfit (undoable). */
async function apply(userId, outfitId, { io = null } = {}) {
  await db.ready();
  const row = await db.one(db.from("shop2_outfits").select("*").eq("id", outfitId).eq("user_id", userId).maybeSingle());
  if (!row) throw shopError("not_found", 404);
  const before = await people.equippedSnapshot(userId);
  await saveSnapshot(userId, before, { kind: "previous" });
  const applied = await people.applyLook(userId, row.look || {});
  const limits = await config.getLimits();
  await actions.log(userId, "outfit_apply", { outfitId, applied }, { undo: { type: "restore_look", look: before }, undoMinutes: Math.max(10, limits.purchases.actionUndoMinutes) });
  if (io) await people.broadcastProfile(io, userId);
  return { applied };
}

async function remove(userId, outfitId) {
  await db.ready();
  const gone = await db.rows(db.from("shop2_outfits").delete().eq("id", outfitId).eq("user_id", userId).select("id"));
  if (!gone.length) throw shopError("not_found", 404);
  return { ok: true };
}

/* ---------------------------------------------------------------- wishlist */

async function wishlist(userId) {
  await db.ready();
  return db.rows(db.from("shop2_wishlist").select("*").eq("user_id", userId).order("created_at", { ascending: false }));
}

/** Add (or remove with remove: true) an item; set keys are kept as `set:<key>` rows. */
async function toggleWish(userId, { itemId = null, setKey = null, remove = false } = {}) {
  await db.ready();
  const key = itemId ? String(itemId) : setKey ? `set:${setKey}` : null;
  if (!key) throw shopError("item_required", 400);
  if (itemId) {
    const cat = await catalog.getCatalog();
    if (!cat.byId.has(String(itemId))) throw shopError("not_found", 404);
  }
  const limits = await config.getLimits();
  if (remove) {
    await db.rows(db.from("shop2_wishlist").delete().eq("user_id", userId).eq("item_id", key).select("item_id"));
    await actions.log(userId, "wishlist_remove", { itemId: key }, { undo: { type: "wishlist_add", itemId: key }, undoMinutes: limits.purchases.actionUndoMinutes });
    return { wished: false };
  }
  const all = await wishlist(userId);
  if (all.length >= MAX_WISHLIST && !all.some((w) => String(w.item_id) === key)) throw shopError("wishlist_full", 409, { max: MAX_WISHLIST });
  await db.one(db.from("shop2_wishlist").upsert({ user_id: userId, item_id: key, created_at: new Date().toISOString() }, { onConflict: "user_id,item_id", ignoreDuplicates: true }).select("*").maybeSingle());
  await actions.log(userId, "wishlist_add", { itemId: key }, { undo: { type: "wishlist_remove", itemId: key }, undoMinutes: limits.purchases.actionUndoMinutes });
  return { wished: true };
}

module.exports = { list, save, saveSnapshot, apply, remove, publicOutfit, wishlist, toggleWish };
