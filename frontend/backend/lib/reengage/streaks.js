"use strict";

/**
 * Growth 3B "Ortak seri" + "Bugünün görevleri". Extends the existing DesCoin daily reward
 * (lib/descoin.js: 40 a day, +5 per streak day up to +50, users.descoin_streak), it does
 * not duplicate it: the personal streak shown here IS that streak.
 *
 *  - Shared streak: a streak two friends keep together. A day counts when both wrote to
 *    each other (DMs the server saw). A missed day starts it again. When a day completes,
 *    both get the shared bonus (+10). If one is late the other may nudge once a day: one
 *    push with their face, never in quiet hours, never when nudges from that person are off.
 *  - Tasks: three a day, each about one person (write to your closest friend, save a shared
 *    streak at risk, 10 minutes in voice with a friend). Paid once from facts the server
 *    counted itself, through descoin.creditCapped (reason "reengage_task", capped daily).
 */

const R = require("./rules");
const store = require("./store");

const TASK_REASON = "reengage_task";
const MAX_SHARED = 20;

function istDay(ms) {
  return require("../reengagePolicy").istDay(ms);
}

function deps(over = {}) {
  return {
    now: over.now || (() => Date.now()),
    descoin: over.descoin || require("../descoin"),
    push: over.push || (() => require("../webPush")),
    emit: over.emit || require("./io").emitToUser,
    state: over.state || (() => require("../../runtime/sharedState")),
    log: over.log || console,
  };
}

function err(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

async function areFriends(a, b) {
  const { data } = await store
    .db()
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`)
    .limit(1);
  return Boolean(data && data.length);
}

async function people(ids) {
  const out = new Map();
  for (const part of store.chunks([...new Set(ids.filter(Boolean).map(String))])) {
    const { data } = await store.db().from("users").select("id, username, display_name, avatar_url").in("id", part);
    for (const u of data || []) out.set(String(u.id), { id: String(u.id), username: u.username, name: u.display_name || u.username, avatarUrl: u.avatar_url || null });
  }
  return out;
}

function sideOf(row, me) {
  return String(row.user_a) === String(me) ? "a" : "b";
}

/** People ranked by DMs with `me` in the last 14 days (both ways). [{ id, score }] */
async function rankedFriends(me, now) {
  const since = new Date(now - 14 * R.DAY_MS).toISOString();
  const db = store.db();
  const [a, b] = await Promise.all([
    db.from("dm_messages").select("to_user_id").eq("from_user_id", me).gte("created_at", since).limit(3000),
    db.from("dm_messages").select("from_user_id").eq("to_user_id", me).gte("created_at", since).limit(3000),
  ]);
  const score = new Map();
  for (const r of a.data || []) score.set(String(r.to_user_id), (score.get(String(r.to_user_id)) || 0) + 1);
  for (const r of b.data || []) score.set(String(r.from_user_id), (score.get(String(r.from_user_id)) || 0) + 1);
  // Only accepted friends get tasks.
  const { data: links } = await db
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${me},friend_id.eq.${me}`)
    .limit(500);
  const friends = new Set((links || []).map((r) => (String(r.user_id) === String(me) ? String(r.friend_id) : String(r.user_id))));
  const list = [...friends].map((id) => ({ id, score: score.get(id) || 0 }));
  list.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  return list;
}

function friendsInVoice(friendIds, d) {
  const ids = new Set(friendIds.map(String));
  const out = [];
  try {
    for (const call of d.state().activeServerVoiceCalls?.values?.() || []) {
      for (const uid of call?.participants?.keys?.() || []) if (ids.has(String(uid)) && !out.includes(String(uid))) out.push(String(uid));
    }
  } catch {
    /* optional */
  }
  return out;
}

/** Today's three tasks for `me` (created on first read). */
async function ensureTasks(me, d, now) {
  const day = istDay(now);
  const cur = await store.tasksOf(me, day);
  if (!cur.ready) return { ready: false, rows: [] };
  if (cur.rows.length) return cur;
  const ranked = await rankedFriends(me, now);
  const { rows: streaks } = await store.streaksOf(me);
  const atRisk = streaks
    .map((s) => ({ s, v: R.streakView(s, day) }))
    .filter(({ s, v }) => v.count > 0 && !v.doneToday && !(sideOf(s, me) === "a" ? v.aToday : v.bToday))
    .sort((x, y) => y.v.count - x.v.count)
    .map(({ s }) => (sideOf(s, me) === "a" ? String(s.user_b) : String(s.user_a)));
  const plan = R.planTasks({ people: ranked, atRisk, inVoice: friendsInVoice(ranked.map((p) => p.id), d) });
  const rows = plan.map((t) => ({ user_id: me, day, slot: t.slot, kind: t.kind, target_id: t.target_id, reward: t.reward, goal: t.goal, progress: 0, paid_amount: 0, done_at: null }));
  try {
    await store.insertTasks(rows);
  } catch {
    return { ready: false, rows: [] };
  }
  return store.tasksOf(me, day);
}

