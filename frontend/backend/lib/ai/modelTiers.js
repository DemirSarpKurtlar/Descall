"use strict";

/**
 * Public Dima model tiers — never expose provider model ids to clients.
 * Legacy auto/fast/smart map into these ids.
 */
const PUBLIC_TIERS = [
  {
    id: "dima_1_1_fast",
    label: "Dima 1.1 Fast",
    description: "Very fast · short chats · lower max tokens",
    preferredProvider: "groq",
    maxTokens: 1024,
    thinking: false,
    tools: false,
    cheapPrompt: true,
  },
  {
    id: "dima_1_1_turbo",
    label: "Dima 1.1 Turbo",
    description: "Fast · larger replies · still low latency",
    preferredProvider: "groq",
    maxTokens: 2048,
    thinking: false,
    tools: false,
    cheapPrompt: true,
  },
  {
    id: "dima_1_2_thinking",
    label: "Dima 1.2 Thinking",
    description: "Slower · stronger · reasoning · higher budget",
    preferredProvider: "gemini",
    maxTokens: 8192,
    thinking: true,
  },
  {
    id: "dima_1_2_pro",
    label: "Dima 1.2 Pro",
    description: "Stronger reasoning · larger output budget",
    preferredProvider: "gemini",
    maxTokens: 12288,
    thinking: true,
  },
  {
    id: "dima_1_3_deep",
    label: "Dima 1.3 Deep",
    description: "Heaviest · long analysis · max quality",
    preferredProvider: "gemini",
    maxTokens: 16384,
    thinking: true,
    deep: true,
  },
];

const TIER_IDS = new Set(PUBLIC_TIERS.map((t) => t.id));
const LEGACY = {
  fast: "dima_1_1_fast",
  auto: "dima_1_1_fast",
  smart: "dima_1_2_thinking",
};

function normalizeTier(raw) {
  const id = String(raw || "dima_1_1_fast").toLowerCase().trim().replace(/-/g, "_");
  if (LEGACY[id]) return LEGACY[id];
  if (TIER_IDS.has(id)) return id;
  if (id.includes("turbo")) return "dima_1_1_turbo";
  if (id.includes("1_3") || id.includes("1.3") || id === "deep") return "dima_1_3_deep";
  if (id.includes("pro")) return "dima_1_2_pro";
  if (id.includes("1_1") || id.includes("1.1") || id === "flash") return "dima_1_1_fast";
  if (id.includes("1_2") || id.includes("1.2") || id.includes("think")) return "dima_1_2_thinking";
  return "dima_1_1_fast";
}

function tierConfig(tier) {
  const id = normalizeTier(tier);
  return PUBLIC_TIERS.find((t) => t.id === id) || PUBLIC_TIERS[0];
}

function preferredProviderForTier(tier, { agentEnabled = false } = {}) {
  if (agentEnabled) return "gemini";
  return tierConfig(tier).preferredProvider || "gemini";
}

/** Only Gemini currently executes compose_* tools. Groq chat has no tool loop. */
function providerSupportsAgentTools(provider) {
  return String(provider || "").toLowerCase() === "gemini";
}

function maxTokensForTier(tier) {
  return tierConfig(tier).maxTokens || 4096;
}

function thinkingEnabledForTier(tier) {
  return Boolean(tierConfig(tier).thinking);
}

function toolsEnabledForTier(tier, { agentEnabled = false } = {}) {
  if (agentEnabled) return true;
  const cfg = tierConfig(tier);
  // Fast/Turbo default tools OFF to burn less quota; Thinking/Pro/Deep keep tools.
  if (cfg.tools === false) return false;
  return true;
}

function cheapPromptForTier(tier, { agentEnabled = false } = {}) {
  if (agentEnabled) return false;
  return Boolean(tierConfig(tier).cheapPrompt);
}

/** Gemini model candidates (server-only). */
function modelsForTier(tier) {
  const t = normalizeTier(tier);
  if (t === "dima_1_1_fast" || t === "dima_1_1_turbo") {
    return ["gemini-2.5-flash", "gemini-3.5-flash"];
  }
  if (t === "dima_1_2_pro" || t === "dima_1_3_deep") {
    return ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
  }
  return ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
}

/** Groq model candidates (server-only). */
function groqModelsForTier(tier) {
  const t = normalizeTier(tier);
  if (t === "dima_1_1_fast") {
    return ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.6-27b"];
  }
  // Turbo and any other tier routed to Groq.
  return ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];
}

function publicTiers() {
  return PUBLIC_TIERS.map(({ id, label, description }) => ({
    id,
    label,
    description,
  }));
}

module.exports = {
  PUBLIC_TIERS,
  normalizeTier,
  tierConfig,
  preferredProviderForTier,
  providerSupportsAgentTools,
  maxTokensForTier,
  thinkingEnabledForTier,
  toolsEnabledForTier,
  cheapPromptForTier,
  modelsForTier,
  groqModelsForTier,
  publicTiers,
};
