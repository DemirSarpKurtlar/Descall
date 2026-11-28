"use strict";

/**
 * Localized server content (draft C, owner pick 28 Nov 2026): the static content of an
 * opted-in server (name, description, category / channel names, topics, the official
 * messages) shows in each reader's app language. Pure logic, no I/O: the DB layer is
 * ./store.js, the API decoration ./decorate.js. Mirrored for the admin preview by
 * src/lib/serverL10n.js (serverL10n.selftest.mjs checks both agree).
 *
 * Fallback for one item: the reader's app language, then English, then the original.
 * The source language (the one the originals are written in) is special: its row is
 * used only while it still matches the original (it carries <#id> mentions that follow
 * channel renames); once the original changes, the original wins. A row in any other
 * language is shown even when stale (better than a language the reader cannot read);
 * the admin editor flags it.
 *
 * Channel mentions are stored as <#channel-id> and resolved per reader to the
 * channel's own display name: "#regras" for a text channel, "Lobby" for a voice room.
 * User chat messages are never translated: only rows an admin wrote exist.
 */

const KINDS = Object.freeze(["server_name", "server_description", "channel_name", "channel_topic", "message"]);
const FALLBACK_LOCALE = "en";
const MAX_TEXT = 4000;
const MENTION_RE = /<#([0-9a-fA-F-]{36})>/g;
const VOICE_TYPES = new Set(["voice", "stage"]);

function norm(text) {
  return String(text == null ? "" : text).replace(/\r\n/g, "\n").trim();
}

function time(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : 0;
}

/** Locales to try for a reader, in order: their language, then English. */
function chainFor(lang) {
  const out = [];
  for (const l of [lang, FALLBACK_LOCALE]) if (l && !out.includes(l)) out.push(l);
  return out;
}

/**
 * A translation is stale when the original changed after it was written: the original
 * it was written against (source_text) differs from the current one, or the original
 * was edited (edited_at) after the translation was saved.
 */
function isStale(row, original, editedAt = null) {
  if (!row) return false;
  if (row.source_text != null && norm(row.source_text) !== norm(original)) return true;
  const edited = time(editedAt);
  return Boolean(edited && time(row.updated_at) && edited > time(row.updated_at));
}

/**
 * Pick the text a reader sees for one item.
 * @param {{original: string|null, rows: Record<string, {text: string, source_text?: string|null, updated_at?: string}>,
 *          lang: string, sourceLocale: string, editedAt?: string|null}} input
 * @returns {null | {text: string, locale: string, translated: boolean, stale: boolean}}
 *   null = show the original as stored.
 */
function pick({ original, rows, lang, sourceLocale, editedAt = null }) {
  if (!norm(original)) return null;
  const byLocale = rows || {};
  for (const locale of chainFor(lang)) {
    const row = byLocale[locale];
    if (locale === sourceLocale) {
      if (row && norm(row.text) && !isStale(row, original, editedAt)) {
        return { text: String(row.text), locale, translated: false, stale: false };
      }
      return null;
    }
    if (row && norm(row.text)) {
      return { text: String(row.text), locale, translated: true, stale: isStale(row, original, editedAt) };
    }
  }
  return null;
}

