"use strict";

/**
 * Market 2.0 admin operations: rule versions (+ simulate, schedule at 00:00, activate /
 * rollback), night market scheduler (+ open now with 5-minute undo, skip, past nights), limits
 * (+ "what if yesterday" impact, gift freeze, ring flags), two-week timeline with clash
 * detection, the scheduled change queue, timeline events, audit trail.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const events = require("./events");
const night = require("./night");
const people = require("./people");
const { simulate } = require("./simulate");
const { normalizeRules, diff } = require("./rules");
const { detectClashes, setLifecycle } = require("./timeline");
const { deckFor, discountDistribution } = require("./nightMarket");
const { impactOf } = require("./giftRules");
const { shopError } = require("./storefrontService");
const { RARITY_RANK } = require("./rules");

const NIGHT_UNDO_MS = 5 * time.MIN_MS;
const LIMITS_UNDO_MS = 10 * time.MIN_MS;

function bad(code, status = 400) {
  return shopError(code, status);
}

function reasonOf(v, min = 3) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min) throw bad("reason_required");
  return s.slice(0, 300);
}

/* ---------------------------------------------------------------- queue */

async function enqueue(kind, ref, payload, { runAt, actorId = null } = {}) {
  await db.ready();
  const row = { kind, ref: String(ref), payload: payload || {}, run_at: time.iso(runAt), status: "pending", created_by: actorId, created_at: time.iso(Date.now()) };
  return db.one(db.from("shop2_queue").insert(row).select("*").single()).catch(() => row);
}

async function cancelQueued(kind, ref) {
  await db.ready();
  await db.rows(db.from("shop2_queue").update({ status: "cancelled", done_at: time.iso(Date.now()) }).eq("kind", kind).eq("ref", String(ref)).eq("status", "pending").select("id")).catch(() => []);
}

async function listQueue({ now = Date.now() } = {}) {
  await db.ready();
  const list = await db.rows(db.from("shop2_queue").select("*").eq("status", "pending").order("run_at", { ascending: true })).catch(() => []);
  return list.map((q) => ({ id: q.id, kind: q.kind, ref: q.ref, payload: q.payload || {}, runAt: q.run_at, inSec: Math.max(0, Math.round((time.ms(q.run_at) - now) / 1000)), createdBy: q.created_by || null, createdAt: q.created_at }));
}

async function cancelQueueItem(id, { actorId } = {}) {
  await db.ready();
  const [row] = await db.rows(db.from("shop2_queue").update({ status: "cancelled", done_at: time.iso(Date.now()), cancelled_by: actorId || null }).eq("id", id).eq("status", "pending").select("*"));
  if (!row) throw bad("not_found", 404);
  // Cancelling a scheduled rule / publish also reverts its target.
  if (row.kind === "rule_apply") await config.updateVersion(Number(row.ref), { status: "draft", apply_at: null });
  if (row.kind === "set_publish") await db.rows(db.from("shop2_sets").update({ status: "draft" }).eq("set_key", row.ref).eq("status", "scheduled").select("set_key")).catch(() => []);
  catalog.invalidate();
  return row;
}

/** Scheduler: run due queue items. */
async function runDue({ now = Date.now() } = {}) {
  await db.ready();
  const due = await db.rows(db.from("shop2_queue").select("*").eq("status", "pending").lte("run_at", time.iso(now)).limit(50)).catch(() => []);
  const done = [];
  for (const q of due) {
    const [claimed] = await db.rows(db.from("shop2_queue").update({ status: "running" }).eq("id", q.id).eq("status", "pending").select("*"));
    if (!claimed) continue;
    let status = "done";
    let error = null;
    try {
      if (q.kind === "rule_apply") {
        await activateMark(Number(q.ref), time.ms(q.run_at));
        events.toAll("shop2:storefront", { reason: "rules", version: Number(q.ref) });
      } else if (q.kind === "set_publish") {
        await db.rows(db.from("shop2_sets").update({ status: "live" }).eq("set_key", q.ref).eq("status", "scheduled").select("set_key"));
        catalog.invalidate();
        events.toAll("shop2:storefront", { reason: "set_published", setKey: q.ref });
      } else if (q.kind === "recall_finalize") {
        await require("./admin").finalizeRecall(q.ref, { now });
      } else if (q.kind === "limits_undo_close") {
        /* marker only */
      }
    } catch (err) {
      status = "failed";
      error = String(err?.message || err).slice(0, 300);
    }
    await db.rows(db.from("shop2_queue").update({ status, error, done_at: time.iso(now) }).eq("id", q.id).select("id"));
    done.push({ id: q.id, kind: q.kind, status });
  }
  return done;
}

