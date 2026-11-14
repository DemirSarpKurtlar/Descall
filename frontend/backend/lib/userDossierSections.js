"use strict";

/**
 * Kullanıcı dosyası (Nov 2026 remake): the heavy dossier tabs, loaded one by
 * one (GET /admin/people/:id/dossier/<section>). Every read is guarded: a
 * table or column that is not there (migration not applied, older database)
 * makes that part empty instead of failing the tab. Never reads message text:
 * activity counts rows by created_at only.
 */

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const model = require("./userDossierModel");

const DAY_MS = model.DAY_MS;
const ROW_CAP = 5000;
const PAGE = 1000;

function isMissing(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || err || "");
  return ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202", "42883"].includes(code) || /does not exist|schema cache|Could not find/i.test(msg);
}

/** Run one query; any error or throw reads as no rows. */
async function soft(build) {
  try {
    const res = await build();
    if (res?.error) return { rows: [], count: null, error: res.error, missing: isMissing(res.error) };
    return { rows: Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [], count: typeof res?.count === "number" ? res.count : null };
  } catch (error) {
    return { rows: [], count: null, error, missing: true };
  }
}

/** All rows of a filtered query, page by page, up to ROW_CAP. */
async function paged(build, cap = ROW_CAP) {
  const rows = [];
  for (let from = 0; from < cap; from += PAGE) {
    const res = await soft(() => build().range(from, Math.min(cap, from + PAGE) - 1));
    if (res.error) return { rows, truncated: false, missing: res.missing };
    rows.push(...res.rows);
    if (res.rows.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function countOf(build) {
  const res = await soft(build);
  return typeof res.count === "number" ? res.count : null;
}

/** id -> row for users (username, display name, avatar, banned). */
async function usersById(ids) {
  const want = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = {};
  for (let i = 0; i < want.length; i += 300) {
    const part = want.slice(i, i + 300);
    let res = await soft(() => supabase.from("users").select("id, username, display_name, avatar_url, is_banned, created_at, last_seen").in("id", part));
    if (res.error) res = await soft(() => supabase.from("users").select("id, username, display_name, avatar_url").in("id", part));
    for (const u of res.rows) out[u.id] = u;
  }
  return out;
}

async function namesById(table, ids, col = "name") {
  const want = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = {};
  for (let i = 0; i < want.length; i += 300) {
    const res = await soft(() => supabase.from(table).select(`id, ${col}`).in("id", want.slice(i, i + 300)));
    for (const r of res.rows) out[r.id] = r[col];
  }
  return out;
}

function publicUser(u, id) {
  if (!u) return { id, username: null, displayName: null, avatarUrl: null, banned: false };
  return {
    id: u.id,
    username: u.username || null,
    displayName: u.display_name || u.username || null,
    avatarUrl: u.avatar_url || null,
    banned: Boolean(u.is_banned) || state.bannedUserIds?.has?.(String(u.id)) || false,
    createdAt: u.created_at || null,
    lastSeen: u.last_seen || null,
  };
}

async function loadUser(userId) {
  let res = await soft(() =>
    supabase.from("users").select("id, username, created_at, signup_at, first_touch_source, first_touch_campaign, first_message_at, active_sessions, descoin_balance, descoin_frozen, is_banned").eq("id", userId).maybeSingle()
  );
  if (res.error) res = await soft(() => supabase.from("users").select("id, username, created_at, active_sessions, descoin_balance").eq("id", userId).maybeSingle());
  const user = res.rows[0] || null;
  if (!user) {
    const err = new Error("User not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  return user;
}

/* ---------------------------------------------------------------- linked */

const SEEN_WINDOW_DAYS = 90;

/**
 * Other accounts on the same device (app device fingerprint, session device
 * hash) or network (/24 subnet hash, same session IP). Returns masked data only.
 */
async function loadLinked(userId, { user = null, now = Date.now() } = {}) {
  const me = user || (await loadUser(userId));
  const since = new Date(now - SEEN_WINDOW_DAYS * DAY_MS).toISOString();
  const mineRes = await soft(() =>
    supabase.from("descoin_device_seen").select("kind, hash, last_seen").eq("user_id", userId).gte("last_seen", since).limit(200)
  );
  const mine = mineRes.rows;
  const hashes = [...new Set(mine.map((m) => m.hash).filter(Boolean))].slice(0, 150);
  const seenRes = hashes.length
    ? await soft(() => supabase.from("descoin_device_seen").select("user_id, kind, hash, last_seen").in("hash", hashes).gte("last_seen", since).limit(3000))
    : { rows: [] };
  const [la, lb] = await Promise.all([
    soft(() => supabase.from("descoin_account_links").select("user_a, user_b, kinds, last_seen").eq("user_a", userId).limit(100)),
    soft(() => supabase.from("descoin_account_links").select("user_a, user_b, kinds, last_seen").eq("user_b", userId).limit(100)),
  ]);

  // Session device hash / exact IP shared with another account (jsonb containment).
  const sessions = Array.isArray(me.active_sessions) ? me.active_sessions : [];
  const deviceHashes = [...new Set(sessions.map((s) => s?.deviceHash).filter(Boolean))].slice(0, 5);
  const ips = [...new Set(sessions.map((s) => s?.ip).filter((ip) => ip && ip !== "unknown" && model.maskIp(ip)))].slice(0, 5);
  const sessionDevice = [];
  const sessionIp = [];
  const sessionAt = (list, pick) => {
    const hit = (Array.isArray(list) ? list : []).filter(pick).map((s) => s.lastActiveAt || s.createdAt).filter(Boolean).sort();
    return hit.pop() || null;
  };
  for (const h of deviceHashes) {
    const res = await soft(() => supabase.from("users").select("id, active_sessions").contains("active_sessions", [{ deviceHash: h }]).limit(20));
    for (const r of res.rows) if (r.id !== userId) sessionDevice.push({ userId: r.id, at: sessionAt(r.active_sessions, (s) => s?.deviceHash === h) });
  }
  for (const ip of ips) {
    const res = await soft(() => supabase.from("users").select("id, active_sessions").contains("active_sessions", [{ ip }]).limit(26));
    // Many accounts on one address = shared network (school, dorm, carrier): not listed.
    if (res.rows.length > 25) continue;
    for (const r of res.rows) if (r.id !== userId) sessionIp.push({ userId: r.id, at: sessionAt(r.active_sessions, (s) => s?.ip === ip) });
  }

  const linked = model.linkedAccounts(userId, {
    mine,
    seen: seenRes.rows,
    links: [...la.rows, ...lb.rows],
    sessionDevice,
    sessionIp,
  }).slice(0, 50);
  const byId = await usersById(linked.map((l) => l.userId));
  const accounts = linked
    .filter((l) => byId[l.userId])
    .map((l) => ({ ...publicUser(byId[l.userId], l.userId), kinds: l.kinds, lastSharedAt: l.lastSharedAt }));
  return {
    accounts,
    bannedCount: accounts.filter((a) => a.banned && (a.kinds.includes("device") || a.kinds.includes("session_device"))).length,
    ready: !mineRes.missing,
  };
}

/* ---------------------------------------------------------- communities */

async function loadCommunities(userId) {
  const [ownedRes, joinedRes, groupsRes, friendsRes, bansRes] = await Promise.all([
    soft(() => supabase.from("servers").select("id, name, icon_url, is_public, created_at").eq("owner_id", userId).limit(50)),
    soft(() => supabase.from("server_members").select("server_id, nickname, joined_at").eq("user_id", userId).order("joined_at", { ascending: false }).limit(200)),
    soft(() => supabase.from("group_members").select("group_id, role, joined_at").eq("user_id", userId).order("joined_at", { ascending: false }).limit(200)),
    soft(() => supabase.from("friendships").select("friend_id, status").eq("user_id", userId).limit(5000)),
    soft(() => supabase.from("server_bans").select("server_id, reason, created_at").eq("user_id", userId).limit(100)),
  ]);
  const owned = ownedRes.rows;
  const ownedIds = new Set(owned.map((s) => s.id));
  const serverIds = [...new Set([...joinedRes.rows.map((m) => m.server_id), ...bansRes.rows.map((b) => b.server_id)])];
  let serverRows = {};
  for (let i = 0; i < serverIds.length; i += 300) {
    const res = await soft(() => supabase.from("servers").select("id, name, icon_url, owner_id").in("id", serverIds.slice(i, i + 300)));
    for (const r of res.rows) serverRows[r.id] = r;
  }
  const memberCounts = {};
  await Promise.all(
    [...ownedIds].slice(0, 20).map(async (sid) => {
      memberCounts[sid] = await countOf(() => supabase.from("server_members").select("server_id", { count: "exact", head: true }).eq("server_id", sid));
    })
  );
  const groupNames = await namesById("groups", groupsRes.rows.map((g) => g.group_id));
  const friends = friendsRes.rows.filter((f) => f.status == null || f.status === "accepted").length;
  return {
    owned: owned.map((s) => ({ id: s.id, name: s.name || null, iconUrl: s.icon_url || null, isPublic: Boolean(s.is_public), createdAt: s.created_at || null, members: memberCounts[s.id] ?? null })),
    joined: joinedRes.rows
      .filter((m) => !ownedIds.has(m.server_id))
      .map((m) => ({
        id: m.server_id,
        name: serverRows[m.server_id]?.name || null,
        iconUrl: serverRows[m.server_id]?.icon_url || null,
        nickname: m.nickname || null,
        joinedAt: m.joined_at || null,
      })),
    groups: groupsRes.rows.map((g) => ({ id: g.group_id, name: groupNames[g.group_id] || null, role: g.role || null, joinedAt: g.joined_at || null })),
    serverBans: bansRes.rows.map((b) => ({ serverId: b.server_id, name: serverRows[b.server_id]?.name || null, reason: b.reason || null, at: b.created_at || null })),
    friends,
  };
}

/* ------------------------------------------------------------- activity */

async function loadActivity(userId, { days = 30, now = Date.now() } = {}) {
  const since = new Date(now - days * DAY_MS).toISOString();
  const createdAt = (table, col) => paged(() => supabase.from(table).select("created_at").eq(col, userId).gte("created_at", since).order("created_at", { ascending: false }));
  const [dm, grp, srv, voice, screens] = await Promise.all([
    createdAt("dm_messages", "from_user_id"),
    createdAt("group_messages", "sender_id"),
    createdAt("server_messages", "sender_id"),
    paged(() => supabase.from("server_voice_sessions").select("joined_at, left_at, duration_seconds").eq("user_id", userId).gte("joined_at", since).order("joined_at", { ascending: false }), 2000),
    paged(() => supabase.from("screen_share_sessions").select("started_at").eq("user_id", userId).gte("started_at", since).order("started_at", { ascending: false }), 2000),
  ]);
  const out = model.activitySeries(
    {
      messages: [...dm.rows, ...grp.rows, ...srv.rows].map((r) => r.created_at),
      voice: voice.rows.map((r) => ({ at: r.joined_at, seconds: model.voiceSeconds(r, now) })),
      screens: screens.rows.map((r) => r.started_at),
    },
    { days, now }
  );
  return {
    ...out,
    split: { dm: dm.rows.length, group: grp.rows.length, server: srv.rows.length },
    truncated: Boolean(dm.truncated || grp.truncated || srv.truncated),
    available: { messages: !(dm.missing && grp.missing && srv.missing), voice: !voice.missing, screen: !screens.missing },
  };
}

/** Voice seconds in the last 30 days only (the hero tile; cheap). */
async function voiceSeconds30d(userId, now = Date.now()) {
  const since = new Date(now - 30 * DAY_MS).toISOString();
  const res = await soft(() => supabase.from("server_voice_sessions").select("joined_at, left_at, duration_seconds").eq("user_id", userId).gte("joined_at", since).limit(2000));
  if (res.error) return null;
  return res.rows.reduce((s, r) => s + model.voiceSeconds(r, now), 0);
}

/* --------------------------------------------------------------- wallet */

async function loadSubscription(userId) {
  const res = await soft(() => supabase.from("user_subscriptions").select("plan_id, status, started_at, ends_at, unlimited, is_free, source").eq("user_id", userId).limit(1));
  const row = res.rows[0];
  if (!row) return { ready: !res.missing, current: null };
  const end = Date.parse(row.ends_at || "");
  const active = row.status === "active" && (row.unlimited || !Number.isFinite(end) || end > Date.now());
  return {
    ready: true,
    current: {
      plan: row.plan_id || null,
      status: row.status || null,
      active,
      startedAt: row.started_at || null,
      endsAt: row.ends_at || null,
      unlimited: Boolean(row.unlimited),
      free: Boolean(row.is_free),
      source: row.source || null,
    },
  };
}

async function loadWallet(userId) {
  const user = await loadUser(userId);
  const [ledgerRes, purchasesRes, eventsRes, creditsRes, subscription] = await Promise.all([
    soft(() => supabase.from("descoin_ledger").select("id, amount, reason, meta, balance_after, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)),
    soft(() => supabase.from("shop_purchases").select("id, item_id, amount_descoin, amount_cents, currency, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20)),
    soft(() => supabase.from("subscription_events").select("id, kind, prev_plan, new_plan, new_ends_at, actor_kind, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20)),
    soft(() => supabase.from("user_credits").select("credits").eq("user_id", userId).limit(1)),
    loadSubscription(userId),
  ]);
  const actors = await usersById(ledgerRes.rows.map((r) => r?.meta?.by).filter(Boolean));
  const items = await namesById("shop_items", purchasesRes.rows.map((p) => p.item_id));
  return {
    balance: Number(user.descoin_balance) || 0,
    frozen: Boolean(user.descoin_frozen),
    ledger: ledgerRes.rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      reason: r.reason || null,
      note: typeof r.meta?.reason === "string" ? r.meta.reason.slice(0, 200) : null,
      by: r.meta?.by ? actors[r.meta.by]?.username || null : null,
      balanceAfter: r.balance_after ?? null,
      at: r.created_at,
    })),
    purchases: purchasesRes.rows.map((p) => ({
      id: p.id,
      item: items[p.item_id] || null,
      itemId: p.item_id || null,
      descoin: p.amount_descoin ?? null,
      cents: p.amount_cents ?? null,
      currency: p.currency || null,
      status: p.status || null,
      at: p.created_at,
    })),
    subscription: subscription.current,
    subscriptionReady: subscription.ready,
    subscriptionEvents: eventsRes.rows.map((e) => ({ id: e.id, kind: e.kind, prevPlan: e.prev_plan || null, plan: e.new_plan || null, endsAt: e.new_ends_at || null, actor: e.actor_kind || null, at: e.created_at })),
    gameCredits: creditsRes.error ? null : Number(creditsRes.rows[0]?.credits) || 0,
  };
}

/* --------------------------------------------------------------- badges */

async function loadBadges(userId) {
  const specialBadges = require("./specialBadges");
  const [catalog, held] = await Promise.all([
    specialBadges.catalog({ fresh: true }).catch(() => []),
    specialBadges.badgesForUser(userId).catch(() => []),
  ]);
  const heldById = new Map((held || []).map((h) => [h.id, h]));
  return {
    badges: (catalog || []).map((row) => {
      const pub = specialBadges.publicCatalogRow(row, { admin: true });
      const h = heldById.get(pub.id);
      return { ...pub, held: Boolean(h), serial: h?.serial ?? null, grantedAt: h?.grantedAt || null, equipped: Boolean(h?.equipped) };
    }),
    ready: Array.isArray(catalog) && catalog.length > 0,
  };
}

/* ---------------------------------------------------------------- notes */

const NOTES_TABLE = "admin_user_notes";

function notesUnavailable() {
  const err = new Error("Admin notes are not set up yet.");
  err.code = "NOTES_UNAVAILABLE";
  err.status = 503;
  return err;
}

function publicNote(row) {
  return { id: row.id, body: row.body, authorId: row.author_id || null, authorUsername: row.author_username || null, at: row.created_at };
}

async function listNotes(userId, { limit = 100 } = {}) {
  const res = await soft(() => supabase.from(NOTES_TABLE).select("id, user_id, author_id, author_username, body, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit));
  if (res.error) return { ready: false, notes: [] };
  return { ready: true, notes: res.rows.map(publicNote) };
}

async function addNote(userId, { body, actor }) {
  const clean = model.cleanNote(body);
  if (!clean) {
    const err = new Error("Write a note of 1 to 2000 characters.");
    err.code = "NOTE_INVALID";
    err.status = 400;
    throw err;
  }
  const res = await soft(() =>
    supabase.from(NOTES_TABLE).insert({ user_id: userId, author_id: actor.id, author_username: actor.username || null, body: clean }).select("id, user_id, author_id, author_username, body, created_at").single()
  );
  if (res.error) {
    if (res.missing) throw notesUnavailable();
    throw new Error("Could not save the note.");
  }
  return publicNote(res.rows[0]);
}

/** Admins delete their own notes only. */
async function deleteNote(userId, noteId, { actor }) {
  const found = await soft(() => supabase.from(NOTES_TABLE).select("id, user_id, author_id").eq("id", noteId).eq("user_id", userId).maybeSingle());
  if (found.error) {
    if (found.missing) throw notesUnavailable();
    throw new Error("Could not delete the note.");
  }
  const row = found.rows[0];
  if (!row) {
    const err = new Error("Note not found.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  if (String(row.author_id) !== String(actor.id)) {
    const err = new Error("Only the author can delete a note.");
    err.status = 403;
    err.code = "NOTE_NOT_YOURS";
    throw err;
  }
  const del = await soft(() => supabase.from(NOTES_TABLE).delete().eq("id", noteId).eq("user_id", userId));
  if (del.error) throw new Error("Could not delete the note.");
  return { id: noteId };
}

/* ------------------------------------------------------------- timeline */

const MOD_DUPES = new Set(["ban", "unban", "timeout", "untimeout", "kick"]);

async function loadTimeline(userId, { now = Date.now() } = {}) {
  const user = await loadUser(userId);
  const moderation = require("./moderation");
  const adminAuditStore = require("./adminAuditStore");
  const [reportsRes, history, ledgerRes, purchasesRes, eventsRes, joinsRes, ownedRes, groupsRes, audit, notes] = await Promise.all([
    soft(() => supabase.from("user_reports").select("id, reporter_id, reason, status, context_type, created_at").eq("target_id", userId).order("created_at", { ascending: false }).limit(60)),
    moderation.listHistory({ targetUserId: userId, limit: 60 }).catch(() => []),
    soft(() => supabase.from("descoin_ledger").select("id, amount, reason, meta, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(60)),
    soft(() => supabase.from("shop_purchases").select("id, item_id, amount_descoin, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)),
    soft(() => supabase.from("subscription_events").select("id, kind, new_plan, new_ends_at, actor_kind, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)),
    soft(() => supabase.from("server_members").select("server_id, joined_at").eq("user_id", userId).order("joined_at", { ascending: false }).limit(40)),
    soft(() => supabase.from("servers").select("id, name, created_at").eq("owner_id", userId).limit(30)),
    soft(() => supabase.from("group_members").select("group_id, joined_at").eq("user_id", userId).order("joined_at", { ascending: false }).limit(40)),
    adminAuditStore.list({ target: userId, limit: 80 }).catch(() => null),
    listNotes(userId, { limit: 40 }),
  ]);

  const people = await usersById([
    ...reportsRes.rows.map((r) => r.reporter_id),
    ...ledgerRes.rows.map((r) => r?.meta?.by).filter(Boolean),
  ]);
  const items = await namesById("shop_items", purchasesRes.rows.map((p) => p.item_id));
  const servers = await namesById("servers", joinsRes.rows.map((j) => j.server_id));
  const groups = await namesById("groups", groupsRes.rows.map((g) => g.group_id));
  const mk = (type, id, at, meta = {}) => ({ type, group: model.groupOf(type), id: String(id), at, meta });

  const lists = [];
  const signupAt = user.signup_at || user.created_at;
  if (signupAt) lists.push([mk("signup", user.id, signupAt, { source: user.first_touch_source || null, campaign: user.first_touch_campaign || null })]);
  if (user.first_message_at) lists.push([mk("first_message", user.id, user.first_message_at)]);
  lists.push(
    (Array.isArray(user.active_sessions) ? user.active_sessions : []).map((s) =>
      mk("login", s.id || s.createdAt, s.createdAt, { device: s.device || null, ip: model.maskIp(s.ip) })
    )
  );
  lists.push(reportsRes.rows.map((r) => mk("report", r.id, r.created_at, { reason: r.reason || "other", status: r.status || "open", context: r.context_type || null, reporter: people[r.reporter_id]?.username || null })));
  lists.push(
    (history || []).map((h) =>
      mk("mod", h.id, h.created_at, {
        action: h.action_type || null,
        category: h.category || null,
        reason: h.reason || null,
        actor: h.actorUsername || null,
        durationSeconds: h.duration_seconds ?? null,
        revoked: Boolean(h.revoked_at),
      })
    )
  );
  lists.push(ledgerRes.rows.map((r) => mk("ledger", r.id, r.created_at, { amount: Number(r.amount) || 0, reason: r.reason || null, by: r?.meta?.by ? people[r.meta.by]?.username || null : null })));
  lists.push(purchasesRes.rows.map((p) => mk("purchase", p.id, p.created_at, { item: items[p.item_id] || null, descoin: p.amount_descoin ?? null, status: p.status || null })));
  lists.push(eventsRes.rows.map((e) => mk("subscription", e.id, e.created_at, { kind: e.kind || null, plan: e.new_plan || null, endsAt: e.new_ends_at || null, actor: e.actor_kind || null })));
  lists.push(joinsRes.rows.map((j) => mk("server_join", `${j.server_id}:${j.joined_at}`, j.joined_at, { serverId: j.server_id, server: servers[j.server_id] || null })));
  lists.push(ownedRes.rows.map((s) => mk("server_own", s.id, s.created_at, { serverId: s.id, server: s.name || null })));
  lists.push(groupsRes.rows.map((g) => mk("group_join", `${g.group_id}:${g.joined_at}`, g.joined_at, { group: groups[g.group_id] || null })));
  lists.push(
    (audit || [])
      .filter((a) => a && a.action && !MOD_DUPES.has(a.action))
      .map((a) => mk("admin", a.id, a.at, { action: a.action, actor: a.actorUsername || null, amount: typeof a.meta?.amount === "number" ? a.meta.amount : null }))
  );
  lists.push((notes.notes || []).map((n) => mk("note", n.id, n.at, { actor: n.authorUsername || null })));

  const merged = model.mergeTimeline(lists, { limit: 300 });
  const counts = {};
  for (const it of merged) counts[it.group] = (counts[it.group] || 0) + 1;
  return { items: merged, counts, generatedAt: new Date(now).toISOString() };
}

module.exports = {
  soft,
  usersById,
  loadUser,
  loadLinked,
  loadCommunities,
  loadActivity,
  voiceSeconds30d,
  loadSubscription,
  loadWallet,
  loadBadges,
  listNotes,
  addNote,
  deleteNote,
  loadTimeline,
  NOTES_TABLE,
};
