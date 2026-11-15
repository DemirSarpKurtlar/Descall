"use strict";

/**
 * Duyurular runtime: the per-person feed (audience filtered on the server, one
 * cached list of live rows, never one shared answer for everyone), real-time
 * delivery to open sessions that match the audience, phone notifications,
 * the scheduler (scheduled -> live, expired -> ended) and the Claude
 * translation helper for the admin composer.
 */

const model = require("./model");
const store = require("./store");

const TICK_MS = 30_000;
const LIVE_TTL_MS = 10_000;
const META_TTL_MS = 60_000;
const ESTIMATE_TTL_MS = 60_000;

const S = {
  io: null,
  timer: null,
  live: { at: 0, rows: null, inflight: null },
  meta: new Map(), // userId -> { at, lang, createdAt }
  estimates: new Map(), // audienceKey -> { at, value }
  translateClient: null,
};

function now() {
  return Date.now();
}

/* ---------------- live rows cache ---------------- */

function invalidate() {
  S.live.at = 0;
  S.live.rows = null;
}

async function liveRows() {
  if (S.live.rows && now() - S.live.at < LIVE_TTL_MS) return S.live.rows;
  if (S.live.inflight) return S.live.inflight;
  S.live.inflight = (async () => {
    try {
      const rows = await store.listActive();
      S.live.rows = rows.filter((r) => model.statusOf(r, now()) === "live");
      S.live.at = now();
      return S.live.rows;
    } finally {
      S.live.inflight = null;
    }
  })();
  return S.live.inflight;
}

/* ---------------- who is asking ---------------- */

async function premiumOf(ids) {
  try {
    return await require("../premium/badges").plansFor(ids);
  } catch {
    return new Map();
  }
}

async function metaFor(ids) {
  const want = ids.map(String).filter((id) => {
    const hit = S.meta.get(id);
    return !hit || now() - hit.at > META_TTL_MS;
  });
  if (want.length) {
    const rows = await store.usersByIds(want, "id, language, created_at").catch(() => []);
    const seen = new Set();
    for (const u of rows) {
      seen.add(String(u.id));
      S.meta.set(String(u.id), { at: now(), lang: model.normLang(u.language), createdAt: u.created_at || null });
    }
    for (const id of want) if (!seen.has(id)) S.meta.set(id, { at: now(), lang: null, createdAt: null });
    if (S.meta.size > 20_000) S.meta.clear();
  }
  return new Map(ids.map((id) => [String(id), S.meta.get(String(id)) || { lang: null, createdAt: null }]));
}

/** {lang, platform, premium, createdAt} for one person (lang / platform from the asking app first). */
async function whoIs(userId, { lang = null, platform = null } = {}) {
  const meta = (await metaFor([userId])).get(String(userId));
  const plans = await premiumOf([userId]);
  return {
    lang: model.normLang(lang) || meta.lang || model.FALLBACK_LANG,
    platform: model.platformOf(platform),
    premium: Boolean(plans.get(String(userId))),
    createdAt: meta.createdAt,
  };
}

/* ---------------- feed ---------------- */

async function feedFor(userId, opts = {}) {
  const who = await whoIs(userId, opts);
  const rows = (await liveRows()).filter((r) => model.matchAudience(r.audience, who, now()));
  const ids = rows.map((r) => r.id);
  const reads = await store.userReads(userId, ids).catch(() => []);
  const byId = new Map(reads.map((r) => [String(r.announcement_id), r]));
  const fresh = ids.filter((id) => !byId.has(String(id)));
  if (fresh.length) store.markDelivered(userId, fresh, { platform: who.platform, lang: who.lang }).catch(() => {});
  const list = model.sortFeed(rows.map((r) => model.publicView(r, who.lang, byId.get(String(r.id)) || null)));
  const unread = list.filter((a) => !a.read).length;
  return { announcements: list, unread, lang: who.lang };
}

/** Anonymous / legacy read: everyone-audience rows only, in the asked language (or the source). */
async function publicList(lang = null) {
  const rows = (await liveRows()).filter((r) => model.isEveryone(r.audience));
  return model.sortFeed(rows.map((r) => model.publicView(r, lang || r.source_lang || "tr")));
}

