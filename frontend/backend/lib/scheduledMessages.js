"use strict";

/**
 * Scheduled sending (messaging phase 4).
 *
 * Schedules live in scheduled_messages (supabase/migrations/
 * 20261108_scheduled_messages.sql), so they go out while the sender is
 * offline, from whichever server instance claims them first. The sender can
 * list, edit (text and time) and cancel them until they go out.
 *
 * Delivery reuses the notification quick-reply path (lib/notifyActions.js
 * `reply`): DMs mirror dm:send, groups and channels run the real socket
 * handlers on a virtual socket, so blocks, friendship, membership, channel
 * permissions, slow mode, timeouts, bans, unread counts, mentions and pushes
 * are checked again at send time. A scheduled DM does not mark the chat read.
 *
 * One attachment (messaging phase 5): the app uploads it through the normal
 * /api/media/upload (purpose=message, same limits) when you schedule, and the
 * row keeps the stored private ref (media_ref + type / mime / size / name,
 * supabase/migrations/20261109_scheduled_message_attachment.sql). It goes out
 * with the message; when the row is cancelled or fails, the stored upload is
 * deleted (unless a sent message or another pending row uses the same file).
 * A row with an attachment and no caption stores content " " (the content
 * column needs one character); an older instance would refuse to send it
 * ("empty") instead of sending the file without its text.
 *
 * Claiming: UPDATE ... SET status='sending' WHERE id=? AND status='pending'
 * returns the row only to the one instance that won it. A row stuck in
 * 'sending' (a crash mid-send) is marked failed, never re-sent (no doubles).
 */

const { isMissingTable } = require("./readReceipts");
const { isMissingColumn } = require("./forwardedMessage");

const CONV_TYPES = Object.freeze(["dm", "group", "channel"]);
const MIN_LEAD_MS = 30 * 1000;
const MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_PENDING_PER_USER = 50;
const MAX_TEXT = 2000;
const TICK_MS = 15 * 1000;
const BATCH = 20;
const STUCK_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// "Image or file": voice notes and audio are recorded live, never scheduled.
const ATTACH_TYPES = Object.freeze(["image", "video", "document", "file"]);
const MAX_ATTACH_BYTES = 100 * 1024 * 1024; // routes/media.js MAX_FILE_SIZE
const EMPTY_CAPTION = " ";

class ScheduleError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function attachmentOf(row) {
  if (!row?.media_ref) return null;
  return {
    url: row.media_ref, // sb://media-private/... → signed URL on the way out (lib/privateMedia.js hooks)
    mediaType: row.media_type || "file",
    mimeType: row.mime_type || null,
    size: row.file_size == null ? null : Number(row.file_size),
    originalName: row.original_name || null,
  };
}

function toItem(row) {
  const attachment = attachmentOf(row);
  return {
    id: row.id,
    convType: row.conv_type,
    convId: row.conv_id,
    content: attachment ? String(row.content || "").trim() : row.content,
    attachment,
    sendAt: row.send_at,
    status: row.status,
    error: row.error || null,
    createdAt: row.created_at || null,
    sentAt: row.sent_at || null,
  };
}

function validateText(raw, { allowEmpty = false } = {}) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text && allowEmpty) return EMPTY_CAPTION;
  if (!text) throw new ScheduleError(400, "empty");
  if (text.length > MAX_TEXT) throw new ScheduleError(400, "too_long");
  if (text.startsWith("/")) throw new ScheduleError(400, "no_commands");
  return text;
}

function validateTime(raw, now = Date.now()) {
  const t = Date.parse(String(raw || ""));
  if (!Number.isFinite(t)) throw new ScheduleError(400, "bad_time");
  if (t < now + MIN_LEAD_MS) throw new ScheduleError(400, "too_soon");
  if (t > now + MAX_LEAD_MS) throw new ScheduleError(400, "too_far");
  return new Date(t).toISOString();
}

