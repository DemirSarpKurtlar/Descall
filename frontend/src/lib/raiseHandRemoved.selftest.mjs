/**
 * Raise hand is removed on every client and the server.
 * Run: node frontend/src/lib/raiseHandRemoved.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const files = [
  "src/components/CallOverlay.jsx",
  "src/hooks/useGroupCall.js",
  "src/dev/glassQaBridge.js",
  "src/styles/ui-polish.css",
  "src/styles/glass-desktop/calls.css",
  "src/styles/glass/call.css",
  "src/i18n/locales/en.js",
  "src/i18n/locales/tr.js",
  "backend/socket/groupHandlers.js",
];

const banned = [
  "hand-raise",
  "isHandRaised",
  "toggleHandRaise",
  "handRaised",
  "participant-tile-hand",
  "Raise hand",
  "Lower hand",
  "Hand raised",
  "raised their hand",
];

for (const file of files) {
  const src = readFileSync(join(root, file), "utf8");
  for (const phrase of banned) {
    assert.equal(src.includes(phrase), false, `${file} still mentions ${phrase}`);
  }
}

const overlay = readFileSync(join(root, "src/components/CallOverlay.jsx"), "utf8");
assert.equal(overlay.includes("justifyContent: \"center\""), true, "call bar stays a centered cluster");
assert.equal(overlay.includes("<Hand"), false);
assert.equal(overlay.includes(", Hand,"), false);

console.log("raiseHandRemoved.selftest.mjs: ok");
