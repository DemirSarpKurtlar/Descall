/**
 * Run: node frontend/src/components/dimaai/stripAgentDraft.selftest.mjs
 */
import assert from "node:assert/strict";
import { isAgentDraftJson, stripAgentDraftChrome } from "./stripAgentDraft.js";

const payload = `{
  "recipient": "yigit",
  "content": "sa"
}`;

assert.equal(isAgentDraftJson(payload), true);
assert.equal(isAgentDraftJson('{"ok":true,"count":2}'), false);
assert.equal(isAgentDraftJson('{\n  "recipient": "yigit",\n  "content": "sa"'), true);

const fenced = `DM Hazır!

\`\`\`json
${payload}
\`\`\`

Lütfen kartı gözden geçirin ve onaylayın.`;

assert.equal(stripAgentDraftChrome(fenced, { hasPendingCard: true }), "");
assert.equal(stripAgentDraftChrome(fenced, { hasPendingCard: false }), "");
assert.equal(
  stripAgentDraftChrome("**My DM Dispatch Plan**\n\nOkay, so the task is clear: I need to send a DM.", {
    hasPendingCard: true,
  }),
  "",
);
assert.equal(stripAgentDraftChrome("Kartı onaylaman yeterli.", { hasPendingCard: true }), "Kartı onaylaman yeterli.");
assert.match(
  stripAgentDraftChrome("```js\nconst x = 1;\n```", { hasPendingCard: true }),
  /const x/,
);

const streaming = "```json\n{\n  \"recipient\": \"yigit\",\n  \"content\": \"sa\"";
assert.equal(stripAgentDraftChrome(streaming, { hasPendingCard: true }), "");

console.log("stripAgentDraft.selftest.mjs: ok");
