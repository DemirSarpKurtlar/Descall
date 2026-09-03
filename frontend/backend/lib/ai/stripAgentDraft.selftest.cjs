"use strict";

const assert = require("node:assert/strict");
const { isAgentDraftJson, stripAgentDraftChrome } = require("./stripAgentDraft");

const payload = `{
  "recipient": "yigit",
  "content": "sa"
}`;

assert.equal(isAgentDraftJson(payload), true);
assert.equal(
  stripAgentDraftChrome(`DM Hazır!\n\n\`\`\`json\n${payload}\n\`\`\`\n\nLütfen kartı gözden geçirin ve onaylayın.`, {
    hasPendingCard: true,
  }),
  "",
);
assert.equal(
  stripAgentDraftChrome("**My DM Dispatch Plan**\n\nOkay, so the task is clear: I need to send a direct message.", {
    hasPendingCard: true,
  }),
  "",
);
assert.equal(
  stripAgentDraftChrome("Kartı onaylaman yeterli.", { hasPendingCard: true }),
  "Kartı onaylaman yeterli.",
);

console.log("stripAgentDraft.selftest.cjs: ok");