/* ---------------------------------------------------------------- rule versions */

async function rulesOverview({ now = Date.now() } = {}) {
  const list = await config.listVersions({ fresh: true });
  const active = config.activeAt(list, now);
  const all = [config.builtIn(), ...list];
  const out = all.map((v, i) => {
    const prev = v.basedOn != null ? all.find((x) => x.version === v.basedOn) : all[i - 1] || null;
    const changes = prev ? diff(prev.rules, v.rules) : [];
    return { version: v.version, status: v.version === active.version ? "active" : v.status === "active" ? "archived" : v.status, note: v.note, applyAt: v.applyAt, appliedAt: v.appliedAt, createdAt: v.createdAt, createdBy: v.createdBy, basedOn: v.basedOn, builtIn: v.builtIn, changeCount: changes.length };
  });
  return { active: active.version, activeRules: active.rules, tomorrow: config.activeAt(list, time.nextMidnightMs(now) + 1000).version, versions: out.reverse() };
}

async function getRuleVersion(version) {
  const v = await config.getVersion(version);
  if (!v) throw bad("not_found", 404);
  const list = await config.listVersions();
  const prev = v.basedOn != null ? await config.getVersion(v.basedOn) : [config.builtIn(), ...list].filter((x) => x.version < v.version).pop() || null;
  return { ...v, changes: prev ? diff(prev.rules, v.rules) : [], previous: prev ? prev.version : null };
}

async function createRuleVersion(body, { actorId } = {}) {
  const base = body?.basedOn != null ? await config.getVersion(body.basedOn) : await config.activeRules();
  const merged = mergeRules(base ? base.rules : {}, body?.rules || body || {});
  return config.createVersion({ rules: merged, note: body?.note, basedOn: base ? base.version : null, actorId });
}

function mergeRules(baseRules, patch) {
  const b = normalizeRules(baseRules || {});
  const p = patch || {};
  return normalizeRules({
    weights: { ...b.weights, ...(p.weights || {}), rarity: { ...b.weights.rarity, ...(p.weights?.rarity || {}) }, category: { ...b.weights.category, ...(p.weights?.category || {}) } },
    bands: Array.isArray(p.bands) && p.bands.length === 4 ? p.bands : b.bands,
    toggles: { ...b.toggles, ...(p.toggles || {}) },
  });
}

async function simulateRules(body, { now = Date.now() } = {}) {
  const cat = await catalog.getCatalog();
  const active = await config.activeRules(now);
  let rules;
  let version;
  if (body?.version != null) {
    const v = await config.getVersion(body.version);
    if (!v) throw bad("not_found", 404);
    rules = v.rules;
    version = v.version;
  } else {
    rules = mergeRules(active.rules, body?.rules || {});
    version = "unsaved";
  }
  const day = time.addDays(time.dayKey(now), 1);
  const result = await simulate({ rules, pool: cat.items.filter(catalog.sellable), sample: body?.sample || 10_000, day, ruleVersion: typeof version === "number" ? version : 999, baseline: active.rules });
  return { version, comparedTo: active.version, day, changes: diff(active.rules, rules), ...result };
}

/** Schedule a version for the next 00:00 Istanbul (or `at`). */
async function scheduleRuleVersion(version, { at = null, actorId, now = Date.now() } = {}) {
  const v = await config.getVersion(version);
  if (!v || v.builtIn) throw bad("not_found", 404);
  const runAt = at ? time.ms(at) : time.nextMidnightMs(now);
  if (runAt == null || runAt <= now) throw bad("bad_time");
  await cancelQueued("rule_apply", v.version);
  const updated = await config.updateVersion(v.version, { status: "scheduled", apply_at: time.iso(runAt) });
  await enqueue("rule_apply", v.version, { at: time.iso(runAt) }, { runAt, actorId });
  return updated;
}

