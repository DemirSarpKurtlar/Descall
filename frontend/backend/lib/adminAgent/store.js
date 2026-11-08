"use strict";

const crypto = require("crypto");

/**
 * Admin agent persistence: the owner's switches, conversations (the exact message list
 * sent to the model) and per-call usage with dollar cost. Tables: supabase/migrations/
 * 20261110_admin_agent.sql. Service role only.
 */

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

/** $ per million tokens. Cache writes are the 5-minute TTL rate (1.25x input). */
const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Possible server-side fallback models (refusal fallbacks).
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

function priceFor(model) {
  const id = String(model || "");
  if (PRICES[id]) return PRICES[id];
  const base = Object.keys(PRICES).find((k) => id.startsWith(k));
  return base ? PRICES[base] : PRICES["claude-opus-5-5"];
}

/** Dollar cost of one response's usage block. */
function costOf(model, usage = {}) {
  const p = priceFor(model);
  const n = (x) => Math.max(0, Number(x) || 0);
  return (
    (n(usage.input_tokens) * p.in +
      n(usage.output_tokens) * p.out +
      n(usage.cache_read_input_tokens) * p.cacheRead +
      n(usage.cache_creation_input_tokens) * p.cacheWrite) /
    1_000_000
  );
}

const DEFAULT_SETTINGS = { enabled: true, monthly_budget_usd: 50 };

async function getSettings() {
  const { data, error } = await db().from("admin_agent_settings").select("enabled, monthly_budget_usd, updated_at, updated_by").eq("id", 1).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS, missing: Boolean(error) };
  return { enabled: Boolean(data.enabled), monthly_budget_usd: Number(data.monthly_budget_usd), updated_at: data.updated_at, updated_by: data.updated_by };
}

async function saveSettings(patch, actorId) {
  const row = { id: 1, updated_at: new Date().toISOString(), updated_by: actorId || null };
  if (typeof patch.enabled === "boolean") row.enabled = patch.enabled;
  if (patch.monthly_budget_usd !== undefined) row.monthly_budget_usd = patch.monthly_budget_usd;
  const { error } = await db().from("admin_agent_settings").upsert(row, { onConflict: "id" });
  if (error) throw error;
  return getSettings();
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Dollars spent this calendar month (UTC). */
async function monthSpend(now = new Date()) {
  const { data, error } = await db().from("admin_agent_usage").select("cost_usd").gte("at", monthStart(now)).limit(100000);
  if (error) return 0;
  return (data || []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
}

async function recordUsage({ adminId, threadId, kind = "chat", model, usage }) {
  const row = {
    admin_id: adminId || null,
    thread_id: threadId || null,
    kind,
    model: String(model || "unknown"),
    input_tokens: usage?.input_tokens || 0,
    output_tokens: usage?.output_tokens || 0,
    cache_read_tokens: usage?.cache_read_input_tokens || 0,
    cache_write_tokens: usage?.cache_creation_input_tokens || 0,
    cost_usd: Number(costOf(model, usage).toFixed(6)),
  };
  const { error } = await db().from("admin_agent_usage").insert(row);
  if (error) console.warn("[admin-agent] usage not recorded:", error.message);
  return row.cost_usd;
}

async function createThread(adminId, title) {
  const { data, error } = await db()
    .from("admin_agent_threads")
    .insert({ admin_id: adminId, title: String(title || "").slice(0, 120) || null })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

/** The thread if it belongs to this admin, else null. */
async function getThread(threadId, adminId) {
  const { data } = await db().from("admin_agent_threads").select("id, admin_id, title, created_at, updated_at").eq("id", threadId).maybeSingle();
  if (!data || String(data.admin_id) !== String(adminId)) return null;
  return data;
}

async function listThreads(adminId, limit = 30) {
  const { data, error } = await db()
    .from("admin_agent_threads")
    .select("id, title, created_at, updated_at")
    .eq("admin_id", adminId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function loadMessages(threadId) {
  const { data, error } = await db()
    .from("admin_agent_messages")
    .select("seq, role, content")
    .eq("thread_id", threadId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Append messages after `afterSeq`. Append-only: earlier rows are never changed. */
async function appendMessages(threadId, afterSeq, messages) {
  if (!messages.length) return afterSeq;
  const rows = messages.map((m, i) => ({ thread_id: threadId, seq: afterSeq + 1 + i, role: m.role, content: m.content }));
  const { error } = await db().from("admin_agent_messages").insert(rows);
  if (error) throw error;
  await db().from("admin_agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  return afterSeq + rows.length;
}

async function deleteThread(threadId, adminId) {
  const t = await getThread(threadId, adminId);
  if (!t) return false;
  const { error } = await db().from("admin_agent_threads").delete().eq("id", threadId);
  if (error) throw error;
  return true;
}

let auditOverride = null;

/** One audit row per agent tool call ("agent_tool"), next to the panel's own actions. */
function audit({ adminUser, tool, path, status, threadId }) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: adminUser?.id,
    actorUsername: adminUser?.username,
    action: "agent_tool",
    target: tool,
    meta: { path: String(path || "").split("?")[0], status, threadId },
  };
  try {
    const sink = auditOverride || require("../adminAuditStore").persist;
    return Promise.resolve(sink(entry)).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function __setDbForTests(client, auditSink = null) {
  dbOverride = client;
  auditOverride = auditSink;
}

module.exports = {
  PRICES, priceFor, costOf, getSettings, saveSettings, monthSpend, monthStart, recordUsage,
  createThread, getThread, listThreads, loadMessages, appendMessages, deleteThread, audit, __setDbForTests,
};
