"use strict";

/**
 * Topluluk çevirileri (admin, draft C extra 3-5): translation editor of the localized
 * servers (server_content_l10n / server_content_translations). Mounted inside
 * routes/admin.js after requireAuth, requireAdmin, the admin rate limit, 2FA, step-up
 * (every write needs a fresh code; the draft translation ends with /preview and only
 * reads) and requireAdminSection: every /server-translations path is the
 * "announcements" section (adminPermissions RULES), like the announcement languages.
 *
 *   GET  /server-translations                       localized + candidate servers, coverage
 *   GET  /server-translations/:serverId             items x locales, coverage, stale flags
 *   PUT  /server-translations/:serverId/settings    { enabled, sourceLocale }
 *   PUT  /server-translations/:serverId/items       { items: [{kind, refId, locale, text}] } ("" deletes)
 *   POST /server-translations/:serverId/draft/preview { items: [{kind, refId}], locales } -> drafts, nothing saved
 *
 * Every write is audited through state.appendAudit (İşlem kaydı). Nothing is published
 * by the draft call: the admin reviews and saves.
 */

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const core = require("../lib/serverL10n/core");
const store = require("../lib/serverL10n/store");
const { liveLocaleIds, normalizeLocale } = require("../lib/locales");
const { selectAllIn } = require("../lib/serverPermissions");

const router = express.Router();
const OFFICIAL_SERVER_ID = "be4b140c-f5a3-487c-b301-8b66b17086fa";
const MAX_ITEMS_PER_SAVE = 500;
const MAX_DRAFT_ITEMS = 40;
const DRAFT_CONCURRENCY = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// English answers; the admin page shows its own text per `code` (srvLoc.admin.err.*).
const ERR = Object.freeze({
  BAD_LOCALE: "Pick one of the app languages.",
  REASON_REQUIRED: "Write why you turn it off.",
  EMPTY: "Pick what to translate first.",
  BAD_ITEM: "Unknown item or language.",
  TOO_LONG: "A translation can be at most 4000 characters.",
  NO_EMOJI: "Translations cannot contain emojis.",
  BAD_MENTION: "A channel mention points to a channel that does not exist.",
  TRANSLATE_UNAVAILABLE: "Automatic translation is not set up on the server.",
  NOT_FOUND: "Server not found.",
  SCHEMA_MISSING: "The translation tables are not installed yet.",
});
const STATUS = { TRANSLATE_UNAVAILABLE: 503 };

function bad(res, code) {
  return res.status(STATUS[code] || 400).json({ error: ERR[code], code });
}

function audit(req, action, target, meta = {}) {
  try {
    return state.appendAudit(req.user?.id || null, req.user?.username || "admin", action, target, meta);
  } catch {
    return null;
  }
}

function fail(res, e, label) {
  const status = e?.status || 500;
  if (status >= 500 && status !== 503) console.error(`[ADMIN] server-translations ${label} failed:`, e?.message || e);
  return res.status(status).json({ error: status >= 500 && status !== 503 ? "Could not load the translations." : e.message, code: e?.code || undefined });
}

function httpErr(code, status = 400) {
  const e = new Error(ERR[code] || code);
  e.code = code;
  e.status = status;
  return e;
}

const locales = () => liveLocaleIds();

async function loadServer(serverId) {
  if (!UUID_RE.test(String(serverId || ""))) throw httpErr("NOT_FOUND", 404);
  const { data, error } = await supabase.from("servers").select("id, name, description, owner_id, icon_url, is_public").eq("id", serverId).maybeSingle();
  if (error) throw error;
  if (!data) throw httpErr("NOT_FOUND", 404);
  return data;
}

async function loadSettings(serverId) {
  const { data, error } = await supabase.from("server_content_l10n").select("*").eq("server_id", serverId).maybeSingle();
  if (error) {
    if (store.isMissingTable(error)) throw httpErr("SCHEMA_MISSING", 503);
    throw error;
  }
  return data || null;
}

async function loadRows(serverId) {
  return selectAllIn(supabase, "server_content_translations", "*", (q) => q.order("id", { ascending: true }), "server_id", [serverId]);
}

/**
 * The official messages of a server: pinned ones, ones that already have translations,
 * and the latest ones its owner wrote (user chat is never offered for translation).
 */