async function activateMark(version, at = Date.now()) {
  const list = await config.listVersions({ fresh: true });
  for (const v of list) if (v.status === "active" && v.version !== version) await config.updateVersion(v.version, { status: "archived" });
  return config.updateVersion(version, { status: "active", applied_at: time.iso(at), apply_at: null });
}

/** Activate now (rollback = activate an older version). Version 0 = built-in default. */
async function activateRuleVersion(version, { now = Date.now() } = {}) {
  const n = Number(version);
  if (n === 0) {
    const list = await config.listVersions({ fresh: true });
    for (const v of list) if (["active", "scheduled"].includes(v.status)) await config.updateVersion(v.version, { status: "archived", apply_at: null });
    events.toAll("shop2:storefront", { reason: "rules", version: 0 });
    return config.builtIn();
  }
  const v = await config.getVersion(n);
  if (!v) throw bad("not_found", 404);
  await cancelQueued("rule_apply", n);
  const out = await activateMark(n, now);
  events.toAll("shop2:storefront", { reason: "rules", version: n });
  return out;
}

async function cancelRuleSchedule(version) {
  const v = await config.getVersion(version);
  if (!v || v.status !== "scheduled") throw bad("not_scheduled", 409);
  await cancelQueued("rule_apply", v.version);
  return config.updateVersion(v.version, { status: "draft", apply_at: null });
}

/* ---------------------------------------------------------------- night markets */

async function eligibleCount(rule) {
  const r = rule || {};
  try {
    let q = db.real().from("users").select("id", { count: "exact", head: true });
    if (r.minAccountDays) q = q.lte("created_at", time.iso(Date.now() - Number(r.minAccountDays) * time.DAY_MS));
    const { count } = await q;
    return count ?? null;
  } catch {
    return null;
  }
}

async function pastNights({ now = Date.now(), limit = 8 } = {}) {
  const list = (await night.nights(now - 60 * time.DAY_MS, now)).filter((n) => time.ms(n.endsAt) <= now && !["skipped", "cancelled"].includes(n.status));
  const recent = list.slice(-limit).reverse();
  const out = [];
  for (const n of recent) out.push({ id: n.id, startsAt: n.startsAt, endsAt: n.endsAt, auto: Boolean(n.auto), report: await night.report(n.id) });
  return out;
}

async function forecastFor(past, cfg) {
  if (!past.length) return { participants: null, revenue: null, flips: null, basis: 0 };
  const avg = (k) => Math.round(past.reduce((a, p) => a + (p.report[k] || 0), 0) / past.length);
  const hours = Number(cfg?.durationHours) || 4;
  const scale = hours / 4;
  return { participants: Math.round(avg("participants") * scale), revenue: Math.round(avg("revenue") * scale), flips: Math.round(avg("flips") * scale), purchases: Math.round(avg("purchases") * scale), basis: past.length };
}

async function nightsOverview({ from = null, days = 21, now = Date.now() } = {}) {
  const start = from ? time.dayStartMs(from) : time.dayStartMs(time.dayKey(now));
  const list = await night.nights(start, start + days * time.DAY_MS);
  const limits = await config.getLimits();
  const past = await pastNights({ now });
  const cur = await night.current(now);
  const forecast = await forecastFor(past, limits.nightMarket);
  return {
    defaults: limits.nightMarket,
    open: cur.open ? { ...cur.open, undoable: Boolean(cur.open.undoUntil && time.ms(cur.open.undoUntil) > now) } : null,
    upcoming: list.filter((n) => time.ms(n.endsAt) > now),
    past,
    distribution: discountDistribution({ discountMin: limits.nightMarket.discountMin, discountMax: limits.nightMarket.discountMax, skew: limits.nightMarket.skew }),
    eligibleUsers: await eligibleCount(null),
    forecast,
  };
}