/* ---------------- sockets ---------------- */

function connectedSockets() {
  const io = S.io;
  const rooms = io?.sockets?.adapter?.rooms;
  const out = [];
  if (!rooms || typeof rooms.entries !== "function") return out;
  for (const [room, sids] of rooms.entries()) {
    if (!String(room).startsWith("user:")) continue;
    const userId = String(room).slice(5);
    for (const sid of sids || []) {
      const s = io.sockets.sockets?.get?.(sid);
      const auth = s?.handshake?.auth || {};
      out.push({ userId, sid, lang: model.normLang(auth.lang), platform: model.platformOf(auth.platform === "ios" ? "ios" : auth.app) });
    }
  }
  return out;
}

/**
 * Emit `event` with the localized view to every open session the audience
 * matches; sessions it does not match get `announcement:removed`.
 * @returns {Promise<number>} people reached
 */
async function deliver(row, event, { toast = false } = {}) {
  const io = S.io;
  if (!io) return 0;
  const socks = connectedSockets();
  if (!socks.length) return 0;
  const ids = [...new Set(socks.map((s) => s.userId))];
  const meta = await metaFor(ids);
  const plans = model.normalizeAudience(row.audience).premium ? await premiumOf(ids) : new Map();
  const reached = new Set();
  for (const s of socks) {
    const m = meta.get(s.userId) || {};
    const who = { lang: s.lang || m.lang, platform: s.platform, premium: Boolean(plans.get(s.userId)), createdAt: m.createdAt };
    const target = io.to ? io.to(s.sid) : null;
    if (!target) continue;
    if (model.statusOf(row) === "live" && model.matchAudience(row.audience, who)) {
      const view = model.publicView(row, who.lang || model.FALLBACK_LANG);
      target.emit(event, { ...view, toast: Boolean(toast) });
      reached.add(s.userId);
    } else {
      target.emit("announcement:removed", { id: row.id });
    }
  }
  return reached.size;
}

function broadcastRemoved(id) {
  const io = S.io;
  if (!io) return;
  io.emit("announcement:removed", { id });
  io.emit("announcement:deleted", { id }); // clients from before the remake
}

function notifyAdmins(type, id, extra = {}) {
  try {
    S.io?.to?.("admin")?.emit("admin:announcements", { type, id, at: new Date().toISOString(), ...extra });
  } catch {
    /* io without rooms (tests) */
  }
}

/* ---------------- phone notifications ---------------- */

async function audienceIds(audience) {
  const a = model.normalizeAudience(audience);
  const users = await store.audienceUsers({ withSessions: a.platforms.length > 0 });
  const plans = a.premium ? await premiumOf(users.map((u) => u.id)) : new Map();
  return users.filter((u) =>
    model.matchAudience(a, {
      lang: u.language,
      platforms: a.platforms.length ? model.platformsFromSessions(u.active_sessions) : undefined,
      platform: "web",
      premium: Boolean(plans.get(String(u.id))),
      createdAt: u.created_at,
    })
  );
}

async function estimateAudience(audience, { fresh = false } = {}) {
  const key = model.audienceKey(audience);
  const hit = S.estimates.get(key);
  if (!fresh && hit && now() - hit.at < ESTIMATE_TTL_MS) return hit.value;
  const users = await audienceIds(audience);
  const byLang = {};
  for (const u of users) {
    const l = model.normLang(u.language) || model.FALLBACK_LANG;
    byLang[l] = (byLang[l] || 0) + 1;
  }
  const value = { count: users.length, byLang };
  S.estimates.set(key, { at: now(), value });
  return value;
}

