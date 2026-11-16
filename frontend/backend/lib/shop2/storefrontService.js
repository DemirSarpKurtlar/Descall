"use strict";

/**
 * Daily personal storefront (service): today's row in shop2_storefronts is created on the first
 * read of the Istanbul day and kept stable for the day (a card the user buys stays visible with
 * owned = true). Refresh (once a day, DesCoin or free) and the lock live on the same row.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const people = require("./people");
const actions = require("./actions");
const events = require("./events");
const { generateStorefront } = require("./storefront");
const descoin = require("../descoin");

const LOOKBACK_DAYS = 30;

function shopError(code, status = 400, vars = undefined) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  if (vars) err.vars = vars;
  return err;
}

async function readRow(userId, day) {
  await db.ready();
  return db.one(db.from("shop2_storefronts").select("*").eq("user_id", userId).eq("day", day).maybeSingle());
}

async function recentRows(userId, day, days = LOOKBACK_DAYS) {
  await db.ready();
  const from = time.addDays(day, -days);
  const list = await db.rows(db.from("shop2_storefronts").select("*").eq("user_id", userId).gte("day", from)).catch(() => []);
  return list.filter((r) => r.day < day).sort((a, b) => (a.day < b.day ? 1 : -1));
}

function lastShownFrom(rows) {
  const m = new Map();
  for (const r of rows) {
    const ids = Array.isArray(r.shown) && r.shown.length ? r.shown : (r.slots || []).map((s) => s.itemId);
    for (const id of ids) {
      const k = String(id);
      if (!m.has(k) || m.get(k) < r.day) m.set(k, r.day);
    }
  }
  return m;
}

/** Facts the algorithm needs about the user (owned, wishlist, partial sets, new account). */
async function userFacts(userId, now = Date.now()) {
  const [owned, user, wishlist, cat, rules] = await Promise.all([
    people.ownedIds(userId),
    people.getUser(userId),
    db.rows(db.from("shop2_wishlist").select("item_id").eq("user_id", userId)).catch(() => []),
    catalog.getCatalog(),
    config.activeRules(now),
  ]);
  const setCounts = new Map();
  for (const it of cat.items) {
    if (!it.setKey) continue;
    const c = setCounts.get(it.setKey) || { total: 0, owned: 0 };
    c.total += 1;
    if (owned.has(String(it.id))) c.owned += 1;
    setCounts.set(it.setKey, c);
  }
  const partialSets = [...setCounts.entries()].filter(([, c]) => c.owned > 0 && c.owned < c.total).map(([k]) => k);
  const created = time.ms(user?.created_at);
  const newAccount = created != null && now - created < rules.rules.toggles.newAccountDays * time.DAY_MS;
  return { owned, user, wishlist: new Set(wishlist.map((w) => String(w.item_id))), partialSets, newAccount, catalog: cat, rules, setCounts };
}

function compute(userId, day, facts, { refreshCount = 0, regen = 0, lock = null, shownToday = [], lastShown, rules = null, now }) {
  const rv = rules || facts.rules;
  return generateStorefront({
    userId,
    day,
    ruleVersion: rv.version,
    refreshCount,
    regen,
    pool: facts.catalog.items,
    owned: facts.owned,
    lastShown,
    shownToday,
    wishlist: facts.wishlist,
    partialSets: facts.partialSets,
    lock,
    newAccount: facts.newAccount,
    rules: rv.rules,
    now,
  });
}

/** Streak of consecutive storefront days; every `streakDays` in a row earns a free refresh. */
async function touchStreak(userId, day, limits) {
  const st = await people.getState(userId);
  if (st.last_view_day === day) return st;
  const yesterday = time.addDays(day, -1);
  const streak = st.last_view_day === yesterday ? (Number(st.streak_days) || 0) + 1 : 1;
  const every = limits.refresh.streakDays;
  const reward = every > 0 && streak % every === 0;
  return people.patchState(userId, {
    last_view_day: day,
    streak_days: streak,
    free_refreshes: (Number(st.free_refreshes) || 0) + (reward ? 1 : 0),
    streak_reward_day: reward ? day : st.streak_reward_day || null,
  });
}

