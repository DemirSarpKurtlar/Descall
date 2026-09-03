"use strict";

const crypto = require("crypto");
const supabase = require("../../db/supabase");
const { logInternal } = require("./sanitize");

const TTL_MS = 15 * 60 * 1000;
const memory = new Map();
const inflightByFingerprint = new Map();

function actionFingerprint({ userId, conversationId, type, payload, preview }) {
  const to =
    payload?.toUserId ||
    payload?.userId ||
    preview?.recipient?.id ||
    preview?.recipient?.username ||
    preview?.title ||
    "";
  const channel = payload?.channelId || preview?.channelId || "";
  const text = String(payload?.text || preview?.body || "").trim().toLowerCase();
  return `${userId}::${conversationId || ""}::${type}::${String(to).toLowerCase()}::${channel}::${text}`;
}

function findPendingByFingerprint(fp) {
  for (const row of memory.values()) {
    if (row.status !== "pending") continue;
    if (actionFingerprint(row) === fp) return row;
  }
  return null;
}

const ACTION_TYPES = new Set([
  "dm",
  "channel",
  "group",
  "friend_request",
  "friend_accept",
  "friend_decline",
  "presence_status",
  "custom_status",
]);

function nowMs() {
  return Date.now();
}

function publicAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type || row.action_type,
    status: row.status,
    preview: row.preview || {},
    expiresAt: row.expiresAt || row.expires_at || null,
    conversationId: row.conversationId || row.conversation_id || null,
    createdAt: row.createdAt || row.created_at || null,
  };
}

function fromMemory(id) {
  const row = memory.get(String(id || ""));
  if (!row) return null;
  if (row.status === "pending" && row.expiresAt && new Date(row.expiresAt).getTime() <= nowMs()) {
    row.status = "expired";
    memory.set(row.id, row);
  }
  return row;
}

function remember(row) {
  if (!row?.id) return row;
  memory.set(row.id, row);
  return row;
}

async function persistInsert(row) {
  try {
    await supabase.from("dimaai_pending_actions").insert({
      id: row.id,
      user_id: row.userId,
      conversation_id: row.conversationId || null,
      action_type: row.type,
      payload: row.payload || {},
      preview: row.preview || {},
      status: row.status,
      expires_at: row.expiresAt,
      created_at: row.createdAt,
    });
  } catch (err) {
    logInternal("agent-pending-insert", err);
  }
}

async function persistStatus(id, patch) {
  try {
    await supabase
      .from("dimaai_pending_actions")
      .update({
        status: patch.status,
        result: patch.result || null,
        resolved_at: patch.resolvedAt || new Date().toISOString(),
        payload: patch.payload,
        preview: patch.preview,
      })
      .eq("id", id);
  } catch (err) {
    logInternal("agent-pending-update", err);
  }
}

async function loadFromDb(userId, id) {
  try {
    const { data, error } = await supabase
      .from("dimaai_pending_actions")
      .select("id,user_id,conversation_id,action_type,payload,preview,status,expires_at,created_at,result")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = {
      id: data.id,
      userId: data.user_id,
      conversationId: data.conversation_id,
      type: data.action_type,
      payload: data.payload || {},
      preview: data.preview || {},
      status: data.status,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      result: data.result || null,
    };
    if (row.status === "pending" && row.expiresAt && new Date(row.expiresAt).getTime() <= nowMs()) {
      row.status = "expired";
      await persistStatus(row.id, { status: "expired" });
    }
    return remember(row);
  } catch (err) {
    logInternal("agent-pending-load", err);
    return null;
  }
}

async function createPending({ userId, conversationId, type, payload, preview }) {
  const kind = String(type || "").trim();
  if (!ACTION_TYPES.has(kind)) {
    return { error: "Unknown action type." };
  }
  const text = String(payload?.text || preview?.body || "").trim();
  if (["dm", "channel", "group"].includes(kind) && !text) {
    return { error: "Message text is required." };
  }
  if (text.length > 4000) {
    return { error: "Message is too long (max 4000 characters)." };
  }
  const fp = actionFingerprint({
    userId: String(userId),
    conversationId: conversationId || null,
    type: kind,
    payload: payload || {},
    preview: preview || {},
  });
  const existing = findPendingByFingerprint(fp);
  if (existing) return { action: publicAction(existing), row: existing, reused: true };
  if (inflightByFingerprint.has(fp)) {
    return inflightByFingerprint.get(fp);
  }

  let resolveInflight;
  const inflight = new Promise((resolve) => {
    resolveInflight = resolve;
  });
  inflightByFingerprint.set(fp, inflight);

  try {
    const raced = findPendingByFingerprint(fp);
    if (raced) {
      const reused = { action: publicAction(raced), row: raced, reused: true };
      resolveInflight(reused);
      return reused;
    }
    const createdAt = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      userId: String(userId),
      conversationId: conversationId || null,
      type: kind,
      payload: payload || {},
      preview: preview || {},
      status: "pending",
      expiresAt: new Date(nowMs() + TTL_MS).toISOString(),
      createdAt,
      result: null,
    };
    remember(row);
    await persistInsert(row);
    const created = { action: publicAction(row), row, reused: false };
    resolveInflight(created);
    return created;
  } catch (err) {
    inflightByFingerprint.delete(fp);
    throw err;
  } finally {
    inflightByFingerprint.delete(fp);
  }
}

