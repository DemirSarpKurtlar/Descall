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
for (const l of ["ru", "fr", "es"]) {
  for (const k of ["Mute chat", "Unmute chat", "lx.muteAudio", "lx.unmuteAudio"]) {
    const v = translate(l, k);
    assert.ok(!/микрофон|micro/i.test(v), `${l} ${k} is not about the microphone: ${v}`);
    assert.notEqual(v, k, `${l} ${k} translated`);
  }
}
assert.equal(translate("en", "Mute chat"), "Mute");

console.log("polishWording.selftest: ok");