async function officialMessages(server, rows) {
  const withRows = [...new Set(rows.filter((r) => r.kind === "message").map((r) => String(r.ref_id)))];
  const cols = "id, channel_id, sender_id, content, pinned_at, edited_at, created_at, updated_at";
  const [pinned, owned, translated] = await Promise.all([
    supabase.from("server_messages").select(cols).eq("server_id", server.id).not("pinned_at", "is", null).order("created_at", { ascending: true }).limit(50),
    supabase.from("server_messages").select(cols).eq("server_id", server.id).eq("sender_id", server.owner_id).order("created_at", { ascending: false }).limit(30),
    withRows.length
      ? selectAllIn(supabase, "server_messages", cols, (q) => q.eq("server_id", server.id).order("id", { ascending: true }), "id", withRows)
      : Promise.resolve([]),
  ]);
  const byId = new Map();
  for (const m of [...(pinned.data || []), ...(owned.data || []), ...(translated || [])]) {
    if (m && typeof m.content === "string" && m.content.trim() && !/^__voice__:/.test(m.content)) byId.set(String(m.id), m);
  }
  return [...byId.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function itemList(server, channels, messages) {
  const items = [
    { kind: "server_name", refId: server.id, original: server.name, label: "server" },
    { kind: "server_description", refId: server.id, original: server.description || "", label: "server" },
  ];
  const ordered = orderChannels(channels);
  for (const ch of ordered) {
    items.push({ kind: "channel_name", refId: ch.id, original: ch.name, channelType: ch.type, parentId: ch.parent_id || null, slug: ch.type !== "category" && !["voice", "stage"].includes(ch.type) && core.isSlugName(ch.name) });
    if (ch.type !== "category" && !["voice", "stage"].includes(ch.type)) {
      items.push({ kind: "channel_topic", refId: ch.id, original: ch.topic || "", channelType: ch.type, parentId: ch.parent_id || null });
    }
  }
  for (const m of messages) {
    items.push({ kind: "message", refId: m.id, original: m.content, channelId: m.channel_id, pinned: Boolean(m.pinned_at), editedAt: m.edited_at || null, createdAt: m.created_at });
  }
  return items;
}

/** Categories by position, each followed by its channels; loose channels first. */
function orderChannels(channels) {
  const byPos = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0);
  const cats = channels.filter((c) => c.type === "category").sort(byPos);
  const loose = channels.filter((c) => c.type !== "category" && !c.parent_id).sort(byPos);
  const out = [...loose];
  for (const cat of cats) {
    out.push(cat);
    out.push(...channels.filter((c) => c.type !== "category" && String(c.parent_id) === String(cat.id)).sort(byPos));
  }
  for (const c of channels) if (!out.includes(c)) out.push(c);
  return out;
}

async function editorPayload(serverId) {
  const server = await loadServer(serverId);
  const settings = await loadSettings(serverId);
  const rows = await loadRows(serverId);
  const { data: channels, error } = await supabase.from("server_channels").select("id, name, type, topic, position, parent_id").eq("server_id", serverId);
  if (error) throw error;
  const messages = await officialMessages(server, rows);
  const items = itemList(server, channels || [], messages);
  const idx = core.indexRows(rows);
  const all = locales();
  for (const it of items) {
    const byLocale = idx.get(it.kind)?.get(String(it.refId).toLowerCase()) || {};
    it.translations = {};
    for (const l of all) {
      const r = byLocale[l];
      if (!r) continue;
      it.translations[l] = {
        text: r.text,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by_username || null,
        stale: core.isStale(r, it.original, it.editedAt),
        sourceText: r.source_text ?? null,
      };
    }
  }
  const cov = core.coverage(items.map((it) => ({ kind: it.kind, refId: it.refId, original: it.original, editedAt: it.editedAt })), rows, all);
  return {
    server: { id: server.id, name: server.name, description: server.description || "", iconUrl: server.icon_url || null },
    settings: settings
      ? { enabled: Boolean(settings.enabled), sourceLocale: settings.source_locale || "tr", updatedAt: settings.updated_at, updatedBy: settings.updated_by_username || null }
      : { enabled: false, sourceLocale: "tr", updatedAt: null, updatedBy: null },
    locales: all,
    channels: orderChannels(channels || []).map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic || null, parentId: c.parent_id || null, position: c.position ?? 0 })),
    items,
    coverage: cov,
    translateAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

/* ---------------- list ---------------- */

