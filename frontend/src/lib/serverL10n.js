/**
 * Localized server content (draft C, owner pick 28 Nov 2026) on the client.
 *
 * The API adds the reader's language version next to the original fields of opted-in
 * servers (backend/lib/serverL10n/decorate.js): nameLocalized / topicLocalized /
 * descriptionLocalized / content_localized, each with l10n.<field>.source = the original
 * it was resolved against. A value only counts while its source still equals the field:
 * a socket update that renames a channel shows the new original at once, until the next
 * list fetch brings its translation.
 *
 * "Show original" (Orijinali göster) is remembered per message / topic for the session
 * (sessionStorage), so it survives channel switches and reloads of the tab only.
 *
 * pick() and renderMentions() mirror backend/lib/serverL10n/core.js for the admin
 * editor's live preview; serverL10n.selftest.mjs checks both agree on the seed.
 */

const FALLBACK_LOCALE = "en";
const MENTION_RE = /<#([0-9a-fA-F-]{36})>/g;
const VOICE_TYPES = new Set(["voice", "stage"]);
const STORE_KEY = "descall:l10n:original:v1";

export function norm(text) {
  return String(text == null ? "" : text).replace(/\r\n/g, "\n").trim();
}

function valid(meta, current) {
  return Boolean(meta) && norm(meta.source) === norm(current);
}

/* ---------------- show original (per session) ---------------- */

let originals = null;
const listeners = new Set();

function loadOriginals() {
  if (originals) return originals;
  originals = new Set();
  try {
    const raw = globalThis.sessionStorage?.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) list.slice(-500).forEach((k) => typeof k === "string" && originals.add(k));
  } catch {
    /* private mode */
  }
  return originals;
}

/** Key of a toggle: "m:<messageId>" or "t:<channelId>". */
export function originalKey(kind, id) {
  return `${kind === "topic" ? "t" : "m"}:${String(id || "")}`;
}

export function isShowingOriginal(key) {
  return loadOriginals().has(key);
}

export function setShowingOriginal(key, on) {
  const set = loadOriginals();
  if (on) set.add(key);
  else set.delete(key);
  try {
    globalThis.sessionStorage?.setItem(STORE_KEY, JSON.stringify([...set].slice(-500)));
  } catch {
    /* private mode: this tab only */
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a listener failing must not stop the others */
    }
  });
}

export function toggleShowingOriginal(key) {
  setShowingOriginal(key, !isShowingOriginal(key));
}

