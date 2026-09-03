"use strict";

const assert = require("assert");
const { encryptSecret, decryptSecret, maskSecret } = require("./cryptoKeys");
const { sanitizeProviderText, publicErrorForStatus, publicErrorForCode, adminPingError, USER_QUOTA, USER_QUOTA_TR, USER_GENERIC, USER_GENERIC_TR } = require("./sanitize");
const {
  shouldFailover,
  shouldSkipSameProvider,
  isRecentlyFailing,
  failingWindowMs,
  reviveWindowMs,
  normalizeErrorCode,
  keyReviveMeta,
} = require("./provider-manager");
const { classifyHttpStatus, modelCandidates, extractText, extractThought, extractFunctionCalls, thinkingConfigFor } = require("./gemini");
const { tokenLimitFields, samplingFields } = require("./groq");
const { buildSystemPrompt } = require("./systemPrompt");
const { geminiFunctionDeclarations, IMPLEMENTED, executeTool } = require("./tools");
const { PUBLIC_ASSISTANT_NAME } = require("./provider");
const { normalizeTier, modelsForTier, groqModelsForTier, publicTiers, maxTokensForTier, thinkingEnabledForTier, preferredProviderForTier, providerSupportsAgentTools, toolsEnabledForTier, cheapPromptForTier } = require("./modelTiers");
const { createPending, rejectPending, confirmPending } = require("./agentActions");
const { kindFromMime, allowedMime } = require("./fileExtract");

process.env.JWT_SECRET = process.env.JWT_SECRET || "dimaai-test-secret-min-32-characters!!";

const sample = "AIzaSyDummyTestKeyValue1234567890abcd";
const enc = encryptSecret(sample);
assert.notEqual(enc, sample);
assert.equal(decryptSecret(enc), sample);
assert.equal(maskSecret(sample), "AIza...abcd");
assert.ok(!enc.includes("AIza"));

