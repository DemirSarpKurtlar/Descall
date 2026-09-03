export const DEFAULT_MODEL_TIERS = [
  {
    id: "dima_1_1_fast",
    label: "Dima 1.1 Fast",
    shortLabel: "1.1 Fast",
    description: "Very fast · short chats · lower max tokens",
  },
  {
    id: "dima_1_1_turbo",
    label: "Dima 1.1 Turbo",
    shortLabel: "1.1 Turbo",
    description: "Fast · larger replies · still low latency",
  },
  {
    id: "dima_1_2_thinking",
    label: "Dima 1.2 Thinking",
    shortLabel: "1.2 Thinking",
    description: "Slower · stronger · reasoning · higher budget",
  },
  {
    id: "dima_1_2_pro",
    label: "Dima 1.2 Pro",
    shortLabel: "1.2 Pro",
    description: "Stronger reasoning · larger output budget",
  },
  {
    id: "dima_1_3_deep",
    label: "Dima 1.3 Deep",
    shortLabel: "1.3 Deep",
    description: "Heaviest · long analysis · max quality",
  },
];

/** Compact ChatGPT-style model menu — only the three primary modes. */
export const MODEL_MENU_IDS = ["dima_1_1_fast", "dima_1_2_thinking", "dima_1_3_deep"];

export const MODEL_MENU_META = {
  dima_1_1_fast: { shortLabel: "1.1 Fast", label: "Dima 1.1 Fast" },
  dima_1_2_thinking: { shortLabel: "1.2 Thinking", label: "Dima 1.2 Thinking" },
  dima_1_3_deep: { shortLabel: "1.3 Deep", label: "Dima 1.3 Deep" },
};

export const MODEL_TIER_STORAGE_KEY = "dimaai_model_tier";

export function mapLegacyTier(id) {
  const raw = String(id || "").toLowerCase().replace(/-/g, "_");
  if (raw === "fast" || raw === "auto") return "dima_1_1_fast";
  if (raw === "smart") return "dima_1_2_thinking";
  // Collapse Turbo/Pro into the three menu primaries so the pill never "vanishes".
  if (raw.includes("turbo")) return "dima_1_1_fast";
  if (raw.includes("pro")) return "dima_1_2_thinking";
  if (raw.includes("deep") || raw.includes("1_3")) return "dima_1_3_deep";
  if (raw.includes("think") || raw.includes("1_2")) return "dima_1_2_thinking";
  if (raw.includes("1_1") || raw === "dima_1_1_fast") return "dima_1_1_fast";
  if (MODEL_MENU_IDS.includes(raw)) return raw;
  return "dima_1_1_fast";
}

export function readStoredModelTier() {
  try {
    const v = localStorage.getItem(MODEL_TIER_STORAGE_KEY);
    return v ? mapLegacyTier(v) : null;
  } catch {
    return null;
  }
}

export function writeStoredModelTier(id) {
  try {
    localStorage.setItem(MODEL_TIER_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
