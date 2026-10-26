"use strict";

/**
 * DesCoin anti-bot runtime — Faz 0 (monitor only).
 *
 * Plan: DesCoin anti-bot plan §7/§10 (Faz 0 = "gölge mod").
 *
 * What this does:
 *   - watches messages, call heartbeats, socket connects and capped credits,
 *   - keeps small per-user signal state in memory,
 *   - every 10 min recomputes a 0-100 risk score per active user and stores it
 *     (descoin_risk), with linked-account pairs (descoin_account_links) and
 *     hashed device / network sightings (descoin_device_seen),
 *   - counts what the later stages *would* have done ("shadow" counters:
 *     messages that would not earn, coins that would be withheld),
 *   - records alerts when an account crosses the alert score.
 *
 * What it never does: change an amount, a cap, a balance, a wallet flag, or
 * delay / skip a credit. Every hook is fire-and-forget and swallows its own
 * errors, so a bug or a missing table here cannot affect earning. Nothing
 * here emits anything to the user.
 */

const config = require("./config");
const messageRules = require("./messageRules");
const mediaRules = require("./mediaRules");
const risk = require("./risk");
const hashing = require("./hashing");
const store = require("./store");
const alerts = require("./alerts");

function db() {
  return require("../../db/supabase");
}

const DAY_MS = 24 * 3600_000;
/** Plan §2 message day cap; only used to evaluate the "one partner" shadow rule. */
const PLANNED_MESSAGE_DAY_CAP = 30;
const MAX_JOB_USERS = 1000;

const users = new Map();
const convLogs = new Map();
const riskCache = new Map(); // userId -> { score, trusted, linked:Set, at }
const metaCache = new Map(); // userId -> { createdAt, emailVerified, at }
const deviceWriteAt = new Map();

function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function u(userId) {
  let s = users.get(userId);
  if (!s) {
    s = {
      msgTimes: [],
      hours: new Set(),
      activeDays: new Set(),
      sigHistory: null,
      lastCreditedByConv: new Map(),
      counterpartsByDay: new Map(), // day -> Map(counterpartId -> n)
      inputAt: 0,
      frameChangedAt: 0,
      vad: false,
      lastSpokeAt: 0,
      presence: new Map(),
      subnets: new Set(),
      ua: { automation: false, webdriver: false, headless: false, clientSignals: false },
      capsHit: { day: today(), set: new Set() },
      shadow: {},
      lastSeenAt: Date.now(),
      dirty: true,
    };
    users.set(userId, s);
  }
  return s;
}

function markActive(s, now = Date.now()) {
  const hour = Math.floor(now / 3600_000);
  s.hours.add(hour);
  for (const h of s.hours) if (h <= hour - 24) s.hours.delete(h);
  s.activeDays.add(today(now));
  if (s.activeDays.size > 14) s.activeDays = new Set([...s.activeDays].sort().slice(-14));
  s.lastSeenAt = now;
  s.dirty = true;
}

function shadowNote(userId, key, amount = 1, now = Date.now()) {
  const s = u(userId);
  const d = today(now);
  const bucket = (s.shadow[d] = s.shadow[d] || { would_withhold: 0, blocked: {} });
  if (key === "would_withhold") bucket.would_withhold += amount;
  else bucket.blocked[key] = (bucket.blocked[key] || 0) + amount;
  const keys = Object.keys(s.shadow).sort();
  while (keys.length > 7) delete s.shadow[keys.shift()];
  s.dirty = true;
}

function noteCounterpart(s, cp, now = Date.now()) {
  if (!cp) return;
  const d = today(now);
  const m = s.counterpartsByDay.get(d) || new Map();
  m.set(cp, (m.get(cp) || 0) + 1);
  s.counterpartsByDay.set(d, m);
  const cut = today(now - 7 * DAY_MS);
  for (const k of s.counterpartsByDay.keys()) if (k <= cut) s.counterpartsByDay.delete(k);
}

function counterparts7(s) {
  const out = new Map();
  for (const m of s.counterpartsByDay.values()) for (const [k, v] of m) out.set(k, (out.get(k) || 0) + v);
  return out;
}

