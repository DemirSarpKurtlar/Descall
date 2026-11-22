"use strict";

/**
 * Canlı popup engine (admin remake, Draft B "Kontrol merkezi", Nov 2026).
 *
 *  - campaigns: send now or schedule; live for 24 hours, then ended. A live
 *    campaign keeps one receipt per recipient in memory (flushed to
 *    popup_receipts every few seconds) so the panel can follow it live;
 *  - delivery: `admin:popup` to each matching socket (a platform rule only
 *    reaches sockets of that platform). People who were not reachable get it on
 *    their next connect (pending_login) while the campaign is live;
 *  - receipts: the client reports delivered / seen / clicked / acked / dismissed
 *    (`popup:receipt`, see socket/popupReceipts.js). An acknowledgement on one
 *    device closes the popup on the person's other devices;
 *  - recall: closes every open popup at once (`admin:popup:recall`), cancels the
 *    login deliveries, and can show a short correction or send an edited copy;
 *  - "Düzeldi": ends an incident popup and sends a success popup to the same people;
 *  - scheduler: every 15 s it fires due schedules, ends expired campaigns,
 *    settles unconfirmed deliveries and samples the connected count.
 * Works without the tables (memory only) until the migration is applied.
 */

const crypto = require("crypto");
const model = require("./model");
const store = require("./store");
const state = require("../../runtime/sharedState");
const { pruneDeadPresence, summarizePresence } = require("../presenceRoster");

const TICK_MS = 15_000;
const CONFIRM_MS = 30_000;
const FLUSH_DEBOUNCE_MS = 2_000;
const SAMPLE_KEEP_MS = 80 * 60_000;
const CACHE_ENDED = 20;

const E = {
  io: null,
  started: false,
  initPromise: null,
  campaigns: new Map(),
  dirtyReceipts: new Map(),
  dirtyCampaigns: new Set(),
  samples: [],
  timer: null,
  flushTimer: null,
  notifyAt: new Map(),
  notifyTimers: new Map(),
  clock: () => Date.now(),
};

const nowMs = () => E.clock();
const iso = (t = nowMs()) => new Date(t).toISOString();

function httpError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/* ---------------- lifecycle ---------------- */

function attachIo(io) {
  if (io) E.io = io;
  if (!E.started) start();
  return E.initPromise;
}

function start() {
  E.started = true;
  E.initPromise = init().catch((err) => console.warn("[live-popup] init failed:", err?.message || err));
  if (process.env.NODE_ENV !== "test") {
    E.timer = setInterval(() => tick().catch((err) => console.warn("[live-popup] tick failed:", err?.message || err)), TICK_MS);
    E.timer.unref?.();
  }
}

async function init() {
  const rows = await store.loadActive();
  for (const c of rows) {
    if (E.campaigns.has(c.id)) continue;
    const receipts = c.status === "live" ? await store.loadReceipts(c.id) : [];
    E.campaigns.set(c.id, entryOf(c, receipts));
  }
  sample();
}

function ready() {
  return E.initPromise || Promise.resolve();
}

function entryOf(c, receipts = []) {
  return {
    c: { ...c, audience: c.audience || { rules: [] }, stats: c.stats || {} },
    receipts: new Map(receipts.map((r) => [String(r.user_id), { ...r }])),
    emitted: new Map(),
  };
}

/* ---------------- presence helpers ---------------- */

function socketsOf(userId) {
  const io = E.io;
  const room = io?.sockets?.adapter?.rooms?.get?.(`user:${String(userId)}`);
  const ids = room ? [...room] : [];
  const out = [];
  for (const sid of ids) {
    const s = io?.sockets?.sockets?.get?.(sid);
    if (!s) continue;
    const auth = s.handshake?.auth || {};
    out.push({ id: sid, platform: model.platformOf(auth.platform === "ios" ? "ios" : auth.app), lang: model.normLang(auth.lang) });
  }
  return out;
}

function roster() {
  const io = E.io;
  if (io) pruneDeadPresence(state.presence, io);
  return summarizePresence(state.presence, { io });
}

function connectedCandidates() {
  const r = roster();
  return {
    roster: r,
    list: (r.live || []).map((row) => {
      const sockets = socketsOf(row.id);
      const platforms = [...new Set(sockets.map((s) => s.platform))];
      return {
        id: String(row.id),
        username: row.username || null,
        avatar_url: row.avatar_url || null,
        status: row.status,
        sockets,
        platforms,
        lang: sockets.find((s) => s.lang)?.lang || null,
      };
    }),
  };
}

function voiceUserIds() {
  const out = new Set();
  for (const call of state.activeServerVoiceCalls?.values?.() || []) {
    for (const uid of call?.participants?.keys?.() || []) out.add(String(uid));
  }
  for (const call of state.activeGroupCalls?.values?.() || []) {
    for (const uid of call?.participants || []) out.add(String(uid));
  }
  return out;
}

/** Whether the voice rule can be offered (server voice state lives in this process). */
function voiceAvailable() {
  return Boolean(state.activeServerVoiceCalls && state.activeGroupCalls);
}

/* ---------------- audience ---------------- */

/**
 * Connected people matching the rules (+ offline people picked by name, shown at login).
 * @returns {Promise<{targets: object[], offline: object[], connected: number}>}
 */
