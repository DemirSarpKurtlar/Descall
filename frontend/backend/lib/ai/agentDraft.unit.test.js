"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeHandle,
  convKey,
  looksLikeToolJson,
  polishOutboundText,
  scorePerson,
} = require("./agentDraft");

test("DM keys match the live chat format", () => {
  assert.equal(convKey("b", "a"), "a::b");
  assert.equal(convKey("a", "b"), "a::b");
});

test("handles strip @ and extra spaces", () => {
  assert.equal(normalizeHandle("@Yigit"), "Yigit");
  assert.equal(normalizeHandle("  @@demir  "), "demir");
});

test("polish keeps dictated wording and rejects tool JSON / AI voice", () => {
  assert.equal(polishOutboundText("  sa kanks  ").text, "sa kanks");
  assert.equal(polishOutboundText('"yarın gelirim"').text, "yarın gelirim");
  assert.equal(polishOutboundText("```\nsee you tonight\n```").text, "see you tonight");
  assert.ok(polishOutboundText('{ "pending_action": true, "text": "hi" }').error);
  assert.ok(polishOutboundText("Hi, I am an AI assistant writing on behalf of Demir.").error);
  assert.ok(looksLikeToolJson('{"toUserId":"x","text":"hi"}'));
});

test("people ranking prefers exact username over partial display names", () => {
  const yigit = { username: "yigit", display_name: "Yiğit" };
  const other = { username: "yigitcan", display_name: "Yigit Fan" };
  assert.ok(scorePerson(yigit, "yigit") > scorePerson(other, "yigit"));
  assert.ok(scorePerson(yigit, "yiğit") >= 50 || scorePerson(yigit, "Yiğit") >= 50);
});
