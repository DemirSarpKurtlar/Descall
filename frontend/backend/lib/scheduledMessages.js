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
 * Text only (no attachments): a file must be uploaded while you are there.
 *
 * Claiming: UPDATE ... SET status='sending' WHERE id=? AND status='pending'
 * returns the row only to the one instance that won it. A row stuck in
 * 'sending' (a crash mid-send) is marked failed, never re-sent (no doubles).
 */

const { isMissingTable } = require("./readReceipts");

const CONV_TYPES = Object.freeze(["dm", "group", "channel"]);
const MIN_LEAD_MS = 30 * 1000;
const MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_PENDING_PER_USER = 50;
const MAX_TEXT = 2000;
const TICK_MS = 15 * 1000;
const BATCH = 20;
const STUCK_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ScheduleError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function toItem(row) {
  return {
    id: row.id,
    convType: row.conv_type,
    convId: row.conv_id,
    content: row.content,
    sendAt: row.send_at,
    status: row.status,
    error: row.error || null,
    createdAt: row.created_at || null,
    sentAt: row.sent_at || null,
  };
}

function validateText(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
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
    const content = validateText(body.content);
    const sendAt = validateTime(body.sendAt, now());
    if (!(await canSend(userId, convType, convId))) throw new ScheduleError(403, "not_allowed");
    const db = getDb();
    const { data: pending, error: countErr } = await db.from("scheduled_messages").select("id").eq("user_id", userId).eq("status", "pending");
    if (countErr) throw fail(countErr);
    if ((pending || []).length >= MAX_PENDING_PER_USER) throw new ScheduleError(429, "too_many");
    const stamp = new Date(now()).toISOString();
    const { data, error } = await db
      .from("scheduled_messages")
      .insert({ user_id: userId, conv_type: convType, conv_id: convId, content, send_at: sendAt, status: "pending", created_at: stamp, updated_at: stamp })
      .select("*")
      .single();
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
    await ownPending(userId, id);
    const patch = { updated_at: new Date(now()).toISOString() };
    if (body.content !== undefined) patch.content = validateText(body.content);
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
    for (const row of stuck || []) notify(io, row);

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
        const out = await actions().reply(io, claimed.user_id, { conv: `${claimed.conv_type}:${claimed.conv_id}`, text: claimed.content, markRead: false });
        const done = { status: "sent", sent_at: new Date(now()).toISOString(), updated_at: new Date(now()).toISOString(), message_id: out?.messageId ? String(out.messageId) : null, error: null };
        const { data } = await db.from("scheduled_messages").update(done).eq("id", claimed.id).select("*").maybeSingle();
        finalRow = data || { ...claimed, ...done };
      } catch (err) {
        const code = String(err?.code || "failed").slice(0, 64);
        if (!err?.code) log.warn?.("[scheduled] send failed:", err?.message || err);
        const failed = { status: "failed", error: code, updated_at: new Date(now()).toISOString() };
        const { data } = await db.from("scheduled_messages").update(failed).eq("id", claimed.id).select("*").maybeSingle();
        finalRow = data || { ...claimed, ...failed };
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

module.exports = { CONV_TYPES, MIN_LEAD_MS, MAX_PENDING_PER_USER, ScheduleError, validateText, validateTime, createScheduledMessages, scheduledMessages };