async function resolveAudience({ audience, actorId = null, includeSelf = false, severity = "info", fixedUserIds = null, withMeta = false }) {
  const { list: all } = connectedCandidates();
  const connected = all.length;
  const rules = audience?.rules || [];
  const has = (t) => rules.some((r) => r.type === t);
  let targets;
  let offlineIds = [];

  if (fixedUserIds) {
    const want = new Set(fixedUserIds.map(String));
    targets = all.filter((c) => want.has(c.id));
    const online = new Set(targets.map((c) => c.id));
    offlineIds = [...want].filter((id) => !online.has(id));
  } else {
    let pool = all;
    const usersRule = model.ruleOf(audience, "users");
    if (usersRule) {
      const want = new Set(usersRule.users.map((u) => u.id));
      pool = all.filter((c) => want.has(c.id.toLowerCase()));
      const liveIds = new Set(pool.map((c) => c.id.toLowerCase()));
      // Offline picks get it at login, unless a rule needs a live session to judge.
      if (!has("platform") && !has("voice") && !has("visibility")) offlineIds = [...want].filter((id) => !liveIds.has(id));
    }
    const needMeta = has("accountAge") || has("language");
    const metaIds = [...pool.map((c) => c.id), ...offlineIds];
    const meta = needMeta || (withMeta && metaIds.length) ? new Map((await store.usersByIds(metaIds)).map((u) => [String(u.id), u])) : new Map();
    const plans = has("premium") ? await require("../premium/badges").plansFor(metaIds).catch(() => new Map()) : new Map();
    const voice = has("voice") ? voiceUserIds() : new Set();
    const serverRule = model.ruleOf(audience, "server");
    const serverMembers = serverRule ? await store.serverMembersAmong(serverRule.serverId, metaIds) : null;
    const enrich = (c) => {
      const m = meta.get(c.id) || meta.get(c.id.toLowerCase());
      return {
        ...c,
        lang: c.lang || model.normLang(m?.language) || null,
        createdAt: m?.created_at || null,
        plan: plans.get?.(c.id) || null,
        inVoice: voice.has(c.id),
      };
    };
    const ctx = { serverMembers, now: nowMs() };
    targets = pool.map(enrich).filter((c) => model.matchCandidate(c, audience, ctx));
    if (offlineIds.length) {
      const offRules = { rules: rules.filter((r) => !["users", "platform", "voice", "visibility"].includes(r.type)) };
      offlineIds = offlineIds.filter((id) => {
        const m = meta.get(id);
        const c = { id, lang: model.normLang(m?.language), createdAt: m?.created_at || null, plan: plans.get?.(id) || null, platforms: [], inVoice: false };
        return model.matchCandidate(c, offRules, ctx);
      });
    }
  }

  const self = actorId ? String(actorId) : null;
  if (self) {
    targets = targets.filter((c) => c.id !== self);
    offlineIds = offlineIds.filter((id) => id !== self);
    if (includeSelf) {
      const me = all.find((c) => c.id === self);
      if (me) targets.push(me);
    }
  }
  if (severity === "info") {
    const exempt = await store.exemptIds().catch(() => new Set());
    if (exempt.size) {
      targets = targets.filter((c) => c.id === self || !exempt.has(c.id));
      offlineIds = offlineIds.filter((id) => !exempt.has(id));
    }
  }

  let offline = [];
  if (offlineIds.length) {
    const rows = await store.usersByIds(offlineIds);
    const byId = new Map(rows.map((u) => [String(u.id).toLowerCase(), u]));
    offline = offlineIds.map((id) => {
      const u = byId.get(String(id).toLowerCase());
      return { id: u ? String(u.id) : id, username: u?.username || null, avatar_url: u?.avatar_url || null, lang: model.normLang(u?.language) };
    });
  }
  if (withMeta) {
    const missingLang = targets.filter((c) => !c.lang).map((c) => c.id);
    if (missingLang.length) {
      const rows = await store.usersByIds(missingLang, "id, language");
      const langs = new Map(rows.map((u) => [String(u.id), model.normLang(u.language)]));
      targets = targets.map((c) => (c.lang ? c : { ...c, lang: langs.get(c.id) || null }));
    }
  }
  return { targets, offline, connected };
}

async function audiencePreview({ audience, actorId, includeSelf, severity }) {
  const clean = model.normalizeAudience(audience);
  const res = await resolveAudience({ audience: clean, actorId, includeSelf, severity });
  const platformRule = model.ruleOf(clean, "platform");
  const byPlatform = Object.fromEntries(model.PLATFORMS.map((p) => [p, 0]));
  for (const t of res.targets) {
    const p = model.primaryPlatform(t.platforms, platformRule?.values) || "web";
    byPlatform[p] += 1;
  }
  return {
    count: res.targets.length + res.offline.length,
    online: res.targets.length,
    offline: res.offline.length,
    connected: res.connected,
    share: res.connected ? Math.round((res.targets.length / res.connected) * 100) : 0,
    byPlatform,
    sample: res.targets.slice(0, 8).map((t) => ({ id: t.id, username: t.username, avatarUrl: t.avatar_url })),
    voiceAvailable: voiceAvailable(),
  };
}

/* ---------------- campaigns ---------------- */