async function sendPush(row, userIds) {
  if (!userIds.length) return 0;
  let push;
  try {
    push = require("../webPush");
  } catch {
    return 0;
  }
  const meta = await metaFor(userIds);
  const groups = new Map();
  for (const id of userIds) {
    const lang = meta.get(String(id))?.lang || model.FALLBACK_LANG;
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(id);
  }
  for (const [lang, ids] of groups) {
    const text = model.localize(row, lang);
    const payload = {
      type: "announcement",
      tag: `announcement-${row.id}`,
      title: "Descall",
      body: text.title.slice(0, 140),
      deepLink: `/?announcement=${encodeURIComponent(row.id)}`,
      announcementId: row.id,
    };
    for (let i = 0; i < ids.length; i += 400) {
      await push.deliverPush(ids.slice(i, i + 400), payload, { type: "announcement", title: text.title, text: text.content, announcementId: row.id }).catch(() => {});
    }
  }
  return userIds.length;
}

/* ---------------- lifecycle ---------------- */

/** Make a row live now: status, audience size, open sessions, phone notification. */
async function goLive(row, { actor = null } = {}) {
  const t = new Date().toISOString();
  let size = null;
  try {
    size = (await estimateAudience(row.audience, { fresh: true })).count;
  } catch {
    size = null;
  }
  const patch = { status: "live", is_active: true, published_at: row.published_at || t, audience_size: size, updated_at: t };
  if (actor) {
    patch.updated_by = actor.id;
    patch.updated_by_name = actor.username;
  }
  const live = await store.update(row.id, patch);
  invalidate();
  const toast = Boolean(live.live_notify !== false && live.priority !== "normal");
  const reached = live.live_notify === false ? 0 : await deliver(live, "announcement:new", { toast });
  let pushed = 0;
  if (live.push) {
    try {
      const people = await audienceIds(live.audience);
      pushed = await sendPush(live, people.map((u) => String(u.id)));
    } catch (err) {
      console.warn("[announcements] push failed:", err?.message || err);
    }
  }
  notifyAdmins("live", live.id, { reached, pushed });
  return { row: live, reached, pushed };
}

async function endRow(row, { reason = "expired", actor = null, status = "ended" } = {}) {
  const t = new Date().toISOString();
  const patch = { status, is_active: false, ended_at: row.ended_at || t, ended_reason: reason, updated_at: t };
  if (status === "archived") patch.archived_at = t;
  if (actor) {
    patch.updated_by = actor.id;
    patch.updated_by_name = actor.username;
  }
  const out = await store.update(row.id, patch);
  invalidate();
  broadcastRemoved(row.id);
  notifyAdmins(status, row.id, { reason });
  return out;
}

async function tick() {
  if (!(await store.schemaReady())) return { published: 0, ended: 0 };
  const t = now();
  let published = 0;
  let ended = 0;
  for (const row of await store.listScheduled()) {
    const at = row.starts_at ? Date.parse(row.starts_at) : NaN;
    if (!Number.isFinite(at) || at > t) continue;
    try {
      const end = row.ends_at ? Date.parse(row.ends_at) : NaN;
      if (Number.isFinite(end) && end <= t) await endRow(row, { reason: "expired" });
      else {
        await goLive(row);
        published += 1;
        try {
          require("../../runtime/sharedState").appendAudit(null, "system", "announcement_publish", row.id, { scheduled: true, title: row.title });
        } catch {
          /* audit optional */
        }
      }
    } catch (err) {
      console.warn("[announcements] scheduled publish failed:", err?.message || err);
    }
  }
  for (const row of await store.listActive()) {
    if (model.baseStatus(row) !== "live" || !row.ends_at) continue;
    if (Date.parse(row.ends_at) > t) continue;
    try {
      await endRow(row, { reason: "expired" });
      ended += 1;
    } catch (err) {
      console.warn("[announcements] expiry failed:", err?.message || err);
    }
  }
  return { published, ended };
}

function start(io) {
  if (io) S.io = io;
  if (S.timer || process.env.NODE_ENV === "test") return;
  S.timer = setInterval(() => tick().catch((err) => console.warn("[announcements] tick failed:", err?.message || err)), TICK_MS);
  S.timer.unref?.();
}

function attachIo(io) {
  if (io) S.io = io;
}

/* ---------------- test send ---------------- */

