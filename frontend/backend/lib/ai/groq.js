"use strict";

const { buildSystemPrompt } = require("./systemPrompt");
const { groqModelsForTier, maxTokensForTier } = require("./modelTiers");
const { logInternal } = require("./sanitize");

const GROQ_BASE = "https://api.groq.com/openai/v1";

/** gpt-oss reasoning models reject max_tokens (and dual budgets). Others still take max_tokens. */
function tokenLimitFields(model, maxTok) {
  if (String(model).includes("gpt-oss")) {
    return { max_completion_tokens: maxTok };
  }
  return { max_tokens: maxTok };
}

function samplingFields(model, temperature) {
  if (String(model).includes("gpt-oss")) return {};
  return { temperature };
}

function toOpenAiMessages(messages, promptOpts) {
  const out = [{ role: "system", content: buildSystemPrompt(promptOpts || {}) }];
  for (const m of messages || []) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content || "").trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

function httpError(status, detail) {
  const err = new Error("provider_unavailable");
  err.causeStatus = status;
  const d = String(detail || "").toLowerCase();
  if (status === 401 || status === 403) err.code = "auth";
  else if (status === 429) err.code = "quota";
  else if (status >= 500) err.code = "unavailable";
  else if (status === 400) err.code = "request";
  else err.code = "error";
  err.detail = String(detail || "").slice(0, 240);
  if (d.includes("abort")) err.code = "aborted";
  return err;
}

async function pingKey(apiKey, signal) {
  const models = groqModelsForTier("auto");
  let lastErr = null;
  for (const model of models) {
    try {
      let res;
      try {
        res = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with the single word OK." }],
            ...tokenLimitFields(model, 8),
            ...samplingFields(model, 0),
          }),
          signal,
        });
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) {
          const aborted = new Error("aborted");
          aborted.code = "aborted";
          throw aborted;
        }
        const wrapped = new Error("provider_unavailable");
        wrapped.code = "unavailable";
        wrapped.causeStatus = 503;
        throw wrapped;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw httpError(res.status, text);
      }
      const json = await res.json().catch(() => ({}));
      const preview = Boolean(json?.choices?.[0]?.message?.content);
      return { ok: true, preview };
    } catch (err) {
      if (err?.code === "aborted" || err?.code === "auth" || err?.code === "quota") throw err;
      lastErr = err;
      // 404 model retired — try next candidate
      if (err?.causeStatus === 404 || err?.code === "request") continue;
    }
  }
  throw lastErr || httpError(503, "unavailable");
}

async function streamChat({ apiKey, model, messages, signal, onToken, onThought, promptOpts, modelTier }) {
  const maxTok = maxTokensForTier(modelTier || promptOpts?.modelTier || "dima_1_1_fast");
  const body = {
    model,
    messages: toOpenAiMessages(messages, promptOpts),
    stream: true,
    ...tokenLimitFields(model, maxTok),
    ...samplingFields(model, 0.7),
  };
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw httpError(res.status, text);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let thought = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.code = "aborted";
      throw err;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const deltaObj = json?.choices?.[0]?.delta || {};
      // Answer tokens → bubble; reasoning → Thinking panel only (never mix).
      let answer = "";
      if (typeof deltaObj.content === "string" && deltaObj.content) {
        answer = deltaObj.content;
      }
      let reasoning = "";
      if (typeof deltaObj.reasoning === "string" && deltaObj.reasoning) {
        reasoning = deltaObj.reasoning;
      } else if (typeof deltaObj.reasoning_content === "string" && deltaObj.reasoning_content) {
        reasoning = deltaObj.reasoning_content;
      } else if (deltaObj.reasoning && typeof deltaObj.reasoning === "object") {
        reasoning = String(deltaObj.reasoning.content || deltaObj.reasoning.text || "");
      }
      if (reasoning) {
        thought += reasoning;
        onThought?.(reasoning);
      }
      if (answer) {
        assembled += answer;
        onToken?.(answer);
      }
    }
  }
  return { text: assembled, thought, citations: [] };
}

async function complete({
  apiKey,
  messages,
  signal,
  onToken,
  onThought,
  modelTier,
  customInstructions,
  memoryBlock,
  memoryEnabled,
  nsfwMode,
  locale,
  agentEnabled,
}) {
  const promptOpts = {
    locale,
    customInstructions,
    memoryBlock,
    memoryEnabled,
    nsfwMode: Boolean(nsfwMode),
    modelTier,
    agentEnabled: Boolean(agentEnabled),
  };
  const models = groqModelsForTier(modelTier);
  let lastErr = null;
  for (const model of models) {
    try {
      return await streamChat({
        apiKey,
        model,
        messages,
        signal,
        onToken,
        onThought,
        promptOpts,
        modelTier,
      });
    } catch (err) {
      if (err?.code === "aborted") throw err;
      lastErr = err;
      // auth/quota won't recover on next model with same key
      if (err?.code === "auth" || err?.code === "quota") throw err;
      logInternal("groq-model-fallback", err, { status: err?.causeStatus });
    }
  }
  throw lastErr || httpError(503, "groq_unavailable");
}

module.exports = {
  complete,
  pingKey,
  modelsForTier: groqModelsForTier,
  tokenLimitFields,
  samplingFields,
};