function newCampaignRow({ content, audience, includeSelf, scheduleAt, note, templateId, actor, kind = "standard", parentId = null }) {
  return {
    id: crypto.randomUUID(),
    status: scheduleAt ? "scheduled" : "live",
    kind,
    parent_id: parentId,
    title: content.title,
    body: content.body,
    severity: content.severity,
    icon: content.icon,
    duration_ms: content.durationMs,
    require_ack: content.requireAck,
    auto_resolve: content.autoResolve,
    cta_label: content.ctaLabel || null,
    cta_url: content.ctaUrl || null,
    audience,
    include_self: Boolean(includeSelf),
    template_id: templateId || null,
    note: note || null,
    stats: {},
    scheduled_at: scheduleAt || null,
    sent_at: null,
    expires_at: null,
    ended_at: null,
    recalled_at: null,
    recall_mode: null,
    recall_reason: null,
    recalled_by: null,
    created_by: actor?.id || null,
    created_by_username: actor?.username || null,
    created_at: iso(),
    updated_at: iso(),
  };
}

async function countSentToday(extraDayStart = null) {
  const since = extraDayStart || model.dayStartIso(nowMs());
  const fromDb = await store.countSentSince(since).catch(() => null);
  if (fromDb != null) return fromDb;
  let n = 0;
  for (const { c } of E.campaigns.values()) if (c.sent_at && c.sent_at >= since && c.kind !== "single") n += 1;
  return n;
}

async function checkDailyLimit(scheduleAt) {
  if (!scheduleAt) {
    const sent = await countSentToday();
    if (sent >= model.DAILY_LIMIT) throw httpError(429, "The daily popup limit is reached.", "DAILY_LIMIT");
    return;
  }
  const dayStart = model.dayStartIso(Date.parse(scheduleAt));
  const dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString();
  let n = 0;
  for (const { c } of E.campaigns.values()) if (c.status === "scheduled" && c.scheduled_at >= dayStart && c.scheduled_at < dayEnd) n += 1;
  if (dayStart === model.dayStartIso(nowMs())) n += await countSentToday();
  if (n >= model.DAILY_LIMIT) throw httpError(429, "The daily popup limit is reached for that day.", "DAILY_LIMIT");
}

/**
 * Create and send now, or schedule.
 * @returns {Promise<object>} the campaign entry
 */
async function createCampaign({ content, audience, includeSelf = false, scheduleAt = null, note, templateId = null, actor, kind = "standard", parentId = null, skipLimit = false }) {
  await ready();
  if (!skipLimit) await checkDailyLimit(scheduleAt);
  const row = newCampaignRow({ content, audience, includeSelf, scheduleAt, note, templateId, actor, kind, parentId });
  const entry = entryOf(row);
  if (scheduleAt) {
    E.campaigns.set(row.id, entry);
    await store.saveCampaign(row);
    if (templateId) store.bumpTemplate(templateId).catch(() => {});
    scheduledChanged(row.id);
    return entry;
  }
  const res = await sendCampaign(entry, { requireRecipients: true });
  if (templateId) store.bumpTemplate(templateId).catch(() => {});
  return res;
}

async function parentRecipientIds(parentId) {
  const parent = await getEntry(parentId);
  return parent ? [...parent.receipts.keys()] : [];
}

function baseReceipt(campaignId, person, platform) {
  return {
    campaign_id: campaignId,
    user_id: person.id,
    username: person.username || null,
    platform: platform || null,
    language: person.lang || null,
    delivered_at: null,
    seen_at: null,
    clicked_at: null,
    acked_at: null,
    dismissed_at: null,
    missed_at: null,
    missed_reason: null,
    closed_at: null,
    pending_login: false,
    resend_count: 0,
  };
}

async function sendCampaign(entry, { requireRecipients = false } = {}) {
  const c = entry.c;
  const fixed = c.audience?.fromCampaign ? await parentRecipientIds(c.audience.fromCampaign) : null;
  const res = await resolveAudience({
    audience: c.audience,
    actorId: c.created_by,
    includeSelf: c.include_self,
    severity: c.severity,
    fixedUserIds: fixed,
    withMeta: true,
  });
  const total = res.targets.length + res.offline.length;
  if (!total && requireRecipients) throw httpError(400, "No one matches this audience right now.", "NO_RECIPIENTS");
  const t0 = nowMs();
  c.status = total ? "live" : "ended";
  c.sent_at = iso(t0);
  c.expires_at = iso(t0 + model.LIVE_WINDOW_MS);
  if (!total) c.ended_at = iso(t0);
  E.campaigns.set(c.id, entry);
  const wire = model.toWirePopup(c);
  const allowed = model.ruleOf(c.audience, "platform")?.values || null;
  for (const t of res.targets) {
    const r = baseReceipt(c.id, t, model.primaryPlatform(t.platforms, allowed));
    const sockets = allowed ? t.sockets.filter((s) => allowed.includes(s.platform)) : t.sockets;
    if (sockets.length && E.io) {
      for (const s of sockets) E.io.to(s.id).emit("admin:popup", wire);
      entry.emitted.set(t.id, t0);
    } else {
      r.missed_at = iso(t0);
      r.missed_reason = "connection";
      r.pending_login = true;
    }
    entry.receipts.set(t.id, r);
  }
  for (const o of res.offline) {
    if (entry.receipts.has(o.id)) continue;
    const r = baseReceipt(c.id, o, null);
    r.missed_at = iso(t0);
    r.missed_reason = "offline";
    r.pending_login = true;
    entry.receipts.set(o.id, r);
  }
  c.stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at }));
  await store.saveCampaign(c);
  await store.upsertReceipts([...entry.receipts.values()]);
  notifyAdmins(c.id);
  return entry;
}