function nightRow(body, base = {}, now = Date.now()) {
  const mode = ["scheduled", "random", "manual"].includes(body?.mode) ? body.mode : base.mode || "scheduled";
  let startMs = body?.startsAt ? time.ms(body.startsAt) : time.ms(base.starts_at);
  const hours = body?.durationHours != null ? Number(body.durationHours) : null;
  let endMs = body?.endsAt ? time.ms(body.endsAt) : hours && startMs != null ? startMs + hours * time.HOUR_MS : time.ms(base.ends_at);
  if (mode === "random" && body?.windowStart && body?.windowEnd) {
    // Random opening inside [windowStart, windowEnd - duration], stable for the same inputs.
    const ws = time.ms(body.windowStart);
    const we = time.ms(body.windowEnd);
    const dur = (hours || 4) * time.HOUR_MS;
    if (ws == null || we == null || we - ws < dur) throw bad("bad_window");
    const r = require("./rng").hash01("shop2-night-random", body.windowStart, body.windowEnd, hours);
    startMs = ws + Math.floor(((we - dur - ws) * r) / time.HOUR_MS) * time.HOUR_MS;
    endMs = startMs + dur;
  }
  if (startMs == null || endMs == null || endMs <= startMs) throw bad("bad_window");
  if (endMs - startMs > 12 * time.HOUR_MS) throw bad("bad_window");
  const num = (v, d, lo, hi) => (v == null ? d : Math.min(hi, Math.max(lo, Math.round(Number(v)))));
  const elig = body?.eligibility && typeof body.eligibility === "object" ? { minAccountDays: body.eligibility.minAccountDays ? num(body.eligibility.minAccountDays, 0, 0, 3650) : undefined, premiumOnly: body.eligibility.premiumOnly === true || undefined } : base.eligibility || null;
  return {
    mode,
    status: base.status || "scheduled",
    starts_at: time.iso(startMs),
    ends_at: time.iso(endMs),
    cards: num(body?.cards, base.cards ?? null, 1, 12),
    flips: num(body?.flips, base.flips ?? null, 1, 12),
    discount_min: num(body?.discountMin, base.discount_min ?? null, 5, 90),
    discount_max: num(body?.discountMax, base.discount_max ?? null, 5, 90),
    skew: body?.skew != null ? Math.min(6, Math.max(0.5, Number(body.skew) || 2.2)) : base.skew ?? null,
    eligibility: elig ? JSON.parse(JSON.stringify(elig)) : null,
    note: body?.note !== undefined ? (body.note ? String(body.note).slice(0, 300) : null) : base.note || null,
    updated_at: time.iso(now),
  };
}

async function createNight(body, { actorId, now = Date.now() } = {}) {
  await db.ready();
  const row = { ...nightRow(body, {}, now), created_by: actorId || null, created_at: time.iso(now) };
  if (time.ms(row.ends_at) <= now) throw bad("bad_window");
  return night.fromRow(await db.one(db.from("shop2_night_markets").insert(row).select("*").single()));
}

/** Update a row, or override a default ("auto-YYYY-MM-DD") night with a real row. */
async function updateNight(id, body, { actorId, now = Date.now() } = {}) {
  await db.ready();
  if (String(id).startsWith("auto-")) {
    const def = (await night.nights(now - time.DAY_MS, now + 60 * time.DAY_MS)).find((n) => n.id === id);
    if (!def) throw bad("not_found", 404);
    const row = { ...nightRow(body, { starts_at: def.startsAt, ends_at: def.endsAt }, now), overrides: id, created_by: actorId || null, created_at: time.iso(now) };
    return night.fromRow(await db.one(db.from("shop2_night_markets").insert(row).select("*").single()));
  }
  const cur = await db.one(db.from("shop2_night_markets").select("*").eq("id", id).maybeSingle());
  if (!cur) throw bad("not_found", 404);
  const [saved] = await db.rows(db.from("shop2_night_markets").update(nightRow(body, cur, now)).eq("id", id).select("*"));
  return night.fromRow(saved);
}

async function setNightStatus(id, status, { actorId, now = Date.now() } = {}) {
  await db.ready();
  if (String(id).startsWith("auto-")) {
    const def = (await night.nights(now - time.DAY_MS, now + 60 * time.DAY_MS)).find((n) => n.id === id);
    if (!def) throw bad("not_found", 404);
    const row = { mode: "scheduled", status, starts_at: def.startsAt, ends_at: def.endsAt, overrides: id, created_by: actorId || null, created_at: time.iso(now) };
    return night.fromRow(await db.one(db.from("shop2_night_markets").insert(row).select("*").single()));
  }
  const [saved] = await db.rows(db.from("shop2_night_markets").update({ status, updated_at: time.iso(now) }).eq("id", id).select("*"));
  if (!saved) throw bad("not_found", 404);
  return night.fromRow(saved);
}

