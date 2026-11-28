"use strict";

/**
 * Localized server content (draft C) on the API: adds the reader's language version
 * next to the original fields of opted-in servers. Nothing is removed or renamed, so
 * every client that reads `name` / `topic` / `content` keeps working.
 *
 *   server   nameLocalized, descriptionLocalized, l10n { enabled, locale, sourceLocale,
 *            name, description: {locale, translated, stale}, messages: {id: {...}} }
 *   channel  nameLocalized, topicLocalized, l10n { name, topic: {locale, translated, source} }
 *   message  content_localized, l10n { locale, sourceLocale, translated, stale, source }
 *
 * `source` is the original a value was resolved against: a client that merges an edited
 * original into its cache drops the stale localized value (same rule as the template
 * topic keys of publicChannel). `messages` only lists official messages in channels the
 * reader can see (the channel list of the same payload).
 *
 * The reader's language is the app's UI language, sent as Accept-Language by the web,
 * desktop and mobile apps (users.language is not written by the app); `?lang=` wins.
 */

const core = require("./core");
const store = require("./store");
const { parseAcceptLanguage, resolveLang } = require("../locales");

/** The reader's live UI locale, or null (then nothing is localized). */
function readerLang(req) {
  const q = req?.query?.lang;
  return resolveLang([typeof q === "string" ? q : null, parseAcceptLanguage(req?.headers?.["accept-language"])], { fallback: null });
}

function applies(item, current) {
  if (!item) return false;
  if (core.norm(item.source) !== core.norm(current)) return false;
  return item.translated || item.text !== String(current ?? "");
}

const meta = (item) => ({ locale: item.locale, translated: item.translated, stale: Boolean(item.stale) });

function viewFor(bundle, server, lang) {
  return core.buildView({
    settings: bundle.settings,
    rows: bundle.rows,
    server: { id: server.id, name: server.name ?? null, description: server.description ?? null },
    channels: bundle.channels,
    messages: bundle.messages,
    lang,
  });
}

/** One API channel (camelCase, publicChannel shape) with its localized fields. */
function decorateChannel(ch, view) {
  if (!ch || !view) return ch;
  const entry = view.channels.get(String(ch.id).toLowerCase());
  if (!entry) return ch;
  const out = { ...ch };
  const l10n = {};
  if (applies(entry.name, ch.name)) {
    out.nameLocalized = entry.name.text;
    l10n.name = { ...meta(entry.name), source: ch.name };
  }
  if (ch.topic && entry.topic && applies(entry.topic, ch.topic)) {
    out.topicLocalized = entry.topic.text;
    l10n.topic = { ...meta(entry.topic), source: ch.topic };
  }
  if (Object.keys(l10n).length) out.l10n = { locale: view.locale, sourceLocale: view.sourceLocale, ...l10n };
  return out;
}

/** One API server (publicServer shape, channels optional) with its localized fields. */
function decorateServer(pub, bundle, lang) {
  if (!pub || !bundle) return pub;
  const view = viewFor(bundle, pub, lang);
  if (!view) return pub;
  const out = { ...pub };
  const l10n = { enabled: true, locale: view.locale, sourceLocale: view.sourceLocale };
  if (applies(view.server.name, pub.name)) {
    out.nameLocalized = view.server.name.text;
    l10n.name = { ...meta(view.server.name), source: pub.name };
  }
  if (pub.description && applies(view.server.description, pub.description)) {
    out.descriptionLocalized = view.server.description.text;
    l10n.description = { ...meta(view.server.description), source: pub.description };
  }
  if (Array.isArray(pub.channels)) {
    out.channels = pub.channels.map((ch) => decorateChannel(ch, view));
    const visible = new Set(pub.channels.map((c) => String(c.id).toLowerCase()));
    const messages = {};
    for (const m of bundle.messages || []) {
      const id = String(m.id).toLowerCase();
      const item = view.messages.get(id);
      if (!item || !visible.has(String(m.channel_id).toLowerCase())) continue;
      if (!applies(item, m.content)) continue;
      messages[m.id] = { text: item.text, ...meta(item), channelId: m.channel_id, source: m.content };
    }
    if (Object.keys(messages).length) l10n.messages = messages;
  }
  out.l10n = l10n;
  return out;
}

