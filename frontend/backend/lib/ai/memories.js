"use strict";

const supabase = require("../../db/supabase");

const MAX_MEMORIES = 40;
const MAX_FACT = 500;

function normalizeFact(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAX_FACT);
}

async function listMemories(userId, limit = MAX_MEMORIES) {
  const { data, error } = await supabase
    .from("dimaai_memories")
    .select("id,fact,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || MAX_MEMORIES, MAX_MEMORIES));
  if (error) throw error;
  return data || [];
}

async function listMemoriesSafe(userId, limit = MAX_MEMORIES) {
  try {
    return await listMemories(userId, limit);
  } catch (err) {
    console.warn("[dimaai:memories-list]", err?.message || err);
    return [];
  }
}

async function addMemory(userId, fact) {
  const cleaned = normalizeFact(fact);
  if (!cleaned) return { error: "Empty memory." };
  const existing = await listMemories(userId);
  const dup = existing.find((m) => m.fact.toLowerCase() === cleaned.toLowerCase());
  if (dup) return { memory: dup, duplicate: true };
  if (existing.length >= MAX_MEMORIES) {
    const oldest = existing[existing.length - 1];
    if (oldest) {
      await supabase.from("dimaai_memories").delete().eq("id", oldest.id).eq("user_id", userId);
    }
  }
  const { data, error } = await supabase
    .from("dimaai_memories")
    .insert({ user_id: userId, fact: cleaned })
    .select("id,fact,created_at,updated_at")
    .single();
  if (error) throw error;
  return { memory: data };
}

async function deleteMemory(userId, memoryId) {
  const { error } = await supabase
    .from("dimaai_memories")
    .delete()
    .eq("id", memoryId)
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

async function forgetMatching(userId, query) {
  const q = normalizeFact(query).toLowerCase();
  if (!q) {
    const { error } = await supabase.from("dimaai_memories").delete().eq("user_id", userId);
    if (error) throw error;
    return { ok: true, cleared: true };
  }
  const items = await listMemories(userId);
  const hits = items.filter((m) => m.fact.toLowerCase().includes(q));
  for (const hit of hits) {
    await deleteMemory(userId, hit.id);
  }
  return { ok: true, deleted: hits.length, facts: hits.map((h) => h.fact) };
}

async function memoryBlockForPrompt(userId, enabled) {
  if (!enabled) return "";
  const items = await listMemoriesSafe(userId, 20);
  if (!items.length) return "";
  return [
    "## User memories (authorized; respect privacy)",
    ...items.map((m) => `- ${m.fact}`),
    "Update memories only via remember_fact / forget_fact tools when the user asks (e.g. hatırla / unut / ne hatırlıyorsun).",
  ].join("\n");
}

module.exports = {
  MAX_MEMORIES,
  listMemories,
  listMemoriesSafe,
  addMemory,
  deleteMemory,
  forgetMatching,
  memoryBlockForPrompt,
  normalizeFact,
};