/** Today's row, generated on first read. */
async function ensureToday(userId, { now = Date.now() } = {}) {
  const day = time.dayKey(now);
  let row = await readRow(userId, day);
  if (row) return { row, created: false };
  const facts = await userFacts(userId, now);
  const recent = await recentRows(userId, day);
  const sf = compute(userId, day, facts, { lastShown: lastShownFrom(recent), now });
  const fresh = {
    user_id: userId,
    day,
    rule_version: sf.ruleVersion,
    refresh_count: 0,
    regen: 0,
    seed: sf.seed,
    slots: sf.slots,
    shown: sf.slots.map((s) => s.itemId),
    excluded: sf.excluded,
    lock_item_id: null,
    lock_slot: null,
    meta: { relaxed: sf.relaxed, epicFloor: sf.epicFloorApplied, poolSize: sf.poolSize, eligible: sf.eligible },
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  const { data, error } = await db.from("shop2_storefronts").insert(fresh).select("*").single();
  if (error) {
    if (String(error.code) === "23505") return { row: await readRow(userId, day), created: false };
    throw error;
  }
  try {
    await touchStreak(userId, day, await config.getLimits());
  } catch {
    /* streak is a bonus */
  }
  return { row: data || fresh, created: true };
}

/** What a refresh costs this user now. */
async function refreshQuote(userId, row, limits) {
  const used = Number(row?.refresh_count) || 0;
  const st = await people.getState(userId);
  const freeGrants = Number(st.free_refreshes) || 0;
  const plan = limits.refresh.premiumFree ? await people.premiumPlan(userId) : null;
  const perDay = limits.refresh.perDay;
  // The daily refresh (perDay) is paid, free on Descall+. Admin / streak grants are extra free
  // refreshes and are used first; they never use up the daily one.
  const dailyUsed = Number(row?.meta?.dailyUsed ?? used) || 0;
  const daily = dailyUsed < perDay;
  const available = daily || freeGrants > 0;
  let free = null;
  if (freeGrants > 0) free = st.streak_reward_day && st.streak_reward_day >= time.addDays(row?.day || time.dayKey(), -1) ? "streak" : "grant";
  else if (daily && plan) free = "premium";
  const price = free ? 0 : limits.refresh.price;
  return { available, price, free, used, perDay, freeGrants, usedAt: row?.refreshed_at || null, streakDays: Number(st.streak_days) || 0, streakEvery: limits.refresh.streakDays };
}

async function refresh(userId, { keepLockedItemId, idempotencyKey = null, expectedPrice = null, now = Date.now() } = {}) {
  const limits = await config.getLimits();
  return descoin.runSerialized(userId, async () => {
    const { row } = await ensureToday(userId, { now });
    if (idempotencyKey && row.meta?.refreshKey === idempotencyKey) return { row, duplicate: true, paid: row.refresh_paid || 0 };
    const q = await refreshQuote(userId, row, limits);
    if (!q.available) throw shopError("refresh_used", 409);
    if (expectedPrice != null && Number.isFinite(Number(expectedPrice)) && q.price > Number(expectedPrice)) throw shopError("price_changed", 409, { price: q.price });
    const current = new Set((row.slots || []).map((s) => String(s.itemId)));
    let lockId = keepLockedItemId === undefined ? row.lock_item_id : keepLockedItemId;
    if (lockId && !current.has(String(lockId))) throw shopError("lock_not_in_storefront", 400);
    const lockSlot = lockId ? (row.slots || []).find((s) => String(s.itemId) === String(lockId))?.slot || 1 : null;
    const facts = await userFacts(userId, now);
    const recent = await recentRows(userId, row.day);
    const sf = compute(userId, row.day, facts, {
      refreshCount: (Number(row.refresh_count) || 0) + 1,
      regen: Number(row.regen) || 0,
      lock: lockId ? { itemId: lockId, slot: lockSlot } : null,
      shownToday: [...(row.shown || []), ...current].filter((id) => String(id) !== String(lockId)),
      lastShown: lastShownFrom(recent),
      now,
    });
    let balance = null;
    if (q.price > 0) {
      try {
        balance = (await descoin.debit(userId, q.price, "shop_purchase", { shop2: "refresh", day: row.day })).balance;
      } catch (err) {
        if (err.message === "INSUFFICIENT_BALANCE") throw shopError("insufficient_balance", 402);
        if (err.code === "WALLET_FROZEN") throw shopError("wallet_frozen", 403);
        throw err;
      }
    } else if (q.free === "streak" || q.free === "grant") {
      await people.patchState(userId, { free_refreshes: Math.max(0, q.freeGrants - 1) });
    }
    const shown = [...new Set([...(row.shown || []), ...sf.slots.map((s) => s.itemId)].map(String))];
    const patch = {
      rule_version: sf.ruleVersion,
      refresh_count: (Number(row.refresh_count) || 0) + 1,
      seed: sf.seed,
      slots: sf.slots,
      shown,
      excluded: sf.excluded,
      lock_item_id: lockId || null,
      lock_slot: lockId ? lockSlot : null,
      refreshed_at: new Date(now).toISOString(),
      refresh_paid: q.price,
      meta: { ...(row.meta || {}), dailyUsed: (Number(row.meta?.dailyUsed ?? row.refresh_count) || 0) + (q.free === "grant" || q.free === "streak" ? 0 : 1), refreshKey: idempotencyKey || null, relaxed: sf.relaxed, epicFloor: sf.epicFloorApplied, previousSlots: row.slots },
      updated_at: new Date(now).toISOString(),
    };
    const [updated] = await db.rows(db.from("shop2_storefronts").update(patch).eq("user_id", userId).eq("day", row.day).select("*"));
    await actions.log(userId, "refresh", { day: row.day, paid: q.price, free: q.free, kept: lockId || null });
    events.toUser(userId, "shop2:storefront", { reason: "refresh", day: row.day });
    return { row: updated || { ...row, ...patch }, paid: q.price, free: q.free, balance };
  });
}

async function setLock(userId, itemId, { now = Date.now() } = {}) {
  const rules = await config.activeRules(now);
  if (!rules.rules.toggles.lockEnabled) throw shopError("lock_disabled", 409);
  const { row } = await ensureToday(userId, { now });
  const prev = row.lock_item_id || null;
  let slot = null;
  if (itemId) {
    const s = (row.slots || []).find((x) => String(x.itemId) === String(itemId));
    if (!s) throw shopError("lock_not_in_storefront", 400);
    slot = s.slot;
  }
  await db.rows(db.from("shop2_storefronts").update({ lock_item_id: itemId || null, lock_slot: slot, updated_at: new Date(now).toISOString() }).eq("user_id", userId).eq("day", row.day).select("user_id"));
  const limits = await config.getLimits();
  await actions.log(userId, itemId ? "lock" : "unlock", { itemId: itemId || null, previous: prev, day: row.day }, { undo: { type: "lock", itemId: prev, day: row.day }, undoMinutes: limits.purchases.actionUndoMinutes });
  return { lock: itemId ? { itemId, slot } : null, previous: prev };
}

/** Admin: give a free refresh. */
async function grantFreeRefresh(userId, n = 1) {
  const st = await people.getState(userId);
  return people.patchState(userId, { free_refreshes: (Number(st.free_refreshes) || 0) + n });
}

/** Admin: regenerate today's storefront with a new seed (bumps `regen`). */
async function regenerate(userId, { now = Date.now() } = {}) {
  const { row } = await ensureToday(userId, { now });
  const facts = await userFacts(userId, now);
  const recent = await recentRows(userId, row.day);
  const regen = (Number(row.regen) || 0) + 1;
  const sf = compute(userId, row.day, facts, { refreshCount: Number(row.refresh_count) || 0, regen, lastShown: lastShownFrom(recent), now });
  const patch = { regen, seed: sf.seed, slots: sf.slots, rule_version: sf.ruleVersion, shown: [...new Set([...(row.shown || []), ...sf.slots.map((s) => s.itemId)].map(String))], excluded: sf.excluded, lock_item_id: null, lock_slot: null, updated_at: new Date(now).toISOString() };
  const [updated] = await db.rows(db.from("shop2_storefronts").update(patch).eq("user_id", userId).eq("day", row.day).select("*"));
  events.toUser(userId, "shop2:storefront", { reason: "regenerated", day: row.day });
  return updated || { ...row, ...patch };
}

/**
 * Preview without writing anything: today = the stored row (or what it would be), tomorrow =
 * the storefront the user will get at 00:00 under the rules in force then.
 */
async function preview(userId, which = "today", { now = Date.now() } = {}) {
  const today = time.dayKey(now);
  const facts = await userFacts(userId, now);
  if (which === "tomorrow") {
    const day = time.addDays(today, 1);
    const rules = await config.activeRules(time.dayStartMs(day) + 1000);
    const recent = await recentRows(userId, day);
    const sf = compute(userId, day, facts, { lastShown: lastShownFrom(recent), rules, now: time.dayStartMs(day) + 1000 });
    return { day, stored: false, storefront: sf, rules, facts };
  }
  const row = await readRow(userId, today);
  if (row) {
    return { day: today, stored: true, row, storefront: { seed: row.seed, ruleVersion: row.rule_version, refreshCount: row.refresh_count, slots: row.slots || [], excluded: row.excluded || {}, relaxed: row.meta?.relaxed || [], epicFloorApplied: Boolean(row.meta?.epicFloor) }, rules: facts.rules, facts };
  }
  const recent = await recentRows(userId, today);
  const sf = compute(userId, today, facts, { lastShown: lastShownFrom(recent), now });
  return { day: today, stored: false, storefront: sf, rules: facts.rules, facts };
}

module.exports = { shopError, readRow, recentRows, lastShownFrom, userFacts, compute, ensureToday, refreshQuote, refresh, setLock, grantFreeRefresh, regenerate, preview, touchStreak };