const leaked = sanitizeProviderText("Gemini 2.0 Flash error from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash");
assert.ok(!/gemini/i.test(leaked));
assert.ok(!/googleapis/i.test(leaked));
assert.equal(publicErrorForStatus(503), "Dima is temporarily unavailable. Please try again shortly.");
assert.equal(publicErrorForStatus(429), USER_QUOTA);
assert.equal(publicErrorForCode("quota", 429), USER_QUOTA);
assert.equal(publicErrorForCode("quota", 429, { locale: "tr" }), USER_QUOTA_TR);
assert.equal(publicErrorForCode("request", 400), USER_GENERIC);
assert.equal(publicErrorForCode("request", 400, { locale: "tr" }), USER_GENERIC_TR);
assert.equal(publicErrorForStatus(400, { locale: "tr" }), USER_GENERIC_TR);
assert.equal(adminPingError("auth"), "This key was rejected.");
assert.equal(adminPingError("request"), "This key could not be verified.");
assert.equal(adminPingError("quota"), USER_QUOTA);
assert.equal(classifyHttpStatus(404), "request");
assert.equal(classifyHttpStatus(401), "auth");
assert.equal(modelCandidates("dima_1_2_thinking")[0], "gemini-3.6-flash");
assert.equal(modelCandidates("dima_1_1_fast")[0], "gemini-2.5-flash");
assert.ok(!modelCandidates().includes("gemini-2.0-flash"));
assert.equal(modelsForTier("fast")[0], "gemini-2.5-flash"); // legacy → 1.1 Fast
assert.equal(modelsForTier("smart")[0], "gemini-3.6-flash"); // legacy → 1.2 Thinking
assert.equal(modelsForTier("dima_1_3_deep")[0], "gemini-3.6-flash");
assert.equal(groqModelsForTier("fast")[0], "openai/gpt-oss-20b");
assert.deepEqual(tokenLimitFields("openai/gpt-oss-20b", 1024), { max_completion_tokens: 1024 });
assert.deepEqual(tokenLimitFields("qwen/qwen3.6-27b", 1024), { max_tokens: 1024 });
assert.deepEqual(samplingFields("openai/gpt-oss-20b", 0.7), {});
assert.ok(samplingFields("qwen/qwen3.6-27b", 0.7).temperature === 0.7);
assert.ok(!JSON.stringify(groqModelsForTier("auto")).includes("llama-3.3"));
assert.ok(!JSON.stringify(publicTiers()).toLowerCase().includes("llama"));
assert.ok(!JSON.stringify(publicTiers()).toLowerCase().includes("groq"));
assert.equal(normalizeTier("SMART"), "dima_1_2_thinking");
assert.equal(normalizeTier("fast"), "dima_1_1_fast");
assert.ok(publicTiers().every((t) => ["dima_1_1_fast", "dima_1_1_turbo", "dima_1_2_thinking", "dima_1_2_pro", "dima_1_3_deep"].includes(t.id)));
assert.equal(normalizeTier("auto"), "dima_1_1_fast");
assert.equal(normalizeTier("dima-1-2-pro"), "dima_1_2_pro");
assert.equal(groqModelsForTier("dima_1_1_turbo")[0], "openai/gpt-oss-120b");
assert.equal(maxTokensForTier("dima_1_1_fast"), 1024);
assert.equal(maxTokensForTier("dima_1_1_turbo"), 2048);
assert.equal(maxTokensForTier("dima_1_2_thinking"), 8192);
assert.equal(maxTokensForTier("dima_1_2_pro"), 12288);
assert.equal(maxTokensForTier("dima_1_3_deep"), 16384);
assert.equal(thinkingEnabledForTier("dima_1_1_fast"), false);
assert.equal(thinkingEnabledForTier("dima_1_2_thinking"), true);
assert.equal(preferredProviderForTier("dima_1_1_fast"), "groq");
assert.equal(preferredProviderForTier("dima_1_2_thinking"), "gemini");
assert.deepEqual(thinkingConfigFor("gemini-3.6-flash", "dima_1_2_pro"), { thinkingLevel: "high", includeThoughts: true });
assert.deepEqual(thinkingConfigFor("gemini-2.5-flash", "dima_1_3_deep"), { thinkingBudget: 8192, includeThoughts: true });
assert.ok(!JSON.stringify(publicTiers()).toLowerCase().includes("gemini"));

assert.deepEqual(thinkingConfigFor("gemini-3.6-flash"), { thinkingLevel: "medium", includeThoughts: true });
assert.deepEqual(thinkingConfigFor("gemini-3.5-flash"), { thinkingLevel: "medium", includeThoughts: true });
assert.deepEqual(thinkingConfigFor("gemini-2.5-flash"), { thinkingBudget: 1024, includeThoughts: true });
assert.deepEqual(thinkingConfigFor("gemini-2.5-flash", "dima_1_2_thinking"), { thinkingBudget: 1024, includeThoughts: true });
assert.deepEqual(thinkingConfigFor("gemini-2.5-flash", "dima_1_3_deep"), { thinkingBudget: 8192, includeThoughts: true });
assert.equal(thinkingConfigFor("unknown-model"), null);
assert.equal(
  extractText({
    candidates: [{ content: { parts: [{ thought: true, text: "hidden" }, { text: "visible reply" }] } }],
  }),
  "visible reply",
);
assert.equal(
  extractText({ candidates: [{ content: { parts: [{ thought: true, text: "only thinking" }] } }] }),
  "",
);
assert.equal(
  extractThought({ candidates: [{ content: { parts: [{ thought: true, text: "only thinking" }] } }] }),
  "only thinking",
);
assert.equal(
  extractFunctionCalls({
    candidates: [{
      content: {
        parts: [{
          functionCall: { name: "web_search", args: { q: "x" } },
          thoughtSignature: "sig123",
        }],
      },
    }],
  })[0].thoughtSignature,
  "sig123",
);

assert.equal(shouldFailover("unavailable"), true);
assert.equal(shouldFailover("auth"), true);
assert.equal(shouldFailover("quota"), true);
assert.equal(shouldFailover("error"), true);

