"use strict";

/**
 * Localized server content (draft C): fallback order (app language, English, original),
 * the source-language rule, stale detection, <#id> mention resolution per reader, slug
 * names, coverage, and the seed: every row of backend/content/descallCommunityL10n.js in
 * the source language renders exactly to the live original (fixture), no emojis, no
 * Valorant / "takım bul", and the migration on disk is generated from the content file.
 * Run: node frontend/backend/lib/serverL10n/core.selftest.cjs
 */

const assert = require("node:assert/strict");
const core = require("./core");
const content = require("../../content/descallCommunityL10n");
const live = require("../../test/fixtures/descallCommunityLive.cjs");

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

const row = (locale, text, extra = {}) => ({ locale, text, ...extra });

t("fallback: app language, then English, then the original", () => {
  const rows = { en: row("en", "rules"), "pt-BR": row("pt-BR", "regras"), tr: row("tr", "kurallar", { source_text: "kurallar" }) };
  assert.deepEqual(core.pick({ original: "kurallar", rows, lang: "pt-BR", sourceLocale: "tr" }), { text: "regras", locale: "pt-BR", translated: true, stale: false });
  assert.equal(core.pick({ original: "kurallar", rows, lang: "de", sourceLocale: "tr" }).text, "rules");
  assert.equal(core.pick({ original: "kurallar", rows, lang: "de", sourceLocale: "tr" }).locale, "en");
  assert.equal(core.pick({ original: "kurallar", rows: {}, lang: "de", sourceLocale: "tr" }), null, "no rows: original");
  assert.equal(core.pick({ original: "", rows, lang: "en", sourceLocale: "tr" }), null, "no original: nothing");
});

t("source language: its row only while it matches the original", () => {
  const rows = { tr: row("tr", "Kural <#x>", { source_text: "Kural #a" }), en: row("en", "Rule") };
  const fresh = core.pick({ original: "Kural #a", rows, lang: "tr", sourceLocale: "tr" });
  assert.equal(fresh.translated, false);
  assert.equal(fresh.text, "Kural <#x>");
  assert.equal(core.pick({ original: "Kural #b (edited)", rows, lang: "tr", sourceLocale: "tr" }), null, "stale source row: original");
  // A Turkish reader never falls through to English.
  assert.equal(core.pick({ original: "Kural", rows: { en: row("en", "Rule") }, lang: "tr", sourceLocale: "tr" }), null);
  // English source: an English reader sees the original even with no rows.
  assert.equal(core.pick({ original: "Rules", rows: { de: row("de", "Regeln") }, lang: "en", sourceLocale: "en" }), null);
});

t("stale: original changed or edited after the translation, still shown", () => {
  const r = row("de", "Regeln", { source_text: "kurallar", updated_at: "2026-11-28T15:00:00Z" });
  assert.equal(core.isStale(r, "kurallar"), false);
  assert.equal(core.isStale(r, "kurallar-v2"), true);
  assert.equal(core.isStale(r, "kurallar", "2026-11-28T16:00:00Z"), true, "edited after");
  assert.equal(core.isStale(r, "kurallar", "2026-11-28T14:00:00Z"), false, "edited before");
  const hit = core.pick({ original: "kurallar-v2", rows: { de: r }, lang: "de", sourceLocale: "tr" });
  assert.equal(hit.text, "Regeln");
  assert.equal(hit.stale, true);
});

t("mentions resolve by id to the reader's channel name", () => {
  const chans = { a: { name: "regras", type: "text" }, b: { name: "Lobby", type: "voice" } };
  const of = (id) => ({ "11111111-1111-4111-8111-111111111111": chans.a, "22222222-2222-4222-8222-222222222222": chans.b })[id] || null;
  const text = "Leia <#11111111-1111-4111-8111-111111111111>, depois <#22222222-2222-4222-8222-222222222222> e <#33333333-3333-4333-8333-333333333333>.";
  assert.equal(core.renderMentions(text, of), "Leia #regras, depois Lobby e #deleted-channel.");
  assert.deepEqual(core.mentionIds(text), ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]);
  // Upper-case ids in stored text still resolve.
  assert.equal(core.renderMentions("<#11111111-1111-4111-8111-111111111111>".toUpperCase().replace("<#", "<#"), of), "#regras");
});

const rows = content.seedRows().map((r, i) => ({ id: i + 1, server_id: content.SERVER_ID, kind: r.kind, ref_id: r.refId, locale: r.locale, text: r.text, source_text: null, updated_at: "2026-11-28T17:00:00Z" }));
// source_text as the migration fills it: the live original of each item.
const originalOf = (kind, ref) => {
  if (kind === "server_name") return live.SERVER.name;
  if (kind === "server_description") return live.SERVER.description;
  if (kind === "message") return live.MESSAGES.find((m) => m.id === ref)?.content ?? null;
  const ch = live.CHANNELS.find((c) => c.id === ref);
  return kind === "channel_name" ? ch?.name ?? null : ch?.topic ?? null;
};
for (const r of rows) r.source_text = originalOf(r.kind, r.ref_id);

const view = (lang) => core.buildView({
  settings: { enabled: true, source_locale: content.SOURCE_LOCALE },
  rows,
  server: live.SERVER,
  channels: live.CHANNELS,
  messages: live.MESSAGES,
  lang,
});

t("seed: one row per item and locale, all items exist live", () => {
  assert.equal(rows.length, 7 * (2 + live.CHANNELS.length + Object.keys(content.CHANNEL_TOPICS).length + live.MESSAGES.length));
  for (const r of rows) assert.ok(r.source_text, `${r.kind} ${r.ref_id} has a live original`);
  for (const [slug, topic] of Object.entries(content.CHANNEL_TOPICS)) {
    assert.ok(live.CHANNELS.find((c) => c.id === content.CHANNELS[slug])?.topic, `${slug} has a topic`);
    assert.equal(Object.keys(topic).length, 7);
  }
  assert.deepEqual([...new Set(rows.map((r) => r.locale))].sort(), [...content.LOCALES].sort());
});

