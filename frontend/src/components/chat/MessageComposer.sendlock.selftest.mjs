/**
 * Run: node frontend/src/components/chat/MessageComposer.sendlock.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const composer = readFileSync(join(root, "MessageComposer.jsx"), "utf8");
const chat = readFileSync(join(root, "../layout/ChatPanel.jsx"), "utf8");

assert(composer.includes("sendingRef"), "composer must lock rapid Enter sends");
assert(composer.includes("nameKey"), "emoji categories must be translated");
assert(chat.includes("composerDisabled"), "timeout and missing send permission must disable the composer");
assert(chat.includes("activeTimeout?.timedOut"), "timeout banner must actually block sending");
assert(chat.includes("aria-label={t(\"Voice Call\")}"), "call buttons need aria-labels");

console.log("MessageComposer.sendlock.selftest.mjs: ok");
