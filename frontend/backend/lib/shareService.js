"use strict";

/**
 * "Paylaş > Descall" service: the reads and writes behind /api/native/share
 * (routes/share.js). Shaping and rules are pure in lib/shareTargets.js.
 *
 * Sending reuses the notification quick-reply path (lib/notifyActions.js `reply`), so a
 * shared photo goes through exactly the checks of a message typed in the app: friendship,
 * blocks, membership, channel permissions (SEND / ATTACH_FILES / announcement), timeouts,
 * the word filter, slow mode, pushes and unread counts. One attachment per message (the
 * app's own rule); the caption goes with the first one. Scheduled sends use
 * lib/scheduledMessages.js (one row per attachment).
 *
 * Idempotency: every send carries a clientId; a repeat of the same clientId (an offline
 * queue retrying after a lost response) gets the first answer back instead of a second
 * copy of the messages. Kept per node for 30 minutes.
 */

const share = require("./shareTargets");

const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;
const IDEMPOTENCY_MAX = 5000;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const MEDIA_TYPES = new Set(["image", "video", "document", "file", "audio"]);
const CHANNEL_CONCURRENCY = 6;

class ShareError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

/** Validated attachment list from the request body. */
function readItems(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new ShareError(400, "bad_items");
  if (raw.length > share.MAX_ITEMS) throw new ShareError(400, "too_many_items");
  return raw.map((it) => {
    const url = typeof it?.url === "string" ? it.url.trim() : "";
    if (!url || url.length > 2000) throw new ShareError(400, "bad_items");
    const mediaType = MEDIA_TYPES.has(String(it.mediaType)) ? String(it.mediaType) : "file";
    const size = Number(it.size);
    if (Number.isFinite(size) && size > share.MAX_FILE_BYTES) throw new ShareError(413, "too_large");
    return {
      url,
      mediaType: mediaType === "audio" ? "document" : mediaType,
      mimeType: typeof it.mimeType === "string" ? it.mimeType.slice(0, 120) : null,
      size: Number.isFinite(size) && size >= 0 ? Math.floor(size) : null,
      originalName: typeof it.originalName === "string" ? it.originalName.slice(0, 200) : null,
    };
  });
}

function readText(raw) {
  if (raw == null) return "";
  if (typeof raw !== "string") throw new ShareError(400, "bad_text");
  const t = raw.replace(/\r\n?/g, "\n").trim();
  if (t.length > share.MAX_TEXT) throw new ShareError(400, "too_long");
  return t;
}

