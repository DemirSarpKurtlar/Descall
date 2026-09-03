"use strict";

const { logInternal, sanitizeProviderText } = require("./sanitize");
const { buildSystemPrompt } = require("./systemPrompt");
const { geminiFunctionDeclarations, executeTool } = require("./tools");
const { modelsForTier, normalizeTier, maxTokensForTier, thinkingEnabledForTier, toolsEnabledForTier } = require("./modelTiers");

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Retired June 2026 — kept only so env overrides that still point here can 404-fallback. */
const SHUTDOWN_DEFAULT = "gemini-2.0-flash";

function modelCandidates(tier) {
  const env = String(process.env.DIMA_INTERNAL_MODEL || "").trim();
  const tierModels = modelsForTier(tier);
  const out = [];
  if (env && env !== SHUTDOWN_DEFAULT && (!tier || normalizeTier(tier) === "dima_1_1_fast")) {
    out.push(env);
  }
  for (const id of tierModels) {
    if (!out.includes(id)) out.push(id);
  }
  // Always keep a broad fallback tail for 404s.
  for (const id of ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"]) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

let stickyModel = null;

function thinkingConfigFor(model, tier) {
  const id = String(model || "").toLowerCase();
  const t = normalizeTier(tier);
  // Include thoughts so the UI can stream a visible "Thinking" panel.
  if (id.includes("gemini-3")) {
    // Cap 1.2 Thinking at medium; Pro/Deep may use high.
    const level = t === "dima_1_3_deep" || t === "dima_1_2_pro" ? "high" : "medium";
    return { thinkingLevel: level, includeThoughts: true };
  }
  if (id.includes("gemini-2.5")) {
    // Cap 1.2 Thinking budget; Deep/Pro keep higher budgets.
    let budget = 1024;
    if (t === "dima_1_3_deep") budget = 8192;
    else if (t === "dima_1_2_pro") budget = 4096;
    return { thinkingBudget: budget, includeThoughts: true };
  }
  return null;
}

function generationConfigFor(model, maxOutputTokens = 16384, { thinking = true, modelTier } = {}) {
  const cfg = { temperature: 0.7, maxOutputTokens };
  if (thinking) {
    const thinkingConfig = thinkingConfigFor(model, modelTier);
    if (thinkingConfig) cfg.thinkingConfig = thinkingConfig;
  }
  return cfg;
}

function classifyHttpStatus(status) {
  if (status === 429) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 404) return "request";
  if (status >= 500 || status === 408) return "unavailable";
  return "error";
}

function httpError(status, raw) {
  const kind = classifyHttpStatus(status);
  const detail = sanitizeProviderText(raw).slice(0, 240);
  const err = new Error(kind);
  err.code = kind;
  err.causeStatus = status;
  err.detail = detail;
  logInternal("gemini-http", { message: detail }, { status });
  return err;
}

function toGeminiContents(messages) {
  return (messages || [])
    .filter((m) => m && String(m.role || ""))
    .map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.name,
                response: typeof m.content === "object" ? m.content : { result: m.content },
              },
            },
          ],
        };
      }
      if (m.role === "assistant" && Array.isArray(m.modelParts) && m.modelParts.length) {
        return { role: "model", parts: m.modelParts };
      }
      if (m.role === "assistant" && m.functionCall) {
        const fc = { name: m.functionCall.name, args: m.functionCall.args || {} };
        const part = { functionCall: fc };
        const sig = m.functionCall.thoughtSignature || m.thoughtSignature;
        if (sig) part.thoughtSignature = sig;
        return { role: "model", parts: [part] };
      }
      if (m.role === "assistant" || m.role === "model") {
        return {
          role: "model",
          parts: [{ text: String(m.content || "") }],
        };
      }
      if (m.role === "user") {
        const parts = [];
        if (Array.isArray(m.imageParts)) {
          for (const p of m.imageParts) {
            if (p?.inlineData?.data) parts.push(p);
          }
        }
        const text = String(m.content || "");
        if (text.trim()) parts.push({ text });
        if (!parts.length) return null;
        return { role: "user", parts };
      }
      return null;
    })
    .filter(Boolean);
}