/** Channel ids mentioned in a stored text, in order, without repeats. */
function mentionIds(text) {
  const out = [];
  for (const m of String(text || "").matchAll(MENTION_RE)) {
    const id = m[1].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Replace <#id> with the reader's channel name: "#name" for text-like channels, the
 * bare name for voice / stage rooms. `channelOf(id)` returns {name, type} or null.
 */
function renderMentions(text, channelOf) {
  return String(text || "").replace(MENTION_RE, (_, id) => {
    const ch = typeof channelOf === "function" ? channelOf(id.toLowerCase()) : null;
    if (!ch || !ch.name) return "#deleted-channel";
    return VOICE_TYPES.has(ch.type) ? String(ch.name) : `#${ch.name}`;
  });
}

/** Group translation rows: kind -> ref_id -> locale -> row. */
function indexRows(rows) {
  const idx = new Map();
  for (const r of rows || []) {
    if (!r || !KINDS.includes(r.kind)) continue;
    const ref = String(r.ref_id || "").toLowerCase();
    if (!idx.has(r.kind)) idx.set(r.kind, new Map());
    const byRef = idx.get(r.kind);
    if (!byRef.has(ref)) byRef.set(ref, {});
    byRef.get(ref)[r.locale] = r;
  }
  return idx;
}

function rowsOf(idx, kind, ref) {
  return idx.get(kind)?.get(String(ref || "").toLowerCase()) || {};
}

/**
 * Everything one reader sees for one server.
 * @param {{settings: {enabled: boolean, source_locale: string}, rows: object[],
 *          server: {id, name, description}, channels: {id, name, type, topic}[],
 *          messages?: {id, content, edited_at}[], lang: string}} input
 * @returns {null | {
 *   locale, sourceLocale,
 *   server: {name: Item|null, description: Item|null},
 *   channels: Map<id, {name: Item|null, topic: Item|null}>,
 *   channelName(id): string|null, messages: Map<id, Item>, message(id, original, editedAt): Item|null }}
 *   Item = {text (mentions resolved), locale, translated, stale, source (original)}
 */
function buildView({ settings, rows, server, channels = [], messages = [], lang }) {
  if (!settings?.enabled || !server?.id) return null;
  const sourceLocale = settings.source_locale || "tr";
  const idx = indexRows(rows);
  const item = (kind, ref, original, editedAt) => {
    const hit = pick({ original, rows: rowsOf(idx, kind, ref), lang, sourceLocale, editedAt });
    return hit ? { ...hit, source: original } : null;
  };

  const chMap = new Map();
  const nameOf = new Map();
  for (const ch of channels || []) {
    if (!ch?.id) continue;
    const id = String(ch.id).toLowerCase();
    const name = item("channel_name", id, ch.name);
    chMap.set(id, { name, topic: null, type: ch.type, original: ch });
    nameOf.set(id, { name: name ? name.text : ch.name, type: ch.type });
  }
  const channelOf = (id) => nameOf.get(String(id).toLowerCase()) || null;
  const resolved = (it) => (it ? { ...it, text: renderMentions(it.text, channelOf) } : null);

  for (const [id, entry] of chMap) {
    entry.topic = resolved(item("channel_topic", id, entry.original.topic));
    delete entry.original;
  }

  const msgMap = new Map();
  for (const m of messages || []) {
    if (!m?.id) continue;
    const hit = resolved(item("message", m.id, m.content, m.edited_at));
    if (hit) msgMap.set(String(m.id).toLowerCase(), hit);
  }

  return {
    locale: lang,
    sourceLocale,
    server: {
      name: item("server_name", server.id, server.name),
      description: resolved(item("server_description", server.id, server.description)),
    },
    channels: chMap,
    channelName: (id) => channelOf(id)?.name ?? null,
    messages: msgMap,
    message: (id, original, editedAt) => resolved(item("message", id, original, editedAt)),
  };
}

/**
 * Coverage of one locale over the items that have an original: share of items with a
 * row in that locale, and the stale ones. `items` = [{kind, refId, original, editedAt}].
 */
function coverage(items, rows, locales) {
  const idx = indexRows(rows);
  const out = {};
  const live = (items || []).filter((it) => norm(it.original));
  for (const locale of locales) {
    let done = 0;
    let stale = 0;
    for (const it of live) {
      const row = rowsOf(idx, it.kind, it.refId)[locale];
      if (!row || !norm(row.text)) continue;
      done += 1;
      if (isStale(row, it.original, it.editedAt)) stale += 1;
    }
    out[locale] = { total: live.length, done, stale, missing: live.length - done, pct: live.length ? Math.round((done / live.length) * 100) : 100 };
  }
  return out;
}

/** Slug style for a translated text-channel name: lowercase, hyphens, no punctuation. */
function slugify(text, locale = "") {
  let s = String(text || "").trim().toLocaleLowerCase(locale || undefined);
  // Latin diacritics go (the originals do the same: "hos-geldin"); Cyrillic stays.
  if (!/^ru/.test(locale)) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/ß/g, "ss").replace(/ı/g, "i");
  return s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 100);
}

/** True when a channel's original name is written in slug style (text channels). */
function isSlugName(name) {
  const s = String(name || "");
  return Boolean(s) && !/\s/.test(s) && s === s.toLocaleLowerCase();
}

module.exports = {
  KINDS,
  FALLBACK_LOCALE,
  MAX_TEXT,
  MENTION_RE,
  norm,
  chainFor,
  isStale,
  pick,
  mentionIds,
  renderMentions,
  indexRows,
  buildView,
  coverage,
  slugify,
  isSlugName,
};