async function getEntry(id) {
  if (!model.isUuid(id)) return null;
  const hit = E.campaigns.get(id);
  if (hit) return hit;
  const c = await store.getCampaign(id);
  if (!c) return null;
  const receipts = c.sent_at ? await store.loadReceipts(id) : [];
  const entry = entryOf(c, receipts);
  E.campaigns.set(id, entry);
  evictEnded();
  return entry;
}

function evictEnded() {
  const ended = [...E.campaigns.values()].filter((e) => !["live", "scheduled"].includes(e.c.status));
  if (ended.length <= CACHE_ENDED || !store.available()) return;
  ended
    .sort((a, b) => String(a.c.sent_at || a.c.created_at).localeCompare(String(b.c.sent_at || b.c.created_at)))
    .slice(0, ended.length - CACHE_ENDED)
    .forEach((e) => {
      if (!E.dirtyCampaigns.has(e.c.id) && !E.dirtyReceipts.has(e.c.id)) E.campaigns.delete(e.c.id);
    });
}

async function requireEntry(id, statuses) {
  await ready();
  const entry = await getEntry(id);
  if (!entry) throw httpError(404, "Popup not found.", "NOT_FOUND");
  if (statuses && !statuses.includes(entry.c.status)) throw httpError(409, "This popup can no longer do that.", "BAD_STATE");
  return entry;
}

/* ---------------- receipts ---------------- */

function markDirty(entry, userId) {
  if (!E.dirtyReceipts.has(entry.c.id)) E.dirtyReceipts.set(entry.c.id, new Set());
  if (userId) E.dirtyReceipts.get(entry.c.id).add(String(userId));
  E.dirtyCampaigns.add(entry.c.id);
  if (!E.flushTimer) {
    E.flushTimer = setTimeout(() => {
      E.flushTimer = null;
      flush().catch((err) => console.warn("[live-popup] flush failed:", err?.message || err));
    }, FLUSH_DEBOUNCE_MS);
    E.flushTimer.unref?.();
  }
}

/**
 * A client receipt. Only the recipient's own row of a live campaign moves; every
 * timestamp is set once.
 * @returns {boolean} accepted
 */
function handleReceipt(socket, payload = {}) {
  const userId = socket?.user?.id ? String(socket.user.id) : null;
  const id = String(payload?.id || "");
  const kind = String(payload?.kind || "");
  if (!userId || !model.isUuid(id) || !model.RECEIPT_KINDS.includes(kind)) return false;
  const entry = E.campaigns.get(id);
  if (!entry || entry.c.status !== "live") return false;
  const r = entry.receipts.get(userId);
  if (!r) return false;
  const now = iso();
  const auth = socket.handshake?.auth || {};
  const lang = model.normLang(payload.lang) || model.normLang(auth.lang);
  if (lang) r.language = lang;
  if (!r.platform) r.platform = model.platformOf(auth.platform === "ios" ? "ios" : auth.app);
  const ensureDelivered = () => {
    if (!r.delivered_at) r.delivered_at = now;
    r.pending_login = false;
    entry.emitted.delete(userId);
  };
  let closeOthers = false;
  if (kind === "delivered") ensureDelivered();
  if (kind === "seen") {
    ensureDelivered();
    if (!r.seen_at) r.seen_at = now;
  }
  if (kind === "clicked") {
    ensureDelivered();
    if (!r.seen_at) r.seen_at = now;
    if (!r.clicked_at) r.clicked_at = now;
    if (!entry.c.require_ack && !r.closed_at) {
      r.closed_at = now;
      closeOthers = true;
    }
  }
  if (kind === "acked") {
    ensureDelivered();
    if (!r.seen_at) r.seen_at = now;
    if (!r.acked_at) r.acked_at = now;
    closeOthers = true;
  }
  if (kind === "dismissed") {
    ensureDelivered();
    if (!r.dismissed_at && !r.acked_at) r.dismissed_at = now;
    closeOthers = true;
  }
  if (closeOthers) {
    try {
      socket.to?.(`user:${userId}`)?.emit?.("admin:popup:close", { id });
    } catch {
      /* best effort */
    }
  }
  markDirty(entry, userId);
  notifyAdmins(id);
  return true;
}

/** Show pending (missed) and still-unacknowledged required popups on a new connection. */
function onUserConnected(socket) {
  const userId = socket?.user?.id ? String(socket.user.id) : null;
  if (!userId) return 0;
  const auth = socket.handshake?.auth || {};
  const platform = model.platformOf(auth.platform === "ios" ? "ios" : auth.app);
  const t = nowMs();
  let shown = 0;
  for (const entry of E.campaigns.values()) {
    const c = entry.c;
    if (c.status !== "live" || (c.expires_at && Date.parse(c.expires_at) <= t)) continue;
    const r = entry.receipts.get(userId);
    if (!r) continue;
    const allowed = model.ruleOf(c.audience, "platform")?.values;
    if (allowed && !allowed.includes(platform)) continue;
    const pending = !r.delivered_at && r.pending_login;
    const unacked = c.require_ack && model.isOpen(r);
    if (!pending && !unacked) continue;
    socket.emit("admin:popup", model.toWirePopup(c));
    entry.emitted.set(userId, t);
    shown += 1;
  }
  return shown;
}