function createShareService(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const now = deps.now || (() => Date.now());
  const state = () => deps.state || require("../runtime/sharedState");
  const profile = () => deps.userProfile || require("./userProfile");
  const dmLib = () => deps.dmMessages || require("./dmMessages");
  const groupList = () => deps.groupList || require("./groupList");
  const serverList = () => deps.serverList || require("../routes/servers").buildMyServerList;
  const channelBits = deps.resolveUserChannelsBits || ((...a) => require("../socket/serverChannelHandlers").resolveUserChannelsBits(...a));
  const blocking = () => deps.blocking || require("./blocking");
  const moderation = () => deps.moderation || require("./moderation");
  const actions = () => deps.actions || require("./notifyActions").createNotifyActions();
  const scheduled = () => deps.scheduled || require("./scheduledMessages").scheduledMessages();
  const cluster = () => deps.cluster || require("./cluster");
  const log = deps.log || console;
  const wait = deps.sleep || sleep;
  const seen = new Map(); // `${userId}:${clientId}` → { at, result }

  // ── Reads ────────────────────────────────────────────────────────────────

  async function friendEntries(userId) {
    const ids = await dmLib().listAcceptedFriendIds(userId);
    if (!ids.length) return [];
    const entries = ids.map((id) => profile().enrichFriendEntry(id));
    const missing = entries.filter((e) => !e.username || e.username === "?").map((e) => e.id);
    if (missing.length) {
      const { data } = await getDb().from("users").select("id, username, display_name, avatar_url").in("id", missing.slice(0, 200));
      const byId = new Map((data || []).map((u) => [u.id, u]));
      for (const e of entries) {
        const u = byId.get(e.id);
        if (!u) continue;
        e.username = u.username;
        e.displayName = e.displayName || u.display_name || null;
        e.avatarUrl = e.avatarUrl || u.avatar_url || null;
      }
    }
    return entries;
  }

  function siteTimedOut(userId) {
    try {
      return Boolean(moderation().getActiveTimeout(userId));
    } catch {
      return false;
    }
  }

  /** Map(channelId → channelVerdict) for every text channel of these servers. */
  async function channelVerdicts(userId, servers) {
    const out = new Map();
    const site = siteTimedOut(userId);
    await mapLimit(servers, CHANNEL_CONCURRENCY, async (s) => {
      const chans = (Array.isArray(s?.channels) ? s.channels : []).filter((c) => c?.id && (c.type === "text" || c.type === "announcement" || !c.type));
      if (!chans.length) return;
      let r = null;
      try {
        r = await channelBits(s.id, userId, chans.map((c) => ({ id: c.id, parent_id: c.parentId || c.parent_id || null })));
      } catch (err) {
        log.warn("[share] channel permissions failed:", err?.message || err);
      }
      for (const c of chans) {
        out.set(String(c.id), share.channelVerdict({
          type: c.type || "text",
          bits: r?.bits?.get(c.id) ?? 0n,
          sendAllowed: Boolean(r?.sendAllowed?.get(c.id)),
          isOwner: Boolean(r?.isOwner || s.isOwner),
          slowmodeSeconds: c.slowmodeSeconds ?? c.slowmode_seconds ?? 0,
          timeoutUntil: s.timeoutUntil || null,
          siteTimedOut: site,
          now: now(),
        }));
      }
    });
    return out;
  }

  /** My latest messages in every table, as pickRecents rows. */
  async function recentRows(userId) {
    const db = getDb();
    const since = new Date(now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const [dms, groups, chans] = await Promise.all([
      db.from("dm_messages").select("to_user_id, media_url, created_at").eq("from_user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(80),
      db.from("group_messages").select("group_id, media_url, created_at").eq("sender_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(80),
      db.from("server_messages").select("channel_id, media_url, created_at").eq("sender_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(80),
    ]);
    const rows = [];
    for (const r of dms?.data || []) rows.push({ conv: `dm:${r.to_user_id}`, at: r.created_at, media: Boolean(r.media_url) });
    for (const r of groups?.data || []) rows.push({ conv: `group:${r.group_id}`, at: r.created_at, media: Boolean(r.media_url) });
    for (const r of chans?.data || []) rows.push({ conv: `channel:${r.channel_id}`, at: r.created_at, media: Boolean(r.media_url) });
    return rows;
  }

  async function targets(userId) {
    const [friends, servers, groups, rows] = await Promise.all([
      friendEntries(userId),
      Promise.resolve(serverList()(userId)).then((p) => (Array.isArray(p?.servers) ? p.servers : [])).catch(() => []),
      groupList().getUserGroups(userId).catch(() => []),
      recentRows(userId).catch(() => []),
    ]);
    const verdicts = await channelVerdicts(userId, servers);
    const presence = state().presence;
    const onlineIds = new Set();
    if (presence?.forEach) presence.forEach((p, id) => { if (p && p.status !== "invisible") onlineIds.add(String(id)); });
    return share.shapeTargets({ friends, groups, servers, verdicts, recentRows: rows, onlineIds, now: now() });
  }

  // ── Precheck (permission + duplicate) ────────────────────────────────────

  async function verdictFor(userId, c) {
    const db = getDb();
    if (c.type === "dm") {
      if (c.id === userId) return { canSend: false, canAttach: false, reason: "no_permission", slowModeSec: 0 };
      const s = state();
      const key = dmLib().convKey ? dmLib().convKey(userId, c.id) : null;
      if ((key && s.dmBlockPairs?.has?.(key)) || (await blocking().isBlockedEitherWay(userId, c.id).catch(() => false))) {
        return { canSend: false, canAttach: false, reason: "blocked", slowModeSec: 0 };
      }
      const friend = await dmLib().isAcceptedFriend(userId, c.id).catch(() => false);
      return friend ? { canSend: true, canAttach: true, reason: null, slowModeSec: 0 } : { canSend: false, canAttach: false, reason: "not_friends", slowModeSec: 0 };
    }
    if (c.type === "group") {
      const { data } = await db.from("group_members").select("group_id").eq("group_id", c.id).eq("user_id", userId).maybeSingle();
      return data ? { canSend: true, canAttach: true, reason: null, slowModeSec: 0 } : { canSend: false, canAttach: false, reason: "no_permission", slowModeSec: 0 };
    }
    const { data: ch } = await db.from("server_channels").select("id, server_id, type, slowmode_seconds, parent_id").eq("id", c.id).maybeSingle();
    if (!ch || (ch.type !== "text" && ch.type !== "announcement")) return { canSend: false, canAttach: false, reason: "no_permission", slowModeSec: 0 };
    const [{ data: member }, r] = await Promise.all([
      db.from("server_members").select("timeout_until").eq("server_id", ch.server_id).eq("user_id", userId).maybeSingle(),
      channelBits(ch.server_id, userId, [{ id: ch.id, parent_id: ch.parent_id || null }]).catch(() => null),
    ]);
    if (!member || !r?.isMember) return { canSend: false, canAttach: false, reason: "no_permission", slowModeSec: 0 };
    return share.channelVerdict({
      type: ch.type,
      bits: r.bits.get(ch.id) ?? 0n,
      sendAllowed: Boolean(r.sendAllowed.get(ch.id)),
      isOwner: r.isOwner,
      slowmodeSeconds: ch.slowmode_seconds,
      timeoutUntil: member.timeout_until,
      siteTimedOut: siteTimedOut(userId),
      now: now(),
    });
  }

  /** Refs of my uploads in the last week with one of these names and sizes. */
  async function uploadRefs(userId, files) {
    const named = (files || []).filter((f) => f?.name && Number(f.size) > 0).slice(0, share.MAX_ITEMS);
    if (!named.length) return new Map();
    const since = new Date(now() - share.DUPLICATE_WINDOW_MS).toISOString();
    const { data } = await getDb()
      .from("media_uploads")
      .select("public_url, original_name, file_size, created_at")
      .eq("uploader_id", userId)
      .in("original_name", named.map((f) => String(f.name).slice(0, 200)))
      .gte("created_at", since)
      .limit(100);
    const want = new Set(named.map((f) => `${f.name}|${Number(f.size)}`));
    const out = new Map();
    for (const u of data || []) {
      if (u?.public_url && want.has(`${u.original_name}|${Number(u.file_size)}`)) out.set(u.public_url, { name: u.original_name, size: Number(u.file_size) });
    }
    return out;
  }

  async function myRowsIn(userId, c, refs) {
    const db = getDb();
    const since = new Date(now() - share.DUPLICATE_WINDOW_MS).toISOString();
    const cols = "content, media_url, created_at";
    let q;
    if (c.type === "dm") q = db.from("dm_messages").select(cols).eq("from_user_id", userId).eq("to_user_id", c.id);
    else if (c.type === "group") q = db.from("group_messages").select(cols).eq("sender_id", userId).eq("group_id", c.id);
    else q = db.from("server_messages").select(cols).eq("sender_id", userId).eq("channel_id", c.id);
    const { data } = await q.gte("created_at", since).order("created_at", { ascending: false }).limit(60);
    return (data || []).map((r) => {
      const up = r.media_url ? refs.get(r.media_url) : null;
      return { content: r.content || "", originalName: up?.name || null, size: up?.size ?? null, at: r.created_at };
    });
  }

  async function precheck(userId, body = {}) {
    const convs = [...new Set((Array.isArray(body.convs) ? body.convs : []).map((x) => share.parseConv(x)?.conv).filter(Boolean))].slice(0, 30);
    if (!convs.length) throw new ShareError(400, "bad_conversation");
    const links = [...new Set([
      ...(Array.isArray(body.links) ? body.links : []).map(share.normalizeLink),
      ...share.linksIn(typeof body.text === "string" ? body.text : ""),
    ].filter(Boolean))].slice(0, 5);
    const files = Array.isArray(body.files) ? body.files.slice(0, share.MAX_ITEMS).map((f) => ({ name: String(f?.name || "").slice(0, 200), size: Number(f?.size) || 0 })) : [];
    const refs = await uploadRefs(userId, files).catch(() => new Map());
    const results = {};
    await mapLimit(convs, 6, async (conv) => {
      const c = share.parseConv(conv);
      let verdict;
      try {
        verdict = await verdictFor(userId, c);
      } catch (err) {
        log.warn("[share] precheck verdict failed:", err?.message || err);
        verdict = { canSend: true, canAttach: true, reason: null, slowModeSec: 0, unknown: true };
      }
      let duplicate = null;
      if (verdict.canSend && (links.length || refs.size)) {
        try {
          duplicate = share.findDuplicate({ links, files, rows: await myRowsIn(userId, c, refs), now: now() });
        } catch {
          duplicate = null;
        }
      }
      results[conv] = { ...verdict, duplicate };
    });
    return { results };
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  function remember(key, result) {
    const t = now();
    if (seen.size >= IDEMPOTENCY_MAX) {
      for (const [k, v] of seen) if (t - v.at > IDEMPOTENCY_TTL_MS) seen.delete(k);
      while (seen.size >= IDEMPOTENCY_MAX) seen.delete(seen.keys().next().value);
    }
    seen.set(key, { at: t, result });
  }

  function recall(key) {
    const hit = seen.get(key);
    if (!hit) return null;
    if (now() - hit.at > IDEMPOTENCY_TTL_MS) {
      seen.delete(key);
      return null;
    }
    return hit.result;
  }

  async function scheduleOne(userId, c, { text, item, sendAt, silent = false }) {
    const row = await scheduled().create(userId, {
      convType: c.type,
      convId: c.id,
      content: text,
      sendAt: new Date(sendAt).toISOString(),
      attachment: item ? item.url : undefined,
      ...(silent ? { silent: true } : {}),
    });
    return row?.id || null;
  }

  /** One message through the quick-reply path; rate limits are waited out, not failed. */
  async function sendOne(io, userId, c, { text, item, silent }) {
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const out = await actions().reply(io, userId, { conv: c.conv, text, media: item || null, markRead: false, silent: Boolean(silent) });
        return { messageId: out?.messageId || null };
      } catch (err) {
        lastErr = err;
        const code = String(err?.code || "").toLowerCase();
        if (code !== "rate_limited") throw err;
        const gap = Number(state().systemConfig?.dmRateLimitMs) || 200;
        await wait(Math.min(2000, gap + 80 + attempt * 150));
      }
    }
    throw lastErr;
  }

  /**
   * body: { clientId, conv, text?, items?: [{ url, mediaType, mimeType, size, originalName }],
   *         silent?, sendAt? (ISO, scheduled) }
   * → { ok, conv, results: [{ index, status: "sent" | "scheduled" | "failed", messageId?,
   *     scheduledId?, sendAt?, reason? }], sent, scheduled, failed }
   * index -1 is a text-only message (no attachments). A slow-mode channel takes the first
   * item now and schedules the rest one slow-mode period apart.
   */
  async function send(io, userId, body = {}) {
    const clientId = String(body.clientId || "");
    if (!CLIENT_ID_RE.test(clientId)) throw new ShareError(400, "bad_client_id");
    const c = share.parseConv(body.conv);
    if (!c) throw new ShareError(400, "bad_conversation");
    const key = `${userId}:${clientId}:${c.conv}`;
    const prior = recall(key);
    if (prior) return { ...prior, replay: true };
    const text = readText(body.text);
    const items = readItems(body.items);
    if (!text && !items.length) throw new ShareError(400, "empty");
    const silent = Boolean(body.silent);
    let sendAt = null;
    if (body.sendAt != null && body.sendAt !== "") {
      sendAt = Date.parse(String(body.sendAt));
      if (!Number.isFinite(sendAt)) throw new ShareError(400, "bad_time");
    }

    // Unit list: the caption rides on the first attachment; a text-only share is one unit.
    const units = items.length ? items.map((item, i) => ({ index: i, item, text: i === 0 ? text : "" })) : [{ index: -1, item: null, text }];
    const results = [];

    if (sendAt) {
      for (const u of units) {
        try {
          const id = await scheduleOne(userId, c, { text: u.text, item: u.item, sendAt, silent });
          results.push({ index: u.index, status: "scheduled", scheduledId: id, sendAt: new Date(sendAt).toISOString() });
        } catch (err) {
          results.push({ index: u.index, status: "failed", reason: share.reasonOf(err?.code) });
        }
      }
    } else {
      for (let k = 0; k < units.length; k++) {
        const u = units[k];
        try {
          const out = await sendOne(io, userId, c, { text: u.text, item: u.item, silent });
          results.push({ index: u.index, status: "sent", messageId: out.messageId });
        } catch (err) {
          const reason = share.reasonOf(err?.code);
          if (reason === "slowmode" && c.type === "channel") {
            // This and every later unit go out on the slow-mode clock.
            const v = await verdictFor(userId, c).catch(() => ({ slowModeSec: 0 }));
            const plan = share.slowmodePlan({ count: units.length - k, slowModeSec: v.slowModeSec || 30, retryAfterSec: v.slowModeSec || 30, now: now() });
            for (let j = k; j < units.length; j++) {
              const at = plan[j - k];
              try {
                const id = await scheduleOne(userId, c, { text: units[j].text, item: units[j].item, sendAt: at, silent });
                results.push({ index: units[j].index, status: "scheduled", scheduledId: id, sendAt: new Date(at).toISOString(), reason: "slowmode" });
              } catch (e2) {
                results.push({ index: units[j].index, status: "failed", reason: share.reasonOf(e2?.code) === "failed" ? "slowmode" : share.reasonOf(e2?.code) });
              }
            }
            break;
          }
          results.push({ index: u.index, status: "failed", reason });
          // A refusal for the conversation (no permission, blocked...) refuses every unit.
          if (["no_permission", "announcement", "timed_out", "blocked", "not_friends", "rules_required", "content_blocked"].includes(reason)) {
            for (let j = k + 1; j < units.length; j++) results.push({ index: units[j].index, status: "failed", reason });
            break;
          }
        }
      }
    }
    const count = (s) => results.filter((r) => r.status === s).length;
    const result = { ok: count("failed") === 0, conv: c.conv, results, sent: count("sent"), scheduled: count("scheduled"), failed: count("failed") };
    // Only a result that did something is replayed; a total failure may be retried for real.
    if (result.sent || result.scheduled) remember(key, result);
    return result;
  }

  // ── Undo ─────────────────────────────────────────────────────────────────

  function emitToUser(io, uid, event, payload) {
    try {
      io?.to?.(`user:${uid}`)?.emit(event, payload);
    } catch {
      /* best effort */
    }
  }

  /**
   * body: { conv, messageIds: [], scheduledIds: [] } → { ok, removed, failed }.
   * Only my own messages, only within UNDO_WINDOW_MS of being sent.
   */
  async function undo(io, userId, body = {}) {
    const c = share.parseConv(body.conv);
    if (!c) throw new ShareError(400, "bad_conversation");
    const ids = [...new Set((Array.isArray(body.messageIds) ? body.messageIds : []).map(String).filter((x) => /^[0-9A-Za-z-]{1,64}$/.test(x)))].slice(0, 20);
    const schedIds = [...new Set((Array.isArray(body.scheduledIds) ? body.scheduledIds : []).map(String))].slice(0, 20);
    const db = getDb();
    const since = new Date(now() - share.UNDO_WINDOW_MS).toISOString();
    let removed = 0;
    let failed = 0;
    if (ids.length) {
      let res;
      if (c.type === "dm") {
        res = await db.from("dm_messages").delete().in("id", ids).eq("from_user_id", userId).eq("to_user_id", c.id).gte("created_at", since).select("id");
      } else if (c.type === "group") {
        res = await db.from("group_messages").delete().in("id", ids).eq("sender_id", userId).eq("group_id", c.id).gte("created_at", since).select("id");
      } else {
        res = await db.from("server_messages").delete().in("id", ids).eq("sender_id", userId).eq("channel_id", c.id).gte("created_at", since).select("id, server_id");
      }
      if (res?.error) throw new ShareError(502, "failed");
      const gone = res?.data || [];
      removed += gone.length;
      failed += ids.length - gone.length;
      for (const row of gone) {
        if (c.type === "dm") {
          const s = state();
          const k = dmLib().convKey(userId, c.id);
          try { cluster().invalidate("dmConv", k); } catch { /* ignore */ }
          const arr = s.dmHistory?.get?.(k);
          if (arr) {
            const i = arr.findIndex((m) => m.id === row.id);
            if (i >= 0) arr.splice(i, 1);
          }
          emitToUser(io, userId, "dm:message:deleted", { messageId: row.id, withUserId: c.id });
          emitToUser(io, c.id, "dm:message:deleted", { messageId: row.id, withUserId: userId });
        } else if (c.type === "group") {
          try { io?.to?.(`group:${c.id}`)?.emit("group:message:deleted", { messageId: row.id, groupId: c.id }); } catch { /* ignore */ }
          emitToUser(io, userId, "group:message:deleted", { messageId: row.id, groupId: c.id });
        } else {
          const payload = { serverId: row.server_id, channelId: c.id, messageId: row.id };
          try { io?.to?.(`server-channel:${c.id}`)?.emit("server:channel:message:deleted", payload); } catch { /* ignore */ }
          emitToUser(io, userId, "server:channel:message:deleted", payload);
        }
      }
      if (c.type === "dm" && gone.length) {
        // The peer's unread badge counted these messages.
        const s = state();
        const map = s.dmUnreadByUser?.get?.(c.id);
        if (map?.has?.(userId)) {
          const left = Math.max(0, (map.get(userId) || 0) - gone.length);
          if (left) map.set(userId, left);
          else map.delete(userId);
          emitToUser(io, c.id, "dm:unread:sync", { peerId: userId, count: left });
        }
      }
    }
    for (const id of schedIds) {
      try {
        const item = await scheduled().cancel(userId, id);
        emitToUser(io, userId, "scheduled:update", item);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    return { ok: failed === 0, removed, failed };
  }

  return { targets, precheck, send, undo, _seen: seen };
}

let singleton = null;
function shareService() {
  if (!singleton) singleton = createShareService();
  return singleton;
}

module.exports = { ShareError, createShareService, shareService, readItems, readText };
