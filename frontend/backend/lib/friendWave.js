"use strict";

/**
 * "El salla" (wave) from a home / lock screen widget (iOS interactive App Intent, Android
 * widget button) or the app: POST /api/native/wave { to }. The friend gets a socket event
 * ("friend:wave") on every open device and a push; the widget does not open the app.
 *
 * Limits (rolling 24 hours, per sender): WAVES_PER_FRIEND to one friend, WAVES_PER_DAY in
 * total, and one wave per friend every PAIR_COOLDOWN_MS. The durable count is the
 * friend_waves table (migration 20261124w); the in-memory stamps in front of it answer a
 * burst without a query and keep the limits when the table is not there yet.
 *
 * decideWave() is pure (selftest: friendWave.selftest.cjs). sendWave() does the I/O with
 * injectable deps. Nothing here logs a name or an id.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WAVES_PER_FRIEND = 5;
const WAVES_PER_DAY = 20;
const PAIR_COOLDOWN_MS = 60 * 1000;
const KEEP_MS = 7 * DAY_MS;
const SOURCES = new Set(["widget", "app", "notification", "shortcut"]);
const ID_RE = /^[0-9a-zA-Z-]{1,64}$/;

/** sender id -> [{ to, at }] (newest last), at most WAVES_PER_DAY + 1 entries kept. */
const memory = new Map();

function idOk(id) {
  return ID_RE.test(String(id || ""));
}

/**
 * @param {object} a
 * @param {{to: string, at: number}[]} a.recent  the sender's waves of the last 24 h (any order)
 * @param {string} a.to                          friend id
 * @param {number} a.now
 * @returns {{ ok: true, remainingToday: number, remainingForFriend: number, resetAt: number }
 *          | { ok: false, error: "wave_cooldown" | "wave_limit", retryAfter: number, resetAt: number }}
 */
function decideWave({ recent = [], to, now = Date.now() } = {}) {
  const day = (Array.isArray(recent) ? recent : [])
    .filter((w) => w && Number.isFinite(w.at) && now - w.at < DAY_MS && w.at <= now + 5000)
    .sort((a, b) => a.at - b.at);
  const pair = day.filter((w) => String(w.to) === String(to));
  const lastPair = pair.length ? pair[pair.length - 1].at : 0;
  // The window frees up when the oldest counted wave turns 24 hours old.
  const resetFrom = (list) => (list.length ? list[0].at + DAY_MS : now);
  if (lastPair && now - lastPair < PAIR_COOLDOWN_MS) {
    const retryAfter = Math.ceil((PAIR_COOLDOWN_MS - (now - lastPair)) / 1000);
    return { ok: false, error: "wave_cooldown", retryAfter: Math.max(1, retryAfter), resetAt: lastPair + PAIR_COOLDOWN_MS };
  }
  if (pair.length >= WAVES_PER_FRIEND) {
    const resetAt = pair[pair.length - WAVES_PER_FRIEND].at + DAY_MS;
    return { ok: false, error: "wave_limit", retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)), resetAt };
  }
  if (day.length >= WAVES_PER_DAY) {
    const resetAt = day[day.length - WAVES_PER_DAY].at + DAY_MS;
    return { ok: false, error: "wave_limit", retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)), resetAt };
  }
  return {
    ok: true,
    remainingForFriend: WAVES_PER_FRIEND - pair.length - 1,
    remainingToday: WAVES_PER_DAY - day.length - 1,
    resetAt: resetFrom(day.length ? day : [{ at: now }]),
  };
}

function memoryRecent(fromId, now) {
  const list = (memory.get(fromId) || []).filter((w) => now - w.at < DAY_MS);
  if (list.length) memory.set(fromId, list);
  else memory.delete(fromId);
  return list;
}

function remember(fromId, to, at) {
  const list = memory.get(fromId) || [];
  list.push({ to: String(to), at });
  memory.set(fromId, list.slice(-(WAVES_PER_DAY + 1)));
  // Bounded: a long-running process does not keep every sender forever.
  if (memory.size > 20000) {
    const cutoff = at - DAY_MS;
    for (const [k, v] of memory) if (!v.length || v[v.length - 1].at < cutoff) memory.delete(k);
  }
}

