"use strict";

/**
 * Descall+ 2.0 user-side service (owner pick 5B "Sunucu ve Hediye"): hub data, boosts, server
 * level pages, owner goals, the thank-you wall, gifts (scheduled, tracked, recall, group gifts),
 * trial tickets, cancel / resume, gift asks and the effective limits.
 * Membership writes go through the SQL functions of 20261125c_descall_plus_2.sql.
 */

const crypto = require("crypto");
const config = require("./config");
const limits = require("./limits");
const notify = require("./notify");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 3600 * 1000;

class PlusError extends Error {
  constructor(code, status = 400, extra = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const STATUS = {
  not_member: 403, no_slots: 409, not_in_server: 403, cooldown: 409, already_moving: 409, not_active: 409,
  same_server: 400, not_found: 404, not_moving: 409, gift_opened: 409, not_openable: 409, trial_used: 409,
  already_active: 409, expired: 410, not_redeemable: 403, group_closed: 409, invalid: 400, admin_grant: 409,
  user_not_found: 404, invalid_plan: 400, plan_archived: 409,
  ask_weekly_limit: 429, recipient_asks_off: 403, recipient_not_friend: 403, owner_only: 403, rate_limited: 429,
  gift_not_recallable: 409, gift_not_reschedulable: 409, not_cancellable: 409, not_cancelling: 409, boosts_off: 403,
  tickets_off: 403, ticket_unavailable: 409, recipient_member: 409, recipient_trial_used: 409, reason_required: 400,
};

function fail(code, extra) {
  throw new PlusError(code, STATUS[code] || 400, extra);
}

async function rpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const missing = ["PGRST202", "42883", "42P01", "PGRST205"].includes(error.code) || /does not exist|Could not find the function/i.test(error.message || "");
    throw new PlusError(missing ? "plus_unavailable" : "server_error", missing ? 503 : 500);
  }
  return data;
}

function unwrap(res) {
  if (res && res.ok === false) fail(res.error || "server_error", res);
  return res;
}

function isUuid(v) {
  return UUID.test(String(v || ""));
}

function newRequestId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

/* ---------------- people ---------------- */

async function usersById(ids) {
  const want = [...new Set((ids || []).map(String).filter(isUuid))];
  const out = new Map();
  for (let i = 0; i < want.length; i += 300) {
    const { data } = await db().from("users").select("id, username, display_name, avatar_url, created_at").in("id", want.slice(i, i + 300));
    for (const u of data || []) out.set(String(u.id), u);
  }
  return out;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username || null, displayName: u.display_name || null, avatarUrl: u.avatar_url || null };
}