assert.equal(shouldFailover("request"), false);
assert.equal(shouldSkipSameProvider("request"), true);
assert.equal(shouldSkipSameProvider("unavailable"), false);

assert.equal(normalizeErrorCode("quota"), "quota");
assert.equal(normalizeErrorCode("auth"), "auth");
assert.equal(failingWindowMs("quota"), 60 * 1000);
assert.equal(failingWindowMs("unavailable"), 45 * 1000);
assert.equal(failingWindowMs("error"), 90 * 1000);
assert.equal(failingWindowMs("auth"), 30 * 60 * 1000);
assert.equal(reviveWindowMs("quota"), 60 * 1000);
assert.equal(reviveWindowMs("unavailable"), 45 * 1000);
assert.equal(reviveWindowMs("error"), 90 * 1000);
assert.equal(reviveWindowMs("auth"), null);

{
  const freshQuota = {
    last_error: "quota",
    last_error_at: new Date(Date.now() - 10 * 1000).toISOString(),
    last_ok_at: null,
  };
  assert.equal(isRecentlyFailing(freshQuota), true);
  const cooledQuota = {
    last_error: "quota",
    last_error_at: new Date(Date.now() - 90 * 1000).toISOString(),
    last_ok_at: null,
  };
  assert.equal(isRecentlyFailing(cooledQuota), false);
  const freshAuth = {
    last_error: "auth",
    last_error_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    last_ok_at: null,
  };
  assert.equal(isRecentlyFailing(freshAuth), true);
  const meta = keyReviveMeta(cooledQuota, null);
  assert.ok(meta.reviveAfterAt);
  assert.equal(meta.msUntilRevive, 0);
}

assert.equal(PUBLIC_ASSISTANT_NAME, "Dima 1.1");
const prompt = buildSystemPrompt({ locale: "tr", customInstructions: "Be brief.", memoryEnabled: true });
assert.ok(prompt.includes("Demir Sarp Kurtlar"));
assert.ok(prompt.includes("DimaAI"));
assert.ok(prompt.includes("Never mention underlying model providers"));
assert.ok(prompt.includes("Be brief."));
assert.ok(prompt.includes("web_search") || prompt.includes("Web search"));
const cheap = buildSystemPrompt({ locale: "tr", customInstructions: "Be brief.", memoryEnabled: true, modelTier: "dima_1_1_fast" });
assert.ok(cheap.length < prompt.length);
assert.ok(!cheap.includes("web_search"));
assert.ok(!cheap.includes("## Descall product knowledge"));
assert.ok(cheap.includes("Demir Sarp Kurtlar"));
assert.ok(cheap.includes("Be brief.") || cheap.includes("User instructions"));
const turboPrompt = buildSystemPrompt({ modelTier: "dima_1_1_turbo" });
assert.ok(turboPrompt.length < prompt.length);
const thinkingPrompt = buildSystemPrompt({ modelTier: "dima_1_2_thinking", memoryEnabled: true });
assert.ok(thinkingPrompt.includes("web_search") || thinkingPrompt.includes("Web search"));
const agentPrompt = buildSystemPrompt({ locale: "tr", memoryEnabled: true, agentEnabled: true, modelTier: "dima_1_1_fast" });
assert.ok(agentPrompt.includes("Personal agent is ON"));
assert.ok(agentPrompt.includes("compose_direct_message"));
assert.ok(agentPrompt.includes("search_people"));
assert.ok(agentPrompt.length > cheap.length);
const agentOffPrompt = buildSystemPrompt({ memoryEnabled: true, agentEnabled: false });
assert.ok(agentOffPrompt.includes("Personal agent is OFF"));
assert.equal(toolsEnabledForTier("dima_1_1_fast"), false);
assert.equal(toolsEnabledForTier("dima_1_1_turbo"), false);
assert.equal(toolsEnabledForTier("fast"), false);
assert.equal(toolsEnabledForTier("dima_1_2_thinking"), true);
assert.equal(toolsEnabledForTier("dima_1_3_deep"), true);
assert.equal(toolsEnabledForTier("dima_1_1_fast", { agentEnabled: true }), true);
assert.equal(cheapPromptForTier("dima_1_1_fast"), true);
assert.equal(cheapPromptForTier("dima_1_1_fast", { agentEnabled: true }), false);
assert.equal(cheapPromptForTier("dima_1_2_thinking"), false);
assert.equal(preferredProviderForTier("dima_1_1_fast"), "groq");
assert.equal(preferredProviderForTier("dima_1_1_fast", { agentEnabled: true }), "gemini");
assert.equal(providerSupportsAgentTools("gemini"), true);
assert.equal(providerSupportsAgentTools("groq"), false);
assert.ok(IMPLEMENTED.has("get_user_servers"));
assert.ok(IMPLEMENTED.has("web_search"));
assert.ok(IMPLEMENTED.has("remember_fact"));
assert.ok(IMPLEMENTED.has("list_memories"));
assert.ok(IMPLEMENTED.has("list_friends"));
assert.ok(IMPLEMENTED.has("compose_direct_message"));
assert.ok(IMPLEMENTED.has("search_people"));
assert.ok(IMPLEMENTED.has("compose_status_update"));
assert.ok(geminiFunctionDeclarations().some((d) => d.name === "web_search"));
assert.ok(geminiFunctionDeclarations().some((d) => d.name === "compose_direct_message"));
assert.ok(geminiFunctionDeclarations().some((d) => d.name === "search_people"));
assert.ok(geminiFunctionDeclarations().every((d) => !/gemini|google/i.test(JSON.stringify(d))));