function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && p.thought !== true && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function extractThought(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && typeof p.text === "string" && p.text && (p.thought === true || p.thought === "true"))
    .map((p) => p.text)
    .join("");
}

function extractFunctionCalls(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts
    .filter((p) => p && p.functionCall && p.functionCall.name)
    .map((p) => {
      const sig = p.thoughtSignature || p.functionCall.thoughtSignature || p.thought_signature;
      return {
        name: p.functionCall.name,
        args: p.functionCall.args || {},
        thoughtSignature: sig || undefined,
      };
    });
}

function extractModelParts(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts : [];
}

async function withModelFallback(run, tier) {
  const candidates = modelCandidates(tier);
  const preferred = stickyModel && candidates.includes(stickyModel) ? stickyModel : null;
  const models = preferred
    ? [preferred, ...candidates.filter((id) => id !== preferred)]
    : candidates;
  let lastErr = null;
  for (const model of models) {
    try {
      const result = await run(model);
      stickyModel = model;
      return result;
    } catch (err) {
      lastErr = err;
      if (err?.causeStatus === 404) {
        if (stickyModel === model) stickyModel = null;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || Object.assign(new Error("unavailable"), { code: "unavailable", causeStatus: 503 });
}

function toolsPayload() {
  const decls = geminiFunctionDeclarations();
  if (!decls.length) return undefined;
  return [{ functionDeclarations: decls }];
}

function nsfwSafetySettings() {
  return [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  ];
}

function requestBody(messages, generationConfig, promptOpts = {}, { enableTools = true } = {}) {
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(promptOpts) }] },
    contents: toGeminiContents(messages),
    generationConfig,
  };
  if (promptOpts?.nsfwMode) {
    body.safetySettings = nsfwSafetySettings();
  }
  if (enableTools) {
    const tools = toolsPayload();
    if (tools) {
      body.tools = tools;
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }
  }
  return body;
}

async function postGemini({ model, stream, apiKey, messages, signal, generationConfig, promptOpts, enableTools = true }) {
  const path = stream
    ? `${BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
    : `${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(messages, generationConfig, promptOpts, { enableTools })),
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
    logInternal("gemini-network", err);
    throw wrapped;
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw httpError(res.status, raw);
  }
  return res;
}

async function readSseStream(res, { onToken, onThought, signal }) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let thought = "";
  const functionCalls = [];
  const seenFc = new Set();
  let modelParts = [];

  while (true) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* ignore */ }
      const err = new Error("aborted");
      err.code = "aborted";
      throw err;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() || "";
    for (const block of blocks) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const parts = extractModelParts(json);
        if (parts.length) {
          // Merge stream parts: keep prior non-overlapping, prefer latest full set.
          modelParts = parts.length >= modelParts.length ? parts : modelParts.concat(parts);
        }
        const thoughtPiece = extractThought(json);
        if (thoughtPiece) {
          thought += thoughtPiece;
          onThought?.(thoughtPiece);
        }
        const piece = extractText(json);
        // Prefer thought channel only — do not also token the same chunk.
        if (piece && !(thoughtPiece && piece === thoughtPiece)) {
          full += piece;
          onToken?.(piece);
        }
        for (const fc of extractFunctionCalls(json)) {
          const key = `${fc.name}:${JSON.stringify(fc.args)}`;
          if (!seenFc.has(key)) {
            seenFc.add(key);
            functionCalls.push(fc);
          }
        }
      } catch {
        /* ignore partial json */
      }
    }
  }
  return { text: full, thought, functionCalls, modelParts };
}

async function unaryOnce({ model, apiKey, messages, signal, generationConfig, promptOpts, enableTools = true }) {
  const res = await postGemini({
    model,
    stream: false,
    apiKey,
    messages,
    signal,
    generationConfig,
    promptOpts,
    enableTools,
  });
  const json = await res.json().catch(() => ({}));
  return {
    text: extractText(json),
    thought: extractThought(json),
    functionCalls: extractFunctionCalls(json),
    modelParts: extractModelParts(json),
  };
}