function createScheduledMessages(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const now = deps.now || (() => Date.now());
  const log = deps.log || console;
  const actions = () => deps.actions || require("./notifyActions").createNotifyActions();
  const canSend = deps.canSend || defaultCanSend;
  const deleteUpload = deps.deleteUpload || defaultDeleteUpload;
  const checkUpload = deps.checkUpload || defaultCheckUpload;
  let tableMissing = false;

  function fail(error) {
    if (isMissingTable(error, "scheduled_messages")) {
      tableMissing = true;
      return new ScheduleError(503, "not_ready");
    }
    return new ScheduleError(500, "failed");
  }

  async function defaultCanSend(userId, convType, convId) {
    const db = getDb();
    if (convType === "dm") {
      if (convId === userId) return false;
      const { isAcceptedFriend } = require("./dmMessages");
      return isAcceptedFriend(userId, convId);
    }
    if (convType === "group") {
      const { data } = await db.from("group_members").select("group_id").eq("group_id", convId).eq("user_id", userId).maybeSingle();
      return Boolean(data);
    }
    try {
      const { Permissions } = require("./serverPermissions");
      await require("../socket/serverChannelHandlers").assertTextChannelAccess(userId, convId, Permissions.SEND_MESSAGES);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The stored upload behind `url` (the app's signed URL or a ref), owned by
   * `userId`: { ref, path, mediaType, mimeType, size, originalName } or throws.
   */
  async function defaultCheckUpload(userId, url) {
    const pm = require("./privateMedia");
    const parsed = pm.parseMediaUrl(String(url || ""));
    if (!parsed || parsed.kind === "legacy" || parsed.path.startsWith("quarantine/")) throw new ScheduleError(400, "bad_attachment");
    const { data, error } = await getDb()
      .from("media_uploads")
      .select("storage_path, media_type, mime_type, file_size, original_name")
      .eq("storage_path", parsed.path)
      .eq("uploader_id", userId)
      .limit(1);
    if (error) throw new ScheduleError(500, "failed");
    const up = (data || [])[0];
    if (!up) throw new ScheduleError(400, "bad_attachment");
    return {
      ref: pm.refForPath(parsed.path),
      path: parsed.path,
      mediaType: up.media_type || "file",
      mimeType: up.mime_type || null,
      size: up.file_size == null ? null : Number(up.file_size),
      originalName: up.original_name || null,
    };
  }

  /** Validated attachment for a new row (null when the body has none). */
  async function readAttachment(userId, raw) {
    if (raw == null || raw === "") return null;
    const url = typeof raw === "string" ? raw : raw?.url;
    if (!url || typeof url !== "string") throw new ScheduleError(400, "bad_attachment");
    const up = await checkUpload(userId, url);
    if (!ATTACH_TYPES.includes(up.mediaType)) throw new ScheduleError(400, "bad_attachment");
    if (up.size != null && up.size > MAX_ATTACH_BYTES) throw new ScheduleError(413, "attachment_too_large");
    return up;
  }

  /**
   * Remove the stored file of a cancelled / failed row: storage object and its
   * media_uploads row. Kept when a message already carries it or another
   * pending schedule uses it. Never throws.
   */
  async function defaultDeleteUpload(row) {
    try {
      const pm = require("./privateMedia");
      const parsed = pm.parseMediaUrl(String(row?.media_ref || ""));
      if (!parsed) return false;
      const db = getDb();
      const ref = pm.refForPath(parsed.path);
      const [dmUse, groupUse, serverUse, otherRows] = await Promise.all([
        db.from("dm_messages").select("id").eq("media_url", ref).limit(1),
        db.from("group_messages").select("id").eq("media_url", ref).limit(1),
        db.from("server_messages").select("id").eq("media_url", ref).limit(1),
        db.from("scheduled_messages").select("id").eq("media_ref", ref).in("status", ["pending", "sending"]).neq("id", row.id).limit(1),
      ]);
      for (const r of [dmUse, groupUse, serverUse, otherRows]) {
        if (r?.error) return false; // unsure: keep the file
        if ((r?.data || []).length) return false;
      }
      const { error } = await db.storage.from(pm.PRIVATE_BUCKET).remove([parsed.path]);
      if (error) {
        log.warn?.("[scheduled] upload delete failed:", error.message || error);
        return false;
      }
      await db.from("media_uploads").delete().eq("storage_path", parsed.path).eq("uploader_id", row.user_id);
      return true;
    } catch (err) {
      log.warn?.("[scheduled] upload delete failed:", err?.message || err);
      return false;
    }
  }

  function dropUpload(row) {
    if (!row?.media_ref) return;
    void Promise.resolve()
      .then(() => deleteUpload(row))
      .catch(() => {});
  }

  async function list(userId, { convType = null, convId = null } = {}) {
    if (tableMissing) return [];
    let q = getDb().from("scheduled_messages").select("*").eq("user_id", userId).eq("status", "pending");
    if (convType && convId) q = q.eq("conv_type", convType).eq("conv_id", convId);
    const { data, error } = await q.order("send_at", { ascending: true }).limit(MAX_PENDING_PER_USER);
    if (error) {
      fail(error);
      return [];
    }
    return (data || []).map(toItem);
  }

  async function create(userId, body = {}) {
    if (tableMissing) throw new ScheduleError(503, "not_ready");
    const convType = String(body.convType || "");
    const convId = String(body.convId || "");
    if (!CONV_TYPES.includes(convType) || !UUID.test(convId)) throw new ScheduleError(400, "bad_conversation");
    const hasAttachment = body.attachment != null && body.attachment !== "";
    const content = validateText(body.content, { allowEmpty: hasAttachment });
    const sendAt = validateTime(body.sendAt, now());
    if (!(await canSend(userId, convType, convId))) throw new ScheduleError(403, "not_allowed");
    const attachment = await readAttachment(userId, body.attachment);
    const db = getDb();
    const { data: pending, error: countErr } = await db.from("scheduled_messages").select("id").eq("user_id", userId).eq("status", "pending");
    if (countErr) throw fail(countErr);
    if ((pending || []).length >= MAX_PENDING_PER_USER) throw new ScheduleError(429, "too_many");
    const stamp = new Date(now()).toISOString();
    const media = attachment
      ? { media_ref: attachment.ref, media_type: attachment.mediaType, mime_type: attachment.mimeType, file_size: attachment.size, original_name: attachment.originalName }
      : {};
    const { data, error } = await db
      .from("scheduled_messages")
      .insert({ user_id: userId, conv_type: convType, conv_id: convId, content, send_at: sendAt, status: "pending", created_at: stamp, updated_at: stamp, ...media })
      .select("*")
      .single();
    if (error && attachment && isMissingColumn(error, "media_ref")) throw new ScheduleError(503, "attach_not_ready");
    if (error || !data) throw fail(error);
    return toItem(data);
  }

  async function ownPending(userId, id) {
    if (!UUID.test(String(id || ""))) throw new ScheduleError(404, "not_found");
    const { data, error } = await getDb().from("scheduled_messages").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) throw fail(error);
    if (!data) throw new ScheduleError(404, "not_found");
    if (data.status !== "pending") throw new ScheduleError(409, "already_sent");
    return data;
  }

  async function update(userId, id, body = {}) {
    if (tableMissing) throw new ScheduleError(503, "not_ready");
    const current = await ownPending(userId, id);
    const patch = { updated_at: new Date(now()).toISOString() };
    if (body.content !== undefined) patch.content = validateText(body.content, { allowEmpty: Boolean(current.media_ref) });
    if (body.sendAt !== undefined) patch.send_at = validateTime(body.sendAt, now());
    // Only while still pending: a send that started in between wins.
    const { data, error } = await getDb().from("scheduled_messages").update(patch).eq("id", id).eq("user_id", userId).eq("status", "pending").select("*").maybeSingle();
    if (error) throw fail(error);
    if (!data) throw new ScheduleError(409, "already_sent");
    return toItem(data);
  }

  async function cancel(userId, id) {
    if (tableMissing) throw new ScheduleError(503, "not_ready");
    await ownPending(userId, id);
    const { data, error } = await getDb()
      .from("scheduled_messages")
      .update({ status: "cancelled", updated_at: new Date(now()).toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw fail(error);
    if (!data) throw new ScheduleError(409, "already_sent");
    dropUpload(data);
    return toItem(data);
  }

  function notify(io, row) {
    try { io?.to?.(`user:${row.user_id}`)?.emit?.("scheduled:update", toItem(row)); } catch { /* best effort */ }
  }

  /** One pass: send what is due. Returns the number of rows handled. */
  async function tick(io) {
    if (tableMissing) return 0;
    const db = getDb();
    const stamp = new Date(now()).toISOString();
    // A send that never finished (crash): failed, never retried, so nothing is sent twice.
    const stuckBefore = new Date(now() - STUCK_MS).toISOString();
    const { data: stuck } = await db.from("scheduled_messages").update({ status: "failed", error: "interrupted", updated_at: stamp }).eq("status", "sending").lt("updated_at", stuckBefore).select("*");
    for (const row of stuck || []) {
      dropUpload(row);
      notify(io, row);
    }

    const { data: due, error } = await db.from("scheduled_messages").select("*").eq("status", "pending").lte("send_at", stamp).order("send_at", { ascending: true }).limit(BATCH);
    if (error) {
      fail(error);
      return 0;
    }
    let handled = 0;
    for (const row of due || []) {
      const { data: claimed } = await db
        .from("scheduled_messages")
        .update({ status: "sending", updated_at: new Date(now()).toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (!claimed) continue; // another instance, or edited / cancelled meanwhile
      handled += 1;
      let finalRow;
      try {
        const media = attachmentOf(claimed);
        const out = await actions().reply(io, claimed.user_id, {
          conv: `${claimed.conv_type}:${claimed.conv_id}`,
          text: media ? String(claimed.content || "").trim() : claimed.content,
          markRead: false,
          ...(media ? { media } : {}),
        });
        const done = { status: "sent", sent_at: new Date(now()).toISOString(), updated_at: new Date(now()).toISOString(), message_id: out?.messageId ? String(out.messageId) : null, error: null };
        const { data } = await db.from("scheduled_messages").update(done).eq("id", claimed.id).select("*").maybeSingle();
        finalRow = data || { ...claimed, ...done };
      } catch (err) {
        const code = String(err?.code || "failed").slice(0, 64);
        if (!err?.code) log.warn?.("[scheduled] send failed:", err?.message || err);
        const failed = { status: "failed", error: code, updated_at: new Date(now()).toISOString() };
        const { data } = await db.from("scheduled_messages").update(failed).eq("id", claimed.id).select("*").maybeSingle();
        finalRow = data || { ...claimed, ...failed };
        dropUpload(finalRow);
      }
      notify(io, finalRow);
    }
    return handled;
  }

  let timer = null;
  let running = false;
  function start({ getIo = () => null, intervalMs = TICK_MS } = {}) {
    if (timer) return stop;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await tick(getIo());
      } catch (err) {
        log.warn?.("[scheduled] tick failed:", err?.message || err);
      } finally {
        running = false;
      }
    };
    timer = setInterval(run, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    setTimeout(run, 3000).unref?.();
    return stop;
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { list, create, update, cancel, tick, start, stop };
}

let shared = null;
function scheduledMessages() {
  if (!shared) shared = createScheduledMessages();
  return shared;
}

module.exports = { CONV_TYPES, ATTACH_TYPES, MAX_ATTACH_BYTES, attachmentOf, MIN_LEAD_MS, MAX_PENDING_PER_USER, ScheduleError, validateText, validateTime, createScheduledMessages, scheduledMessages };