function isOnline(id) {
  try {
    const p = require("../../runtime/sharedState").presence.get(String(id));
    return Boolean(p && p.status && p.status !== "offline" && p.status !== "invisible");
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

async function isFriend(a, b) {
  try {
    return await require("../dmMessages").isAcceptedFriend(a, b);
  } catch {
    return false;
  }
}

async function blocked(a, b) {
  try {
    return await require("../blocking").isBlockedEitherWay(a, b);
  } catch {
    return false;
  }
}

async function plusMe(userId) {
  const me = await rpc("premium_plus_me", { p_user: userId });
  return me && typeof me === "object" ? me : { plan: null, active: false };
}

/* ---------------- servers and boosts ---------------- */

async function boostCounts(serverIds) {
  const ids = [...new Set((serverIds || []).filter(isUuid))];
  if (!ids.length) return {};
  const res = await rpc("premium_boost_counts", { p_server_ids: ids });
  return res && typeof res === "object" ? res : {};
}

async function serverSettings(serverIds) {
  const ids = [...new Set((serverIds || []).filter(isUuid))];
  const out = new Map();
  if (!ids.length) return out;
  const { data } = await db().from("server_plus_settings").select("*").in("server_id", ids);
  for (const r of data || []) out.set(String(r.server_id), r);
  return out;
}

async function memberCounts(serverIds) {
  const out = new Map();
  for (const id of serverIds) {
    const { data } = await db().from("server_members").select("user_id").eq("server_id", id).limit(5000);
    const list = data || [];
    out.set(id, { members: list.length, online: list.filter((m) => isOnline(m.user_id)).length });
  }
  return out;
}

function goalOf(settings, cfg, count) {
  if (!settings?.goal_level) return null;
  const target = cfg.levels[settings.goal_level - 1];
  if (!target) return null;
  const due = settings.goal_due ? new Date(`${settings.goal_due}T23:59:59Z`) : null;
  return {
    level: settings.goal_level,
    boosts: target.boosts,
    missing: Math.max(0, target.boosts - count),
    due: settings.goal_due || null,
    daysLeft: due ? Math.max(0, Math.ceil((due.getTime() - Date.now()) / DAY)) : null,
    show: settings.goal_show !== false,
    reached: count >= target.boosts,
  };
}

function serverCard(server, { count = 0, settings = null, cfg, members = null, myBoosts = 0 }) {
  const prog = limits.progressFor(count, cfg.levels);
  return {
    id: server.id,
    name: server.name,
    iconUrl: server.icon_url || null,
    vanity: server.vanity_slug || null,
    isOwner: false,
    members: members?.members ?? null,
    online: members?.online ?? null,
    count,
    level: prog.level,
    progress: prog,
    perks: limits.levelPerks(prog.level, cfg.levels),
    goal: goalOf(settings, cfg, count),
    myBoosts,
    settings: settings ? {
      goalLevel: settings.goal_level, goalDue: settings.goal_due, goalShow: settings.goal_show,
      showBoostersGroup: settings.show_boosters_group, thankWall: settings.thank_wall,
    } : { goalLevel: null, goalDue: null, goalShow: true, showBoostersGroup: true, thankWall: true },
  };
}

async function myBoosts(userId) {
  const { data } = await db().from("server_boosts").select("*").eq("user_id", userId).neq("status", "removed").order("created_at", { ascending: true });
  return data || [];
}

function boostView(b, cfg, now = Date.now()) {
  const since = new Date(b.moved_at || b.created_at).getTime();
  const movableAt = new Date(since + cfg.boosts.moveCooldownDays * DAY);
  return {
    id: b.id,
    serverId: b.server_id,
    status: b.status,
    createdAt: b.created_at,
    movedAt: b.moved_at || null,
    moveTo: b.move_to || null,
    moveAt: b.move_at || null,
    graceUntil: b.grace_until || null,
    movableAt: movableAt.toISOString(),
    movableNow: b.status === "active" && movableAt.getTime() <= now,
    showOnWall: b.show_on_wall !== false,
  };
}

/** Slots of a plan (admin config). */
function slotsFor(cfg, plan) {
  if (plan === "ultra") return Number(cfg.tiers.ultra.boosts) || 0;
  if (plan === "plus") return Number(cfg.tiers.plus.boosts) || 0;
  return 0;
}

async function serversOfUser(userId) {
  const { data: mem } = await db().from("server_members").select("server_id").eq("user_id", userId).limit(500);
  const ids = (mem || []).map((m) => m.server_id).filter(isUuid);
  if (!ids.length) return [];
  const { data } = await db().from("servers").select("id, name, icon_url, owner_id, vanity_slug").in("id", ids);
  return data || [];
}

async function assertMember(serverId, userId) {
  const { data } = await db().from("server_members").select("user_id").eq("server_id", serverId).eq("user_id", userId).maybeSingle();
  if (!data) fail("not_in_server");
}

async function assignBoost(userId, serverId, { requestId = null, platform = "web" } = {}) {
  if (!isUuid(serverId)) fail("not_found");
  const cfg = await config.load();
  if (!cfg.features.boosts) fail("boosts_off");
  const me = await plusMe(userId);
  const before = (await boostCounts([serverId]))[serverId] || 0;
  const res = unwrap(await rpc("premium_boost_assign", {
    p_user: userId, p_server: serverId, p_slots: slotsFor(cfg, me.plan), p_request_id: requestId && /^[A-Za-z0-9:_.-]{8,100}$/.test(requestId) ? requestId : newRequestId("boost"),
  }));
  await afterServerCountChange(serverId, before, res.server_count, cfg, { by: userId, kind: "boosted" });
  require("./paywall").track(userId, { moment: "server_paywall", action: "converted", platform, serverId, meta: { boost: true } });
  return { boost: boostView(res.boost, cfg), serverCount: res.server_count, replay: Boolean(res.replay) };
}

async function moveBoost(userId, boostId, toServerId) {
  if (!isUuid(boostId) || !isUuid(toServerId)) fail("not_found");
  const cfg = await config.load();
  const res = unwrap(await rpc("premium_boost_move", {
    p_user: userId, p_boost: boostId, p_to: toServerId, p_cooldown_days: cfg.boosts.moveCooldownDays, p_notice_hours: cfg.boosts.moveNoticeHours,
  }));
  // The owner of the server the boost leaves hears it now (24 h before it goes).
  const { data: from } = await db().from("servers").select("id, name, owner_id").eq("id", res.boost.server_id).maybeSingle();
  if (from?.owner_id && from.owner_id !== userId) {
    notify.toUser(from.owner_id, { kind: "boost_leaving", serverId: from.id, serverName: from.name, at: res.boost.move_at });
  }
  notify.audit(userId, "premium_plus_boost_move", boostId, { from: res.boost.server_id, to: toServerId, at: res.boost.move_at });
  return { boost: boostView(res.boost, cfg) };
}

async function cancelMove(userId, boostId) {
  if (!isUuid(boostId)) fail("not_found");
  const cfg = await config.load();
  const res = unwrap(await rpc("premium_boost_cancel_move", { p_user: userId, p_boost: boostId }));
  return { boost: boostView(res.boost, cfg) };
}

async function setBoostWall(userId, boostId, show) {
  if (!isUuid(boostId)) fail("not_found");
  const { data } = await db().from("server_boosts").update({ show_on_wall: Boolean(show), updated_at: new Date().toISOString() }).eq("id", boostId).eq("user_id", userId).select("id").maybeSingle();
  if (!data) fail("not_found");
  return { ok: true };
}

/**
 * After a server's count changed: when it reaches a new level (or the owner's goal) one
 * announcement per level per server, never repeated (server_plus_settings.announced_level).
 */
async function afterServerCountChange(serverId, before, after, cfg, { by = null } = {}) {
  const lvBefore = limits.levelFor(before, cfg.levels);
  const lvAfter = limits.levelFor(after, cfg.levels);
  notify.toServer(serverId, { kind: "boost_count", serverId, count: after, level: lvAfter });
  if (lvAfter <= lvBefore) return;
  const settings = (await serverSettings([serverId])).get(serverId) || null;
  const announced = Number(settings?.announced_level || 0);
  if (lvAfter <= announced) return;
  const goalReached = Boolean(settings?.goal_level && lvAfter >= settings.goal_level && !settings.goal_reached_at);
  await db().from("server_plus_settings").upsert({
    server_id: serverId,
    announced_level: lvAfter,
    ...(goalReached ? { goal_reached_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "server_id" });
  notify.toServer(serverId, { kind: "level_up", serverId, level: lvAfter, by, goalReached });
}

/** One server's boost page (phone "Takviye seviyesi", the in-server paywall, the wall). */
async function serverBoostPage(userId, serverId) {
  if (!isUuid(serverId)) fail("not_found");
  const { data: server } = await db().from("servers").select("id, name, icon_url, owner_id, vanity_slug, is_public").eq("id", serverId).maybeSingle();
  if (!server) fail("not_found");
  await assertMember(serverId, userId);
  const cfg = await config.load();
  const [counts, settingsMap, membersMap, boosts, me] = await Promise.all([
    boostCounts([serverId]), serverSettings([serverId]), memberCounts([serverId]),
    Promise.resolve(db().from("server_boosts").select("id, user_id, created_at, status, show_on_wall").eq("server_id", serverId).neq("status", "removed").order("created_at", { ascending: true })).then((r) => r.data || []),
    plusMe(userId),
  ]);
  const count = counts[serverId] || 0;
  const card = serverCard(server, { count, settings: settingsMap.get(serverId), cfg, members: membersMap.get(serverId), myBoosts: boosts.filter((b) => b.user_id === userId).length });
  card.isOwner = server.owner_id === userId;
  // Boosters (the wall + the member list group): one row per person, oldest first, with tenure.
  const per = new Map();
  for (const b of boosts) {
    const row = per.get(b.user_id) || { userId: b.user_id, boosts: 0, since: b.created_at, onWall: true };
    row.boosts += 1;
    if (b.created_at < row.since) row.since = b.created_at;
    if (b.show_on_wall === false) row.onWall = false;
    per.set(b.user_id, row);
  }
  const people = await usersById([...per.keys()]);
  const { data: prefs } = per.size ? await db().from("premium_user_prefs").select("user_id, hide_on_walls").in("user_id", [...per.keys()]) : { data: [] };
  const hidden = new Set((prefs || []).filter((p) => p.hide_on_walls).map((p) => String(p.user_id)));
  const boosters = [...per.values()].map((r) => ({ ...r, user: publicUser(people.get(String(r.userId))), onWall: r.onWall && !hidden.has(String(r.userId)) }));
  const slots = slotsFor(cfg, me.plan);
  const used = (await myBoosts(userId)).length;
  return {
    server: card,
    boosters,
    me: { plan: me.plan, slots, used, free: Math.max(0, slots - used), trialUsed: Boolean(me.trial_used) },
    levels: cfg.levels,
  };
}

/** Owner settings: goal level / date, show the goal bar, the boosters group, the wall. */
async function saveServerSettings(userId, serverId, body) {
  if (!isUuid(serverId)) fail("not_found");
  const { data: server } = await db().from("servers").select("id, owner_id").eq("id", serverId).maybeSingle();
  if (!server) fail("not_found");
  if (server.owner_id !== userId) fail("owner_only");
  const b = body && typeof body === "object" ? body : {};
  const patch = { server_id: serverId, updated_by: userId, updated_at: new Date().toISOString() };
  if (b.goalLevel !== undefined) {
    if (b.goalLevel === null || b.goalLevel === 0) patch.goal_level = null;
    else if ([1, 2, 3].includes(Number(b.goalLevel))) patch.goal_level = Number(b.goalLevel);
    else fail("invalid");
    patch.goal_reached_at = null;
  }
  if (b.goalDue !== undefined) {
    if (b.goalDue === null || b.goalDue === "") patch.goal_due = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.goalDue)) && !Number.isNaN(Date.parse(b.goalDue))) patch.goal_due = String(b.goalDue);
    else fail("invalid");
  }
  for (const [k, col] of [["goalShow", "goal_show"], ["showBoostersGroup", "show_boosters_group"], ["thankWall", "thank_wall"]]) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== "boolean") fail("invalid");
      patch[col] = b[k];
    }
  }
  const { error } = await db().from("server_plus_settings").upsert(patch, { onConflict: "server_id" });
  if (error) fail("server_error");
  notify.toServer(serverId, { kind: "settings", serverId });
  return serverBoostPage(userId, serverId);
}