/** Open a night market right now (manual). Undo within 5 minutes cancels it. */
async function openNow(body, { actorId, now = Date.now() } = {}) {
  reasonOf(body?.reason);
  const cur = await night.current(now);
  if (cur.open) throw bad("night_open", 409);
  const hours = Math.min(12, Math.max(1, Number(body?.durationHours) || 2));
  const row = { ...nightRow({ ...body, mode: "manual", startsAt: time.iso(now), endsAt: time.iso(now + hours * time.HOUR_MS) }, {}, now), status: "open", undo_until: time.iso(now + NIGHT_UNDO_MS), note: String(body.reason).trim().slice(0, 300), created_by: actorId || null, created_at: time.iso(now) };
  await db.ready();
  const saved = await db.one(db.from("shop2_night_markets").insert(row).select("*").single());
  events.toAll("shop2:storefront", { reason: "night_open", nightId: saved?.id });
  return { night: night.fromRow(saved), undoUntil: row.undo_until };
}

async function undoOpen(id, { now = Date.now() } = {}) {
  await db.ready();
  const cur = await db.one(db.from("shop2_night_markets").select("*").eq("id", id).maybeSingle());
  if (!cur || !cur.undo_until || time.ms(cur.undo_until) < now) throw bad("undo_expired", 409);
  const [saved] = await db.rows(db.from("shop2_night_markets").update({ status: "cancelled", ends_at: time.iso(now), undo_until: null }).eq("id", id).select("*"));
  events.toAll("shop2:storefront", { reason: "night_closed", nightId: id });
  return night.fromRow(saved);
}

async function deleteNight(id) {
  await db.ready();
  const cur = await db.one(db.from("shop2_night_markets").select("*").eq("id", id).maybeSingle());
  if (!cur) throw bad("not_found", 404);
  if (time.ms(cur.starts_at) <= Date.now()) throw bad("night_started", 409);
  await db.rows(db.from("shop2_night_markets").delete().eq("id", id).select("id"));
  return { ok: true };
}

/** Flip preview: the deck a user (or a sample user) would get with these settings. */
async function previewNight(body, { now = Date.now(), base = "" } = {}) {
  const limits = await config.getLimits();
  const cat = await catalog.getCatalog();
  const userId = body?.userId || "preview-user";
  const owned = body?.userId ? await people.ownedIds(body.userId) : new Set();
  const n = { id: body?.nightId || `preview-${time.dayKey(now)}`, cards: body?.cards ?? limits.nightMarket.cards, discountMin: body?.discountMin ?? limits.nightMarket.discountMin, discountMax: body?.discountMax ?? limits.nightMarket.discountMax, skew: body?.skew ?? limits.nightMarket.skew };
  const d = deckFor({ userId, night: n, pool: cat.items.filter(catalog.sellable), owned });
  return {
    seed: d.seed,
    cards: d.cards.map((c) => ({ ...c, item: catalog.publicItem(cat.byId.get(String(c.itemId)), base) })),
    distribution: discountDistribution({ discountMin: n.discountMin, discountMax: n.discountMax, skew: n.skew }),
    eligibleUsers: await eligibleCount(body?.eligibility || null),
  };
}

/* ---------------------------------------------------------------- limits */

