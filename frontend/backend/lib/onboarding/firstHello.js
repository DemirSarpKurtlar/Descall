"use strict";

/**
 * "İlk Selam": the first real message of a new account earns +50 DesCoin and the special
 * badge "ilkselam", once per account.
 *
 * Called from the socket send paths right after a message is stored (DM and server channel,
 * next to recordFirstMessage). A message counts only when:
 *   - the account is inside its five days, not flagged as a suspicious sign-up, and has no
 *     "İlk Selam" yet;
 *   - the text is real (two letters or more, not a /command);
 *   - it reaches a real person: a DM peer that is another live account older than a day or
 *     with messages of its own, or a server with at least one other member like that.
 * The reward then waits out the undo window (model.HELLO_UNDO_MS): if the message was
 * deleted or the user left the server by then (the dashboard's "Geri al"), nothing is paid.
 * The pending message is stored, so a restart during the window still pays on the next
 * dashboard read (finalizeIfDue).
 */

const model = require("./model");
const store = require("./store");
const rewards = require("./rewards");

const done = new Set();
const timers = new Map();

function db() {
  return require("../../db/supabase");
}

function analytics() {
  return require("../userAnalyticsStore");
}

const DAY = model.DAY_MS;

/** A real other person: live, not banned / deleted, and older than a day or has talked before. */
function realPeer(u, now = Date.now()) {
  if (!u || u.is_banned || u.deleted_at) return false;
  const age = now - Date.parse(u.created_at || 0);
  return age > DAY || Boolean(u.first_message_at);
}

async function peersAreReal(ids, now) {
  const list = [...new Set(ids.filter(Boolean).map(String))].slice(0, 50);
  if (!list.length) return false;
  for (const cols of ["id, created_at, is_banned, deleted_at, first_message_at", "id, created_at"]) {
    const { data, error } = await db().from("users").select(cols).in("id", list);
    if (!error) return (data || []).some((u) => realPeer(u, now));
  }
  return false;
}

async function reachesRealPerson({ userId, kind, serverId, peerId }, now = Date.now()) {
  if (kind === "dm") {
    if (!peerId || String(peerId) === String(userId)) return false;
    return peersAreReal([peerId], now);
  }
  if (kind === "server" && serverId) {
    const { data, error } = await db().from("server_members").select("user_id").eq("server_id", serverId).neq("user_id", userId).limit(50);
    if (error) return false;
    return peersAreReal((data || []).map((r) => r.user_id), now);
  }
  return false;
}

async function messageStillThere(pending, userId) {
  if (!pending?.messageId) return false;
  if (pending.kind === "dm") {
    const { data } = await db().from("dm_messages").select("id").eq("id", pending.messageId).eq("from_user_id", userId).maybeSingle();
    return Boolean(data);
  }
  const { data } = await db().from("server_messages").select("id, server_id").eq("id", pending.messageId).eq("sender_id", userId).maybeSingle();
  if (!data) return false;
  const { data: mem } = await db().from("server_members").select("user_id").eq("server_id", data.server_id).eq("user_id", userId).maybeSingle();
  return Boolean(mem);
}

/**
 * Socket hook. Never throws, never awaited by the send path.
 * @param {{ io?: object, userId: string, kind: "dm"|"server", text: string, messageId: string, serverId?: string, channelId?: string, peerId?: string }} p
 */
async function noteMessage(p) {
  const { io = null, userId, kind, text, messageId } = p || {};
  try {
    if (!userId || !messageId || done.has(String(userId))) return { skipped: "done" };
    if (!model.isRealHelloText(text)) return { skipped: "text" };
    const [account, settings] = await Promise.all([store.accountFacts(userId), store.getSettings()]);
    if (!rewards.eligible(account, settings)) {
      if (account && !model.inWindow(account.signup_at || account.created_at)) done.add(String(userId));
      return { skipped: "eligible" };
    }
    const row = await store.getRow(userId);
    if (!row) return { skipped: "schema" };
    if (row.first_hello_at) {
      done.add(String(userId));
      return { skipped: "done" };
    }
    // One pending message at a time; a newer real message replaces an undone one later.
    if (row.first_hello_pending && Date.now() - Date.parse(row.first_hello_pending.at || 0) < model.HELLO_UNDO_MS) {
      return { skipped: "pending" };
    }
    if (!(await reachesRealPerson({ userId, kind, serverId: p.serverId, peerId: p.peerId }))) return { skipped: "alone" };
    const pending = {
      kind,
      messageId: String(messageId),
      serverId: p.serverId ? String(p.serverId) : null,
      channelId: p.channelId ? String(p.channelId) : null,
      peerId: p.peerId ? String(p.peerId) : null,
      at: new Date().toISOString(),
    };
    await store.patchRow(userId, { first_hello_pending: pending });
    schedule(io, userId, model.HELLO_UNDO_MS);
    return { pending };
  } catch (err) {
    console.warn("[onboarding] first hello note failed:", err?.message || err);
    return { skipped: "error" };
  }
}

