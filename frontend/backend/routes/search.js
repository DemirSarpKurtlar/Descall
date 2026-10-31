"use strict";

/**
 * Mesaj araması (3.7.7). GET /api/search/messages
 *   ?kind=dm&peerId=…            DM with an accepted friend
 *   ?kind=group&groupId=…        group member (removed members: up to removal)
 *   ?kind=channel&serverId=…&channelId=…   VIEW_CHANNEL + READ_MESSAGE_HISTORY
 *   &q=… (2-100 chars) [&from=userId] [&before=ISO cursor] [&limit=25]
 * → { results: [{ id, authorId, author, createdAt, snippet }], nextBefore }
 * GET /api/search/context?…&id=… → { messages } (hit ± 5, same access rules)
 * Text only: voice notes and call cards are not searched. 30 searches a minute.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { isAcceptedFriend } = require("../lib/dmMessages");
const removals = require("../lib/groupRemovals");
const { resolveChannelPermissions, hasPermission, Permissions } = require("../lib/serverPermissions");
const s = require("../lib/messageSearch");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID.test(String(v || ""));

function cursorOf(v) {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function authors(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("users").select("id, username, display_name, avatar_url").in("id", unique);
  return new Map((data || []).map((u) => [String(u.id), u]));
}

/**
 * The conversation the caller may read, as { table, cols, authorCol, scope(q) },
 * or { status, body } to send back. Same rules as the history endpoints.
 */
async function resolveScope(req, me) {
  const kind = String(req.query.kind || "");
  if (kind === "dm") {
    const peerId = String(req.query.peerId || "");
    if (!isUuid(peerId) || peerId === me) return { status: 400, body: { error: "Invalid conversation." } };
    if (!(await isAcceptedFriend(me, peerId))) return { status: 200, body: { results: [], nextBefore: null, messages: [] } };
    return {
      table: "dm_messages",
      cols: "id, from_user_id, content, media_type, created_at",
      authorCol: "from_user_id",
      scope: (q) => q.or(`and(from_user_id.eq.${me},to_user_id.eq.${peerId}),and(from_user_id.eq.${peerId},to_user_id.eq.${me})`),
    };
  }
  if (kind === "group") {
    const groupId = String(req.query.groupId || "");
    if (!isUuid(groupId)) return { status: 400, body: { error: "Invalid group." } };
    const { data: member } = await supabase.from("group_members").select("group_id").eq("group_id", groupId).eq("user_id", me).maybeSingle();
    let readUntil = null;
    if (!member) {
      const removal = await removals.getActiveRemoval(groupId, me);
      if (!removal) return { status: 403, body: { error: "You're not a member of this group." } };
      readUntil = removal.read_until || removal.removed_at;
    }
    return {
      table: "group_messages",
      cols: "id, sender_id, content, media_type, created_at",
      authorCol: "sender_id",
      scope: (q) => {
        let out = q.eq("group_id", groupId);
        if (readUntil) out = out.lte("created_at", readUntil);
        return out;
      },
    };
  }
  if (kind === "channel") {
    const serverId = String(req.query.serverId || "");
    const channelId = String(req.query.channelId || "");
    if (!isUuid(serverId) || !isUuid(channelId)) return { status: 400, body: { error: "Invalid channel." } };
    const perms = await resolveChannelPermissions(supabase, serverId, me, channelId);
    if (!perms.isMember || perms.channelMissing || !hasPermission(perms.bits, Permissions.VIEW_CHANNEL)) {
      return { status: 404, body: { error: "Channel not found." } };
    }
    if (!hasPermission(perms.bits, Permissions.READ_MESSAGE_HISTORY)) return { status: 200, body: { results: [], nextBefore: null, messages: [] } };
    return {
      table: "server_messages",
      cols: "id, sender_id, content, media_type, created_at, message_type",
      authorCol: "sender_id",
      scope: (q) => q.eq("server_id", serverId).eq("channel_id", channelId),
    };
  }
  return { status: 400, body: { error: "Invalid search." } };
}