function safe(fn) {
  try {
    return fn();
  } catch (err) {
    console.warn("[antibot] hook error:", String(err?.message || err).slice(0, 200));
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Device / client signals
// ---------------------------------------------------------------------------

function recordDevice(userId, kind, hash, now = Date.now()) {
  if (!hash) return;
  const key = `${userId}:${kind}:${hash}`;
  if (now - (deviceWriteAt.get(key) || 0) < 30 * 60_000) return;
  deviceWriteAt.set(key, now);
  const iso = new Date(now).toISOString();
  void store.run("descoin_device_seen", "upsert", (s) =>
    s
      .from("descoin_device_seen")
      .upsert({ user_id: userId, kind, hash, last_seen: iso }, { onConflict: "user_id,kind,hash" })
  );
}

/** Called once per socket connection. `ip` is hashed (subnet) and dropped. */
function onSocketConnect(socket, userId, ip) {
  return safe(() => {
    if (!config.collecting() || !userId) return;
    const client = socket?.handshake?.auth?.client;
    if (client === "ios-native-call") return; // our own Swift call socket
    const s = u(userId);
    const ua = socket?.handshake?.headers?.["user-agent"] || "";
    if (risk.isAutomationUa(ua)) s.ua.automation = true;
    const sub = hashing.hashSubnet(ip);
    if (sub) {
      s.subnets.add(sub);
      if (s.subnets.size > 20) s.subnets.delete(s.subnets.values().next().value);
      recordDevice(userId, "subnet", sub);
    }
    s.lastSeenAt = Date.now();
    s.dirty = true;
  });
}

/**
 * Optional client hints (socket "antibot:signals"). Every field is optional and
 * type-checked; the raw fingerprint is hashed immediately and never kept.
 */
function onClientSignals(userId, payload) {
  return safe(() => {
    if (!config.collecting() || !userId || !payload || typeof payload !== "object") return;
    const s = u(userId);
    s.ua.clientSignals = true;
    if (payload.webdriver === true) s.ua.webdriver = true;
    const gl = typeof payload.glRenderer === "string" ? payload.glRenderer.slice(0, 200) : "";
    const platform = typeof payload.platform === "string" ? payload.platform.slice(0, 40).toLowerCase() : "";
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const headless =
      (/swiftshader|llvmpipe/i.test(gl) && platform !== "linux") ||
      payload.headlessUa === true ||
      (num(payload.screenW) === 0 && num(payload.screenH) === 0) ||
      (num(payload.pluginsLen) === 0 && num(payload.languagesLen) === 0);
    if (headless) s.ua.headless = true;
    const fp = typeof payload.fp === "string" ? hashing.hashFingerprint(payload.fp) : null;
    if (fp) recordDevice(userId, "fp", fp);
    s.dirty = true;
  });
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

async function loadMeta(ids) {
  const now = Date.now();
  const need = [...new Set(ids)].filter((id) => {
    const m = metaCache.get(id);
    return id && (!m || now - m.at > 10 * 60_000);
  });
  if (!need.length) return;
  try {
    const { data, error } = await db()
      .from("users")
      .select("id, created_at, email_confirmed_at, auth_provider")
      .in("id", need.slice(0, 1000));
    if (error) return;
    for (const row of data || []) {
      metaCache.set(row.id, {
        createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
        emailVerified: Boolean(row.email_confirmed_at) || ["google", "apple"].includes(row.auth_provider),
        at: now,
      });
    }
  } catch {
    /* unknown meta = treated as mature / verified */
  }
}

function riskOf(userId) {
  return riskCache.get(userId) || { score: 0, trusted: false, linked: new Set() };
}

function sameSubnet(a, b) {
  const A = users.get(a)?.subnets;
  const B = users.get(b)?.subnets;
  if (!A || !B) return false;
  for (const h of A) if (B.has(h)) return true;
  return false;
}

/** Would the later stages count `other` as a real, independent person for `me`? */
function isRealOther(me, other, { requireMature = false } = {}) {
  if (!other || other === me) return false;
  const mine = riskOf(me);
  const theirs = riskOf(other);
  if (mine.linked?.has(other)) return false;
  if (!theirs.trusted && theirs.score >= config.RISK.zero) return false;
  if (sameSubnet(me, other)) return false;
  if (requireMature) {
    const m = metaCache.get(other);
    if (m) {
      if (Date.now() - m.createdAt < 3 * DAY_MS) return false;
      if (!m.emailVerified) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Messages (shadow only)
// ---------------------------------------------------------------------------

async function ensureHistory(userId) {
  const s = u(userId);
  if (s.sigHistory) return s.sigHistory;
  s.sigHistory = [];
  const res = await store.run("descoin_message_fingerprints", "select", (q) =>
    q
      .from("descoin_message_fingerprints")
      .select("minhash, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(messageRules.HISTORY)
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  s.sigHistory.push(...rows.map((r) => r.minhash).filter(Array.isArray).reverse());
  return s.sigHistory;
}

function pushConv(convKey, userId, now) {
  const log = convLogs.get(convKey) || [];
  log.push({ userId, at: now });
  while (log.length > 30 || (log.length && now - log[0].at > messageRules.REPLY_WINDOW_MS)) log.shift();
  convLogs.set(convKey, log);
}

/**
 * Observe one persisted message. Call fire-and-forget; the caller's credit
 * decision does not depend on it. Resolves to the shadow verdict (tests).
 * `text` is only used in memory to build a keyed MinHash; it is never stored
 * or logged.
 */
async function observeMessage({ userId, convKey, dmPeerId = null, text, now = Date.now() } = {}) {
  try {
    if (!config.collecting() || !userId || !convKey) return null;
    const s = u(userId);
    s.msgTimes.push(now);
    if (s.msgTimes.length > 40) s.msgTimes.shift();
    markActive(s, now);
    if (dmPeerId && dmPeerId !== userId) noteCounterpart(s, dmPeerId, now);

    let verdict = null;
    try {
      const log = (convLogs.get(convKey) || []).slice();
      await loadMeta(log.map((e) => e.userId).filter((id) => id !== userId));
      const history = await ensureHistory(userId);
      const cps = s.counterpartsByDay.get(today(now)) || new Map();
      verdict = messageRules.evaluateMessage({
        text: String(text || "").slice(0, 4000),
        userId,
        dmPeerId,
        history,
        convLog: log,
        lastCreditedHereAt: s.lastCreditedByConv.get(convKey) || 0,
        isRealOther: (id) => isRealOther(userId, id, { requireMature: true }),
        counterpartCreditsToday: cps,
        dayCap: PLANNED_MESSAGE_DAY_CAP,
        salt: hashing.minhashSalt(),
        now,
      });
      history.push(verdict.signature);
      if (history.length > messageRules.HISTORY) history.shift();
      store.enqueue("descoin_message_fingerprints", {
        user_id: userId,
        conv_key_hash: hashing.hashConversation(convKey),
        minhash: verdict.signature,
      });
      if (!verdict.ok) shadowNote(userId, `msg_${verdict.reason}`, 1, now);
      else s.lastCreditedByConv.set(convKey, now);
      if (!dmPeerId && verdict.counterpartId) noteCounterpart(s, verdict.counterpartId, now);
    } finally {
      pushConv(convKey, userId, now);
    }
    return verdict ? { ok: verdict.ok, reason: verdict.reason } : null;
  } catch (err) {
    console.warn("[antibot] observeMessage:", String(err?.message || err).slice(0, 200));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Voice / screen share heartbeats (shadow only)
// ---------------------------------------------------------------------------

function hasClientMediaHints(beat) {
  return Boolean(beat) && typeof beat === "object" && (typeof beat.inputAgoMs === "number" || typeof beat.vad === "boolean");
}

/**
 * Observe one accepted earning heartbeat. Media shadow rules (plan §4/§5) are
 * evaluated only when the client sends the new hints (inputAgoMs / vad /
 * frameDelta / visible); today's clients do not, so only activity is recorded.
 */
function observeHeartbeat({ userId, type, ctxKey, others = [], beat = null, now = Date.now() } = {}) {
  return safe(() => {
    if (!config.collecting() || !userId) return null;
    const s = u(userId);
    markActive(s, now);
    if (!hasClientMediaHints(beat) || !ctxKey) return null;
    const ago = Number(beat.inputAgoMs);
    const inputAt = Number.isFinite(ago) && ago >= 0 && ago < DAY_MS ? now - ago : 0;
    if (inputAt > s.inputAt) s.inputAt = inputAt;
    s.presence.set(ctxKey, { at: now, visible: beat.visible === true, inputAt });
    if (s.presence.size > 10) s.presence.delete(s.presence.keys().next().value);
    if (Number(beat.frameDelta) >= mediaRules.FRAME_DELTA_MIN) s.frameChangedAt = now;
    const list = Array.isArray(others) ? others.filter((id) => typeof id === "string").slice(0, 50) : [];
    const isReal = (id) => isRealOther(userId, id);
    if (type === "screenshare") {
      const v = mediaRules.evaluateScreenshare({
        userId,
        others: list,
        isRealOther: isReal,
        presenceOf: (id) => users.get(id)?.presence.get(ctxKey),
        self: { inputAt: s.inputAt, frameChangedAt: s.frameChangedAt },
        now,
      });
      if (!v.ok) shadowNote(userId, `screen_${v.reason}`, 1, now);
      return v;
    }
    s.vad = beat.vad === true;
    if (s.vad) s.lastSpokeAt = now;
    const v = mediaRules.evaluateVoice({
      userId,
      others: list,
      isRealOther: isReal,
      self: { vad: s.vad },
      lastSpokeAt: (id) => users.get(id)?.lastSpokeAt || 0,
      now,
    });
    if (v.reason) shadowNote(userId, `voice_${v.reason}`, 1, now);
    return v;
  });
}

// ---------------------------------------------------------------------------
// Capped credits (called from lib/descoin.js after the credit decision)
// ---------------------------------------------------------------------------

/**
 * @param {string} userId
 * @param {string} reason   voice_activity | screenshare_activity | message_activity
 * @param {number} credited coins that were credited (unchanged by this module)
 * @param {"hour"|"day"|"global"|null} capped
 */
function observeCredit(userId, reason, credited, capped) {
  return safe(() => {
    if (!config.collecting() || !userId) return;
    const s = u(userId);
    if (capped === "day") {
      if (s.capsHit.day !== today()) s.capsHit = { day: today(), set: new Set() };
      s.capsHit.set.add(reason);
      s.dirty = true;
    }
    if (credited > 0) {
      const r = riskOf(userId);
      const mult = risk.multiplierFor(r.score, r.trusted, config.RISK);
      if (mult < 1) shadowNote(userId, "would_withhold", credited - Math.floor(credited * mult));
    }
  });
}

// ---------------------------------------------------------------------------
// Persistence + jobs
// ---------------------------------------------------------------------------

function signalsFor(userId) {
  const s = u(userId);
  const counterparts = Object.fromEntries([...counterparts7(s).entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));
  return {
    ua_automation: s.ua.automation,
    webdriver: s.ua.webdriver,
    headless: s.ua.headless,
    client_signals_seen: s.ua.clientSignals,
    message_cv: risk.timingCv(s.msgTimes),
    active_hours_24: s.hours.size,
    day_caps_hit: s.capsHit.day === today() ? s.capsHit.set.size : 0,
    active_days: [...s.activeDays].sort(),
    counterparts,
    shadow: s.shadow,
  };
}

function mergeSignals(prev, next) {
  const p = prev && typeof prev === "object" ? prev : {};
  const days = new Set([...(Array.isArray(p.active_days) ? p.active_days : []), ...next.active_days]);
  const cps = { ...(p.counterparts && typeof p.counterparts === "object" ? p.counterparts : {}) };
  for (const [k, v] of Object.entries(next.counterparts)) cps[k] = Math.max(cps[k] || 0, v);
  const topCps = Object.fromEntries(Object.entries(cps).sort((a, b) => b[1] - a[1]).slice(0, 20));
  const shadow = { ...(p.shadow && typeof p.shadow === "object" ? p.shadow : {}), ...next.shadow };
  const sk = Object.keys(shadow).sort();
  while (sk.length > 7) delete shadow[sk.shift()];
  return {
    ...next,
    ua_automation: Boolean(p.ua_automation) || next.ua_automation,
    webdriver: Boolean(p.webdriver) || next.webdriver,
    headless: Boolean(p.headless) || next.headless,
    client_signals_seen: Boolean(p.client_signals_seen) || next.client_signals_seen,
    active_days: [...days].sort().slice(-14),
    counterparts: topCps,
    shadow,
  };
}

async function linksFor(userIds, now = Date.now()) {
  const out = new Map(userIds.map((id) => [id, new Set()]));
  if (!userIds.length) return out;
  const since = new Date(now - 30 * DAY_MS).toISOString();
  const mine = await store.run("descoin_device_seen", "select", (s) =>
    s.from("descoin_device_seen").select("user_id, kind, hash").in("user_id", userIds).gte("last_seen", since)
  );
  const hashes = [...new Set((mine.data || []).map((r) => r.hash))];
  if (!hashes.length) return out;
  const shared = await store.run("descoin_device_seen", "select", (s) =>
    s.from("descoin_device_seen").select("user_id, kind, hash").in("hash", hashes.slice(0, 150)).gte("last_seen", since)
  );
  const byHash = new Map();
  for (const r of shared.data || []) {
    if (!byHash.has(r.hash)) byHash.set(r.hash, []);
    byHash.get(r.hash).push(r);
  }
  const pairs = new Map(); // "a|b" -> {sameDevice, sameSubnet}
  for (const rows of byHash.values()) {
    if (rows.length > 25) continue; // carrier-grade NAT / campus network: never evidence
    for (const a of rows) {
      if (!out.has(a.user_id)) continue;
      for (const b of rows) {
        if (b.user_id === a.user_id) continue;
        const key = [a.user_id, b.user_id].sort().join("|");
        const p = pairs.get(key) || { sameDevice: false, sameSubnet: false };
        if (a.kind === "fp") p.sameDevice = true;
        if (a.kind === "subnet") p.sameSubnet = true;
        pairs.set(key, p);
      }
    }
  }
  if (!pairs.size) return out;
  const ids = [...new Set([...pairs.keys()].flatMap((k) => k.split("|")))].slice(0, 300);
  const supa = db();
  const [metaRes, refRes, riskRes] = await Promise.all([
    supa.from("users").select("id, created_at").in("id", ids),
    supa.from("referral_rewards").select("inviter_id, invitee_id").in("invitee_id", ids),
    store.run("descoin_risk", "select", (s) => s.from("descoin_risk").select("user_id, signals").in("user_id", ids)),
  ]);
  const created = new Map((metaRes.data || []).map((r) => [r.id, r.created_at ? new Date(r.created_at).getTime() : 0]));
  const refSet = new Set((refRes.data || []).map((r) => [r.inviter_id, r.invitee_id].sort().join("|")));
  const cpsBy = new Map((riskRes.data || []).map((r) => [r.user_id, r.signals?.counterparts || {}]));
  const insular = (a, b) => {
    const c = { ...(cpsBy.get(a) || {}) };
    const s = users.get(a);
    if (s) for (const [k, v] of counterparts7(s)) c[k] = Math.max(c[k] || 0, v);
    const total = Object.values(c).reduce((sum, v) => sum + v, 0);
    return total >= 10 && (c[b] || 0) / total >= 0.8;
  };
  const rows = [];
  const iso = new Date(now).toISOString();
  for (const [key, p] of pairs) {
    const [a, b] = key.split("|");
    const ca = created.get(a);
    const cb = created.get(b);
    const res = risk.linkStrength({
      ...p,
      referralPair: refSet.has(key),
      signupClose: Boolean(ca && cb && Math.abs(ca - cb) < 48 * 3600_000),
      insular: insular(a, b) || insular(b, a),
    });
    if (!res.linked) continue;
    out.get(a)?.add(b);
    out.get(b)?.add(a);
    rows.push({ user_a: a, user_b: b, kinds: res.kinds, strength: res.kinds.length, last_seen: iso });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    await store.run("descoin_account_links", "upsert", (s) =>
      s.from("descoin_account_links").upsert(part, { onConflict: "user_a,user_b" })
    );
  }
  return out;
}

let jobRunning = false;
let lastJob = null;

// PostgREST puts .in() lists in the URL; keep each batch small.
const JOB_BATCH = 100;

async function scoreBatch(chunk, now, alertDeps) {
  const [prevRes, links] = await Promise.all([
    store.run("descoin_risk", "select", (s) =>
      s.from("descoin_risk").select("user_id, score, signals, trusted").in("user_id", chunk)
    ),
    linksFor(chunk, now).catch((err) => {
      console.warn("[antibot] links:", String(err?.message || err).slice(0, 200));
      return new Map();
    }),
  ]);
  if (prevRes.skipped || prevRes.error) return null; // table missing or DB down: do not score blind
  await loadMeta(chunk);
  const refRes = await db().from("referral_rewards").select("inviter_id, invitee_id").in("invitee_id", chunk);
  const inviterOf = new Map((refRes?.data || []).map((r) => [r.invitee_id, r.inviter_id]));
  const prev = new Map((prevRes.data || []).map((r) => [r.user_id, r]));
  const upserts = [];
  const crossings = [];
  let atHalf = 0;
  let atZero = 0;
  for (const id of chunk) {
    const prevRow = prev.get(id);
    const merged = users.has(id) ? mergeSignals(prevRow?.signals, signalsFor(id)) : prevRow?.signals || {};
    const meta = metaCache.get(id);
    const linked = links.get(id) || new Set();
    const inviter = inviterOf.get(id);
    const cps = merged.counterparts || {};
    const total = Object.values(cps).reduce((sum, v) => sum + v, 0);
    const { score, reasons } = risk.scoreRisk({
      messageCv: merged.message_cv ?? null,
      automationUa: Boolean(merged.ua_automation),
      webdriver: Boolean(merged.webdriver),
      headlessHints: Boolean(merged.headless),
      activeHours24: merged.active_hours_24 || 0,
      dayCapsHit: merged.day_caps_hit || 0,
      linked: linked.size > 0,
      referralInsular: Boolean(inviter && total >= 5 && (cps[inviter] || 0) / total >= 0.8),
      accountAgeDays: meta?.createdAt ? (now - meta.createdAt) / DAY_MS : 999,
      emailVerified: meta ? meta.emailVerified : true,
      clientSignalsSeen: Boolean(merged.client_signals_seen),
      clientSignalsExpected: false,
    });
    merged.linked_with = [...linked].slice(0, 50);
    const trusted = Boolean(prevRow?.trusted);
    riskCache.set(id, { score, trusted, linked, at: now });
    upserts.push({ user_id: id, score, reasons, signals: merged, updated_at: new Date(now).toISOString() });
    crossings.push({ user_id: id, score, prevScore: prevRow ? prevRow.score ?? 0 : null, trusted, reasons });
    if (!trusted && score >= config.RISK.zero) atZero += 1;
    else if (!trusted && score >= config.RISK.half) atHalf += 1;
    const s = users.get(id);
    if (s) s.dirty = false;
  }
  await store.run("descoin_risk", "upsert", (s) => s.from("descoin_risk").upsert(upserts, { onConflict: "user_id" }));
  const alertRes = await alerts.processCrossings(crossings, alertDeps).catch((err) => {
    console.warn("[antibot] alerts:", String(err?.message || err).slice(0, 200));
    return { recorded: 0 };
  });
  return { users: upserts.length, atHalf, atZero, alerts: alertRes.recorded || 0 };
}

/** Recompute links + risk for users seen in memory (or the given ids). */
async function runRiskJob({ userIds = null, now = Date.now(), alertDeps } = {}) {
  if (!config.collecting() || jobRunning) return { users: 0, skipped: true };
  if (!store.available("descoin_risk")) return { users: 0, skipped: true };
  jobRunning = true;
  try {
    let ids = userIds;
    if (!ids) {
      ids = [...users.entries()]
        .sort((a, b) => Number(b[1].dirty) - Number(a[1].dirty) || b[1].lastSeenAt - a[1].lastSeenAt)
        .map(([id]) => id);
    }
    const all = [...new Set(ids)].filter(Boolean).slice(0, MAX_JOB_USERS);
    if (!all.length) return { users: 0 };
    const sum = { users: 0, atHalf: 0, atZero: 0, alerts: 0 };
    for (let i = 0; i < all.length; i += JOB_BATCH) {
      const r = await scoreBatch(all.slice(i, i + JOB_BATCH), now, alertDeps);
      if (!r) return { ...sum, skipped: sum.users === 0 };
      for (const k of Object.keys(sum)) sum[k] += r[k];
    }
    prune(now);
    lastJob = { at: new Date(now).toISOString(), ...sum };
    // Counts only: no ids or usernames in logs.
    console.log(`[antibot] risk job: scored=${sum.users} would_half=${sum.atHalf} would_zero=${sum.atZero} alerts=${sum.alerts}`);
    return sum;
  } finally {
    jobRunning = false;
  }
}

function prune(now = Date.now()) {
  for (const [id, s] of users) if (now - s.lastSeenAt > 2 * DAY_MS && !s.dirty) users.delete(id);
  for (const [k, log] of convLogs) if (!log.length || now - log[log.length - 1].at > messageRules.REPLY_WINDOW_MS) convLogs.delete(k);
  for (const [k, at] of deviceWriteAt) if (now - at > 30 * 60_000) deviceWriteAt.delete(k);
  for (const [k, m] of metaCache) if (now - m.at > 60 * 60_000) metaCache.delete(k);
}

/** Load trusted flags / scores on boot so shadow counters work before the first job. */
async function warmRiskCache() {
  const res = await store.run("descoin_risk", "select", (s) =>
    s.from("descoin_risk").select("user_id, score, trusted, signals").or("score.gte.40,trusted.eq.true").limit(5000)
  );
  for (const r of res.data || []) {
    riskCache.set(r.user_id, {
      score: r.score || 0,
      trusted: Boolean(r.trusted),
      linked: new Set(Array.isArray(r.signals?.linked_with) ? r.signals.linked_with : []),
      at: Date.now(),
    });
  }
}

function setTrustedLocal(userId, trusted) {
  const r = riskOf(userId);
  riskCache.set(userId, { ...r, trusted: Boolean(trusted), linked: r.linked || new Set(), at: Date.now() });
}

/** 90-day retention for hashes / links / alerts; 7 days for message fingerprints. The admin audit trail is kept. */
async function runRetention(now = Date.now()) {
  const cut = (days) => new Date(now - days * DAY_MS).toISOString();
  const R = config.RETENTION_DAYS;
  const jobs = [
    ["descoin_device_seen", "last_seen", R],
    ["descoin_account_links", "last_seen", R],
    ["descoin_risk_alerts", "created_at", R],
    ["descoin_message_fingerprints", "created_at", config.MESSAGE_FP_RETENTION_DAYS],
  ];
  for (const [table, col, days] of jobs) {
    await store.run(table, "retention", (s) => s.from(table).delete().lt(col, cut(days)));
  }
}

let timers = null;
function startAntibotScheduler() {
  if (timers || process.env.DESCOIN_ANTIBOT_SCHEDULER === "0" || !config.collecting()) return false;
  const boot = setTimeout(() => {
    warmRiskCache().catch(() => {});
    runRetention().catch(() => {});
  }, 20_000);
  const riskEvery = setInterval(() => {
    store
      .flush()
      .then(() => runRiskJob())
      .catch((e) => console.warn("[antibot] job:", String(e?.message || e).slice(0, 200)));
  }, 10 * 60_000);
  const retEvery = setInterval(() => runRetention().catch(() => {}), DAY_MS);
  for (const t of [boot, riskEvery, retEvery]) t.unref?.();
  timers = { boot, riskEvery, retEvery };
  return true;
}

function stopAntibotScheduler() {
  if (!timers) return;
  clearTimeout(timers.boot);
  clearInterval(timers.riskEvery);
  clearInterval(timers.retEvery);
  timers = null;
}

function status() {
  return {
    phase: config.ENFORCEMENT_BUILD ? "enforcement-capable" : "faz0-monitor",
    flags: config.getFlags(),
    requested: config.getRequestedFlags(),
    alerts: config.getAlertFlags(),
    trackedUsers: users.size,
    lastJob,
    missingTables: [...store._missing],
    schedulerRunning: Boolean(timers),
  };
}

function _reset() {
  users.clear();
  convLogs.clear();
  riskCache.clear();
  metaCache.clear();
  deviceWriteAt.clear();
  lastJob = null;
  jobRunning = false;
  store._reset();
  alerts._reset();
}

module.exports = {
  onSocketConnect,
  onClientSignals,
  observeMessage,
  observeHeartbeat,
  observeCredit,
  runRiskJob,
  warmRiskCache,
  setTrustedLocal,
  runRetention,
  startAntibotScheduler,
  stopAntibotScheduler,
  status,
  riskOf,
  isRealOther,
  signalsFor,
  mergeSignals,
  flush: store.flush,
  _reset,
  _users: users,
  _riskCache: riskCache,
  _metaCache: metaCache,
};
