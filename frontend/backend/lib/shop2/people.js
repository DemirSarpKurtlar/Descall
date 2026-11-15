"use strict";

/**
 * Per-user facts the shop needs: account row, owned items, equipped look (snapshot / restore),
 * friendship + blocks, Descall+ plan, and the shop2_user_state row (free refreshes, streak,
 * gift privacy, night market notification).
 */

const db = require("./db");
const shop = require("../shop");

const USER_COLS = "id, username, display_name, avatar_url, created_at";

async function getUser(userId) {
  const client = db.real();
  let res = await client.from("users").select(USER_COLS).eq("id", userId).maybeSingle();
  if (res.error && db.isMissingColumn(res.error)) res = await client.from("users").select("id, username, created_at").eq("id", userId).maybeSingle();
  if (res.error) throw res.error;
  return res.data || null;
}

async function getUsers(ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!list.length) return new Map();
  const client = db.real();
  let res = await client.from("users").select(USER_COLS).in("id", list);
  if (res.error && db.isMissingColumn(res.error)) res = await client.from("users").select("id, username, created_at").in("id", list);
  if (res.error) throw res.error;
  return new Map((res.data || []).map((u) => [String(u.id), u]));
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.display_name || null, avatarUrl: u.avatar_url || null };
}

/** Inventory rows of the user (item_id, acquired_via, acquired_at, gifted_by). */
async function inventory(userId) {
  return db.rows(db.real().from("user_inventory").select("id, item_id, acquired_via, gifted_by, acquired_at").eq("user_id", userId));
}

async function ownedIds(userId) {
  return new Set((await inventory(userId)).map((r) => String(r.item_id)));
}

/* ---------------------------------------------------------------- equipped look */

function equipColumns() {
  const out = {};
  for (const [cat, col] of Object.entries(shop.EQUIP_COLUMN_BY_CATEGORY)) {
    if (shop.RETIRED_SHOP_CATEGORIES.has(cat) && cat !== "avatar_frame" && cat !== "profile_badge") continue;
    out[cat] = col;
  }
  return out;
}

/** { category: itemId|null } for every equip slot the users table has. */
async function equippedSnapshot(userId) {
  let cols = equipColumns();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const list = Object.values(cols);
    if (!list.length) return {};
    const { data, error } = await db.real().from("users").select(list.join(", ")).eq("id", userId).maybeSingle();
    if (!error) {
      const out = {};
      for (const [cat, col] of Object.entries(cols)) out[cat] = data?.[col] ?? null;
      return out;
    }
    const m = /column (?:users\.)?"?([a-z_]+)"? does not exist|'([a-z_]+)' column/i.exec(String(error.message || ""));
    const bad = m && (m[1] || m[2]);
    if (!bad) throw error;
    cols = Object.fromEntries(Object.entries(cols).filter(([, c]) => c !== bad));
  }
  return {};
}

/** Equip `look` ({ category: itemId|null }). Only items the user owns; unknown slots ignored. */
async function applyLook(userId, look, { owned = null } = {}) {
  const have = owned || (await ownedIds(userId));
  const cols = equipColumns();
  const applied = {};
  for (const [cat, itemId] of Object.entries(look || {})) {
    if (!cols[cat]) continue;
    if (itemId && !have.has(String(itemId))) continue;
    try {
      await shop.equipItem(userId, cat, itemId || null);
      applied[cat] = itemId || null;
    } catch (err) {
      console.warn(`[shop2] equip ${cat} failed:`, err?.message || err);
    }
  }
  return applied;
}

async function broadcastProfile(io, userId) {
  if (!io) return;
  try {
    await require("../userProfile").broadcastUserProfileUpdate(io, userId);
  } catch {
    /* best effort */
  }
}

/* ---------------------------------------------------------------- relations */

async function isFriend(a, b) {
  try {
    return await require("../dmMessages").isAcceptedFriend(a, b);
  } catch {
    return false;
  }
}

async function friendIds(userId) {
  try {
    return await require("../dmMessages").listAcceptedFriendIds(userId);
  } catch {
    return [];
  }
}

async function blockedEitherWay(a, b) {
  try {
    return await require("../blocking").isBlockedEitherWay(a, b);
  } catch {
    return false;
  }
}

async function premiumPlan(userId) {
  try {
    return await require("../premium/entitlements").planFor(userId);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- shop2_user_state */

const STATE_DEFAULTS = { free_refreshes: 0, streak_days: 0, last_view_day: null, gift_privacy: "friends", notify_night: false };

async function getState(userId) {
  await db.ready();
  const row = await db.one(db.from("shop2_user_state").select("*").eq("user_id", userId).maybeSingle()).catch(() => null);
  return { user_id: userId, ...STATE_DEFAULTS, ...(row || {}) };
}

async function patchState(userId, patch) {
  await db.ready();
  const cur = await getState(userId);
  const next = { ...cur, ...patch, user_id: userId, updated_at: new Date().toISOString() };
  delete next.id;
  delete next.created_at;
  await db.one(db.from("shop2_user_state").upsert(next, { onConflict: "user_id" }).select("*").maybeSingle());
  return next;
}

module.exports = { getUser, getUsers, publicUser, inventory, ownedIds, equipColumns, equippedSnapshot, applyLook, broadcastProfile, isFriend, friendIds, blockedEitherWay, premiumPlan, getState, patchState };
