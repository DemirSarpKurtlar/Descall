/**
 * Client poll state (2.12.0). Snapshots come only from the server: results are
 * hidden until you vote, so nothing is computed locally except the optimistic
 * check mark while a vote is in flight.
 *
 *  - ensurePoll(scope, messageId)  batches `poll:get` (≤100 ids per scope, 40 ms)
 *  - `poll:changed` from the room  refetches that message's snapshot (no counts in the event)
 *  - vote / close / edit / voters  ack-based socket calls (client-side errors in the UI language)
 */
import { getLocale, t } from "../i18n/runtime.js";
import { formatDate, formatTime, formatNumber } from "../i18n/format.js";
import { APP_TIMEZONE } from "./datetime.js";

const byMessage = new Map(); // messageId → snapshot
const listeners = new Map(); // messageId → Set<fn>
const scopeOf = new Map(); // messageId → scope
const pending = new Map(); // scope → Set<messageId>
let flushTimer = null;
let socketRef = null;
let boundSocket = null;

function notify(messageId) {
  for (const fn of listeners.get(messageId) || []) {
    try {
      fn(byMessage.get(messageId) || null);
    } catch {
      /* listener errors stay local */
    }
  }
}

export function setPollSnapshot(snapshot) {
  if (!snapshot?.messageId) return;
  const prev = byMessage.get(snapshot.messageId);
  if (prev?.viewerSpecific && !snapshot.viewerSpecific) return;
  if (prev && Number(prev.version) > Number(snapshot.version) && prev.revealed === snapshot.revealed) return;
  byMessage.set(snapshot.messageId, snapshot);
  if (snapshot.scope) scopeOf.set(snapshot.messageId, snapshot.scope);
  notify(snapshot.messageId);
}

export function getPollSnapshot(messageId) {
  return byMessage.get(messageId) || null;
}

export function subscribePoll(messageId, fn) {
  if (!listeners.has(messageId)) listeners.set(messageId, new Set());
  listeners.get(messageId).add(fn);
  return () => listeners.get(messageId)?.delete(fn);
}

function call(event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const s = socketRef;
    if (!s || !s.connected) {
      resolve({ ok: false, code: "OFFLINE", message: t("polls.store.offline") });
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, code: "TIMEOUT", message: t("polls.store.timeout") });
    }, timeoutMs);
    s.emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res || { ok: false, code: "POLL_ERROR", message: t("polls.store.failed") });
    });
  });
}

function flush() {
  flushTimer = null;
  for (const [scope, ids] of pending) {
    const list = [...ids];
    pending.delete(scope);
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      call("poll:get", { scope, messageIds: chunk }).then((res) => {
        if (!res?.ok) return;
        for (const snap of res.polls || []) setPollSnapshot({ ...snap, viewerSpecific: true });
      });
    }
  }
}

export function ensurePoll(scope, messageId, { force = false } = {}) {
  if (!scope || !messageId || String(messageId).startsWith("temp-")) return;
  scopeOf.set(messageId, scope);
  if (!force && byMessage.has(messageId) && byMessage.get(messageId).viewerSpecific) return;
  if (!pending.has(scope)) pending.set(scope, new Set());
  pending.get(scope).add(messageId);
  if (!flushTimer) flushTimer = setTimeout(flush, 40);
}

function onChanged(evt) {
  const messageId = evt?.messageId;
  if (!messageId || !scopeOf.has(messageId)) return;
  const cur = byMessage.get(messageId);
  if (cur && !evt.structural && !evt.closed && Number(cur.version) >= Number(evt.version)) return;
  ensurePoll(evt.scope || scopeOf.get(messageId), messageId, { force: true });
}

function onReconnect() {
  for (const [messageId, scope] of scopeOf) if (listeners.get(messageId)?.size) ensurePoll(scope, messageId, { force: true });
}

/** Called by the message list with the live socket. Idempotent. */
export function bindPollSocket(socket) {
  socketRef = socket || null;
  if (!socket || boundSocket === socket) return;
  if (boundSocket) {
    boundSocket.off?.("poll:changed", onChanged);
    boundSocket.off?.("connect", onReconnect);
  }
  boundSocket = socket;
  socket.on("poll:changed", onChanged);
  socket.on("connect", onReconnect);
}

function mark(res) {
  if (res?.ok && res.poll) setPollSnapshot({ ...res.poll, viewerSpecific: true });
  return res;
}

export async function votePoll(snapshot, optionIds) {
  const res = await call("poll:vote", { pollId: snapshot.id, optionIds });
  return mark(res);
}
export async function closePollNow(snapshot) {
  return mark(await call("poll:close", { pollId: snapshot.id }));
}
export async function editPollNow(snapshot, poll) {
  return mark(await call("poll:edit", { pollId: snapshot.id, poll }));
}
export async function loadPollVoters(snapshot) {
  return call("poll:voters", { pollId: snapshot.id });
}

const unit = (value, u, unitDisplay, locale) => formatNumber(value, locale, { style: "unit", unit: u, unitDisplay });

/** Time left in the UI language ("42 dk. kaldı" / "42 min left", "3 gün kaldı" / "3 days left"). */
export function pollTimeLeft(endsAt, now = Date.now()) {
  const locale = getLocale();
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return t("polls.ended");
  const min = Math.ceil(ms / 60000);
  const h = Math.round(ms / 3600000);
  const span =
    min < 60 ? unit(min, "minute", "short", locale) : h < 48 ? unit(h, "hour", "short", locale) : unit(Math.round(ms / 86400000), "day", "long", locale);
  return t("polls.timeLeft", { span });
}

/** "18 Eki 23:54" / "18 Oct 23:54" (Europe/Istanbul, like the rest of the poll UI). */
export function pollDateTime(at, locale = getLocale(), { year = false } = {}) {
  const d = new Date(at);
  if (!at || !Number.isFinite(d.getTime())) return "";
  const day = formatDate(d, locale, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: APP_TIMEZONE });
  const time = formatTime(d, locale, { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE });
  return `${day} ${time}`;
}

export function pollEndedAt(snapshot, locale = getLocale()) {
  return pollDateTime(snapshot?.closedAt || snapshot?.endsAt, locale);
}

/** Test hook. */
export function __resetPollStore() {
  byMessage.clear();
  listeners.clear();
  scopeOf.clear();
  pending.clear();
  socketRef = null;
  boundSocket = null;
}