/* ---------------- actions ---------------- */

async function recall(id, input, actor) {
  const entry = await requireEntry(id, ["live"]);
  const c = entry.c;
  const before = model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at });
  const now = iso();
  let closed = 0;
  for (const [uid, r] of entry.receipts) {
    const emittedOnly = !r.delivered_at && entry.emitted.has(uid);
    if (model.isOpen(r) || emittedOnly) {
      E.io?.to(`user:${uid}`).emit("admin:popup:recall", { id: c.id, mode: input.mode, note: input.mode === "note" ? input.note : "" });
      if (model.isOpen(r)) closed += 1;
      r.closed_at = now;
    }
    r.pending_login = false;
  }
  entry.emitted.clear();
  c.status = "recalled";
  c.recalled_at = now;
  c.recall_mode = input.mode;
  c.recall_reason = input.reason;
  c.recalled_by = actor?.id || null;
  c.ended_at = now;
  c.stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at }));
  await store.saveCampaign(c);
  await store.upsertReceipts([...entry.receipts.values()]);
  let followUp = null;
  if (input.mode === "edited" && input.edited) {
    const next = await createCampaign({
      content: input.edited,
      audience: { rules: [], fromCampaign: c.id },
      includeSelf: false,
      note: input.reason,
      actor,
      kind: "edited",
      parentId: c.id,
      skipLimit: true,
    }).catch((err) => {
      if (err?.code === "NO_RECIPIENTS") return null;
      throw err;
    });
    followUp = next ? next.c.id : null;
  }
  notifyAdmins(c.id);
  return { closed, pendingCanceled: before.pendingLogin, alreadySeen: before.seen, followUp };
}

async function resend(id, userIds, actor) {
  const entry = await requireEntry(id, ["live"]);
  const c = entry.c;
  const wire = model.toWirePopup(c);
  const allowed = model.ruleOf(c.audience, "platform")?.values || null;
  const want = Array.isArray(userIds) && userIds.length ? new Set(userIds.map(String)) : null;
  const t = nowMs();
  let sent = 0;
  let queued = 0;
  for (const [uid, r] of entry.receipts) {
    if (want ? !want.has(uid) : model.receiptStatus(r) !== "missed") continue;
    if (c.created_by && uid === String(c.created_by) && !want) continue;
    const sockets = socketsOf(uid).filter((s) => !allowed || allowed.includes(s.platform));
    r.resend_count = (Number(r.resend_count) || 0) + 1;
    r.closed_at = null;
    r.dismissed_at = null;
    if (sockets.length && E.io) {
      for (const s of sockets) E.io.to(s.id).emit("admin:popup", wire);
      entry.emitted.set(uid, t);
      sent += 1;
    } else {
      r.pending_login = true;
      if (!r.delivered_at && !r.missed_at) {
        r.missed_at = iso(t);
        r.missed_reason = "offline";
      }
      queued += 1;
    }
    markDirty(entry, uid);
  }
  notifyAdmins(c.id);
  return { sent, queued, actor: actor?.username || null };
}

async function resolveIncident(id, content, actor, note) {
  const entry = await requireEntry(id, ["live"]);
  const c = entry.c;
  const now = iso();
  for (const [uid, r] of entry.receipts) {
    if (model.isOpen(r) || (!r.delivered_at && entry.emitted.has(uid))) {
      E.io?.to(`user:${uid}`).emit("admin:popup:recall", { id: c.id, mode: "silent", note: "" });
      r.closed_at = now;
    }
    r.pending_login = false;
  }
  entry.emitted.clear();
  c.status = "ended";
  c.ended_at = now;
  c.recall_mode = "resolved";
  c.stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at }));
  await store.saveCampaign(c);
  await store.upsertReceipts([...entry.receipts.values()]);
  const next = await createCampaign({
    content,
    audience: { rules: [], fromCampaign: c.id },
    includeSelf: false,
    note,
    actor,
    kind: "resolved",
    parentId: c.id,
    skipLimit: true,
  }).catch((err) => {
    if (err?.code === "NO_RECIPIENTS") return null;
    throw err;
  });
  notifyAdmins(c.id);
  return { followUp: next ? next.c.id : null, recipients: next ? next.receipts.size : 0 };
}

async function endCampaign(id) {
  const entry = await requireEntry(id, ["live"]);
  const c = entry.c;
  c.status = "ended";
  c.ended_at = iso();
  for (const r of entry.receipts.values()) r.pending_login = false;
  entry.emitted.clear();
  c.stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at }));
  await store.saveCampaign(c);
  await store.upsertReceipts([...entry.receipts.values()]);
  notifyAdmins(c.id);
  return entry;
}

async function cancelScheduled(id, reason) {
  const entry = await requireEntry(id, ["scheduled"]);
  entry.c.status = "canceled";
  entry.c.ended_at = iso();
  entry.c.recall_reason = reason || null;
  await store.saveCampaign(entry.c);
  notifyAdmins(id);
  scheduledChanged(id);
  return entry;
}