async function getOwned(userId, id) {
  const mem = fromMemory(id);
  if (mem && mem.userId === String(userId)) return mem;
  if (mem && mem.userId !== String(userId)) return null;
  return loadFromDb(userId, id);
}

async function rejectPending(userId, id) {
  const row = await getOwned(userId, id);
  if (!row) return { error: "Action not found.", status: 404 };
  if (row.status !== "pending") {
    return { error: "This action is no longer pending.", status: 409, action: publicAction(row) };
  }
  row.status = "rejected";
  row.resolvedAt = new Date().toISOString();
  remember(row);
  await persistStatus(row.id, { status: "rejected", resolvedAt: row.resolvedAt });
  return { action: publicAction(row) };
}

/**
 * Confirm a pending write. `execute` is injected so tests can stub senders.
 */
async function confirmPending(userId, id, { editedText, io, execute } = {}) {
  const row = await getOwned(userId, id);
  if (!row) return { error: "Action not found.", status: 404 };
  if (row.status === "expired") {
    return { error: "This approval expired. Ask Dima to compose it again.", status: 410, action: publicAction(row) };
  }
  if (row.status !== "pending") {
    return { error: "This action is no longer pending.", status: 409, action: publicAction(row) };
  }

  const nextText = editedText !== undefined ? String(editedText || "").trim() : null;
  if (nextText !== null) {
    if (["dm", "channel", "group"].includes(row.type) && !nextText) {
      return { error: "Message text is required.", status: 400 };
    }
    if (nextText.length > 4000) {
      return { error: "Message is too long (max 4000 characters).", status: 400 };
    }
    row.payload = { ...row.payload, text: nextText };
    if (row.preview && typeof row.preview === "object") {
      row.preview = { ...row.preview, body: nextText };
    }
  }

  const run = typeof execute === "function"
    ? execute
    : require("./sendAsUser").executePending;

  let result;
  try {
    result = await run(row, { io });
  } catch (err) {
    logInternal("agent-confirm-exec", err);
    row.status = "failed";
    row.result = { error: "Could not complete that action." };
    remember(row);
    await persistStatus(row.id, { status: "failed", result: row.result, payload: row.payload, preview: row.preview });
    return { error: "Could not complete that action.", status: 500, action: publicAction(row) };
  }

  if (!result?.ok) {
    const message = result?.error || "Could not complete that action.";
    return { error: message, status: result?.status || 400, action: publicAction(row) };
  }

  row.status = "confirmed";
  row.result = result;
  row.resolvedAt = new Date().toISOString();
  remember(row);
  await persistStatus(row.id, {
    status: "confirmed",
    result: { ok: true, type: row.type, summary: result.summary || null },
    payload: row.payload,
    preview: row.preview,
    resolvedAt: row.resolvedAt,
  });
  return { action: publicAction(row), result };
}

async function listPendingForConversation(userId, conversationId) {
  const out = [];
  for (const row of memory.values()) {
    if (row.userId !== String(userId)) continue;
    if (conversationId && row.conversationId !== conversationId) continue;
    const fresh = fromMemory(row.id);
    if (fresh?.status === "pending") out.push(publicAction(fresh));
  }
  try {
    let q = supabase
      .from("dimaai_pending_actions")
      .select("id,user_id,conversation_id,action_type,payload,preview,status,expires_at,created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    const { data } = await q;
    for (const dataRow of data || []) {
      if (out.some((a) => a.id === dataRow.id)) continue;
      const row = remember({
        id: dataRow.id,
        userId: dataRow.user_id,
        conversationId: dataRow.conversation_id,
        type: dataRow.action_type,
        payload: dataRow.payload || {},
        preview: dataRow.preview || {},
        status: dataRow.status,
        expiresAt: dataRow.expires_at,
        createdAt: dataRow.created_at,
      });
      out.push(publicAction(row));
    }
  } catch (err) {
    logInternal("agent-pending-list", err);
  }
  return out;
}

async function getActionsByIds(userId, ids) {
  const out = [];
  const wanted = [...new Set((ids || []).map((id) => String(id || "")).filter(Boolean))];
  for (const id of wanted) {
    const row = await getOwned(userId, id);
    if (!row) continue;
    out.push(publicAction(row));
  }
  return out;
}

module.exports = {
  ACTION_TYPES,
  TTL_MS,
  publicAction,
  createPending,
  getOwned,
  rejectPending,
  confirmPending,
  listPendingForConversation,
  getActionsByIds,
  actionFingerprint,
};