t("seed: the Turkish rows render exactly to the live originals", () => {
  const v = view("tr");
  for (const ch of live.CHANNELS) {
    assert.equal(v.channels.get(ch.id).name.text, ch.name, `name ${ch.name}`);
    if (ch.topic) assert.equal(v.channels.get(ch.id).topic.text, ch.topic, `topic ${ch.name}`);
  }
  for (const m of live.MESSAGES) assert.equal(v.messages.get(m.id).text, m.content, `message ${m.id}`);
  assert.equal(v.server.name.text, live.SERVER.name);
  assert.equal(v.server.description.text, live.SERVER.description);
});

t("seed: pt-BR and English readers see # regras / # rules and the translated rules", () => {
  const pt = view("pt-BR");
  assert.equal(pt.channelName(content.CHANNELS.kurallar), "regras");
  assert.equal(pt.channelName(content.CHANNELS["hos-geldin"]), "boas-vindas");
  assert.equal(pt.channelName(content.CHANNELS.genel), "geral");
  assert.equal(pt.server.name.text, "Comunidade Descall");
  const welcome = pt.messages.get("401e70db-e932-4393-86be-0425a241b85a");
  assert.equal(welcome.translated, true);
  assert.equal(welcome.locale, "pt-BR");
  assert.match(welcome.text, /Leia e aceite as #regras\./);
  assert.match(welcome.text, /entre no Lobby\./);
  assert.doesNotMatch(welcome.text, /<#/);
  const en = view("en");
  assert.equal(en.channelName(content.CHANNELS.kurallar), "rules");
  assert.match(en.messages.get("81d1ae52-594a-479a-a2b1-2a9a3fff5d2f").text, /questions go in #help, bugs in #bug-reports, ideas in #suggestions/);
  assert.match(en.channels.get(content.CHANNELS["hos-geldin"]).topic.text, /introduce yourself in #introductions and post your questions in #help/);
});

t("seed: a language without rows falls back to English", () => {
  const rowsNoDe = rows.filter((r) => r.locale !== "de");
  const v = core.buildView({ settings: { enabled: true, source_locale: "tr" }, rows: rowsNoDe, server: live.SERVER, channels: live.CHANNELS, messages: live.MESSAGES, lang: "de" });
  assert.equal(v.channelName(content.CHANNELS.kurallar), "rules");
  assert.equal(v.server.name.locale, "en");
});

t("seed: text, names and slugs follow the owner rules", () => {
  const banned = /valorant|tak[ıi]m bul/i;
  for (const r of rows) {
    assert.doesNotMatch(r.text, /\p{Extended_Pictographic}/u, `emoji in ${r.kind} ${r.locale}`);
    assert.doesNotMatch(r.text, banned, `banned word in ${r.kind} ${r.locale}`);
    assert.ok(r.text.length <= core.MAX_TEXT);
  }
  for (const ch of live.CHANNELS.filter((c) => c.type === "text" || c.type === "announcement")) {
    for (const r of rows.filter((x) => x.kind === "channel_name" && x.ref_id === ch.id)) {
      assert.equal(r.text, core.slugify(r.text, r.locale), `${r.locale} ${r.text} is a slug`);
    }
  }
  // Mentions in the seed only point at channels of the server.
  const ids = new Set(live.CHANNELS.map((c) => c.id));
  for (const r of rows) for (const id of core.mentionIds(r.text)) assert.ok(ids.has(id), `mention ${id}`);
});

t("disabled server or missing settings: nothing localized", () => {
  assert.equal(core.buildView({ settings: { enabled: false }, rows, server: live.SERVER, channels: live.CHANNELS, lang: "en" }), null);
  assert.equal(core.buildView({ settings: null, rows, server: live.SERVER, channels: live.CHANNELS, lang: "en" }), null);
});

t("coverage counts missing and stale per locale", () => {
  const items = [
    { kind: "channel_name", refId: "a", original: "genel" },
    { kind: "channel_name", refId: "b", original: "oyun" },
    { kind: "channel_topic", refId: "b", original: "" },
  ];
  const rs = [
    { kind: "channel_name", ref_id: "a", locale: "en", text: "general", source_text: "genel" },
    { kind: "channel_name", ref_id: "b", locale: "en", text: "gaming", source_text: "oyun-eski" },
  ];
  const c = core.coverage(items, rs, ["en", "de"]);
  assert.deepEqual(c.en, { total: 2, done: 2, stale: 1, missing: 0, pct: 100 });
  assert.deepEqual(c.de, { total: 2, done: 0, stale: 0, missing: 2, pct: 0 });
});

t("slugify keeps the originals' style", () => {
  assert.equal(core.slugify("Règles du serveur", "fr"), "regles-du-serveur");
  assert.equal(core.slugify("Boas Vindas!", "pt-BR"), "boas-vindas");
  assert.equal(core.slugify("Добро пожаловать", "ru"), "добро-пожаловать");
  assert.equal(core.slugify("Straße", "de"), "strasse");
  assert.equal(core.isSlugName("hos-geldin"), true);
  assert.equal(core.isSlugName("Ses Odaları"), false);
});

t("migration on disk is generated from the content file", () => {
  const fs = require("fs");
  const gen = require("../../scripts/genServerL10nSeed.cjs");
  assert.equal(fs.readFileSync(gen.OUT, "utf8"), gen.build(), "run node backend/scripts/genServerL10nSeed.cjs");
});

console.log(`serverL10n core selftest: ${n} passed`);