async function limitsOverview({ now = Date.now() } = {}) {
  const info = await config.getLimitsInfo();
  const t0 = time.iso(time.dayStartMs(time.dayKey(now)));
  const [gifts, refreshes, flags] = await Promise.all([
    db.rows(db.from("shop2_gifts").select("id, status, meta, created_at").gte("created_at", t0)).catch(() => []),
    db.rows(db.from("shop2_storefronts").select("user_id, refresh_paid").eq("day", time.dayKey(now)).gte("refreshed_at", t0)).catch(() => []),
    listFlags({ status: "open" }),
  ]);
  const blocked = gifts.filter((g) => g.status === "blocked");
  const byCode = {};
  for (const g of blocked) byCode[g.meta?.code || "other"] = (byCode[g.meta?.code || "other"] || 0) + 1;
  const undo = info.updatedAt && now - time.ms(info.updatedAt) < LIMITS_UNDO_MS && info.prev ? { until: time.iso(time.ms(info.updatedAt) + LIMITS_UNDO_MS) } : null;
  return {
    ...info,
    undo,
    usage: { giftsToday: gifts.filter((g) => !["blocked", "recalled"].includes(g.status)).length, blockedToday: blocked.length, blockedByCode: byCode, refreshesToday: refreshes.length, refreshRevenueToday: refreshes.reduce((a, r) => a + (Number(r.refresh_paid) || 0), 0) },
    openFlags: flags.length,
    // What a blocked sender sees (the UI renders the localized message for these codes).
    blockedMessages: ["gift_daily_cap", "gift_recipient_cap", "gift_receive_cap", "gift_new_account", "gift_new_account_set"].map((code) => ({ code, vars: code === "gift_new_account" ? { days: info.limits.gifts.minAccountDaysSend } : code === "gift_new_account_set" ? { days: info.limits.gifts.minAccountDaysSetBuy } : { max: code === "gift_daily_cap" ? info.limits.gifts.perDay : code === "gift_recipient_cap" ? info.limits.gifts.perRecipientDay : info.limits.gifts.receivePerDay } })),
  };
}

async function putLimits(body, { actorId, now = Date.now() } = {}) {
  const reason = reasonOf(body?.reason);
  const patch = body?.limits || body || {};
  const out = await config.setLimits(patch, { actorId, reason, now });
  return { ...out, undoUntil: time.iso(now + LIMITS_UNDO_MS) };
}

/** Restore the previous limits (10 minutes after a change). */
async function undoLimits({ actorId, now = Date.now() } = {}) {
  const info = await config.getLimitsInfo();
  if (!info.prev || !info.updatedAt || now - time.ms(info.updatedAt) > LIMITS_UNDO_MS) throw bad("undo_expired", 409);
  return config.setLimits(info.prev, { actorId, reason: "undo" });
}

/** "What if yesterday": gifts of yesterday under current vs proposed gift limits. */
async function limitsImpact(body, { now = Date.now() } = {}) {
  const info = await config.getLimitsInfo();
  const proposed = { ...info.limits.gifts, ...(body?.gifts || {}) };
  const y = time.addDays(time.dayKey(now), -1);
  const t0 = time.dayStartMs(y);
  const list = await db.rows(db.from("shop2_gifts").select("*").gte("created_at", time.iso(t0)).lt("created_at", time.iso(t0 + time.DAY_MS))).catch(() => []);
  const real = list.filter((g) => g.status !== "blocked");
  const usersById = await people.getUsers(real.map((g) => g.from_user)).catch(() => new Map());
  const edges = real.map((g) => ({ from: g.from_user, to: g.to_user, at: g.created_at, amount: Number(g.amount) || 0, kind: g.kind }));
  const current = impactOf(edges, { ...info.limits.gifts, enabled: true, frozen: false }, { usersById });
  const next = impactOf(edges, { ...proposed, enabled: true, frozen: false }, { usersById });
  return { day: y, gifts: real.length, current, proposed: next, delta: { blocked: next.blocked - current.blocked, blockedAmount: next.blockedAmount - current.blockedAmount } };
}

async function freezeGifts(frozen, { reason, actorId } = {}) {
  const why = reasonOf(reason);
  return config.setLimits({ gifts: { frozen: Boolean(frozen) } }, { actorId, reason: why });
}

async function listFlags({ status = null } = {}) {
  await db.ready();
  let q = db.from("shop2_gift_flags").select("*");
  if (status) q = q.eq("status", status);
  const list = await db.rows(q.order("created_at", { ascending: false }).limit(100)).catch(() => []);
  return list;
}

async function flagsView() {
  const list = await listFlags();
  const ids = [...new Set(list.flatMap((f) => f.users || []))];
  const users = await people.getUsers(ids).catch(() => new Map());
  // Edges among flagged users in the window, for the ring drawing.
  const limits = await config.getLimits();
  const since = time.iso(Date.now() - limits.gifts.ringWindowDays * time.DAY_MS);
  const gifts = await db.rows(db.from("shop2_gifts").select("id, from_user, to_user, amount, created_at, status").gte("created_at", since)).catch(() => []);
  return {
    flags: list.map((f) => {
      const set = new Set(f.users || []);
      return {
        id: f.id,
        giftId: f.gift_id,
        kind: f.kind,
        status: f.status,
        amount: Number(f.amount) || 0,
        createdAt: f.created_at,
        users: (f.users || []).map((id) => people.publicUser(users.get(String(id))) || { id }),
        edges: gifts.filter((g) => set.has(g.from_user) && set.has(g.to_user) && g.status !== "blocked").map((g) => ({ from: g.from_user, to: g.to_user, amount: Number(g.amount) || 0, at: g.created_at })),
        resolution: f.resolution || null,
      };
    }),
  };
}

