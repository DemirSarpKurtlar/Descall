"use strict";

const supabase = require("../../db/supabase");
const { MAX_CONTEXT_MESSAGES } = require("./rateLimit");
const { normalizeTier } = require("./modelTiers");

function titleFromPrompt(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}…` : cleaned;
}

async function listConversations(userId, { q } = {}) {
  let query = supabase
    .from("dimaai_conversations")
    .select("id,title,created_at,updated_at,is_favorite,is_pinned,model_tier")
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("is_favorite", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(80);

  const { data, error } = await query;
  if (error) throw error;
  let items = data || [];

  const needle = String(q || "").trim().toLowerCase().replace(/[%_]/g, "");
  if (needle) {
    const titleHits = items.filter((c) => String(c.title || "").toLowerCase().includes(needle));
    const titleIds = new Set(titleHits.map((c) => c.id));
    // Content search across recent messages (bounded).
    const { data: msgHits } = await supabase
      .from("dimaai_messages")
      .select("conversation_id,content")
      .eq("user_id", userId)
      .ilike("content", `%${needle}%`)
      .limit(120);
    const contentIds = new Set((msgHits || []).map((m) => m.conversation_id));
    items = items.filter((c) => titleIds.has(c.id) || contentIds.has(c.id));
  }
  return items;
}

async function getOwnedConversation(userId, conversationId) {
  const { data, error } = await supabase
    .from("dimaai_conversations")
    .select("id,user_id,title,created_at,updated_at,is_favorite,is_pinned,model_tier")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createConversation(userId, title, { modelTier } = {}) {
  const row = {
    user_id: userId,
    title: titleFromPrompt(title),
    model_tier: normalizeTier(modelTier),
  };
  const { data, error } = await supabase
    .from("dimaai_conversations")
    .insert(row)
    .select("id,title,created_at,updated_at,is_favorite,is_pinned,model_tier")
    .single();
  if (error) throw error;
  return data;
}

async function touchConversation(userId, conversationId, title) {
  const patch = { updated_at: new Date().toISOString() };
  if (title) patch.title = titleFromPrompt(title);
  const { error } = await supabase
    .from("dimaai_conversations")
    .update(patch)
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

async function patchConversation(userId, conversationId, patch = {}) {
  const next = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) next.title = titleFromPrompt(patch.title);
  if (patch.isFavorite !== undefined) next.is_favorite = Boolean(patch.isFavorite);
  if (patch.isPinned !== undefined) next.is_pinned = Boolean(patch.isPinned);
  if (patch.modelTier !== undefined) next.model_tier = normalizeTier(patch.modelTier);
  const { data, error } = await supabase
    .from("dimaai_conversations")
    .update(next)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id,title,created_at,updated_at,is_favorite,is_pinned,model_tier")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function deleteConversation(userId, conversationId) {
  const { error } = await supabase
    .from("dimaai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

async function listMessages(userId, conversationId) {
  const [ownedResult, messagesResult] = await Promise.all([
    getOwnedConversation(userId, conversationId),
    supabase
      .from("dimaai_messages")
      .select("id,role,content,created_at,meta")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (!ownedResult) return null;
  if (messagesResult.error) throw messagesResult.error;
  const messages = (messagesResult.data || []).filter(
    (m) =>
      m.role !== "assistant" ||
      String(m.content || "").trim() ||
      String(m.meta?.thought || "").trim() ||
      (Array.isArray(m.meta?.pendingActions) && m.meta.pendingActions.length),
  );
  return { conversation: ownedResult, messages };
}

async function insertMessage({ userId, conversationId, role, content, meta }) {
  const row = {
    user_id: userId,
    conversation_id: conversationId,
    role,
    content,
  };
  if (meta && typeof meta === "object") row.meta = meta;
  const { data, error } = await supabase
    .from("dimaai_messages")
    .insert(row)
    .select("id,role,content,created_at,meta")
    .single();
  if (error) throw error;
  return data;
}

async function deleteMessage(userId, messageId) {
  const { error } = await supabase
    .from("dimaai_messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", userId);
  if (error) throw error;
}

async function contextForComplete(userId, conversationId) {
  const pack = await listMessages(userId, conversationId);
  if (!pack) return null;
  const msgs = pack.messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content,
    meta: m.meta || {},
  }));
  return { conversation: pack.conversation, messages: msgs, stored: pack.messages };
}

async function getMessage(userId, messageId) {
  const { data, error } = await supabase
    .from("dimaai_messages")
    .select("id,conversation_id,user_id,role,content,created_at,meta")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Delete a message and every later message in the same conversation (for edit/resend). */
async function deleteMessagesFrom(userId, conversationId, messageId) {
  const target = await getMessage(userId, messageId);
  if (!target || target.conversation_id !== conversationId) return null;
  const { data: rows, error } = await supabase
    .from("dimaai_messages")
    .select("id,created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .gte("created_at", target.created_at);
  if (error) throw error;
  const ids = (rows || []).map((r) => r.id);
  if (ids.length) {
    const { error: delErr } = await supabase
      .from("dimaai_messages")
      .delete()
      .in("id", ids)
      .eq("user_id", userId);
    if (delErr) throw delErr;
  }
  return target;
}

async function exportConversation(userId, conversationId) {
  const pack = await listMessages(userId, conversationId);
  if (!pack) return null;
  const lines = [
    `# ${pack.conversation.title || "DimaAI chat"}`,
    "",
    `Exported from DimaAI · ${new Date().toISOString()}`,
    "",
  ];
  for (const m of pack.messages) {
    const who = m.role === "user" ? "You" : "Dima 1.1";
    lines.push(`## ${who}`);
    lines.push(String(m.content || ""));
    const cites = m.meta?.citations;
    if (Array.isArray(cites) && cites.length) {
      lines.push("");
      lines.push("Sources:");
      for (const c of cites) {
        lines.push(`- ${c.title || "Source"}: ${c.url || ""}`);
      }
    }
    lines.push("");
  }
  return {
    conversation: pack.conversation,
    markdown: lines.join("\n"),
    messages: pack.messages,
  };
}

module.exports = {
  getMessage,
  deleteMessagesFrom,
  titleFromPrompt,
  listConversations,
  getOwnedConversation,
  createConversation,
  touchConversation,
  patchConversation,
  deleteConversation,
  listMessages,
  insertMessage,
  deleteMessage,
  contextForComplete,
  exportConversation,
};