const isUserText = (r) => r.message_type == null || ["text", "user", "default"].includes(r.message_type);

function authorOf(people, id) {
  const u = people.get(String(id));
  return u ? { id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null } : null;
}

router.get("/messages", requireAuth, async (req, res) => {
  const me = req.user.id;
  if (rejectIfLimited(res, [recordFailure(`search:${me}`, { windowMs: 60000, max: 30 })])) return;
  const q = s.cleanQuery(req.query.q);
  if (!q) return res.status(400).json({ error: "Type at least 2 letters.", code: "QUERY_TOO_SHORT" });
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 25));
  const before = cursorOf(req.query.before);
  const from = isUuid(req.query.from) ? String(req.query.from) : null;

  try {
    const sc = await resolveScope(req, me);
    if (sc.status) return res.status(sc.status).json(sc.body);
    let query = sc.scope(supabase.from(sc.table).select(sc.cols)).ilike("content", s.likePattern(q));
    if (from) query = query.eq(sc.authorCol, from);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit + 1);
    if (error) throw error;
    const page = (data || []).slice(0, limit);
    const people = await authors(page.map((r) => r[sc.authorCol]));
    const results = page
      .filter(isUserText)
      .map((r) => {
        const text = s.searchableText(r.content);
        if (!text || !s.matches(text, q)) return null;
        return { id: r.id, authorId: r[sc.authorCol], author: authorOf(people, r[sc.authorCol]), createdAt: r.created_at, snippet: s.snippet(text, q) };
      })
      .filter(Boolean);
    res.set("Cache-Control", "no-store");
    res.json({ results, nextBefore: (data || []).length > limit ? page[page.length - 1]?.created_at || null : null });
  } catch (err) {
    console.error("[search]", err?.message || err);
    res.status(500).json({ error: "Could not search." });
  }
});

/**
 * The hit with up to 5 messages before and after it, for a result that is not
 * in the loaded page. GET /api/search/context?kind=…&…&id=messageId
 */
router.get("/context", requireAuth, async (req, res) => {
  const me = req.user.id;
  if (rejectIfLimited(res, [recordFailure(`search-ctx:${me}`, { windowMs: 60000, max: 60 })])) return;
  const id = String(req.query.id || "");
  if (!id || id.length > 64) return res.status(400).json({ error: "Invalid message." });
  try {
    const sc = await resolveScope(req, me);
    if (sc.status) return res.status(sc.status).json(sc.body);
    const { data: hit, error } = await sc.scope(supabase.from(sc.table).select(sc.cols)).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!hit) return res.status(404).json({ error: "Message not found." });
    const [olderRes, newerRes] = await Promise.all([
      sc.scope(supabase.from(sc.table).select(sc.cols)).lt("created_at", hit.created_at).order("created_at", { ascending: false }).limit(5),
      sc.scope(supabase.from(sc.table).select(sc.cols)).gt("created_at", hit.created_at).order("created_at", { ascending: true }).limit(5),
    ]);
    if (olderRes.error) throw olderRes.error;
    if (newerRes.error) throw newerRes.error;
    const rows = [...(olderRes.data || []).reverse(), hit, ...(newerRes.data || [])];
    const people = await authors(rows.map((r) => r[sc.authorCol]));
    const messages = rows.map((r) => {
      const text = s.searchableText(r.content);
      const raw = String(r.content || "");
      const kind = raw.startsWith("__voice__:") ? "voice" : !text && raw.startsWith("{") ? "call" : r.media_type ? String(r.media_type) : "text";
      return { id: r.id, authorId: r[sc.authorCol], author: authorOf(people, r[sc.authorCol]), createdAt: r.created_at, text: kind === "text" ? text || "" : "", kind, hit: r.id === hit.id };
    });
    res.set("Cache-Control", "no-store");
    res.json({ messages });
  } catch (err) {
    console.error("[search:context]", err?.message || err);
    res.status(500).json({ error: "Could not load the message." });
  }
});

module.exports = router;
