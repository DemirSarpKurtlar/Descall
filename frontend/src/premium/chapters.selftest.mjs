import assert from "node:assert/strict";
import { PREMIUM_CATEGORIES } from "./categories.js";
import { PREMIUM_CHAPTERS, storyNumber, storyOrder } from "./chapters.js";

// Every category has chapters, and they hold exactly the category's keys, each once.
assert.deepEqual(Object.keys(PREMIUM_CHAPTERS).sort(), PREMIUM_CATEGORIES.map((c) => c.id).sort());
for (const cat of PREMIUM_CATEGORIES) {
  const chapters = PREMIUM_CHAPTERS[cat.id];
  assert.ok(chapters.length >= 2, `${cat.id} needs at least two chapters`);
  const ids = new Set();
  for (const ch of chapters) {
    assert.match(ch.id, /^[a-z]+$/, `${cat.id}: bad chapter id ${ch.id}`);
    assert.ok(!ids.has(ch.id), `${cat.id}: chapter ${ch.id} twice`);
    ids.add(ch.id);
    assert.ok(ch.keys.length > 0, `${cat.id}.${ch.id} is empty`);
  }
  const order = storyOrder(cat.id);
  assert.equal(new Set(order).size, order.length, `${cat.id}: a key is in two chapters`);
  assert.deepEqual([...order].sort(), [...cat.keys].sort(), `${cat.id}: chapters and category keys differ`);
}

// Every chapter has a title and a lead in every locale (premiumStory.ch.<category>.<chapter>).
const LOCALES = { en: "EN", tr: "TR", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
for (const [loc, suffix] of Object.entries(LOCALES)) {
  const mod = await import(`../i18n/locales/premiumStory.${loc}.js`);
  const tree = mod[`PREMIUM_STORY_${suffix}`];
  assert.ok(tree, `premiumStory.${loc}.js has no PREMIUM_STORY_${suffix}`);
  for (const [cat, chapters] of Object.entries(PREMIUM_CHAPTERS)) {
    for (const ch of chapters) {
      const node = tree.ch?.[cat]?.[ch.id];
      assert.ok(node && node.title && node.lead, `${loc}: premiumStory.ch.${cat}.${ch.id} needs title and lead`);
    }
  }
}

assert.equal(storyNumber("windows", "mini_mode"), "01");
assert.equal(storyNumber("audio", "stream_audio_control"), "08");
assert.equal(storyNumber("audio", "mini_mode"), "");
assert.deepEqual(storyOrder("nope"), []);

console.log("chapters.selftest ok");
