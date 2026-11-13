// Server template channel topics read in the viewer's language (2026-11 owner report:
// "Server rules — accept before chatting ..." in a Turkish UI). Run:
//   node src/i18n/serverTemplateTopics.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_TEMPLATE_TOPICS, templateTopicKey, channelTopicText } from "./serverTemplateTopics.js";
import { SERVER_TEMPLATE_TOPICS_I18N } from "./locales/serverTemplateTopics.i18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { TEMPLATES, localizeTemplate, templateTopicKey: backendKey } = require(join(here, "../../backend/lib/serverTemplates.js"));

// 1. The frontend list and translations match the backend templates and catalogs.
const english = [];
for (const raw of TEMPLATES) {
  for (const c of raw.categories || []) for (const ch of c.channels || []) if (ch.topic && !english.includes(ch.topic)) english.push(ch.topic);
}
assert.deepEqual([...SERVER_TEMPLATE_TOPICS].sort(), english.sort(), "SERVER_TEMPLATE_TOPICS must list every template topic");
for (const [lang, table] of Object.entries(SERVER_TEMPLATE_TOPICS_I18N)) {
  assert.deepEqual(Object.keys(table).sort(), english.sort(), `${lang}: every template topic translated`);
  for (const raw of TEMPLATES) {
    const loc = localizeTemplate(raw, lang);
    (raw.categories || []).forEach((c, ci) => (c.channels || []).forEach((ch, chi) => {
      if (!ch.topic) return;
      assert.equal(table[ch.topic], loc.categories[ci].channels[chi].topic, `${lang}: "${ch.topic}" matches backend/i18n/${lang}.js`);
    }));
  }
}

// 2. Display: template topics translate, a member's own topic never does.
const fakeT = (key) => SERVER_TEMPLATE_TOPICS_I18N.tr[key] || key;
const RULES = "Server rules — accept before chatting in community channels.";
assert.equal(channelTopicText({ topic: RULES }, fakeT), SERVER_TEMPLATE_TOPICS_I18N.tr[RULES]);
assert.equal(channelTopicText({ topic: `  ${RULES}  ` }, fakeT), SERVER_TEMPLATE_TOPICS_I18N.tr[RULES]);
assert.equal(channelTopicText({ topic: "Kendi yazdığım konu." }, fakeT), "Kendi yazdığım konu.");
assert.equal(channelTopicText({ topic: "Server rules: be nice." }, fakeT), "Server rules: be nice.");
assert.equal(channelTopicText({ topic: null }, fakeT), "");
assert.equal(channelTopicText(null, fakeT), "");

// A topic stored in Turkish carries the server's key (publicChannel) and reads in English.
const trTopic = SERVER_TEMPLATE_TOPICS_I18N.tr[RULES];
const tagged = { topic: trTopic, i18n: { topic: { key: RULES, source: trTopic } } };
assert.equal(templateTopicKey(tagged), RULES);
assert.equal(channelTopicText(tagged, (k) => k), RULES);
// A stale key (topic edited, old i18n merged into the cached channel) is ignored.
assert.equal(channelTopicText({ topic: "Yeni konu", i18n: { topic: { key: RULES, source: trTopic } } }, fakeT), "Yeni konu");
// A key that is not a template topic is never used.
assert.equal(templateTopicKey({ topic: "x", i18n: { topic: { key: "Delete account", source: "x" } } }), null);

// 3. Backend: every language's template topic maps back to the English key.
assert.equal(backendKey(RULES), RULES);
assert.equal(backendKey(trTopic), RULES);
assert.equal(backendKey(SERVER_TEMPLATE_TOPICS_I18N.de[RULES]), RULES);
assert.equal(backendKey("Kendi yazdığım konu."), null);
assert.equal(backendKey(null), null);

console.log(`serverTemplateTopics.selftest ok (${english.length} topics, ${Object.keys(SERVER_TEMPLATE_TOPICS_I18N).length} locales)`);