/** "Teşekkür et": the owner to all boosters (or one), or any member to one booster. */
async function thank(userId, serverId, { toUserId = null, message = "" } = {}) {
  if (!isUuid(serverId)) fail("not_found");
  await assertMember(serverId, userId);
  const msg = String(message || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
  const { data: server } = await db().from("servers").select("id, name, owner_id").eq("id", serverId).maybeSingle();
  if (!server) fail("not_found");
  if (!toUserId && server.owner_id !== userId) fail("owner_only");
  if (toUserId && !isUuid(toUserId)) fail("not_found");
  if (toUserId === userId) fail("invalid");
  const since = new Date(Date.now() - DAY).toISOString();
  const { data: recent } = await db().from("server_boost_thanks").select("id").eq("server_id", serverId).eq("from_user", userId).gte("created_at", since).limit(20);
  if ((recent || []).length >= 10) fail("rate_limited");
  const { data: row, error } = await db().from("server_boost_thanks").insert({ server_id: serverId, from_user: userId, to_user: toUserId, message: msg || "thanks" }).select("*").single();
  if (error) fail("server_error");
  if (toUserId) notify.toUser(toUserId, { kind: "thanks", serverId, serverName: server.name, from: userId, message: msg || null });
  else {
    const { data: boosters } = await db().from("server_boosts").select("user_id").eq("server_id", serverId).neq("status", "removed");
    for (const u of new Set((boosters || []).map((b) => String(b.user_id)))) {
      if (u !== userId) notify.toUser(u, { kind: "thanks", serverId, serverName: server.name, from: userId, message: msg || null });
    }
  }
  return { thanks: { id: row.id, createdAt: row.created_at } };
}

/** Public wall for /s/<slug> (only boosters who agreed, only when the owner turned the wall on). */
async function publicWall(serverId) {
  if (!isUuid(serverId)) return null;
  const cfg = await config.load();
  if (!cfg.features.thankWall || !cfg.features.boosts || !config.anySalesOn(cfg)) return null;
  const settings = (await serverSettings([serverId])).get(serverId);
  if (settings && settings.thank_wall === false) return null;
  const { data: boosts } = await db().from("server_boosts").select("user_id, created_at, show_on_wall").eq("server_id", serverId).neq("status", "removed");
  const count = (boosts || []).length;
  const per = new Map();
  for (const b of boosts || []) {
    if (b.show_on_wall === false) continue;
    const r = per.get(b.user_id) || { since: b.created_at, boosts: 0 };
    r.boosts += 1;
    if (b.created_at < r.since) r.since = b.created_at;
    per.set(b.user_id, r);
  }
  const { data: prefs } = per.size ? await db().from("premium_user_prefs").select("user_id, hide_on_walls").in("user_id", [...per.keys()]) : { data: [] };
  for (const p of prefs || []) if (p.hide_on_walls) per.delete(p.user_id);
  const people = await usersById([...per.keys()]);
  const list = [...per.entries()].map(([id, r]) => ({ user: publicUser(people.get(String(id))), since: r.since, boosts: r.boosts }))
    .filter((r) => r.user).sort((a, b) => String(a.since).localeCompare(String(b.since))).slice(0, 60)
    .map((r) => ({ username: r.user.username, displayName: r.user.displayName, avatarUrl: r.user.avatarUrl, since: r.since, boosts: r.boosts }));
  const prog = limits.progressFor(count, cfg.levels);
  return { count, level: prog.level, next: prog.next, boosters: list };
}

/* ---------------- gifts ---------------- */

function giftView(g, { viewer, people = new Map(), cfg, now = Date.now() }) {
  const isSender = String(g.sender_id) === String(viewer);
  const deliveredMs = g.delivered_at ? new Date(g.delivered_at).getTime() : null;
  const recallUntil = g.status === "scheduled" ? g.deliver_at : deliveredMs ? new Date(deliveredMs + cfg.gifts.recallHours * 3600 * 1000).toISOString() : null;
  return {
    id: g.id,
    direction: isSender ? "sent" : "received",
    status: g.status,
    plan: g.plan,
    months: g.months,
    note: g.note || null,
    deliverAt: g.deliver_at,
    paidAt: g.paid_at,
    deliveredAt: g.delivered_at,
    openedAt: g.opened_at,
    boostsGivenAt: g.boosts_given_at,
    returnedAt: g.returned_at,
    amountMinor: isSender ? g.amount_minor : null,
    currency: isSender ? g.currency : null,
    groupId: g.group_id || null,
    from: publicUser(people.get(String(g.sender_id))),
    to: publicUser(people.get(String(g.recipient_id))),
    canRecall: isSender && (g.status === "scheduled" || (g.status === "delivered" && deliveredMs && now < deliveredMs + cfg.gifts.recallHours * 3600 * 1000)),
    canReschedule: isSender && g.status === "scheduled",
    canOpen: (!isSender && g.status === "delivered") || (isSender && g.status === "returned"),
    recallUntil,
    returnAt: deliveredMs && g.status === "delivered" ? new Date(deliveredMs + cfg.gifts.returnDays * DAY).toISOString() : null,
  };
}

async function listGifts(userId) {
  const cfg = await config.load();
  const [sent, received] = await Promise.all([
    Promise.resolve(db().from("premium_gifts").select("*").eq("sender_id", userId).neq("status", "awaiting_payment").order("created_at", { ascending: false }).limit(50)).then((r) => r.data || []),
    Promise.resolve(db().from("premium_gifts").select("*").eq("recipient_id", userId).in("status", ["delivered", "opened"]).order("created_at", { ascending: false }).limit(50)).then((r) => r.data || []),
  ]);
  const people = await usersById([...sent, ...received].flatMap((g) => [g.sender_id, g.recipient_id]));
  const { data: groups } = await db().from("premium_group_gifts").select("*").eq("organizer_id", userId).in("status", ["collecting", "complete"]).order("created_at", { ascending: false }).limit(10);
  const { data: myShares } = await db().from("premium_group_gift_shares").select("group_id, status").eq("user_id", userId).limit(20);
  return {
    sent: sent.map((g) => giftView(g, { viewer: userId, people, cfg })),
    received: received.map((g) => giftView(g, { viewer: userId, people, cfg })),
    groups: await groupViews([...(groups || [])], userId, myShares || []),
  };
}

async function groupViews(groups, viewer, myShares = []) {
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);
  const { data: shares } = await db().from("premium_group_gift_shares").select("group_id, user_id, status, paid_at").in("group_id", ids);
  const people = await usersById([...groups.map((g) => g.recipient_id), ...groups.map((g) => g.organizer_id), ...(shares || []).map((s) => s.user_id)]);
  return groups.map((g) => {
    const mine = (shares || []).filter((s) => s.group_id === g.id);
    return {
      id: g.id,
      status: g.status,
      plan: g.plan,
      months: g.months,
      shares: g.shares,
      paid: mine.filter((s) => s.status === "paid").length,
      shareMinor: g.share_minor,
      currency: g.currency,
      expiresAt: g.expires_at,
      to: publicUser(people.get(String(g.recipient_id))),
      organizer: publicUser(people.get(String(g.organizer_id))),
      members: mine.map((s) => ({ user: publicUser(people.get(String(s.user_id))), status: s.status })),
      mine: Boolean(myShares.find((s) => s.group_id === g.id)) || g.organizer_id === viewer,
      giftId: g.gift_id || null,
    };
  });
}

