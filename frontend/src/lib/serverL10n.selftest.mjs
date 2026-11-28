/**
 * Localized server content (draft C) on the client:
 *   - the mirror pick() / renderMentions() agree with backend/lib/serverL10n/core.js on
 *     every seed item x locale (admin preview = what the API gives readers)
 *   - display helpers only use a localized value while its source equals the original
 *     (a renamed channel shows the new original at once)
 *   - official message lookup (server map, history copy, other-language copy skipped),
 *     "Show original" toggle remembered per session, topic toggle
 *   - channel search by original and translated name, notification names, welcome vars
 *   - admin editor model: <#name> editing, merge of unsaved edits / drafts, cell states,
 *     draft targets, save body, coverage
 * Run: node frontend/src/lib/serverL10n.selftest.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as L from "./serverL10n.js";
import * as M from "../components/admin/serverL10n/serverL10nModel.js";

const require = createRequire(import.meta.url);
const core = require("../../backend/lib/serverL10n/core.js");
const content = require("../../backend/content/descallCommunityL10n.js");
const live = require("../../backend/test/fixtures/descallCommunityLive.cjs");

// sessionStorage stand-in (the toggle is remembered per session).
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

let n = 0;
const t = (name, fn) => {
  try {
    fn();
    n += 1;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
};

const originalOf = (kind, ref) => {
  if (kind === "server_name") return live.SERVER.name;
  if (kind === "server_description") return live.SERVER.description;
  if (kind === "message") return live.MESSAGES.find((m) => m.id === ref)?.content ?? null;
  const ch = live.CHANNELS.find((c) => c.id === ref);
  return kind === "channel_name" ? ch?.name ?? null : ch?.topic ?? null;
};
const rows = content.seedRows().map((r) => ({ kind: r.kind, ref_id: r.refId, locale: r.locale, text: r.text, source_text: originalOf(r.kind, r.refId), updated_at: "2026-11-28T17:00:00Z" }));
// Editor-shaped items (GET /admin/server-translations/:id).
const items = [];
const byKey = new Map();
for (const r of rows) {
  const k = `${r.kind}:${r.ref_id}`;
  if (!byKey.has(k)) {
    const it = { kind: r.kind, refId: r.ref_id, original: originalOf(r.kind, r.ref_id), translations: {} };
    if (r.kind === "message") it.channelId = live.MESSAGES.find((m) => m.id === r.ref_id).channel_id;
    if (r.kind === "message") it.pinned = Boolean(live.MESSAGES.find((m) => m.id === r.ref_id).pinned_at);
    if (r.kind.startsWith("channel")) it.channelType = live.CHANNELS.find((c) => c.id === r.ref_id).type;
    byKey.set(k, it);
    items.push(it);
  }
  byKey.get(k).translations[r.locale] = { text: r.text, sourceText: r.source_text, updatedAt: r.updated_at };
}
const channels = live.CHANNELS.map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic, parentId: c.parent_id }));
const LOCALES = content.LOCALES;

t("mirror pick() and renderMentions() agree with the backend on the seed", () => {
  for (const lang of LOCALES) {
    const view = core.buildView({ settings: { enabled: true, source_locale: "tr" }, rows, server: live.SERVER, channels: live.CHANNELS, messages: live.MESSAGES, lang });
    const pv = L.readerPreview({ items, channels, lang, sourceLocale: "tr" });
    for (const ch of pv.channels) {
      assert.equal(ch.name, view.channelName(ch.id), `${lang} name ${ch.id}`);
      const topic = view.channels.get(ch.id).topic;
      assert.equal(ch.topic, topic ? topic.text : ch.topic || "", `${lang} topic ${ch.id}`);
    }
    for (const m of live.MESSAGES) assert.equal(pv.messages.get(m.id).text, view.messages.get(m.id).text, `${lang} message ${m.id}`);
    assert.equal(pv.serverName, view.server.name.text);
    assert.equal(pv.serverDescription, view.server.description.text);
  }
  // Stale rule parity: an edited original.
  const r = { text: "Regras", sourceText: "kurallar", updatedAt: "2026-11-28T17:00:00Z" };
  assert.deepEqual(L.pick({ original: "kurallar-2", rows: { "pt-BR": r }, lang: "pt-BR", sourceLocale: "tr" }), core.pick({ original: "kurallar-2", rows: { "pt-BR": { text: "Regras", source_text: "kurallar", updated_at: r.updatedAt } }, lang: "pt-BR", sourceLocale: "tr" }));
  assert.equal(L.renderMentions(`see <#${content.CHANNELS.lobi}>`, () => ({ name: "Lobby", type: "voice" })), "see Lobby");
});

const rules = { id: content.CHANNELS.kurallar, name: "kurallar", topic: "Topluluk kuralları.", nameLocalized: "regras", topicLocalized: "Regras da comunidade.", l10n: { name: { locale: "pt-BR", translated: true, source: "kurallar" }, topic: { locale: "pt-BR", translated: true, source: "Topluluk kuralları." } } };

t("display helpers use the localized value only while its source matches", () => {
  assert.equal(L.channelDisplayName(rules), "regras");
  assert.equal(L.channelDisplayName({ ...rules, name: "kurallar-ve-sss" }), "kurallar-ve-sss", "renamed by a socket update: new original");
  assert.equal(L.channelDisplayName({ id: "x", name: "genel" }), "genel");
  const server = { id: "s", name: "Descall Topluluk", nameLocalized: "Comunidade Descall", description: "aciklama", descriptionLocalized: "descricao", l10n: { name: { locale: "pt-BR", translated: true, source: "Descall Topluluk" }, description: { locale: "pt-BR", translated: true, source: "aciklama" } } };
  assert.equal(L.serverDisplayName(server), "Comunidade Descall");
  assert.equal(L.serverDisplayDescription(server), "descricao");
  assert.equal(L.serverNameLocale(server), "pt-BR");
  assert.equal(L.serverDisplayName({ ...server, name: "Yeni Ad" }), "Yeni Ad");
  assert.equal(L.serverNameLocale({ ...server, l10n: { name: { locale: "tr", translated: false, source: "Descall Topluluk" } } }), null, "source-language row: no marker");
});

t("topic: translated text, marker info and the per-session show-original toggle", () => {
  const info = L.channelTopicL10n(rules);
  assert.equal(info.text, "Regras da comunidade.");
  assert.equal(info.translated, true);
  assert.equal(info.canToggle, true);
  L.toggleShowingOriginal(info.key);
  const back = L.channelTopicL10n(rules);
  assert.equal(back.text, "Topluluk kuralları.");
  assert.equal(back.showingOriginal, true);
  assert.ok(JSON.parse(store.get("descall:l10n:original:v1")).includes(info.key), "remembered in sessionStorage");
  L.setShowingOriginal(info.key, false);
  assert.equal(L.channelTopicL10n(rules).text, "Regras da comunidade.");
  assert.equal(L.channelTopicL10n({ ...rules, topic: "Yeni konu" }), null, "edited topic: original");
});

t("official messages: server map first, history copy for the same reader only", () => {
  const msg = { id: "m1", text: "Hos geldin #kurallar" };
  const server = { l10n: { locale: "pt-BR", messages: { m1: { text: "Boas-vindas #regras", locale: "pt-BR", translated: true, source: "Hos geldin #kurallar" } } } };
  assert.equal(L.messageL10n(msg, server).text, "Boas-vindas #regras");
  const hist = { ...msg, contentLocalized: "Welcome #rules", l10n: { locale: "en", reader: "en", translated: true, source: msg.text } };
  assert.equal(L.messageL10n(hist, null, { readerLocale: "en" }).text, "Welcome #rules");
  assert.equal(L.messageL10n(hist, { l10n: { locale: "tr" } }, { readerLocale: "tr" }), null, "copy fetched in English is not shown to a Turkish reader");
  assert.equal(L.messageL10n({ id: "m1", text: "edited" }, server), null, "edited message: original");
  assert.equal(L.messageL10n({ id: "u1", text: "Oi pessoal" }, server), null, "user chat never translated");
  const info = L.messageL10n(msg, server);
  L.toggleShowingOriginal(info.key);
  assert.equal(L.messageL10n(msg, server).text, msg.text);
  assert.equal(L.messageL10n(msg, server).translated, false);
  L.setShowingOriginal(info.key, false);
});

t("channel search finds the original and the translated name", () => {
  assert.equal(L.channelMatches(rules, "kural"), true);
  assert.equal(L.channelMatches(rules, "REGRAS"), true);
  assert.equal(L.channelMatches(rules, "ajuda"), false);
  assert.equal(L.channelSearchText(rules), "kurallar regras");
});

t("notifications and the welcome message use the reader's names", () => {
  const list = [{ id: "s", name: "Descall Topluluk", nameLocalized: "Comunidade Descall", l10n: { name: { source: "Descall Topluluk", locale: "pt-BR", translated: true } }, channels: [rules] }];
  L.rememberServerList(list);
  assert.deepEqual(L.notificationNames(null, { serverId: "s", serverName: "Descall Topluluk", channelId: rules.id, channelName: "kurallar" }), { serverName: "Comunidade Descall", channelName: "regras" });
  assert.deepEqual(L.notificationNames(null, { serverId: "other", serverName: "X", channelId: "c", channelName: "y" }), { serverName: "X", channelName: "y" });
  const welcome = { id: "w", text: "x", i18n: { text: { key: "bot.onb.joinWelcome", vars: { user: "@ana", server: "Descall Topluluk" } } } };
  assert.equal(L.withServerDisplayVars(welcome, "Descall Topluluk", "Comunidade Descall").i18n.text.vars.server, "Comunidade Descall");
  assert.equal(L.withServerDisplayVars(welcome, "Other", "X"), welcome);
});

t("admin model: <#name> editing round trip and unknown names", () => {
  const stored = `Leia <#${content.CHANNELS.kurallar}> e <#${content.CHANNELS.lobi}>.`;
  const editable = M.toEditable(stored, channels);
  assert.equal(editable, "Leia <#kurallar> e <#Lobi>.");
  assert.equal(M.fromEditable(editable, channels), stored);
  assert.deepEqual(M.unknownMentions("veja <#naoexiste> e <#genel>", channels), ["naoexiste"]);
});

t("admin model: unsaved edits and drafts feed coverage, states, preview and save", () => {
  const kurallarName = items.find((it) => it.kind === "channel_name" && it.refId === content.CHANNELS.kurallar);
  const edits = {
    [M.cellKey(kurallarName, "es")]: { text: "", draft: false },
    [M.cellKey(kurallarName, "pt-BR")]: { text: "regras-do-servidor", draft: true },
  };
  const merged = M.mergeEdits(items, edits);
  const it = merged.find((x) => x.kind === "channel_name" && x.refId === content.CHANNELS.kurallar);
  assert.equal(M.cellState(it, "es", "tr"), "missing");
  assert.equal(M.cellState(it, "pt-BR", "tr"), "draft");
  assert.equal(M.cellState(it, "en", "tr"), "done");
  const cov = M.coverageOf(merged, LOCALES);
  assert.equal(cov.es.missing, 1);
  assert.equal(cov.en.pct, 100);
  const pv = L.readerPreview({ items: merged, channels, lang: "pt-BR", sourceLocale: "tr" });
  assert.equal(pv.channels.find((c) => c.id === content.CHANNELS.kurallar).name, "regras-do-servidor", "preview shows the draft");
  assert.match(pv.messages.get("81d1ae52-594a-479a-a2b1-2a9a3fff5d2f").text, /^\*\*Regras do servidor/);
  const es = L.readerPreview({ items: merged, channels, lang: "es", sourceLocale: "tr" });
  assert.equal(es.channels.find((c) => c.id === content.CHANNELS.kurallar).name, "rules", "missing es falls back to English");
  const body = M.saveBody(edits, items, channels);
  assert.deepEqual(body.map((b) => [b.locale, b.text]).sort(), [["es", ""], ["pt-BR", "regras-do-servidor"]]);
  const targets = M.draftTargets(merged, LOCALES, "tr");
  assert.deepEqual(targets, { items: [{ kind: "channel_name", refId: content.CHANNELS.kurallar }], locales: ["es"] });
  assert.equal(M.filterItems(merged, { status: "pending", locales: LOCALES }).length, 1);
  assert.equal(M.filterItems(merged, { q: "regras-do", locales: LOCALES }).length, 1);
  assert.ok(M.filterItems(merged, { group: "message", locales: LOCALES }).every((x) => x.kind === "message"));
});

console.log(`serverL10n client selftest: ${n} passed`);