async function sendScheduledNow(id) {
  const entry = await requireEntry(id, ["scheduled"]);
  const sent = await countSentToday();
  if (sent >= model.DAILY_LIMIT) throw httpError(429, "The daily popup limit is reached.", "DAILY_LIMIT");
  return sendCampaign(entry, { requireRecipients: true });
}

async function updateScheduled(id, { content, audience, includeSelf, scheduleAt }) {
  const entry = await requireEntry(id, ["scheduled"]);
  const c = entry.c;
  Object.assign(c, {
    title: content.title,
    body: content.body,
    severity: content.severity,
    icon: content.icon,
    duration_ms: content.durationMs,
    require_ack: content.requireAck,
    auto_resolve: content.autoResolve,
    cta_label: content.ctaLabel || null,
    cta_url: content.ctaUrl || null,
    audience,
    include_self: Boolean(includeSelf),
    scheduled_at: scheduleAt,
  });
  await store.saveCampaign(c);
  notifyAdmins(id);
  scheduledChanged(id);
  return entry;
}

/*
 * Hybrid server: scheduled sends run on the leader only (two nodes load the same
 * scheduled rows at boot). A schedule made / changed / cancelled on another node
 * reaches the leader's memory through dc:inval. No-ops on a single node.
 */
function cluster() {
  return require("../cluster");
}

function scheduledChanged(id) {
  cluster().invalidate("livePopupScheduled", id);
}

cluster().onInvalidate("livePopupScheduled", (m) => {
  const hit = m.id ? E.campaigns.get(m.id) : null;
  if (hit && hit.c.status !== "scheduled") return;
  if (m.id) E.campaigns.delete(m.id);
  getEntry(m.id).catch(() => {});
});

/** "Telefonuma test gönder": to the admin's own phone sockets (or every own socket), never tracked. */
function testSend(actor, content) {
  const sockets = socketsOf(actor.id);
  const mobile = sockets.filter((s) => s.platform === "ios" || s.platform === "android");
  const list = mobile.length ? mobile : sockets;
  const c = { ...newCampaignRow({ content, audience: { rules: [] }, actor }), sent_at: iso() };
  const wire = { ...model.toWirePopup(c, { test: true }), id: `test-${c.id}` };
  for (const s of list) E.io?.to(s.id).emit("admin:popup", wire);
  return { devices: list.length, mobile: mobile.length > 0 };
}

/* ---------------- reads ---------------- */

function summary(entry) {
  const c = entry.c;
  const live = c.status === "live" ? model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: c.sent_at })) : null;
  return campaignView(c, live);
}

function campaignView(c, liveStats = null) {
  return {
    id: c.id,
    status: c.status,
    kind: c.kind,
    parentId: c.parent_id || null,
    title: c.title,
    body: c.body,
    severity: c.severity,
    icon: c.icon,
    durationMs: Number(c.duration_ms) || 0,
    requireAck: Boolean(c.require_ack),
    autoResolve: Boolean(c.auto_resolve),
    ctaLabel: c.cta_label || "",
    ctaUrl: c.cta_url || "",
    audience: c.audience || { rules: [] },
    includeSelf: Boolean(c.include_self),
    templateId: c.template_id || null,
    note: c.note || null,
    stats: liveStats || c.stats || {},
    scheduledAt: c.scheduled_at || null,
    sentAt: c.sent_at || null,
    expiresAt: c.expires_at || null,
    endedAt: c.ended_at || null,
    recalledAt: c.recalled_at || null,
    recallMode: c.recall_mode || null,
    recallReason: c.recall_reason || null,
    createdBy: { id: c.created_by || null, username: c.created_by_username || null },
    createdAt: c.created_at || null,
  };
}

function sample() {
  const n = roster().connectedCount || 0;
  const t = nowMs();
  E.samples.push({ at: t, n });
  while (E.samples.length && t - E.samples[0].at > SAMPLE_KEEP_MS) E.samples.shift();
  return n;
}

function connectedDelta(current) {
  const t = nowMs();
  const target = t - 60 * 60_000;
  let best = null;
  for (const s of E.samples) {
    if (s.at > t - 5 * 60_000) break;
    if (!best || Math.abs(s.at - target) < Math.abs(best.at - target)) best = s;
  }
  return best ? { delta: current - best.n, sinceMs: t - best.at } : null;
}

async function overview() {
  await ready();
  const r = roster();
  const connected = r.connectedCount || 0;
  const delta = connectedDelta(connected);
  let openOnScreen = 0;
  const live = [];
  const queue = [];
  for (const entry of E.campaigns.values()) {
    if (entry.c.status === "live") {
      for (const rc of entry.receipts.values()) if (model.receiptStatus(rc) === "open") openOnScreen += 1;
      live.push(summary(entry));
    } else if (entry.c.status === "scheduled") queue.push(campaignView(entry.c));
  }
  live.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  queue.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const since30 = iso(nowMs() - 30 * 86400000);
  const rows = await store.listCampaigns({ limit: 120, since: since30 }).catch(() => []);
  const byId = new Map();
  for (const row of rows) if (row.sent_at) byId.set(row.id, campaignView(row));
  for (const entry of E.campaigns.values()) if (entry.c.sent_at && entry.c.sent_at >= since30) byId.set(entry.c.id, summary(entry));
  const history = [...byId.values()].filter((c) => c.status !== "scheduled" && c.status !== "canceled").sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  const rated = history.filter((h) => Number(h.stats?.delivered) > 0);
  const avg = (fn) => (rated.length ? Math.round(rated.reduce((s, h) => s + fn(h), 0) / rated.length) : 0);
  const sentToday = await countSentToday();
  return {
    kpis: {
      connected,
      connectedDelta: delta ? delta.delta : null,
      connectedDeltaMinutes: delta ? Math.round(delta.sinceMs / 60000) : null,
      visible: r.visibleCount || 0,
      invisible: r.invisibleCount || 0,
      openOnScreen,
      sentToday,
      dailyLimit: model.DAILY_LIMIT,
    },
    live,
    queue,
    history: history.slice(0, 60),
    summary30d: {
      count: history.length,
      avgSeenPct: avg((h) => (100 * Number(h.stats.seen || 0)) / Number(h.stats.delivered)),
      avgClickPct: avg((h) => (100 * Number(h.stats.clicked || 0)) / Number(h.stats.delivered)),
    },
    persistent: store.available(),
    voiceAvailable: voiceAvailable(),
  };
}