async function getGroup(userId, groupId) {
  if (!isUuid(groupId)) fail("not_found");
  const { data: g } = await db().from("premium_group_gifts").select("*").eq("id", groupId).maybeSingle();
  if (!g) fail("not_found");
  if (g.recipient_id === userId) fail("not_found"); // the surprise stays a surprise
  const [view] = await groupViews([g], userId);
  return { group: view };
}

async function recallGift(userId, giftId) {
  if (!isUuid(giftId)) fail("not_found");
  const cfg = await config.load();
  const { data: g } = await db().from("premium_gifts").select("*").eq("id", giftId).maybeSingle();
  if (!g || g.sender_id !== userId) fail("not_found");
  const view = giftView(g, { viewer: userId, cfg });
  if (!view.canRecall) fail("gift_not_recallable");
  const { data: done } = await db().from("premium_gifts").update({ status: "recalled", recalled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", giftId).in("status", ["scheduled", "delivered"]).is("opened_at", null).select("*").maybeSingle();
  if (!done) fail("gift_not_recallable");
  if (g.status === "delivered") notify.toUser(g.recipient_id, { kind: "gift_recalled", giftId });
  notify.audit(userId, "premium_plus_gift_recall", giftId, { status: g.status });
  // The money: a recalled gift becomes a refund request the team approves through the provider.
  if (g.amount_minor) {
    await db().from("premium_refund_requests").insert({ user_id: userId, amount_minor: g.amount_minor, currency: g.currency, reason: "gift_recalled" });
  }
  return { gift: giftView(done, { viewer: userId, cfg }) };
}

async function rescheduleGift(userId, giftId, deliverAt) {
  if (!isUuid(giftId)) fail("not_found");
  const cfg = await config.load();
  const when = parseDeliverAt(deliverAt, cfg);
  const { data: done } = await db().from("premium_gifts").update({ deliver_at: when, updated_at: new Date().toISOString() })
    .eq("id", giftId).eq("sender_id", userId).eq("status", "scheduled").select("*").maybeSingle();
  if (!done) fail("gift_not_reschedulable");
  return { gift: giftView(done, { viewer: userId, cfg }) };
}

async function openGift(userId, giftId) {
  if (!isUuid(giftId)) fail("not_found");
  const res = unwrap(await rpc("premium_gift_open", { p_gift: giftId, p_user: userId }));
  const { data: g } = await db().from("premium_gifts").select("*").eq("id", giftId).maybeSingle();
  if (g?.sender_id && g.sender_id !== userId) notify.toUser(g.sender_id, { kind: "gift_opened", giftId });
  // Ask that this gift answered is closed.
  if (g?.ask_id) await db().from("premium_gift_asks").update({ gift_id: giftId }).eq("id", g.ask_id);
  notify.premiumChanged(userId, { kind: "gift_opened" });
  return { subscription: res.subscription, giftId };
}

function parseDeliverAt(v, cfg, now = Date.now()) {
  if (v === undefined || v === null || v === "" || v === "now") return new Date(now).toISOString();
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) fail("gift_bad_time");
  if (t < now - 60 * 1000) fail("gift_bad_time");
  if (t > now + cfg.gifts.maxScheduleDays * DAY) fail("gift_too_far");
  return new Date(Math.max(t, now)).toISOString();
}

/* ---------------- tickets ---------------- */

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Members get `tickets.perMonth` tickets each calendar month (lazily, on first look). */
async function ensureMonthlyTickets(userId, plan, cfg) {
  if (!plan || !cfg.features.tickets) return;
  const n = Math.min(Number(cfg.tickets.perMonth) || 0, Number(cfg.tiers[plan]?.tickets ?? cfg.tickets.perMonth) || 0);
  if (n <= 0) return;
  const period = monthKey();
  const end = new Date(Date.now() + cfg.tickets.validDays * DAY).toISOString();
  const rows = Array.from({ length: n }, (_, i) => ({ owner_id: userId, source: "monthly", period, seq: i + 1, status: "available", expires_at: end }));
  await db().from("premium_trial_tickets").upsert(rows, { onConflict: "owner_id,source,period,seq", ignoreDuplicates: true });
}

/**
 * Hook for the streak system (growth-reengage, moment 10): a 30-day streak gives one bonus ticket.
 * Idempotent per streak key. Returns the ticket or null.
 */
async function grantStreakTicket(userId, streakKey) {
  if (!isUuid(userId) || !/^[A-Za-z0-9:_.-]{1,60}$/.test(String(streakKey || ""))) return null;
  const cfg = await config.load();
  if (!cfg.features.tickets) return null;
  const row = { owner_id: userId, source: "streak", period: `streak:${streakKey}`, seq: 1, status: "available", expires_at: new Date(Date.now() + cfg.tickets.validDays * DAY).toISOString() };
  await db().from("premium_trial_tickets").upsert(row, { onConflict: "owner_id,source,period,seq", ignoreDuplicates: true });
  const { data } = await db().from("premium_trial_tickets").select("*").eq("owner_id", userId).eq("source", "streak").eq("period", row.period).maybeSingle();
  if (data) notify.toUser(userId, { kind: "streak_ticket", ticketId: data.id });
  return data || null;
}

function ticketView(t, people = new Map()) {
  return {
    id: t.id, source: t.source, status: t.status, expiresAt: t.expires_at, sentAt: t.sent_at,
    sentTo: publicUser(people.get(String(t.sent_to))), redeemedAt: t.redeemed_at,
  };
}

async function listTickets(userId) {
  const cfg = await config.load();
  const me = await plusMe(userId);
  await ensureMonthlyTickets(userId, me.plan, cfg);
  const { data: own } = await db().from("premium_trial_tickets").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(30);
  const { data: incoming } = await db().from("premium_trial_tickets").select("*").eq("sent_to", userId).eq("status", "sent").limit(10);
  const people = await usersById([...(own || []), ...(incoming || [])].flatMap((t) => [t.sent_to, t.owner_id]));
  const now = Date.now();
  const valid = (t) => new Date(t.expires_at).getTime() > now;
  return {
    available: (own || []).filter((t) => t.status === "available" && valid(t)).length,
    own: (own || []).map((t) => ticketView(t, people)),
    incoming: (incoming || []).filter(valid).map((t) => ({ ...ticketView(t, people), from: publicUser(people.get(String(t.owner_id))) })),
    trialUsed: Boolean(me.trial_used),
  };
}

async function sendTicket(userId, ticketId, toUserId) {
  if (!isUuid(ticketId) || !isUuid(toUserId)) fail("not_found");
  if (toUserId === userId) fail("invalid");
  if (!(await isFriend(userId, toUserId)) || (await blocked(userId, toUserId))) fail("recipient_not_friend");
  const target = await plusMe(toUserId);
  if (target.active) fail("recipient_member");
  if (target.trial_used) fail("recipient_trial_used");
  const { data } = await db().from("premium_trial_tickets").update({ status: "sent", sent_to: toUserId, sent_at: new Date().toISOString() })
    .eq("id", ticketId).eq("owner_id", userId).eq("status", "available").gt("expires_at", new Date().toISOString()).select("*").maybeSingle();
  if (!data) fail("ticket_unavailable");
  notify.toUser(toUserId, { kind: "ticket_received", ticketId, from: userId });
  return { ticket: ticketView(data) };
}

async function redeemTicket(userId, ticketId) {
  if (!isUuid(ticketId)) fail("not_found");
  const cfg = await config.load();
  if (!cfg.features.tickets) fail("tickets_off");
  const res = unwrap(await rpc("premium_ticket_redeem", { p_ticket: ticketId, p_user: userId, p_plan: "plus", p_days: cfg.trial.days }));
  const { data: t } = await db().from("premium_trial_tickets").select("owner_id").eq("id", ticketId).maybeSingle();
  if (t?.owner_id && t.owner_id !== userId) notify.toUser(t.owner_id, { kind: "ticket_redeemed", ticketId, by: userId });
  notify.premiumChanged(userId, { kind: "trial_started" });
  require("./paywall").track(userId, { moment: "trial", action: "trial_started", meta: { ticket: true } });
  return { subscription: res.subscription };
}

/* ---------------- cancel / resume / impact ---------------- */

/** What cancelling would do to the servers this person boosts (the "İptal edersen" box). */
async function cancelImpact(userId) {
  const cfg = await config.load();
  const me = await plusMe(userId);
  const boosts = (await myBoosts(userId)).filter((b) => b.status !== "removed");
  const serverIds = [...new Set(boosts.map((b) => b.server_id))];
  const [counts, names, members] = await Promise.all([
    boostCounts(serverIds),
    serverIds.length ? Promise.resolve(db().from("servers").select("id, name").in("id", serverIds)).then((r) => r.data || []) : [],
    memberCounts(serverIds),
  ]);
  const servers = serverIds.map((id) => {
    const mine = boosts.filter((b) => b.server_id === id).length;
    const now = counts[id] || 0;
    const after = Math.max(0, now - mine);
    const lvNow = limits.levelFor(now, cfg.levels);
    const lvAfter = limits.levelFor(after, cfg.levels);
    return {
      id,
      name: names.find((s) => s.id === id)?.name || null,
      boostsNow: now,
      boostsAfter: after,
      levelNow: lvNow,
      levelAfter: lvAfter,
      membersAffected: lvAfter < lvNow ? members.get(id)?.members ?? null : 0,
      lost: lvAfter < lvNow ? limits.levelPerks(lvNow, cfg.levels) : null,
    };
  });
  return {
    endsAt: me.ends_at || null,
    noticeDays: cfg.boosts.graceDays,
    servers,
    store: me.provider === "apple" || me.provider === "google" || me.provider === "revenuecat",
    origin: me.origin || null,
  };
}

const CANCEL_REASONS = ["not_using", "too_expensive", "missing_feature", "technical", "temporary", "other"];

async function cancel(userId, { reason, note = null } = {}, { providerCancel } = {}) {
  if (!CANCEL_REASONS.includes(String(reason || ""))) fail("reason_required");
  const me = await plusMe(userId);
  if (!me.active) fail("not_active");
  if (me.unlimited || me.source === "admin" || me.source === "campaign") fail("not_cancellable");
  if (["apple", "google", "revenuecat"].includes(me.provider)) {
    return { store: true, manageUrl: me.provider === "apple" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions" };
  }
  if (providerCancel && me.provider_sub_ref !== undefined) await providerCancel(me);
  const res = unwrap(await rpc("premium_plus_apply", {
    p_user: userId, p_op: "cancel_at_end", p_plan: null, p_days: null, p_ends_at: null, p_origin: me.origin === "store" ? "store" : "web",
    p_provider: me.provider || null, p_platform: null, p_period: null, p_auto_renew: false, p_request_id: newRequestId("cancel"),
    p_meta: { reason }, p_provider_sub_ref: null,
  }));
  await db().from("premium_cancellations").insert({ user_id: userId, reason, note: note ? String(note).slice(0, 500) : null, effective_at: me.ends_at });
  // Owners of boosted servers hear it `graceDays` before the boosts go (the scheduler sends it then).
  notify.premiumChanged(userId, { kind: "cancel_at_end" });
  return { subscription: res.subscription, endsAt: me.ends_at };
}

async function resume(userId, { providerResume } = {}) {
  const me = await plusMe(userId);
  if (!me.active || !me.cancel_at_period_end) fail("not_cancelling");
  if (providerResume) await providerResume(me);
  const res = unwrap(await rpc("premium_plus_apply", {
    p_user: userId, p_op: "resume", p_plan: null, p_days: null, p_ends_at: null, p_origin: "web", p_provider: me.provider || null,
    p_platform: null, p_period: null, p_auto_renew: true, p_request_id: newRequestId("resume"), p_meta: {}, p_provider_sub_ref: null,
  }));
  await db().from("premium_cancellations").update({ undone_at: new Date().toISOString() }).eq("user_id", userId).is("undone_at", null);
  notify.premiumChanged(userId, { kind: "resume" });
  return { subscription: res.subscription };
}

/* ---------------- asks, wishlist, prefs ---------------- */

async function getPrefs(userId) {
  const { data } = await db().from("premium_user_prefs").select("*").eq("user_id", userId).maybeSingle();
  return {
    giftAsksOff: Boolean(data?.gift_asks_off),
    wishlist: Boolean(data?.wishlist),
    gifNoteSeen: Boolean(data?.gif_note_seen_at),
    hideOnWalls: Boolean(data?.hide_on_walls),
  };
}

async function setPrefs(userId, body) {
  const b = body && typeof body === "object" ? body : {};
  const patch = { user_id: userId, updated_at: new Date().toISOString() };
  if (b.giftAsksOff !== undefined) patch.gift_asks_off = Boolean(b.giftAsksOff);
  if (b.wishlist !== undefined) { patch.wishlist = Boolean(b.wishlist); patch.wishlist_at = b.wishlist ? new Date().toISOString() : null; }
  if (b.gifNoteSeen === true) patch.gif_note_seen_at = new Date().toISOString();
  if (b.hideOnWalls !== undefined) patch.hide_on_walls = Boolean(b.hideOnWalls);
  await db().from("premium_user_prefs").upsert(patch, { onConflict: "user_id" });
  return getPrefs(userId);
}

async function askForGift(userId, toUserId, { kind = "animated_profile" } = {}) {
  if (!isUuid(toUserId) || toUserId === userId) fail("not_found");
  if (!(await isFriend(userId, toUserId)) || (await blocked(userId, toUserId))) fail("recipient_not_friend");
  const cfg = await config.load();
  const { data: theirPrefs } = await db().from("premium_user_prefs").select("gift_asks_off").eq("user_id", toUserId).maybeSingle();
  const { data: asks } = await db().from("premium_gift_asks").select("created_at").eq("from_user", userId).order("created_at", { ascending: false }).limit(10);
  const verdict = require("./paywall").canAsk({ asks: asks || [], cfg, recipientOptedOut: Boolean(theirPrefs?.gift_asks_off) });
  if (!verdict.ok) fail(verdict.reason === "recipient_off" ? "recipient_asks_off" : "ask_weekly_limit", { nextAt: verdict.nextAt || null });
  const { data: row } = await db().from("premium_gift_asks").insert({ from_user: userId, to_user: toUserId, kind: /^[a-z][a-z0-9_]{1,40}$/.test(kind) ? kind : "animated_profile" }).select("*").single();
  notify.toUser(toUserId, { kind: "gift_ask", askId: row?.id, from: userId });
  require("./paywall").track(userId, { moment: kind === "animated_profile" ? "gif_upload" : "profile_gif_note", action: "gift_requested" });
  return { ask: { id: row?.id, createdAt: row?.created_at } };
}

async function listAsks(userId) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await db().from("premium_gift_asks").select("*").eq("to_user", userId).is("dismissed_at", null).is("gift_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(20);
  const people = await usersById((data || []).map((a) => a.from_user));
  return { asks: (data || []).map((a) => ({ id: a.id, kind: a.kind, createdAt: a.created_at, from: publicUser(people.get(String(a.from_user))) })) };
}

async function dismissAsk(userId, askId) {
  if (!isUuid(askId)) fail("not_found");
  await db().from("premium_gift_asks").update({ dismissed_at: new Date().toISOString() }).eq("id", askId).eq("to_user", userId);
  return { ok: true };
}

/* ---------------- hub ---------------- */

async function hub(userId, { platform = "web" } = {}) {
  const cfg = await config.load();
  const plat = config.normalizePlatform(platform);
  const me = await plusMe(userId);
  const [servers, boosts, friendList, prefs] = await Promise.all([serversOfUser(userId), myBoosts(userId), friendIds(userId), getPrefs(userId)]);
  const ids = servers.map((s) => s.id);
  const [counts, settings] = await Promise.all([boostCounts(ids), serverSettings(ids)]);
  const boostedIds = new Set(boosts.map((b) => b.server_id));
  const ranked = [...servers].sort((a, b) => Number(boostedIds.has(b.id)) - Number(boostedIds.has(a.id)) || (counts[b.id] || 0) - (counts[a.id] || 0)).slice(0, 12);
  const members = await memberCounts(ranked.map((s) => s.id));
  const cards = ranked.map((s) => {
    const card = serverCard(s, { count: counts[s.id] || 0, settings: settings.get(s.id), cfg, members: members.get(s.id), myBoosts: boosts.filter((b) => b.server_id === s.id).length });
    card.isOwner = s.owner_id === userId;
    return card;
  });
  // Friends for the gift column: wishlist and asks first, then online, then the rest (max 20).
  const fids = friendList.slice(0, 300);
  const people = await usersById(fids);
  const { data: fprefs } = fids.length ? await db().from("premium_user_prefs").select("user_id, wishlist").in("user_id", fids) : { data: [] };
  const wish = new Set((fprefs || []).filter((p) => p.wishlist).map((p) => String(p.user_id)));
  const { data: asksToMe } = await db().from("premium_gift_asks").select("from_user").eq("to_user", userId).is("dismissed_at", null).is("gift_id", null).gte("created_at", new Date(Date.now() - 30 * DAY).toISOString());
  const asked = new Set((asksToMe || []).map((a) => String(a.from_user)));
  let plans = new Map();
  try {
    plans = await require("../premium/badges").plansFor(fids);
  } catch {
    plans = new Map();
  }
  const friends = fids.map((id) => {
    const u = people.get(String(id));
    if (!u) return null;
    const plan = plans instanceof Map ? plans.get(String(id)) || null : null;
    return { ...publicUser(u), plan, wishlist: wish.has(String(id)), asked: asked.has(String(id)), online: isOnline(id) };
  }).filter(Boolean).sort((a, b) => Number(b.asked) - Number(a.asked) || Number(b.wishlist) - Number(a.wishlist) || Number(b.online) - Number(a.online)).slice(0, 20);
  const slots = slotsFor(cfg, me.plan);
  const [tickets, gifts, planRows] = await Promise.all([
    listTickets(userId),
    listGifts(userId),
    Promise.resolve(db().from("premium_plans").select("id, monthly_descoin").in("id", ["plus", "ultra"])).then((r) => r.data || [], () => []),
  ]);
  return {
    me: {
      plan: me.plan, active: Boolean(me.active), endsAt: me.ends_at || null, unlimited: Boolean(me.unlimited), origin: me.origin || null,
      provider: me.provider || null, period: me.period || null, autoRenew: Boolean(me.auto_renew), cancelAtPeriodEnd: Boolean(me.cancel_at_period_end),
      trialEndsAt: me.trial_ends_at || null, trialUsed: Boolean(me.trial_used), source: me.source || null,
    },
    offer: config.publicOffer(cfg, plat, userId),
    plans: planRows.map((p) => ({ id: p.id, monthlyDescoin: p.monthly_descoin })),
    boosts: { slots, used: boosts.length, free: Math.max(0, slots - boosts.length), list: boosts.map((b) => boostView(b, cfg)) },
    servers: cards,
    friends,
    prefs,
    tickets,
    gifts,
  };
}

/* ---------------- limits ---------------- */

async function limitsFor(userId, { serverId = null, platform = "web" } = {}) {
  const cfg = await config.load();
  const plan = await require("../premium/entitlements").planFor(userId);
  let level = 0;
  let count = 0;
  if (isUuid(serverId)) {
    count = (await boostCounts([serverId]))[serverId] || 0;
    level = limits.levelFor(count, cfg.levels);
  }
  const out = limits.limitsFor({ cfg, plan, serverLevel: level, platform, userId });
  return { ...out, serverLevel: level, serverCount: count, upsell: isUuid(serverId) ? limits.screenUpsell({ cfg, serverCount: count, serverLevel: level }) : null };
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  PlusError,
  CANCEL_REASONS,
  plusMe,
  hub,
  boostCounts,
  slotsFor,
  assignBoost,
  moveBoost,
  cancelMove,
  setBoostWall,
  afterServerCountChange,
  serverBoostPage,
  saveServerSettings,
  thank,
  publicWall,
  giftView,
  listGifts,
  getGroup,
  recallGift,
  rescheduleGift,
  openGift,
  parseDeliverAt,
  ensureMonthlyTickets,
  grantStreakTicket,
  listTickets,
  sendTicket,
  redeemTicket,
  cancelImpact,
  cancel,
  resume,
  getPrefs,
  setPrefs,
  askForGift,
  listAsks,
  dismissAsk,
  limitsFor,
  usersById,
  publicUser,
  isFriend,
  blocked,
  monthKey,
  __setDbForTests,
};