router.get("/server-translations", async (req, res) => {
  try {
    const { data: settings, error } = await supabase.from("server_content_l10n").select("*");
    if (error) {
      if (store.isMissingTable(error)) return res.json({ schemaReady: false, servers: [], locales: locales(), translateAvailable: Boolean(process.env.ANTHROPIC_API_KEY) });
      throw error;
    }
    const ids = [...new Set([OFFICIAL_SERVER_ID, ...(settings || []).map((s) => String(s.server_id))])];
    const { data: servers } = await supabase.from("servers").select("id, name, icon_url, is_public").in("id", ids);
    const out = [];
    for (const s of servers || []) {
      const st = (settings || []).find((x) => String(x.server_id) === String(s.id)) || null;
      let coverage = null;
      try {
        const p = await editorPayload(s.id);
        coverage = p.coverage;
      } catch {
        coverage = null;
      }
      out.push({ id: s.id, name: s.name, iconUrl: s.icon_url || null, enabled: Boolean(st?.enabled), sourceLocale: st?.source_locale || "tr", official: String(s.id) === OFFICIAL_SERVER_ID, coverage });
    }
    out.sort((a, b) => Number(b.official) - Number(a.official) || String(a.name).localeCompare(String(b.name)));
    res.json({ schemaReady: true, servers: out, locales: locales(), translateAvailable: Boolean(process.env.ANTHROPIC_API_KEY) });
  } catch (e) {
    fail(res, e, "list");
  }
});

router.get("/server-translations/:serverId", async (req, res) => {
  try {
    res.json(await editorPayload(req.params.serverId));
  } catch (e) {
    fail(res, e, "load");
  }
});

/* ---------------- settings ---------------- */

router.put("/server-translations/:serverId/settings", async (req, res) => {
  try {
    const server = await loadServer(req.params.serverId);
    const before = await loadSettings(server.id);
    const b = req.body || {};
    const enabled = typeof b.enabled === "boolean" ? b.enabled : Boolean(before?.enabled);
    const sourceLocale = b.sourceLocale ? normalizeLocale(b.sourceLocale, { liveOnly: true }) : before?.source_locale || "tr";
    if (!sourceLocale) return bad(res, "BAD_LOCALE");
    if (!b.reason && before?.enabled && !enabled) return bad(res, "REASON_REQUIRED");
    const row = { server_id: server.id, enabled, source_locale: sourceLocale, updated_by: req.user?.id || null, updated_by_username: req.user?.username || null, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("server_content_l10n").upsert(row, { onConflict: "server_id" });
    if (error) throw error;
    store.invalidate(server.id);
    audit(req, "server_l10n_settings", server.id, {
      server: server.name,
      enabled,
      sourceLocale,
      before: before ? { enabled: Boolean(before.enabled), sourceLocale: before.source_locale } : null,
      ...(b.reason ? { reason: String(b.reason).slice(0, 300) } : {}),
    });
    res.json({ ok: true, settings: { enabled, sourceLocale } });
  } catch (e) {
    fail(res, e, "settings");
  }
});

/* ---------------- save ---------------- */

router.put("/server-translations/:serverId/items", async (req, res) => {
  try {
    const server = await loadServer(req.params.serverId);
    const list = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_ITEMS_PER_SAVE) : [];
    if (!list.length) return bad(res, "EMPTY");
    const payload = await editorPayload(server.id);
    const byKey = new Map(payload.items.map((it) => [`${it.kind}:${String(it.refId).toLowerCase()}`, it]));
    const live = new Set(payload.locales);
    const now = new Date().toISOString();
    const upserts = [];
    const deletes = [];
    for (const raw of list) {
      const kind = String(raw?.kind || "");
      const refId = String(raw?.refId || "").toLowerCase();
      const locale = normalizeLocale(raw?.locale, { liveOnly: true });
      const item = byKey.get(`${kind}:${refId}`);
      if (!item || !locale || !live.has(locale)) return bad(res, "BAD_ITEM");
      const text = core.norm(raw?.text);
      if (text.length > core.MAX_TEXT) return bad(res, "TOO_LONG");
      if (/\p{Extended_Pictographic}/u.test(text)) return bad(res, "NO_EMOJI");
      const unknown = core.mentionIds(text).filter((id) => !payload.channels.some((c) => String(c.id).toLowerCase() === id));
      if (unknown.length) return bad(res, "BAD_MENTION");
      if (!text) deletes.push({ kind, refId: item.refId, locale });
      else upserts.push({ server_id: server.id, kind, ref_id: item.refId, locale, text, source_text: item.original || "", updated_by: req.user?.id || null, updated_by_username: req.user?.username || null, updated_at: now });
    }
    for (const row of upserts) {
      const { error } = await supabase.from("server_content_translations").upsert(row, { onConflict: "server_id,kind,ref_id,locale" });
      if (error) throw error;
    }
    for (const d of deletes) {
      const { error } = await supabase.from("server_content_translations").delete().eq("server_id", server.id).eq("kind", d.kind).eq("ref_id", d.refId).eq("locale", d.locale);
      if (error) throw error;
    }
    store.invalidate(server.id);
    const byLocale = {};
    for (const r of [...upserts, ...deletes]) byLocale[r.locale] = (byLocale[r.locale] || 0) + 1;
    audit(req, "server_l10n_save", server.id, {
      server: server.name,
      saved: upserts.length,
      removed: deletes.length,
      locales: byLocale,
      items: [...upserts, ...deletes].slice(0, 40).map((r) => `${r.kind}:${r.ref_id || r.refId}:${r.locale}`),
      ...(req.body?.fromDraft ? { fromDraft: true } : {}),
    });
    const fresh = await editorPayload(server.id);
    res.json({ ok: true, saved: upserts.length, removed: deletes.length, ...fresh });
  } catch (e) {
    fail(res, e, "save");
  }
});

