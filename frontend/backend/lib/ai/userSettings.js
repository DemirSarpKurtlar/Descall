"use strict";

const supabase = require("../../db/supabase");
const { normalizeTier } = require("./modelTiers");

const SETTINGS_COLUMNS =
  "user_id,memory_enabled,tts_enabled,custom_instructions,model_tier,nsfw_enabled,agent_enabled,updated_at";
const SETTINGS_COLUMNS_LEGACY =
  "user_id,memory_enabled,tts_enabled,custom_instructions,model_tier,nsfw_enabled,updated_at";

const DEFAULTS = {
  memory_enabled: true,
  tts_enabled: false,
  custom_instructions: "",
  model_tier: "dima_1_1_fast",
  nsfw_enabled: false,
  agent_enabled: false,
};

function publicSettings(row, { isAdmin = false } = {}) {
  const out = {
    memoryEnabled: row?.memory_enabled !== false,
    ttsEnabled: Boolean(row?.tts_enabled),
    customInstructions: String(row?.custom_instructions || "").slice(0, 4000),
    modelTier: normalizeTier(row?.model_tier),
    agentEnabled: Boolean(row?.agent_enabled),
  };
  // Never leak NSFW flag to non-admins.
  if (isAdmin) {
    out.nsfwEnabled = Boolean(row?.nsfw_enabled);
  }
  return out;
}

async function getSettings(userId) {
  try {
    let { data, error } = await supabase
      .from("dimaai_user_settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error && /agent_enabled/i.test(String(error.message || ""))) {
      ({ data, error } = await supabase
        .from("dimaai_user_settings")
        .select(SETTINGS_COLUMNS_LEGACY)
        .eq("user_id", userId)
        .maybeSingle());
    }
    if (error) throw error;
    if (!data) return { ...DEFAULTS, user_id: userId };
    return { ...DEFAULTS, ...data };
  } catch {
    // Chat must not die if settings table is missing or RLS fails.
    return { ...DEFAULTS, user_id: userId };
  }
}

async function upsertSettings(userId, patch = {}, { isAdmin = false } = {}) {
  if (patch.nsfwEnabled !== undefined && !isAdmin) {
    const err = new Error("Forbidden");
    err.code = "forbidden";
    err.status = 403;
    throw err;
  }

  const current = await getSettings(userId);
  const next = {
    user_id: userId,
    memory_enabled:
      patch.memoryEnabled === undefined ? current.memory_enabled !== false : Boolean(patch.memoryEnabled),
    tts_enabled:
      patch.ttsEnabled === undefined ? Boolean(current.tts_enabled) : Boolean(patch.ttsEnabled),
    custom_instructions:
      patch.customInstructions === undefined
        ? String(current.custom_instructions || "")
        : String(patch.customInstructions || "").slice(0, 4000),
    model_tier: normalizeTier(
      patch.modelTier === undefined ? current.model_tier : patch.modelTier,
    ),
    nsfw_enabled:
      patch.nsfwEnabled === undefined
        ? Boolean(current.nsfw_enabled)
        : Boolean(isAdmin && patch.nsfwEnabled),
    agent_enabled:
      patch.agentEnabled === undefined
        ? Boolean(current.agent_enabled)
        : Boolean(patch.agentEnabled),
    updated_at: new Date().toISOString(),
  };
  let { data, error } = await supabase
    .from("dimaai_user_settings")
    .upsert(next, { onConflict: "user_id" })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error && /agent_enabled/i.test(String(error.message || ""))) {
    const { agent_enabled: _omit, ...legacy } = next;
    ({ data, error } = await supabase
      .from("dimaai_user_settings")
      .upsert(legacy, { onConflict: "user_id" })
      .select(SETTINGS_COLUMNS_LEGACY)
      .single());
    if (!error && data) data = { ...data, agent_enabled: next.agent_enabled };
  }
  if (error) throw error;
  return data;
}

module.exports = {
  DEFAULTS,
  publicSettings,
  getSettings,
  upsertSettings,
};