function schedule(io, userId, ms) {
  const key = String(userId);
  clearTimeout(timers.get(key));
  const t = setTimeout(() => {
    timers.delete(key);
    void finalize({ io, userId });
  }, ms);
  t.unref?.();
  timers.set(key, t);
}

/**
 * Pay the pending first message when it is still there. Idempotent: the reward claim and the
 * conditional first_hello_at update make a second run a no-op.
 */
async function finalize({ io = null, userId, now = Date.now() }) {
  try {
    const row = await store.getRow(userId, { create: false });
    const pending = row?.first_hello_pending;
    if (!row || row.first_hello_at || !pending) return { paid: false };
    if (now - Date.parse(pending.at || 0) < model.HELLO_UNDO_MS - 500) return { paid: false, waiting: true };
    if (!(await messageStillThere(pending, userId))) {
      await store.patchRow(userId, { first_hello_pending: null });
      return { paid: false, undone: true };
    }
    const lastJoin = row.last_join && pending.serverId && String(row.last_join.serverId) === pending.serverId ? row.last_join : null;
    const ref = { ...pending, slot: lastJoin?.slot || (pending.kind === "dm" ? "dm" : "other"), interest: lastJoin?.interest || null };
    const won = await store.patchRow(userId, { first_hello_at: new Date().toISOString(), first_hello_ref: ref, first_hello_pending: null }, { onlyIfNull: "first_hello_at" });
    if (!won) return { paid: false };
    done.add(String(userId));
    const pay = await rewards.payStep({ userId, step: "first_message", io });
    let badge = null;
    try {
      const sb = require("../specialBadges");
      const g = await sb.grant({ userId, badgeId: model.BADGE_ID, actorId: null, note: "onboarding first message" });
      badge = { id: model.BADGE_ID, serial: g.serial };
      // Our own celebration shows it; skip the generic "badge arrived" popup.
      if (g.rowId) await sb.markNotified(userId, [g.rowId]);
      void require("../specialBadgeNotify").broadcastProfile(io, userId);
    } catch (err) {
      if (err?.code !== "owned") console.warn("[onboarding] badge grant failed:", err?.code || err?.message || err);
    }
    const props = { slot: ref.slot, server: ref.serverId || ref.kind, interest: ref.interest || "" };
    void analytics().recordAnalyticsEvent({ userId, event: "onboarding_first_hello", props });
    try {
      io?.to?.(`user:${userId}`)?.emit?.("onboarding:first-hello", {
        amount: pay.amount,
        badge,
        serverId: ref.serverId,
        channelId: ref.channelId,
        messageId: ref.messageId,
      });
    } catch {
      /* best effort */
    }
    return { paid: true, amount: pay.amount, badge };
  } catch (err) {
    console.warn("[onboarding] first hello finalize failed:", err?.message || err);
    return { paid: false, error: true };
  }
}

/** Dashboard read: pay a pending message whose window passed (restart safety). */
async function finalizeIfDue({ io, userId, row }) {
  const pending = row?.first_hello_pending;
  if (!pending || row.first_hello_at) return null;
  if (Date.now() - Date.parse(pending.at || 0) < model.HELLO_UNDO_MS) return null;
  return finalize({ io, userId });
}

/** Undo from the dashboard: forget the pending message at once. */
async function cancelPending(userId, messageId) {
  const row = await store.getRow(userId, { create: false });
  if (!row?.first_hello_pending) return false;
  if (messageId && String(row.first_hello_pending.messageId) !== String(messageId)) return false;
  clearTimeout(timers.get(String(userId)));
  timers.delete(String(userId));
  return store.patchRow(userId, { first_hello_pending: null });
}

function __resetForTests() {
  done.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

module.exports = { noteMessage, finalize, finalizeIfDue, cancelPending, reachesRealPerson, realPeer, __resetForTests };