/** Pay a finished task once (CAS on paid_amount = 0). */
async function payTask(task, d) {
  const won = await store.casTask(task.user_id, task.day, task.slot, { paid_amount: task.reward, done_at: task.done_at || new Date(d.now()).toISOString() }, { paid_amount: 0 });
  if (!won) return 0;
  let credited = 0;
  try {
    const r = await d.descoin.creditCapped(task.user_id, task.reward, TASK_REASON, {
      kind: task.kind,
      slot: task.slot,
      day: task.day,
      targetId: task.target_id || null,
      idempotencyKey: `task:${task.user_id}:${task.day}:${task.slot}`,
    });
    credited = Number(r?.credited) || 0;
    if (credited !== task.reward) await store.casTask(task.user_id, task.day, task.slot, { paid_amount: credited }, {});
    if (credited > 0) d.emit(task.user_id, "descoin:balance", { balance: r.balance, delta: credited, reason: TASK_REASON });
  } catch (e) {
    await store.casTask(task.user_id, task.day, task.slot, { paid_amount: 0 }, {}).catch(() => null);
    d.log.warn("[streaks] task credit failed:", e?.message || e);
    return 0;
  }
  d.emit(task.user_id, "streaks:task", { slot: task.slot, kind: task.kind, paid: credited });
  return credited;
}

/** The "Seriler" screen. */
async function stateFor(me, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const day = istDay(now);
  let daily = null;
  try {
    daily = await d.descoin.getDailyStatus(me);
  } catch {
    daily = null;
  }
  const { ready, rows } = await store.streaksOf(me);
  const tasks = ready ? await ensureTasks(me, d, now) : { ready: false, rows: [] };
  const peerIds = rows.map((s) => (sideOf(s, me) === "a" ? s.user_b : s.user_a));
  const taskPeers = (tasks.rows || []).map((t) => t.target_id).filter(Boolean);
  const who = await people([...peerIds, ...taskPeers]);
  const shared = rows
    .map((s) => {
      const side = sideOf(s, me);
      const peer = String(side === "a" ? s.user_b : s.user_a);
      const v = R.streakView(s, day);
      const meToday = side === "a" ? v.aToday : v.bToday;
      const peerToday = side === "a" ? v.bToday : v.aToday;
      const nudge = R.nudgeAllowed(s, side, day);
      return {
        peer: who.get(peer) || { id: peer },
        count: v.count,
        best: v.best,
        doneToday: v.doneToday,
        meToday,
        peerToday,
        atRisk: v.atRisk,
        canNudge: nudge.ok,
        nudgeReason: nudge.reason,
        startedAt: s.started_at,
      };
    })
    .sort((x, y) => y.count - x.count);
  return {
    ready,
    day,
    personal: daily
      ? { streak: daily.streak, claimedToday: daily.claimedToday, claimAmount: daily.claimAmount, nextBonus: daily.streakBonus, balance: daily.balance, todayReward: daily.claimedToday ? require("../descoin").DAILY_CLAIM_BASE + Math.min(50, Math.max(0, daily.streak - 1) * 5) : null }
      : null,
    shared,
    tasks: (tasks.rows || []).map((t) => ({
      slot: t.slot,
      kind: t.kind,
      target: t.target_id ? who.get(String(t.target_id)) || { id: String(t.target_id) } : null,
      reward: t.reward,
      progress: t.progress,
      goal: t.goal,
      done: Boolean(t.done_at),
      doneAt: t.done_at,
      paid: t.paid_amount,
      bonus: t.kind === "save_streak" ? R.SHARED_BONUS : 0,
    })),
    sharedBonus: R.SHARED_BONUS,
  };
}

async function start(me, peer, opts = {}) {
  const d = deps(opts);
  if (String(me) === String(peer)) throw err("self");
  if (!(await areFriends(me, peer))) throw err("not_friends", 403);
  const { ready, rows } = await store.streaksOf(me);
  if (!ready) throw store.notReady();
  if (rows.length >= MAX_SHARED) throw err("too_many", 409);
  const k = R.pairKey(me, peer);
  const existing = await store.getStreak(me, peer);
  if (existing && existing.status === "active") return { ok: true, already: true };
  await store.upsertStreak({ ...k, status: "active", count: 0, last_day: null, a_day: null, b_day: null, started_by: me, started_at: new Date(d.now()).toISOString() });
  d.emit(peer, "streaks:changed", { peerId: String(me) });
  return { ok: true };
}

async function end(me, peer) {
  const k = R.pairKey(me, peer);
  await store.casStreak(k, { status: "ended" }, {});
  return { ok: true };
}

