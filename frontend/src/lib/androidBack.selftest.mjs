import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideAndroidBack, isCloseLabel } from "./androidBack.js";

function isVisible() {
  return true;
}

function find(flags) {
  if (flags.menu) return "menu";
  if (flags.overlay) return "overlay";
  if (flags.drawerOverConversation) return "drawer";
  if (flags.conversation) return "conversation";
  return "exit";
}

assert.equal(find({ menu: true, overlay: true, conversation: true }), "menu");
assert.equal(find({ overlay: true, conversation: true }), "overlay");
assert.equal(find({ drawerOverConversation: true, conversation: true }), "drawer");
assert.equal(find({ conversation: true }), "conversation");
assert.equal(find({}), "exit");
assert.equal(typeof isVisible, "function");
// ── Real decision table (one back stack for every layer) ──
assert.equal(decideAndroidBack({ menu: true, dialog: true, conversation: true }), "menu", "menu inside a sheet closes first");
assert.equal(decideAndroidBack({ dialog: true, settings: true, conversation: true }), "dialog");
assert.equal(decideAndroidBack({ settingsSection: true, settings: true }), "settings-section", "section returns to the settings menu");
assert.equal(decideAndroidBack({ settings: true, conversation: true }), "settings");
assert.equal(decideAndroidBack({ drawerOverConversation: true, conversation: true }), "drawer");
assert.equal(decideAndroidBack({ conversation: true, view: "servers" }), "conversation");
assert.equal(decideAndroidBack({ server: true, view: "servers" }), "server", "open server goes back to the server list");
assert.equal(decideAndroidBack({ view: "friends" }), "home", "another root tab goes home first");
assert.equal(decideAndroidBack({ view: "chat" }), "exit", "only the home tab exits");
assert.equal(decideAndroidBack({}), "exit");

for (const label of ["Close", "Kapat", "Schließen", "Cerrar", "Fermer", "Fechar", "Закрыть", " kapat "]) {
  assert.equal(isCloseLabel(label), true, `close label ${label}`);
}
for (const label of ["Profil seçenekleri", "Close friends", "", null]) {
  assert.equal(isCloseLabel(label), false, `not a close label: ${label}`);
}

// Escape must reach document listeners (menus listen there): never dispatch on window.
const src = readFileSync(new URL("./androidBack.js", import.meta.url), "utf8");
assert.ok(!/window\.dispatchEvent\(new KeyboardEvent/.test(src), "Escape is not dispatched on window");
assert.match(src, /target\.dispatchEvent\(new KE\("keydown"/, "Escape bubbles from the focused element");
// The profile options button shares .user-profile-close; it must never count as close.
assert.match(src, /user-profile-more/);
// A z-index tie must not let a later sibling button (profile "more") win by accident.
assert.match(src, /if \(rank > bestRank\)/);
// The web history observer must not watch inline styles (springs write them every frame).
assert.ok(!/attributeFilter: \[[^\]]*"style"/.test(src));

console.log("androidBack.selftest ok");