async function listHistory({ limit = 100 } = {}) {
  await ready();
  const rows = await store.listCampaigns({ limit, statuses: ["live", "ended", "recalled", "canceled"] }).catch(() => []);
  const byId = new Map(rows.map((row) => [row.id, campaignView(row)]));
  for (const entry of E.campaigns.values()) if (entry.c.status !== "scheduled") byId.set(entry.c.id, summary(entry));
  return [...byId.values()].sort((a, b) => String(b.sentAt || b.createdAt).localeCompare(String(a.sentAt || a.createdAt))).slice(0, limit);
}

async function detail(id) {
  const entry = await requireEntry(id);
  const c = entry.c;
  const receipts = [...entry.receipts.values()];
  const stats = model.computeStats(receipts, { sentAt: c.sent_at, now: nowMs(), ctaUrl: c.cta_url || "" });
  const avatarIds = [...new Set([...stats.recentAckers.map((a) => a.id), ...stats.events.map((e) => e.userId)])];
  const avatars = await avatarsFor(avatarIds);
  stats.recentAckers = stats.recentAckers.map((a) => ({ ...a, avatarUrl: avatars.get(String(a.id)) || null }));
  stats.events = stats.events.map((e) => ({ ...e, avatarUrl: avatars.get(String(e.userId)) || null }));
  return { campaign: campaignView(c, model.statsSnapshot(stats)), stats, persistent: store.available() };
}

async function avatarsFor(ids) {
  const out = new Map();
  const missing = [];
  for (const id of ids) {
    const p = state.presence.get(id) || state.presence.get(String(id));
    if (p?.avatar_url) out.set(String(id), p.avatar_url);
    else missing.push(String(id));
  }
  if (missing.length) {
    const rows = await store.usersByIds(missing, "id, avatar_url").catch(() => []);
    for (const u of rows) out.set(String(u.id), u.avatar_url || null);
  }
  return out;
}

function lastActivity(r) {
  return Math.max(...["acked_at", "clicked_at", "dismissed_at", "seen_at", "delivered_at", "missed_at"].map((k) => (r[k] ? Date.parse(r[k]) : 0)));
}

async function receiptsPage(id, { filter = "all", q = "", platform = "", offset = 0, limit = 50 } = {}) {
  const entry = await requireEntry(id);
  const all = [...entry.receipts.values()];
  const counts = model.filterCounts(all);
  const f = model.FILTERS.includes(filter) ? filter : "all";
  const term = String(q || "").replace(/^@+/, "").trim().toLowerCase().slice(0, 40);
  const plats = String(platform || "")
    .split(",")
    .filter((p) => model.PLATFORMS.includes(p));
  const rows = all
    .filter((r) => model.matchesFilter(r, f))
    .filter((r) => !term || String(r.username || "").toLowerCase().includes(term))
    .filter((r) => !plats.length || plats.includes(r.platform || "web"))
    .sort((a, b) => lastActivity(b) - lastActivity(a) || String(a.username || "").localeCompare(String(b.username || "")));
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const page = rows.slice(start, start + size);
  const avatars = await avatarsFor(page.map((r) => r.user_id));
  const exempt = await store.exemptIds().catch(() => new Set());
  return {
    campaign: campaignView(entry.c),
    counts,
    total: all.length,
    filtered: rows.length,
    offset: start,
    rows: page.map((r) => ({
      userId: r.user_id,
      username: r.username,
      avatarUrl: avatars.get(String(r.user_id)) || null,
      platform: r.platform || null,
      language: model.normLang(r.language) || null,
      status: model.receiptStatus(r),
      deliveredAt: r.delivered_at,
      seenAt: r.seen_at,
      clickedAt: r.clicked_at,
      ackedAt: r.acked_at,
      dismissedAt: r.dismissed_at,
      missedAt: r.missed_at,
      missedReason: r.missed_reason,
      pendingLogin: Boolean(r.pending_login),
      resendCount: Number(r.resend_count) || 0,
      online: socketsOf(r.user_id).length > 0,
      exempt: exempt.has(String(r.user_id)),
    })),
  };
}

async function exportCsv(id) {
  const entry = await requireEntry(id);
  return { csv: model.receiptsCsv([...entry.receipts.values()]), count: entry.receipts.size, title: entry.c.title };
}