/** "Dürt": one push to a late friend, once a day. */
async function nudge(me, peer, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const day = istDay(now);
  const row = await store.getStreak(me, peer);
  if (!row || row.status !== "active") throw err("no_streak", 404);
  const side = sideOf(row, me);
  const [person, settings] = await Promise.all([store.getPerson(peer, me), store.getSettings(peer)]);
  const allowed = R.nudgeAllowed(row, side, day, { otherAllowsNudges: person.nudges && settings.types.streak !== false });
  if (!allowed.ok) throw err(allowed.reason, 409);
  const { data: u } = await store.db().from("users").select("timezone, presence_status").eq("id", peer).maybeSingle();
  if (R.isQuietFor(settings, u?.timezone, now)) throw err("quiet_hours", 409);
  const col = side === "a" ? "a_nudged_day" : "b_nudged_day";
  const won = await store.casStreak(R.pairKey(me, peer), { [col]: day }, { [col]: row[col] ?? null });
  if (!won) throw err("already_today", 409);
  const who = await people([me]);
  const from = who.get(String(me)) || {};
  const count = R.streakView(row, day).count;
  const copy = require("./copy");
  await d
    .push()
    .sendGrowthPush([peer], {
      type: "streak-nudge",
      fromId: me,
      fromName: from.name,
      avatar: from.avatarUrl,
      tag: `streak-nudge-${me}`,
      deepLink: `/?dm=${encodeURIComponent(me)}`,
      texts: (l) => ({ title: copy.rt(l, "push.nudgeTitle", { from: from.name || "" }), body: copy.rt(l, "push.nudgeBody", { count: Math.max(1, count) }) }),
      actions: (l) => [{ action: "rg_reply", title: copy.rt(l, "push.reply") }],
    })
    .catch((e) => d.log.warn("[streaks] nudge push failed:", e?.message || e));
  d.emit(peer, "streaks:nudged", { from: { id: String(me), name: from.name, avatarUrl: from.avatarUrl }, count });
  return { ok: true };
}

/* ---- facts the server counted ------------------------------------------- */

/** A DM from `from` to `to` was stored. Moves the shared streak and the message tasks. */
async function onDm(from, to, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const day = istDay(now);
  const out = { streak: null, paid: 0 };
  // Shared streak.
  const row = await store.getStreak(from, to).catch(() => null);
  if (row && row.status === "active") {
    const side = sideOf(row, from);
    const next = R.streakAdvance(row, side, day);
    if (!next.repeat || next.completedToday) {
      const k = R.pairKey(from, to);
      const patch = { count: next.count, best: next.best, last_day: next.last_day, a_day: next.a_day, b_day: next.b_day };
      const won = await store.casStreak(k, patch, { count: row.count, last_day: row.last_day ?? null, a_day: row.a_day ?? null, b_day: row.b_day ?? null }).catch(() => null);
      if (won && next.completedToday) {
        out.streak = next.count;
        for (const uid of [from, to]) {
          try {
            const r = await d.descoin.creditCapped(uid, R.SHARED_BONUS, TASK_REASON, {
              kind: "shared_bonus",
              peerId: String(uid) === String(from) ? to : from,
              day,
              idempotencyKey: `shared:${k.user_a}:${k.user_b}:${day}:${uid}`,
            });
            if (r?.credited) d.emit(uid, "descoin:balance", { balance: r.balance, delta: r.credited, reason: TASK_REASON });
          } catch (e) {
            d.log.warn("[streaks] shared bonus failed:", e?.message || e);
          }
          d.emit(uid, "streaks:day", { peerId: String(uid) === String(from) ? String(to) : String(from), count: next.count });
        }
      }
    }
  }
  // Message tasks of the sender.
  const tasks = await store.tasksOf(from, day).catch(() => ({ rows: [] }));
  for (const t of tasks.rows || []) {
    const move = R.taskProgress(t, { type: "dm", to });
    if (!move) continue;
    const doneAt = new Date(now).toISOString();
    const won = await store.casTask(from, day, t.slot, { progress: move.progress, done_at: doneAt }, { done_at: null }).catch(() => null);
    if (won) out.paid += await payTask({ ...t, done_at: doneAt }, d);
  }
  return out;
}

/** Minutes in voice (descoin heartbeat) with friends: the voice task. */
async function onVoiceMinutes(userId, { minutes = 1, withIds = [] } = {}, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const day = istDay(now);
  const tasks = await store.tasksOf(userId, day).catch(() => ({ rows: [] }));
  const t = (tasks.rows || []).find((x) => x.kind === "voice" && !x.done_at);
  if (!t) return 0;
  // Only friends count.
  let friendIds = [];
  if (withIds.length) {
    const { data } = await store
      .db()
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .limit(500);
    const friends = new Set((data || []).map((r) => (String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id))));
    friendIds = withIds.map(String).filter((id) => friends.has(id));
  }
  const move = R.taskProgress(t, { type: "voice", minutes, with: friendIds });
  if (!move) return 0;
  const patch = { progress: move.progress };
  if (move.done) patch.done_at = new Date(now).toISOString();
  const won = await store.casTask(userId, day, t.slot, patch, { progress: t.progress, done_at: null }).catch(() => null);
  if (won && move.done) return payTask({ ...t, ...patch }, d);
  return 0;
}

module.exports = { TASK_REASON, stateFor, start, end, nudge, onDm, onVoiceMinutes, ensureTasks };
