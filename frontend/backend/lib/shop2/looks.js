"use strict";

/**
 * Inventory "Stüdyo" (owner pick, 22 Nov 2026): several equip slots changed in one request
 * (try on locally, then "Uygula"), the equip history ("Kuşanma geçmişi", read from the shop
 * action log, no table of its own) and saved look rename / pin.
 *
 * look_apply actions carry `{ applied: { category: itemId|null }, before: { category:
 * itemId|null }, source }` so the history can show "from -> to" per slot and "Geri dön" can
 * put the old items back.
 */

const db = require("./db");
const people = require("./people");
const actions = require("./actions");
const config = require("./config");
const outfits = require("./outfits");
const { shopError } = require("./storefrontService");

const SOURCES = new Set(["inventory", "revert", "random", "palette", "single"]);
/** Action kinds that changed what the user wears. */
const EQUIP_KINDS = ["look_apply", "equip", "outfit_apply"];
const MAX_SLOTS = 30;

function sameId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

/** Themes need a client that can draw them (same rule as POST /api/shop/equip). */
async function themeAllowed(itemId, themeEngine) {
  if (!itemId) return true;
  try {
    const shop = require("../shop");
    const item = await shop.getItemById(itemId);
    const { themeEquipAllowed } = require("../glassThemeCatalog");
    return Boolean(item) && themeEquipAllowed(item.theme_key, themeEngine);
  } catch {
    return false;
  }
}

/**
 * Wear `look` ({ category: itemId|null }, null = take off). Only slots that change are written;
 * only owned items, only into their own slot (people.applyLook). One undoable `look_apply`
 * action, one profile broadcast. Several slots at once also keep the old look as the
 * automatic "previous" outfit.
 */
async function apply(userId, look, { source = "inventory", themeEngine = null, io = null } = {}) {
  if (!look || typeof look !== "object" || Array.isArray(look)) throw shopError("item_required", 400);
  if (Object.keys(look).length > MAX_SLOTS) throw shopError("bad_request", 400);
  const want = people.cleanLook(look);
  if (!Object.keys(want).length) throw shopError("item_required", 400);
  const before = await people.equippedSnapshot(userId);
  const changed = {};
  for (const [cat, id] of Object.entries(want)) {
    if (!(cat in before) || sameId(before[cat], id)) continue;
    if (cat === "theme" && id && !(await themeAllowed(id, themeEngine))) continue;
    changed[cat] = id;
  }
  if (!Object.keys(changed).length) return { applied: {}, before: {}, actionId: null, previousOutfitId: null, unchanged: true };
  const applied = await people.applyLook(userId, changed);
  const n = Object.keys(applied).length;
  if (!n) throw shopError("look_not_owned", 409);
  const prev = {};
  for (const cat of Object.keys(applied)) prev[cat] = before[cat] ?? null;
  const saved = n > 1 ? await outfits.saveSnapshot(userId, before, { kind: "previous" }).catch(() => null) : null;
  const limits = await config.getLimits();
  const kind = SOURCES.has(source) ? source : "inventory";
  const action = await actions.log(userId, "look_apply", { applied, before: prev, source: kind, outfitId: saved?.id || null }, { undo: { type: "restore_look", look: prev }, undoMinutes: Math.max(10, limits.purchases.actionUndoMinutes) });
  if (io) await people.broadcastProfile(io, userId);
  return { applied, before: prev, actionId: action?.id || null, previousOutfitId: saved?.id || null };
}

/**
 * A single slot changed through POST /api/shop/equip (Vitrin "Kuşan", the purchase window):
 * logged like the inventory so the history is complete. Never throws.
 */
async function logSingle(userId, category, fromId, toId) {
  try {
    if (sameId(fromId, toId)) return null;
    const limits = await config.getLimits();
    return await actions.log(userId, "look_apply", { applied: { [category]: toId || null }, before: { [category]: fromId || null }, source: "single" }, { undo: { type: "restore_look", look: { [category]: fromId || null } }, undoMinutes: Math.max(10, limits.purchases.actionUndoMinutes) });
  } catch (err) {
    console.warn("[shop2] equip log failed:", err?.message || err);
    return null;
  }
}

/** Per-slot changes of an equip-type action row: [{ category, from, to }]. */
function changesOf(row) {
  const p = row.payload || {};
  const applied = p.applied && typeof p.applied === "object" ? p.applied : {};
  const before = p.before && typeof p.before === "object" ? p.before : row.undo?.look && typeof row.undo.look === "object" ? row.undo.look : {};
  return Object.entries(applied)
    .map(([category, to]) => ({ category, from: before[category] ?? null, to: to ?? null }))
    .filter((c) => !sameId(c.from, c.to));
}

