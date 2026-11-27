"use strict";

/**
 * Descall+ 2.0 periodic work (every 5 minutes; the SQL sweeps take their own advisory locks, so
 * several backend nodes never do the same work twice):
 *   - boosts: due moves, lapsed memberships -> grace (owner told), grace over -> removed (owner told)
 *   - gifts: scheduled -> delivered (recipient's DM card goes live, sender's tracker updates),
 *            unopened after 30 days -> back to the sender
 *   - trials: a reminder 24 h before a trial ends (once)
 *   - cancellations: owners of boosted servers hear it 3 days before the boosts go
 */

const config = require("./config");
const notify = require("./notify");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");
const INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
const told = new Set(); // in-process de-dupe for owner pre-notices

async function rpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw Object.assign(new Error(error.message || "rpc"), { code: error.code });
  return data;
}

async function serverOwners(ids) {
  if (!ids.length) return new Map();
  const { data } = await db().from("servers").select("id, name, owner_id").in("id", ids);
  return new Map((data || []).map((s) => [String(s.id), s]));
}

async function sweepBoosts(cfg) {
  const res = await rpc("premium_boost_sweep", { p_plus_slots: cfg.tiers.plus.boosts, p_ultra_slots: cfg.tiers.ultra.boosts, p_grace_days: cfg.boosts.graceDays });
  const changes = Array.isArray(res?.changes) ? res.changes : [];
  if (!changes.length) return 0;
  const owners = await serverOwners([...new Set(changes.map((c) => c.server_id))]);
  for (const c of changes) {
    const s = owners.get(String(c.server_id));
    notify.toServer(c.server_id, { kind: "boost_count", serverId: c.server_id });
    if (s?.owner_id && s.owner_id !== c.user_id && (c.event === "grace" || c.event === "removed" || c.event === "moved_out")) {
      notify.toUser(s.owner_id, { kind: `boost_${c.event}`, serverId: c.server_id, serverName: s.name });
    }
    if (c.event === "removed" || c.event === "grace") notify.toUser(c.user_id, { kind: `my_boost_${c.event}`, serverId: c.server_id });
  }
  return changes.length;
}

async function sweepGifts(cfg) {
  const res = await rpc("premium_gift_sweep", { p_return_days: cfg.gifts.returnDays });
  for (const g of res?.delivered || []) {
    notify.toUser(g.recipient_id, { kind: "gift_received", giftId: g.id });
    notify.toUser(g.sender_id, { kind: "gift_delivered", giftId: g.id });
  }
  for (const g of res?.returned || []) notify.toUser(g.sender_id, { kind: "gift_returned", giftId: g.id });
  for (const g of res?.group_expired || []) notify.toUser(g.organizer_id, { kind: "group_expired", groupId: g.id });
  return (res?.delivered || []).length;
}

async function remindTrials(cfg) {
  const until = new Date(Date.now() + cfg.trial.reminderHours * 3600 * 1000).toISOString();
  const { data } = await db().from("user_subscriptions").select("user_id, trial_ends_at").eq("status", "active").not("trial_ends_at", "is", null).lte("trial_ends_at", until).gt("trial_ends_at", new Date().toISOString()).limit(200);
  let n = 0;
  for (const s of data || []) {
    const key = `trial:${s.user_id}:${s.trial_ends_at}`;
    if (told.has(key)) continue;
    const { data: seen } = await db().from("premium_paywall_events").select("id").eq("user_id", s.user_id).eq("moment", "trial").eq("action", "compact").gte("created_at", new Date(Date.now() - 4 * 86400000).toISOString()).limit(1);
    told.add(key);
    if ((seen || []).length) continue;
    await require("./paywall").track(s.user_id, { moment: "trial", action: "compact", meta: { reminder: true } });
    notify.toUser(s.user_id, { kind: "trial_ending", endsAt: s.trial_ends_at });
    n += 1;
  }
  return n;
}

async function warnOwners(cfg) {
  const until = new Date(Date.now() + cfg.boosts.graceDays * 86400000).toISOString();
  const { data } = await db().from("user_subscriptions").select("user_id, ends_at").eq("status", "active").eq("cancel_at_period_end", true).lte("ends_at", until).limit(200);
  for (const s of data || []) {
    const key = `cancel:${s.user_id}:${s.ends_at}`;
    if (told.has(key)) continue;
    told.add(key);
    const { data: boosts } = await db().from("server_boosts").select("server_id").eq("user_id", s.user_id).neq("status", "removed");
    const owners = await serverOwners([...new Set((boosts || []).map((b) => b.server_id))]);
    for (const srv of owners.values()) {
      if (srv.owner_id && srv.owner_id !== s.user_id) notify.toUser(srv.owner_id, { kind: "boost_ending", serverId: srv.id, serverName: srv.name, at: s.ends_at });
    }
  }
  if (told.size > 20000) told.clear();
}

async function tick() {
  const cfg = await config.load();
  const out = {};
  for (const [name, fn] of [["boosts", sweepBoosts], ["gifts", sweepGifts], ["trials", remindTrials], ["owners", warnOwners]]) {
    try {
      out[name] = await fn(cfg);
    } catch (err) {
      out[name] = `error:${err?.code || "x"}`;
    }
  }
  return out;
}

/** Run the gift sweep right after a payment so a "now" gift lands at once. */
async function deliverNow() {
  try {
    const cfg = await config.load();
    return await sweepGifts(cfg);
  } catch {
    return 0;
  }
}

function start({ getIo } = {}) {
  if (timer) return;
  const run = () => {
    try { notify.bind(getIo?.()); } catch { /* ignore */ }
    tick().catch(() => {});
  };
  setTimeout(run, 30 * 1000 + Math.floor(Math.random() * 30000)).unref?.();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = { start, stop, tick, deliverNow, sweepBoosts, sweepGifts, remindTrials, __setDbForTests };