export function subscribeOriginals(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Snapshot for useSyncExternalStore: changes whenever a toggle changes. */
let version = 0;
subscribeOriginals(() => {
  version += 1;
});
export function originalsVersion() {
  return version;
}

/* ---------------- display values ---------------- */

/** Server name as the reader sees it (localized while it matches the original). */
export function serverDisplayName(server) {
  if (!server) return "";
  if (server.nameLocalized && valid(server.l10n?.name, server.name)) return server.nameLocalized;
  return server.name || "";
}

export function serverDisplayDescription(server) {
  if (!server) return "";
  if (server.descriptionLocalized && valid(server.l10n?.description, server.description)) return server.descriptionLocalized;
  return server.description || "";
}

/** Locale the server name is shown in when it is a translation, else null. */
export function serverNameLocale(server) {
  if (!server?.nameLocalized || !valid(server.l10n?.name, server.name)) return null;
  return server.l10n.name.translated ? server.l10n.name.locale : null;
}

/** Channel / category name as the reader sees it. */
export function channelDisplayName(channel) {
  if (!channel) return "";
  if (channel.nameLocalized && valid(channel.l10n?.name, channel.name)) return channel.nameLocalized;
  return channel.name || "";
}

/**
 * Topic of a channel for this reader: { text, original, locale, translated, stale,
 * showingOriginal, canToggle } or null when the topic is not localized.
 */
export function channelTopicL10n(channel, { showOriginal } = {}) {
  if (!channel?.topic || !channel.topicLocalized || !valid(channel.l10n?.topic, channel.topic)) return null;
  const meta = channel.l10n.topic;
  const key = originalKey("topic", channel.id);
  const canToggle = Boolean(meta.translated);
  const showingOriginal = canToggle && (showOriginal ?? isShowingOriginal(key));
  return {
    text: showingOriginal ? channel.topic : channel.topicLocalized,
    original: channel.topic,
    locale: meta.locale,
    translated: Boolean(meta.translated) && !showingOriginal,
    stale: Boolean(meta.stale),
    showingOriginal,
    canToggle,
    key,
  };
}

/**
 * Official message in the reader's language: { text, original, locale, translated,
 * showingOriginal, canToggle, key } or null. Looks in the server's l10n.messages
 * (covers socket and pinned-list copies) and on the message itself (history API).
 * User chat never has one.
 */
export function messageL10n(message, server, { showOriginal, readerLocale } = {}) {
  if (!message?.id) return null;
  const original = typeof message.text === "string" ? message.text : typeof message.content === "string" ? message.content : "";
  if (!norm(original)) return null;
  let hit = null;
  const fromServer = server?.l10n?.messages?.[message.id];
  // A history copy fetched in another UI language (before a language switch) is skipped.
  const reader = readerLocale || server?.l10n?.locale || null;
  const sameReader = !message.l10n?.reader || !reader || message.l10n.reader === reader;
  if (fromServer && valid(fromServer, original)) hit = { text: fromServer.text, locale: fromServer.locale, translated: fromServer.translated, stale: fromServer.stale };
  else if (message.contentLocalized && sameReader && valid(message.l10n, original)) {
    hit = { text: message.contentLocalized, locale: message.l10n.locale, translated: message.l10n.translated, stale: message.l10n.stale };
  }
  if (!hit) return null;
  const key = originalKey("message", message.id);
  const canToggle = Boolean(hit.translated);
  const showingOriginal = canToggle && (showOriginal ?? isShowingOriginal(key));
  return {
    text: showingOriginal ? original : hit.text,
    original,
    locale: hit.locale,
    translated: Boolean(hit.translated) && !showingOriginal,
    stale: Boolean(hit.stale),
    showingOriginal,
    canToggle,
    key,
  };
}

/** Text searched for a channel: its original and its localized name. */
export function channelSearchText(channel) {
  const a = String(channel?.name || "");
  const b = channelDisplayName(channel);
  return b && b !== a ? `${a} ${b}` : a;
}

function fold(text) {
  return String(text || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}

/** Channel search: matches the original and the translated name ("kurallar", "regras"). */
export function channelMatches(channel, query) {
  const q = fold(query).trim();
  if (!q) return true;
  return fold(channelSearchText(channel)).includes(q);
}

/** Short language code for the marker ("pt-BR" -> "PT", "en" -> "EN"). */
export function markerCode(locale) {
  return String(locale || "").split("-")[0].toUpperCase();
}

/**
 * Localized server / channel names for a notification of an opted-in server, looked up
 * in the reader's server list by id (the socket payload carries the originals).
 */
let knownServers = [];
/** The reader's server list (App keeps it current) for lookups outside React (notifications). */
export function rememberServerList(servers) {
  knownServers = Array.isArray(servers) ? servers : [];
}

export function notificationNames(servers, { serverId, serverName, channelId, channelName } = {}) {
  const server = (servers || knownServers || []).find((s) => String(s?.id) === String(serverId)) || null;
  if (!server) return { serverName, channelName };
  const ch = (server.channels || []).find((c) => String(c?.id) === String(channelId)) || null;
  return {
    serverName: server.name === serverName || !serverName ? serverDisplayName(server) || serverName : serverName,
    channelName: ch && (ch.name === channelName || !channelName) ? channelDisplayName(ch) || channelName : channelName,
  };
}

/** Welcome bot text vars: the server's display name instead of the stored original. */
export function withServerDisplayVars(message, originalName, shownName) {
  const ref = message?.i18n?.text || message?.i18n?.content;
  const vars = ref?.vars;
  if (!originalName || !vars || typeof vars.server !== "string" || vars.server !== originalName) return message;
  const shown = shownName;
  if (!shown || shown === originalName) return message;
  const next = { ...ref, vars: { ...vars, server: shown } };
  return { ...message, i18n: { ...message.i18n, ...(message.i18n.text ? { text: next } : {}), ...(message.i18n.content ? { content: next } : {}) } };
}

/* ---------------- mirror of backend core (admin preview) ---------------- */

export function chainFor(lang) {
  const out = [];
  for (const l of [lang, FALLBACK_LOCALE]) if (l && !out.includes(l)) out.push(l);
  return out;
}

export function isStale(row, original, editedAt = null) {
  if (!row) return false;
  if (row.sourceText != null && norm(row.sourceText) !== norm(original)) return true;
  const edited = Date.parse(editedAt || "") || 0;
  const at = Date.parse(row.updatedAt || "") || 0;
  return Boolean(edited && at && edited > at);
}

/** Same rules as backend pick(): rows = { locale: {text, sourceText, updatedAt} }. */
export function pick({ original, rows, lang, sourceLocale, editedAt = null }) {
  if (!norm(original)) return null;
  for (const locale of chainFor(lang)) {
    const row = rows?.[locale];
    if (locale === sourceLocale) {
      if (row && norm(row.text) && !isStale(row, original, editedAt)) return { text: String(row.text), locale, translated: false, stale: false };
      return null;
    }
    if (row && norm(row.text)) return { text: String(row.text), locale, translated: true, stale: isStale(row, original, editedAt) };
  }
  return null;
}

export function renderMentions(text, channelOf) {
  return String(text || "").replace(MENTION_RE, (_, id) => {
    const ch = typeof channelOf === "function" ? channelOf(id.toLowerCase()) : null;
    if (!ch || !ch.name) return "#deleted-channel";
    return VOICE_TYPES.has(ch.type) ? String(ch.name) : `#${ch.name}`;
  });
}

export function mentionIds(text) {
  const out = [];
  for (const m of String(text || "").matchAll(MENTION_RE)) {
    const id = m[1].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * What a reader in `lang` sees, from the admin editor's items (with unsaved edits merged
 * into `translations`): { serverName, channels: [{id, name, type, parentId, topic}], messages: Map }.
 */
export function readerPreview({ items, channels, lang, sourceLocale }) {
  const byKey = new Map((items || []).map((it) => [`${it.kind}:${String(it.refId).toLowerCase()}`, it]));
  const get = (kind, id) => byKey.get(`${kind}:${String(id).toLowerCase()}`);
  const resolve = (kind, id, original, editedAt) => pick({ original, rows: get(kind, id)?.translations || {}, lang, sourceLocale, editedAt });
  const names = new Map();
  for (const ch of channels || []) {
    const hit = resolve("channel_name", ch.id, ch.name);
    names.set(String(ch.id).toLowerCase(), { name: hit ? hit.text : ch.name, type: ch.type, translated: Boolean(hit?.translated) });
  }
  const channelOf = (id) => names.get(String(id).toLowerCase()) || null;
  const out = (it) => (it ? { ...it, text: renderMentions(it.text, channelOf) } : null);
  const serverItem = (items || []).find((it) => it.kind === "server_name");
  const descItem = (items || []).find((it) => it.kind === "server_description");
  const messages = new Map();
  for (const it of items || []) {
    if (it.kind !== "message") continue;
    const hit = out(resolve("message", it.refId, it.original, it.editedAt));
    messages.set(String(it.refId), hit || { text: it.original, locale: sourceLocale, translated: false, stale: false, untouched: true });
  }
  return {
    serverName: serverItem ? (resolve("server_name", serverItem.refId, serverItem.original)?.text || serverItem.original) : "",
    serverDescription: descItem ? (out(resolve("server_description", descItem.refId, descItem.original))?.text || descItem.original) : "",
    channels: (channels || []).map((ch) => {
      const n = names.get(String(ch.id).toLowerCase());
      const topic = out(resolve("channel_topic", ch.id, ch.topic || ""));
      return { id: ch.id, type: ch.type, parentId: ch.parentId || null, name: n?.name || ch.name, translated: Boolean(n?.translated), topic: topic ? topic.text : ch.topic || "" };
    }),
    messages,
  };
}

/** Coverage of the editor items per locale (same rules as backend coverage()). */
export function coverageOf(items, locales) {
  const live = (items || []).filter((it) => norm(it.original));
  const out = {};
  for (const locale of locales || []) {
    let done = 0;
    let stale = 0;
    for (const it of live) {
      const row = it.translations?.[locale];
      if (!row || !norm(row.text)) continue;
      done += 1;
      if (isStale(row, it.original, it.editedAt)) stale += 1;
    }
    out[locale] = { total: live.length, done, stale, missing: live.length - done, pct: live.length ? Math.round((done / live.length) * 100) : 100 };
  }
  return out;
}