/** Waves from the table, or null when it cannot be read (not migrated yet, outage). */
async function durableRecent(db, fromId, now) {
  try {
    const since = new Date(now - DAY_MS).toISOString();
    const { data, error } = await db
      .from("friend_waves")
      .select("to_user_id, created_at")
      .eq("from_user_id", fromId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(WAVES_PER_DAY + 5);
    if (error) return null;
    return (data || []).map((r) => ({ to: String(r.to_user_id), at: Date.parse(r.created_at) })).filter((w) => Number.isFinite(w.at));
  } catch {
    return null;
  }
}

/** Union of the durable rows and this process's stamps (a row may not be visible yet). */
function mergeRecent(durable, local) {
  if (!durable) return local;
  const out = [...durable];
  for (const w of local) {
    if (!out.some((d) => d.to === w.to && Math.abs(d.at - w.at) < 2000)) out.push(w);
  }
  return out;
}

class WaveError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

/**
 * @param {object} deps  { db, isAcceptedFriend(a,b), isBlockedEitherWay(a,b), emit(userId, event, payload),
 *                         push(userId, payload), sender(userId) -> { username, name, avatarUrl }, now() }
 * @param {object} args  { fromId, to, source }
 */
async function sendWave(deps, { fromId, to, source = "widget" } = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const toId = String(to || "");
  if (!idOk(fromId) || !idOk(toId) || toId === String(fromId)) throw new WaveError("bad_target", 400);
  const src = SOURCES.has(source) ? source : "widget";

  const [friend, blocked] = await Promise.all([
    deps.isAcceptedFriend(fromId, toId).catch(() => false),
    deps.isBlockedEitherWay(fromId, toId).catch(() => false),
  ]);
  // A block reads like "not a friend": the sender learns nothing more.
  if (!friend || blocked) throw new WaveError("not_friend", 403);

  // Burst check first (no query), then the durable count.
  const local = memoryRecent(fromId, now);
  const quick = decideWave({ recent: local, to: toId, now });
  if (!quick.ok) throw new WaveError(quick.error, 429, { retryAfter: quick.retryAfter, resetAt: quick.resetAt });
  const durable = deps.db ? await durableRecent(deps.db, fromId, now) : null;
  const decision = decideWave({ recent: mergeRecent(durable, local), to: toId, now });
  if (!decision.ok) throw new WaveError(decision.error, 429, { retryAfter: decision.retryAfter, resetAt: decision.resetAt });

  remember(fromId, toId, now);
  let id = null;
  if (deps.db && durable) {
    try {
      const { data } = await deps.db
        .from("friend_waves")
        .insert({ from_user_id: fromId, to_user_id: toId, source: src })
        .select("id")
        .maybeSingle();
      id = data?.id || null;
      // Housekeeping: the sender's rows older than a week.
      void Promise.resolve(
        deps.db.from("friend_waves").delete().eq("from_user_id", fromId).lt("created_at", new Date(now - KEEP_MS).toISOString())
      ).catch(() => {});
    } catch {
      /* delivered anyway; the memory stamp still counts it */
    }
  }

  const me = (await Promise.resolve(deps.sender?.(fromId)).catch(() => null)) || {};
  const event = {
    id: id || `w-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    from: {
      id: String(fromId),
      username: me.username || null,
      name: String(me.name || me.username || "").slice(0, 60) || null,
      avatarUrl: typeof me.avatarUrl === "string" && me.avatarUrl.startsWith("https://") ? me.avatarUrl : null,
    },
    at: new Date(now).toISOString(),
  };
  try {
    deps.emit?.(toId, "friend:wave", event);
  } catch {
    /* socket delivery is best effort */
  }
  void Promise.resolve()
    .then(() => deps.push?.(toId, { fromId: String(fromId), from: event.from.name || event.from.username || null }))
    .catch(() => {});
  return { ok: true, id: event.id, remainingToday: decision.remainingToday, remainingForFriend: decision.remainingForFriend, resetAt: new Date(decision.resetAt).toISOString() };
}

function resetWaveMemory() {
  memory.clear();
}

module.exports = {
  DAY_MS,
  WAVES_PER_FRIEND,
  WAVES_PER_DAY,
  PAIR_COOLDOWN_MS,
  WaveError,
  decideWave,
  sendWave,
  resetWaveMemory,
};