async function streamOnce({ model, apiKey, messages, signal, generationConfig, promptOpts, onToken, onThought, enableTools = true }) {
  const res = await postGemini({
    model,
    stream: true,
    apiKey,
    messages,
    signal,
    generationConfig,
    promptOpts,
    enableTools,
  });
  return readSseStream(res, { onToken, onThought, signal });
}

/**
 * Complete with optional tool loop (max 4 rounds) and thought streaming.
 */
async function complete({
  apiKey,
  messages,
  signal,
  onToken,
  onThought,
  userId,
  locale,
  modelTier,
  customInstructions,
  memoryBlock,
  memoryEnabled,
  nsfwMode,
  agentEnabled,
  conversationId,
  io,
  onPendingAction,
}) {
  const tier = normalizeTier(modelTier);
  const tokenBudget = maxTokensForTier(tier);
  const wantThinking = thinkingEnabledForTier(tier);
  const wantTools = toolsEnabledForTier(tier, { agentEnabled: Boolean(agentEnabled) });
  const promptOpts = {
    locale,
    customInstructions,
    memoryBlock,
    memoryEnabled,
    nsfwMode: Boolean(nsfwMode),
    modelTier: tier,
    agentEnabled: Boolean(agentEnabled),
  };

  return withModelFallback(async (model) => {
    const withThinking = generationConfigFor(model, tokenBudget, { thinking: wantThinking, modelTier: tier });
    const withoutThinking = { temperature: 0.7, maxOutputTokens: tokenBudget };
    const citations = [];
    const ctx = {
      userId,
      signal,
      memoryEnabled: memoryEnabled !== false,
      citations,
      agentEnabled: Boolean(agentEnabled),
      conversationId: conversationId || null,
      io: io || null,
      onPendingAction,
    };
    let working = [...(messages || [])];
    let assembledText = "";
    let assembledThought = "";

    const runRound = async (cfg, { streamTokens }) => {
      let result;
      const tokenHandler = streamTokens ? onToken : undefined;
      try {
        result = await streamOnce({
          model,
          apiKey,
          messages: working,
          signal,
          generationConfig: cfg,
          promptOpts,
          onToken: tokenHandler,
          onThought,
          enableTools: wantTools,
        });
      } catch (err) {
        if (err?.causeStatus !== 400) throw err;
        const detail = String(err.detail || "");
        const signatureIssue = /thought_signature|thought signature/i.test(detail);
        // Prefer dropping tools before dropping thoughts so the Thinking panel still gets text.
        try {
          result = await streamOnce({
            model,
            apiKey,
            messages: working,
            signal,
            generationConfig: cfg,
            promptOpts,
            onToken: tokenHandler,
            onThought,
            enableTools: false,
          });
        } catch (err2) {
          if (err2?.causeStatus === 400 && cfg.thinkingConfig && !signatureIssue) {
            result = await streamOnce({
              model,
              apiKey,
              messages: working,
              signal,
              generationConfig: withoutThinking,
              promptOpts,
              onToken: tokenHandler,
              onThought,
              enableTools: false,
            });
          } else if (err2?.causeStatus === 400 && cfg.thinkingConfig) {
            result = await streamOnce({
              model,
              apiKey,
              messages: working,
              signal,
              generationConfig: withoutThinking,
              promptOpts,
              onToken: tokenHandler,
              onThought,
              enableTools: false,
            });
          } else {
            throw err2;
          }
        }
      }

      if (!String(result.text || "").trim() && !(result.functionCalls || []).length) {
        try {
          const unary = await unaryOnce({
            model,
            apiKey,
            messages: working,
            signal,
            generationConfig: cfg.thinkingConfig ? cfg : withoutThinking,
            promptOpts,
            enableTools: wantTools,
          });
          if (unary.thought) {
            assembledThought += unary.thought;
            onThought?.(unary.thought);
          }
          if (String(unary.text || "").trim() && streamTokens) onToken?.(unary.text);
          result = unary;
        } catch (err) {
          if (err?.code === "aborted") throw err;
        }
      }
      return result;
    };

    const MAX_TOOL_ROUNDS = wantTools ? (Boolean(agentEnabled) ? 6 : tier === "dima_1_3_deep" ? 4 : 3) : 1;
    let pendingTools = false;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await runRound(withThinking, { streamTokens: true });
      if (result.thought) assembledThought += result.thought;

      const calls = result.functionCalls || [];
      if (!calls.length) {
        assembledText = result.text || assembledText;
        pendingTools = false;
        break;
      }

      pendingTools = true;
      const modelParts =
        Array.isArray(result.modelParts) && result.modelParts.length
          ? result.modelParts
          : calls.map((fc) => {
              const part = { functionCall: { name: fc.name, args: fc.args || {} } };
              if (fc.thoughtSignature) part.thoughtSignature = fc.thoughtSignature;
              return part;
            });
      working.push({
        role: "assistant",
        modelParts,
        content: result.text || "",
      });
      for (const fc of calls) {
        const exec = await executeTool(fc.name, fc.args || {}, ctx);
        working.push({
          role: "tool",
          name: fc.name,
          content: exec,
        });
      }
      assembledText = "";
    }

    if (pendingTools || !String(assembledText).trim()) {
      // Final visible answer: stream with tools OFF so Gemini emits tokens continuously
      // instead of buffering a tool-planning turn.
      let final;
      try {
        final = await streamOnce({
          model,
          apiKey,
          messages: working,
          signal,
          generationConfig: withThinking,
          promptOpts,
          onToken,
          onThought,
          enableTools: false,
        });
      } catch (err) {
        if (err?.causeStatus === 400 && withThinking.thinkingConfig) {
          final = await streamOnce({
            model,
            apiKey,
            messages: working,
            signal,
            generationConfig: withoutThinking,
            promptOpts,
            onToken,
            onThought,
            enableTools: false,
          });
        } else {
          throw err;
        }
      }
      if (final.thought) {
        assembledThought += final.thought;
      }
      if (!String(final.text || "").trim() && !(final.functionCalls || []).length) {
        try {
          const unary = await unaryOnce({
            model,
            apiKey,
            messages: working,
            signal,
            generationConfig: withoutThinking,
            promptOpts,
            enableTools: false,
          });
          if (unary.thought) {
            assembledThought += unary.thought;
            onThought?.(unary.thought);
          }
          if (String(unary.text || "").trim()) onToken?.(unary.text);
          final = unary;
        } catch (err) {
          if (err?.code === "aborted") throw err;
        }
      }
      assembledText = final.text || assembledText;
    }

    if (!String(assembledText).trim()) {
      const empty = new Error("empty_reply");
      empty.code = "unavailable";
      empty.causeStatus = 503;
      throw empty;
    }
    return {
      text: assembledText,
      thought: assembledThought || undefined,
      citations: citations.length ? citations : undefined,
    };
  }, tier);
}

async function pingKey(apiKey, signal) {
  return withModelFallback(async (model) => {
    const withThinking = { ...generationConfigFor(model, 32), temperature: 0 };
    const withoutThinking = { maxOutputTokens: 32, temperature: 0 };
    const tryPing = async (generationConfig) => {
      const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
          generationConfig,
        }),
        signal,
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw httpError(res.status, raw);
      }
      return res.json();
    };

    let json;
    try {
      json = await tryPing(withThinking);
    } catch (err) {
      if (err?.causeStatus === 400 && withThinking.thinkingConfig) {
        json = await tryPing(withoutThinking);
      } else {
        throw err;
      }
    }
    const text = extractText(json);
    return { ok: true, preview: Boolean(text) };
  }, "auto");
}

module.exports = {
  id: "primary",
  complete,
  pingKey,
  classifyHttpStatus,
  modelCandidates,
  extractText,
  extractThought,
  extractFunctionCalls,
  extractModelParts,
  thinkingConfigFor,
};