/** dismiss | freeze (freeze the wallets of everyone in the ring). */
async function resolveFlag(id, action, { reason, actorId, now = Date.now() } = {}) {
  const why = reasonOf(reason);
  await db.ready();
  const f = await db.one(db.from("shop2_gift_flags").select("*").eq("id", id).maybeSingle());
  if (!f) throw bad("not_found", 404);
  if (!["dismiss", "freeze"].includes(action)) throw bad("bad_option");
  if (action === "freeze") {
    const descoin = require("../descoin");
    for (const u of f.users || []) await descoin.setWalletFrozen(u, true).catch(() => null);
  }
  const [saved] = await db.rows(db.from("shop2_gift_flags").update({ status: action === "freeze" ? "frozen" : "dismissed", resolution: { action, reason: why, by: actorId || null, at: time.iso(now) } }).eq("id", id).select("*"));
  return saved;
}

/* ---------------------------------------------------------------- timeline */

async function timeline({ from = null, days = 14, now = Date.now(), lite = false } = {}) {
  const start = from || time.dayKey(now);
  const n = Math.min(31, Math.max(1, Number(days) || 14));
  const t0 = time.dayStartMs(start);
  const t1 = t0 + n * time.DAY_MS;
  const [allSets, versions, nights, evs] = await Promise.all([
    catalog.getSets(),
    config.listVersions(),
    night.nights(t0, t1),
    db.rows(db.from("shop2_events").select("*")).catch(() => []),
  ]);
  const setLane = allSets
    .filter((s) => s.source === "db" || s.startsAt)
    .map((s) => ({
      key: s.key,
      name: s.name,
      palette: s.palette,
      status: s.status,
      state: setLifecycle(s, now),
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      stockLimit: s.stockLimit,
      stockSold: s.stockSold,
      topRarityCount: s.items.filter((it) => (RARITY_RANK[it.rarity] ?? 0) >= RARITY_RANK.legendary).length,
    }))
    .filter((s) => !s.startsAt || (time.ms(s.startsAt) < t1 && (time.ms(s.endsAt) ?? Infinity) > t0));
  const ruleLane = [config.builtIn(), ...versions]
    .filter((v) => (v.applyAt && time.ms(v.applyAt) >= t0 - time.DAY_MS) || (v.appliedAt && time.ms(v.appliedAt) >= t0 - 14 * time.DAY_MS) || v.status === "scheduled")
    .map((v) => ({ version: v.version, status: v.status, applyAt: v.applyAt || v.appliedAt, note: v.note, weights: v.rules.weights }));
  const eventLane = evs.filter((e) => time.ms(e.starts_at) < t1 && (time.ms(e.ends_at) ?? time.ms(e.starts_at)) >= t0).map((e) => ({ id: e.id, title: e.title, kind: e.kind || "event", startsAt: e.starts_at, endsAt: e.ends_at, note: e.note || null }));
  const clashes = detectClashes({ sets: setLane, nights, rules: ruleLane.map((r) => ({ ...r, weights: r.weights })), events: eventLane, from: start, days: n });
  if (lite) return { clashes };
  const purchases = await require("./admin").paidPurchases(t0 - 14 * time.DAY_MS, t1);
  const revenue = time.dayRange(start, n).map((d) => {
    const list = purchases.filter((p) => p.status !== "refunded" && time.dayKey(p.created_at) === d);
    return { day: d, revenue: list.reduce((a, p) => a + (Number(p.amount) || 0), 0), sales: list.length };
  });
  // Slot conversion: purchases from the storefront per slot position over the last 14 days.
  const sfRows = await db.rows(db.from("shop2_storefronts").select("user_id, day, slots").gte("day", time.addDays(time.dayKey(now), -14))).catch(() => []);
  const slotShown = [0, 0, 0, 0];
  const slotBought = [0, 0, 0, 0];
  const bought = new Set(purchases.filter((p) => p.status !== "refunded" && p.source === "storefront").flatMap((p) => (p.item_ids || []).map((id) => `${p.user_id}|${time.dayKey(p.created_at)}|${id}`)));
  for (const r of sfRows) {
    for (const s of r.slots || []) {
      const k = Math.min(3, Math.max(0, (Number(s.slot) || 1) - 1));
      slotShown[k] += 1;
      if (bought.has(`${r.user_id}|${r.day}|${s.itemId}`)) slotBought[k] += 1;
    }
  }
  const sfBuyers = new Set(purchases.filter((p) => p.source === "storefront" && p.status !== "refunded").map((p) => p.user_id));
  const setBuyers = new Set(purchases.filter((p) => ["set", "pieces", "piece"].includes(p.kind) && p.status !== "refunded").map((p) => p.user_id));
  return {
    from: start,
    days: n,
    lanes: { rules: ruleLane.map(({ weights, ...r }) => (void weights, r)), sets: setLane, nights: nights.map((x) => ({ id: x.id, auto: Boolean(x.auto), status: x.status, mode: x.mode, startsAt: x.startsAt, endsAt: x.endsAt })), events: eventLane, revenue },
    clashes,
    queue: await listQueue({ now }),
    slotConversion: slotShown.map((v, i) => ({ slot: i + 1, shown: v, bought: slotBought[i], pct: v ? Math.round((slotBought[i] / v) * 1000) / 10 : 0 })),
    storefrontToSetPct: sfBuyers.size ? Math.round(([...sfBuyers].filter((u) => setBuyers.has(u)).length / sfBuyers.size) * 1000) / 10 : 0,
    liveViewers: events.liveViewers(now),
  };
}