/* ---------------- draft (Anthropic, reviewed before saving) ---------------- */

function sourceTextOf(item, sourceLocale, channels) {
  // The source-language row keeps <#id> mentions; it counts while it matches the original.
  const row = item.translations?.[sourceLocale];
  const text = row && !row.stale ? row.text : item.original;
  const nameOf = new Map(channels.map((c) => [String(c.id).toLowerCase(), c]));
  const mentioned = core.mentionIds(text).map((id) => nameOf.get(id)).filter(Boolean);
  return { text: core.renderMentions(text, (id) => nameOf.get(id) || null), mentioned };
}

/** Put <#id> back where the draft kept a "#name" of a mentioned channel. */
function retokenize(text, mentioned) {
  let out = String(text || "");
  for (const ch of [...mentioned].sort((a, b) => String(b.name).length - String(a.name).length)) {
    if (["voice", "stage"].includes(ch.type)) continue;
    const esc = String(ch.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`#${esc}(?![\\p{L}\\p{N}_-])`, "gu"), `<#${ch.id}>`);
  }
  return out;
}

async function runPool(list, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) {
      const k = i++;
      out[k] = await fn(list[k]);
    }
  }));
  return out;
}

router.post("/server-translations/:serverId/draft/preview", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return bad(res, "TRANSLATE_UNAVAILABLE");
    }
    const payload = await editorPayload(req.params.serverId);
    const src = payload.settings.sourceLocale || "tr";
    const want = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_DRAFT_ITEMS) : [];
    const targets = (Array.isArray(req.body?.locales) && req.body.locales.length ? req.body.locales : payload.locales)
      .map((l) => normalizeLocale(l, { liveOnly: true }))
      .filter((l) => l && l !== src);
    const byKey = new Map(payload.items.map((it) => [`${it.kind}:${String(it.refId).toLowerCase()}`, it]));
    const picked = want.map((w) => byKey.get(`${w?.kind}:${String(w?.refId || "").toLowerCase()}`)).filter((it) => it && core.norm(it.original));
    if (!picked.length || !targets.length) return bad(res, "EMPTY");
    const service = require("../lib/announcements/service");
    const channelName = (id) => payload.channels.find((c) => String(c.id) === String(id))?.name || "";
    const drafts = [];
    const failed = [];
    await runPool(picked, DRAFT_CONCURRENCY, async (it) => {
      // Only the languages this item is missing (or stale in), unless the admin asked for all.
      const need = targets.filter((l) => req.body?.overwrite || !it.translations?.[l] || it.translations[l].stale);
      if (!need.length) return;
      const { text, mentioned } = sourceTextOf(it, src, payload.channels);
      const isName = it.kind === "server_name" || it.kind === "channel_name";
      const title = isName ? text : it.kind === "message" ? `#${channelName(it.channelId)}` : it.kind === "channel_topic" ? `#${channelName(it.refId)}` : payload.server.name;
      try {
        const out = await service.translate({
          title: title.slice(0, 100),
          content: isName ? text : text,
          from: src,
          to: need,
          limits: { title: 100, content: core.MAX_TEXT },
        });
        for (const [locale, t] of Object.entries(out)) {
          let value = isName ? t.title : t.content;
          if (it.kind === "channel_name" && it.slug) value = core.slugify(value, locale);
          value = retokenize(value, mentioned);
          if (core.norm(value)) drafts.push({ kind: it.kind, refId: it.refId, locale, text: value });
        }
      } catch (e) {
        failed.push({ kind: it.kind, refId: it.refId, code: e?.code || "TRANSLATE_FAILED" });
        if (e?.code === "TRANSLATE_UNAVAILABLE") throw e;
      }
    });
    audit(req, "server_l10n_draft", payload.server.id, { server: payload.server.name, items: picked.length, drafts: drafts.length, failed: failed.length, locales: targets });
    res.json({ drafts, failed });
  } catch (e) {
    fail(res, e, "draft");
  }
});

module.exports = router;
module.exports.__internals = { orderChannels, retokenize, sourceTextOf, itemList };