async function userHistory(userId) {
  await ready();
  const uid = String(userId);
  const fromMemory = [];
  for (const entry of E.campaigns.values()) {
    const r = entry.receipts.get(uid);
    if (r) fromMemory.push({ r, c: entry.c });
  }
  const dbRows = await store.userReceipts(uid, 30).catch(() => []);
  const known = new Set(fromMemory.map((x) => x.c.id));
  const needIds = dbRows.map((r) => r.campaign_id).filter((cid) => !known.has(cid));
  const camps = new Map((await store.campaignsByIds(needIds).catch(() => [])).map((c) => [c.id, c]));
  const merged = [...fromMemory, ...dbRows.filter((r) => camps.has(r.campaign_id)).map((r) => ({ r, c: camps.get(r.campaign_id) }))];
  merged.sort((a, b) => String(b.c.sent_at || "").localeCompare(String(a.c.sent_at || "")));
  const exempt = (await store.exemptIds().catch(() => new Set())).has(uid);
  return {
    exempt,
    items: merged.slice(0, 30).map(({ r, c }) => ({
      campaignId: c.id,
      title: c.title,
      severity: c.severity,
      icon: c.icon,
      sentAt: c.sent_at,
      campaignStatus: c.status,
      status: model.receiptStatus(r),
      seenAt: r.seen_at,
    })),
  };
}

/* ---------------- background ---------------- */

async function flush() {
  const ids = new Set([...E.dirtyCampaigns, ...E.dirtyReceipts.keys()]);
  for (const id of ids) {
    const entry = E.campaigns.get(id);
    const users = E.dirtyReceipts.get(id);
    E.dirtyReceipts.delete(id);
    E.dirtyCampaigns.delete(id);
    if (!entry) continue;
    if (users?.size) await store.upsertReceipts([...users].map((u) => entry.receipts.get(u)).filter(Boolean));
    if (entry.c.sent_at) entry.c.stats = model.statsSnapshot(model.computeStats([...entry.receipts.values()], { sentAt: entry.c.sent_at }));
    await store.saveCampaign(entry.c);
  }
}

async function tick() {
  await ready();
  const t = nowMs();
  sample();
  for (const entry of [...E.campaigns.values()]) {
    const c = entry.c;
    if (c.status === "scheduled" && c.scheduled_at && Date.parse(c.scheduled_at) <= t) {
      if (!cluster().isLeader()) continue;
      await sendCampaign(entry).catch((err) => console.warn("[live-popup] scheduled send failed:", err?.message || err));
      continue;
    }
    if (c.status !== "live") continue;
    if (c.expires_at && Date.parse(c.expires_at) <= t) {
      c.status = "ended";
      c.ended_at = iso(t);
      for (const r of entry.receipts.values()) r.pending_login = false;
      entry.emitted.clear();
      markDirty(entry, null);
      for (const uid of entry.receipts.keys()) E.dirtyReceipts.get(c.id).add(uid);
      continue;
    }
    for (const [uid, at] of [...entry.emitted]) {
      if (t - at < CONFIRM_MS) continue;
      entry.emitted.delete(uid);
      const r = entry.receipts.get(uid);
      if (!r || r.delivered_at) continue;
      if (socketsOf(uid).length) {
        // Connected but silent (a client from before receipts): count it as delivered.
        r.delivered_at = iso(at);
        r.pending_login = false;
      } else {
        r.missed_at = iso(t);
        r.missed_reason = "left";
        r.pending_login = true;
      }
      markDirty(entry, uid);
      notifyAdmins(c.id);
    }
  }
  await flush();
  evictEnded();
}

function notifyAdmins(campaignId) {
  if (!E.io) return;
  const t = nowMs();
  const last = E.notifyAt.get(campaignId) || 0;
  const send = () => {
    E.notifyAt.set(campaignId, nowMs());
    E.notifyTimers.delete(campaignId);
    try {
      E.io.to("admin").emit("admin:livepopup", { campaignId, at: iso() });
    } catch {
      /* best effort */
    }
  };
  if (t - last >= 1000) return send();
  if (E.notifyTimers.has(campaignId)) return undefined;
  const timer = setTimeout(send, 1000 - (t - last));
  timer.unref?.();
  E.notifyTimers.set(campaignId, timer);
  return undefined;
}

function __resetForTests({ clock } = {}) {
  if (E.timer) clearInterval(E.timer);
  if (E.flushTimer) clearTimeout(E.flushTimer);
  for (const tm of E.notifyTimers.values()) clearTimeout(tm);
  Object.assign(E, {
    io: null,
    started: false,
    initPromise: null,
    campaigns: new Map(),
    dirtyReceipts: new Map(),
    dirtyCampaigns: new Set(),
    samples: [],
    timer: null,
    flushTimer: null,
    notifyAt: new Map(),
    notifyTimers: new Map(),
    clock: clock || (() => Date.now()),
  });
}

module.exports = {
  attachIo,
  ready,
  resolveAudience,
  audiencePreview,
  createCampaign,
  handleReceipt,
  onUserConnected,
  recall,
  resend,
  resolveIncident,
  endCampaign,
  cancelScheduled,
  sendScheduledNow,
  updateScheduled,
  testSend,
  overview,
  listHistory,
  detail,
  receiptsPage,
  exportCsv,
  userHistory,
  voiceAvailable,
  flush,
  tick,
  socketsOf,
  __resetForTests,
  __state: E,
};