async function sendTest(row, actor, { lang = null } = {}) {
  const io = S.io;
  const view = model.publicView({ ...row, id: row.id || `test-${Date.now()}` }, lang || row.source_lang || "tr");
  if (io?.to) io.to(`user:${actor.id}`).emit("announcement:test", { ...view, toast: true, test: true });
  let pushed = 0;
  if (row.push) pushed = await sendPush({ ...row, id: view.id }, [String(actor.id)]).catch(() => 0);
  return { view, pushed };
}

/* ---------------- translation (Claude) ---------------- */

const LANG_NAMES = { tr: "Turkish", en: "English", de: "German", es: "Spanish", fr: "French", "pt-BR": "Brazilian Portuguese", ru: "Russian" };
const TRANSLATE_MODEL = "claude-opus-5-5";

function translateClient() {
  if (S.translateClient) return S.translateClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require("@anthropic-ai/sdk").default;
  S.translateClient = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return S.translateClient;
}

function parseJsonBlock(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {{title: string, content: string, ctaLabel?: string, from: string, to: string[]}} input
 * @returns {Promise<Record<string, {title: string, content: string, cta_label: string}>>}
 */
async function translate({ title, content, ctaLabel = "", from = "tr", to = [] }) {
  const client = translateClient();
  if (!client) {
    const e = new Error("Automatic translation is not set up on the server.");
    e.code = "TRANSLATE_UNAVAILABLE";
    e.status = 503;
    throw e;
  }
  const targets = [...new Set(to.map(model.normLang).filter((l) => l && l !== from))];
  if (!targets.length) return {};
  const schemaProps = {};
  for (const l of targets) {
    schemaProps[l] = {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" }, cta_label: { type: "string" } },
      required: ["title", "content", "cta_label"],
      additionalProperties: false,
    };
  }
  const system = [
    "You translate in-app announcements of Descall, a chat and voice app, for its users.",
    "Write natural, friendly, correct text a native speaker would write; keep the meaning, tone and line breaks.",
    "Keep the product names Descall, Descall+, Descall Ultra and DesCoin exactly as they are. Keep URLs, numbers, times and @usernames.",
    "Write dates and times the way the target language writes them. Do not add emojis, quotes or notes.",
    "Keep the title within 80 characters and the button text within 32 characters.",
    "Answer with JSON only: an object with one key per target language code, each {title, content, cta_label}.",
  ].join(" ");
  const user = JSON.stringify({ source_language: LANG_NAMES[from] || from, targets: Object.fromEntries(targets.map((l) => [l, LANG_NAMES[l]])), title, content, cta_label: ctaLabel || "" });
  const req = {
    model: TRANSLATE_MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", properties: schemaProps, required: targets, additionalProperties: false } } },
    messages: [{ role: "user", content: user }],
  };
  const msg = await client.messages.create(req);
  if (msg?.stop_reason === "refusal") {
    const e = new Error("The translation was declined.");
    e.code = "TRANSLATE_FAILED";
    e.status = 502;
    throw e;
  }
  const text = (msg?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = parseJsonBlock(text) || {};
  const out = {};
  for (const l of targets) {
    const t = parsed[l];
    if (!t || !t.title || !t.content) continue;
    out[l] = {
      title: model.stripEmoji(String(t.title)).slice(0, model.LIMITS.title),
      content: model.stripEmoji(String(t.content)).slice(0, model.LIMITS.content),
      cta_label: model.stripEmoji(String(t.cta_label || "")).slice(0, model.LIMITS.ctaLabel),
    };
  }
  if (!Object.keys(out).length) {
    const e = new Error("The translation could not be read.");
    e.code = "TRANSLATE_FAILED";
    e.status = 502;
    throw e;
  }
  return out;
}

function __setTranslateClientForTests(c) {
  S.translateClient = c;
}

function __reset() {
  invalidate();
  S.meta.clear();
  S.estimates.clear();
}

module.exports = {
  start,
  attachIo,
  invalidate,
  liveRows,
  whoIs,
  feedFor,
  publicList,
  deliver,
  broadcastRemoved,
  notifyAdmins,
  estimateAudience,
  goLive,
  endRow,
  tick,
  sendTest,
  translate,
  connectedSockets,
  __setTranslateClientForTests,
  __reset,
};