/** One stored message row (snake_case, server_messages shape). */
function decorateMessage(row, view) {
  if (!row || !view || typeof row.content !== "string") return row;
  const item = view.message(row.id, row.content, row.edited_at);
  if (!applies(item, row.content)) return row;
  return {
    ...row,
    content_localized: item.text,
    l10n: { locale: item.locale, reader: view.locale, sourceLocale: view.sourceLocale, translated: item.translated, stale: Boolean(item.stale), source: row.content },
  };
}

function serverIdsIn(body) {
  const ids = new Set();
  const add = (v) => v && ids.add(String(v));
  if (Array.isArray(body.servers)) body.servers.forEach((s) => add(s?.id));
  if (body.server && typeof body.server === "object") add(body.server.id);
  if (body.channel && typeof body.channel === "object") add(body.channel.serverId || body.channel.server_id);
  if (Array.isArray(body.messages)) body.messages.forEach((m) => add(m?.server_id || m?.serverId));
  if (body.message && typeof body.message === "object") add(body.message.server_id);
  return ids;
}

/**
 * Localized copy of an API body (servers / server / channel / messages / message), or
 * the body itself when nothing applies. Never mutates `body` (the server list is shared
 * between concurrent requests of one user).
 */
async function localizeBody(body, lang) {
  if (!lang || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const enabled = await store.enabledServerIds();
  if (!enabled.size) return body;
  const ids = [...serverIdsIn(body)].filter((id) => enabled.has(id));
  if (!ids.length) return body;
  const bundles = await store.loadBundles(ids);
  if (!bundles.size) return body;
  const out = { ...body };
  const bundleOf = (id) => (id ? bundles.get(String(id)) : null);
  if (Array.isArray(body.servers)) out.servers = body.servers.map((s) => (bundleOf(s?.id) ? decorateServer(s, bundleOf(s.id), lang) : s));
  if (body.server && bundleOf(body.server.id)) out.server = decorateServer(body.server, bundleOf(body.server.id), lang);
  const msgView = new Map();
  const viewOfMsg = (sid) => {
    const b = bundleOf(sid);
    if (!b) return null;
    if (!msgView.has(sid)) msgView.set(sid, viewFor(b, { id: sid }, lang));
    return msgView.get(sid);
  };
  if (body.channel && typeof body.channel === "object") {
    const sid = body.channel.serverId || body.channel.server_id;
    const view = viewOfMsg(sid ? String(sid) : null);
    if (view && body.channel.id && "name" in body.channel) out.channel = decorateChannel(body.channel, view);
  }
  if (Array.isArray(body.messages)) {
    out.messages = body.messages.map((m) => {
      const sid = m?.server_id || m?.serverId;
      const view = sid ? viewOfMsg(String(sid)) : null;
      return view ? decorateMessage(m, view) : m;
    });
  }
  if (body.message && typeof body.message === "object" && body.message.server_id) {
    const view = viewOfMsg(String(body.message.server_id));
    if (view) out.message = decorateMessage(body.message, view);
  }
  return out;
}

/**
 * Express middleware for the /servers router: JSON answers of opted-in servers get the
 * localized fields for the reader's language. Bodies without one pass through as is.
 */
function localizeResponses(req, res, next) {
  const lang = readerLang(req);
  if (!lang) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 || !body || typeof body !== "object") return json(body);
    localizeBody(body, lang)
      .then((out) => json(out))
      .catch((err) => {
        console.warn("[serverL10n] localize failed:", err?.message || err);
        json(body);
      });
    return res;
  };
  res.vary?.("Accept-Language");
  return next();
}

/**
 * Display names of an opted-in server and one channel in every live locale (push
 * notifications, which are built per device language). Map locale -> {serverName, channelName}.
 */
async function namesByLocale(serverId, channelId, locales, { serverName = null } = {}) {
  const bundle = await store.loadBundle(serverId);
  if (!bundle) return null;
  const ch = (bundle.channels || []).find((c) => String(c.id) === String(channelId)) || null;
  const out = {};
  for (const lang of locales) {
    const view = viewFor(bundle, { id: serverId, name: serverName }, lang);
    if (!view) continue;
    const name = view.server.name && view.server.name.source === serverName ? view.server.name.text : null;
    const chName = ch ? view.channelName(ch.id) : null;
    const entry = {};
    if (name && name !== serverName) entry.serverName = name;
    if (chName && ch && chName !== ch.name) entry.channelName = chName;
    if (Object.keys(entry).length) out[lang] = entry;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = { readerLang, decorateServer, decorateChannel, decorateMessage, localizeBody, localizeResponses, namesByLocale };