async function createEvent(body, { actorId, now = Date.now() } = {}) {
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (!title) throw bad("title_required");
  const s = time.ms(body?.startsAt);
  const e = body?.endsAt ? time.ms(body.endsAt) : null;
  if (s == null || (e != null && e <= s)) throw bad("bad_window");
  await db.ready();
  return db.one(db.from("shop2_events").insert({ title, kind: typeof body?.kind === "string" ? body.kind.slice(0, 20) : "event", starts_at: time.iso(s), ends_at: e ? time.iso(e) : null, note: body?.note ? String(body.note).slice(0, 300) : null, created_by: actorId || null, created_at: time.iso(now) }).select("*").single());
}

async function deleteEvent(id) {
  await db.ready();
  const gone = await db.rows(db.from("shop2_events").delete().eq("id", id).select("id"));
  if (!gone.length) throw bad("not_found", 404);
  return { ok: true };
}

/* ---------------------------------------------------------------- audit */

async function audit({ limit = 100, before = null } = {}) {
  let rows = null;
  try {
    let q = db.real().from("admin_audit").select("*").like("action", "shop2_%");
    if (before) q = q.lt("at", before);
    const { data, error } = await q.order("at", { ascending: false }).limit(Math.min(500, limit));
    if (!error) rows = (data || []).map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, actorUsername: r.actor_username, action: r.action, target: r.target, meta: r.meta || {} }));
  } catch {
    rows = null;
  }
  if (!rows || !rows.length) {
    const state = require("../../runtime/sharedState");
    const mem = (state.auditLog || []).filter((e) => String(e.action || "").startsWith("shop2_"));
    if (mem.length || !rows) rows = mem.slice(0, limit);
  }
  return { entries: rows };
}

module.exports = {
  enqueue,
  cancelQueued,
  listQueue,
  cancelQueueItem,
  runDue,
  rulesOverview,
  getRuleVersion,
  createRuleVersion,
  mergeRules,
  simulateRules,
  scheduleRuleVersion,
  activateRuleVersion,
  cancelRuleSchedule,
  nightsOverview,
  createNight,
  updateNight,
  setNightStatus,
  openNow,
  undoOpen,
  deleteNight,
  previewNight,
  pastNights,
  limitsOverview,
  putLimits,
  undoLimits,
  limitsImpact,
  freezeGifts,
  flagsView,
  resolveFlag,
  timeline,
  createEvent,
  deleteEvent,
  audit,
  NIGHT_UNDO_MS,
};
