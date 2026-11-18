// Wording that went wrong in some languages (polish scan i18n-a11y, Nov 2026).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { default: translate, loadI18nCatalogs, ensureLocaleLoaded } = await import("./index.js");
await loadI18nCatalogs("tr");
for (const l of ["en", "de", "es", "fr", "pt-BR", "ru"]) await ensureLocaleLoaded(l);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// i18n-a11y-03: muting a chat or someone's audio is not "turn off microphone".
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.ok(!/dm\.muted \? t\("Unmute"\) : t\("Mute"\)/.test(sidebar), "chat mute uses the chat keys");
assert.equal((sidebar.match(/dm\.muted \? t\("Unmute chat"\) : t\("Mute chat"\)/g) || []).length, 2, "swipe action and menu");
assert.ok(read("../components/ui/GlassVolumeSlider.jsx").includes('t("lx.muteAudio")'));
assert.ok(read("../components/servers/VoiceMemberContextMenu.jsx").includes('t("lx.muteAudio")'), "member menu mutes audio, not the mic");
for (const l of ["ru", "fr", "es"]) {
  for (const k of ["Mute chat", "Unmute chat", "lx.muteAudio", "lx.unmuteAudio"]) {
    const v = translate(l, k);
    assert.ok(!/микрофон|micro/i.test(v), `${l} ${k} is not about the microphone: ${v}`);
    assert.notEqual(v, k, `${l} ${k} translated`);
  }
}
assert.equal(translate("en", "Mute chat"), "Mute");

// i18n-a11y-05: no fixed Turkish case suffix glued to a placeholder ("#duyurular'e", "Seçenek 2'i").
assert.equal(translate("tr", "Message #{name}…", { name: "duyurular" }), "#duyurular kanalına mesaj yaz…");
assert.equal(translate("tr", "polls.create.optionRemove", { n: 2 }), "2. seçeneği kaldır");
{
  const files = ["tr.js", "polls.tr.js", "antibot.tr.js", "gamesAdmin.tr.js", "shopDesk.tr.js"];
  for (const f of files) {
    const src = read(`./locales/${f}`);
    assert.ok(!/\{(name|n|score|price)\}'(e|a|i|ı|u|ü|de|da)\b/.test(src), `${f}: no fixed suffix after a placeholder`);
  }
}

console.log("polishWording.selftest: ok");