/**
 * Equip history for the inventory: equip-type actions of the last `days` days, newest first,
 * with per-slot from / to ids (items resolved by the client from its inventory; s2 items
 * also come as public items).
 */
async function history(userId, { limit = 20, days = 7, base = "", now = Date.now() } = {}) {
  const rows = await actions.list(userId, { limit: 200 });
  const since = now - days * 86_400_000;
  const list = rows.filter((r) => EQUIP_KINDS.includes(r.kind) && Date.parse(r.created_at) >= since);
  const entries = [];
  const ids = new Set();
  const outfitIds = new Set();
  for (const r of list) {
    const changes = changesOf(r);
    if (!changes.length) continue;
    for (const c of changes) {
      if (c.from) ids.add(String(c.from));
      if (c.to) ids.add(String(c.to));
    }
    if (r.kind === "outfit_apply" && r.payload?.outfitId) outfitIds.add(String(r.payload.outfitId));
    const a = actions.publicAction(r, now);
    entries.push({ id: r.id, at: r.created_at, kind: r.kind, source: r.kind === "look_apply" ? r.payload?.source || "inventory" : r.kind, outfitId: r.payload?.outfitId || null, changes, undoneAt: a.undoneAt });
  }
  const catalog = require("./catalog");
  const cat = await catalog.getCatalog();
  const items = {};
  for (const id of ids) {
    const it = cat.byId.get(id);
    if (it) items[id] = catalog.publicItem(it, base);
  }
  let names = new Map();
  if (outfitIds.size) {
    const all = await outfits.list(userId).catch(() => []);
    names = new Map(all.filter((o) => outfitIds.has(String(o.id))).map((o) => [String(o.id), o.name || null]));
  }
  return {
    total: entries.length,
    days,
    entries: entries.slice(0, Math.min(50, Math.max(1, limit))).map((e) => ({ ...e, outfitName: e.outfitId ? names.get(String(e.outfitId)) ?? null : null })),
    items,
  };
}

/* ---------------------------------------------------------------- outfit rename / pin */

// Until supabase/migrations/20261122c_shop2_outfit_pins.sql is applied the pinned_at column is
// missing: pins then live in this process (best effort) instead of failing.
const memPins = new Map();
let warned = false;

function pinnedOf(row) {
  if (!row) return false;
  if (row.pinned_at) return true;
  return memPins.get(String(row.id)) === true;
}

/**
 * Rename and / or pin a saved look. Renaming the automatic "previous" look keeps it as a
 * named save (so it is not pushed out by the next automatic one).
 */
async function update(userId, outfitId, { name, pinned } = {}) {
  await db.ready();
  const row = await db.one(db.from("shop2_outfits").select("*").eq("id", outfitId).eq("user_id", userId).maybeSingle());
  if (!row) throw shopError("not_found", 404);
  const patch = {};
  if (name !== undefined) {
    const n = typeof name === "string" ? name.trim().slice(0, 40) : "";
    if (!n) throw shopError("outfit_name_required", 400);
    patch.name = n;
    if ((row.kind || "saved") === "previous") patch.kind = "saved";
  }
  if (pinned !== undefined && typeof pinned !== "boolean") throw shopError("bad_request", 400);
  if (patch.kind === "saved") {
    const saved = (await outfits.list(userId)).filter((o) => (o.kind || "saved") === "saved");
    if (saved.length >= 30) throw shopError("outfit_limit", 409, { max: 30 });
  }
  let out = row;
  if (Object.keys(patch).length) out = (await db.one(db.from("shop2_outfits").update(patch).eq("id", outfitId).eq("user_id", userId).select("*").single())) || { ...row, ...patch };
  if (pinned !== undefined) {
    try {
      const res = await db.one(db.from("shop2_outfits").update({ pinned_at: pinned ? new Date().toISOString() : null }).eq("id", outfitId).eq("user_id", userId).select("*").single());
      out = res || { ...out, pinned_at: pinned ? new Date().toISOString() : null };
      memPins.delete(String(outfitId));
    } catch (err) {
      if (!db.isMissingColumn?.(err)) throw err;
      if (!warned) {
        warned = true;
        console.warn("[shop2] shop2_outfits.pinned_at missing (migration 20261122c not applied): pins kept in memory");
      }
      memPins.set(String(outfitId), pinned);
      out = { ...out, pinned_at: null };
    }
  }
  return out;
}

module.exports = { apply, logSingle, history, changesOf, update, pinnedOf, EQUIP_KINDS };