assert.equal(kindFromMime("application/pdf", "a.pdf"), "pdf");
assert.equal(kindFromMime("image/png", "x.png"), "image");
assert.ok(allowedMime("text/csv", "data.csv"));
assert.ok(!allowedMime("application/zip", "x.zip"));

(async () => {
  const composeOff = await executeTool(
    "compose_direct_message",
    { username: "alice", text: "Hey, are you free later?" },
    { userId: "u", agentEnabled: false },
  );
  assert.equal(composeOff.ok, false);
  assert.ok(/personal agent is off/i.test(String(composeOff.error || "")));
  const memOff = await executeTool("remember_fact", { fact: "likes tea" }, { userId: "u", memoryEnabled: false });
  assert.equal(memOff.ok, false);

  const staged = await createPending({
    userId: "user-a",
    conversationId: "conv-1",
    type: "dm",
    payload: { toUserId: "user-b", text: "Hello there" },
    preview: { title: "Direct message", body: "Hello there", recipient: { username: "bob" } },
  });
  assert.ok(staged.action?.id);
  assert.equal(staged.action.status, "pending");
  const rejected = await rejectPending("user-a", staged.action.id);
  assert.equal(rejected.action.status, "rejected");

  const staged2 = await createPending({
    userId: "user-a",
    type: "custom_status",
    payload: { text: "In a meeting" },
    preview: { title: "Custom status", body: "Set custom status to “In a meeting”" },
  });
  const confirmed = await confirmPending("user-a", staged2.action.id, {
    execute: async (row) => ({ ok: true, summary: `Would set ${row.payload.text}`, skippedSend: true }),
  });
  assert.equal(confirmed.action.status, "confirmed");
  assert.equal(confirmed.result.skippedSend, true);

  const dupA = await createPending({
    userId: "user-a",
    conversationId: "conv-dup",
    type: "dm",
    payload: { toUserId: "yigit", text: "sa" },
    preview: { body: "sa", recipient: { username: "yigit" } },
  });
  const dupB = await createPending({
    userId: "user-a",
    conversationId: "conv-dup",
    type: "dm",
    payload: { toUserId: "yigit", text: "sa" },
    preview: { body: "sa", recipient: { username: "yigit" } },
  });
  assert.equal(dupA.action.id, dupB.action.id);
  assert.equal(dupB.reused, true);

  const other = await confirmPending("intruder", staged2.action.id, {
    execute: async () => ({ ok: true }),
  });
  assert.ok(other.error);

  console.log("dimaai unit checks ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
