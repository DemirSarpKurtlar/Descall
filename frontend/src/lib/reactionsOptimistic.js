/**
 * Optimistic message reactions (Master Update A2, PR-6).
 *
 * The server state of a message's reactions lives in App.jsx buckets and is
 * patched by the `reaction:update` broadcast. This module keeps a tiny
 * overlay of *pending* local operations for the current user:
 *
 *   pending[messageId][emoji] = { op: "add" | "remove", reqId }
 *
 * `applyPending` folds that overlay over the server list, so a tap shows the
 * chip in the same frame. When the server acks (or its own echo arrives) the
 * pending entry is dropped: the base list now carries the truth. On a failed
 * ack or a 5 s timeout the entry is dropped too, which *is* the rollback
 * (the base list never changed), and the caller shows a short toast.
 *
 * Duplicate broadcasts are harmless: `applyPending` never adds a second row
 * for (messageId, emoji, userId), and App.jsx's patcher dedupes the same key.
 */

export const REACTION_ACK_TIMEOUT_MS = 5000;

/** Pure: fold pending ops for `userId` over the server reactions list. */
export function applyPending(reactions, pendingForMessage, userId, messageId = null) {
  const base = Array.isArray(reactions) ? reactions : [];
  if (!pendingForMessage || !userId) return base;
  const entries = pendingForMessage instanceof Map
    ? [...pendingForMessage.entries()]
    : Object.entries(pendingForMessage);
  if (!entries.length) return base;
  let out = base;
  for (const [emoji, p] of entries) {
    const op = p?.op;
    const has = out.some((r) => r?.emoji === emoji && r?.userId === userId);
    if (op === "add" && !has) {
      out = [...out, { emoji, userId, messageId, pending: true }];
    } else if (op === "remove" && has) {
      out = out.filter((r) => !(r?.emoji === emoji && r?.userId === userId));
    }
  }
  return out;
}

/** Pure: does `userId` currently (incl. pending) have `emoji` on the list? */
export function hasMine(reactions, emoji, userId) {
  return (Array.isArray(reactions) ? reactions : []).some(
    (r) => r?.emoji === emoji && r?.userId === userId,
  );
}

/**
 * Pure reducer used by the store and its selftest.
 * state: { [messageId]: { [emoji]: { op, reqId } } }
 */
export function reactionsReducer(state, action) {
  const s = state || {};
  const mid = action?.messageId;
  const emoji = action?.emoji;
  if (!mid || !emoji) return s;
  const cur = s[mid] || {};
  switch (action.type) {
    case "begin": {
      return { ...s, [mid]: { ...cur, [emoji]: { op: action.op, reqId: action.reqId } } };
    }
    case "settle": {
      // ack ok, ack fail (rollback) and timeout all just drop the overlay,
      // but only if the entry still belongs to this request (a newer tap wins).
      const p = cur[emoji];
      if (!p || (action.reqId && p.reqId !== action.reqId)) return s;
      const nextMsg = { ...cur };
      delete nextMsg[emoji];
      const next = { ...s };
      if (Object.keys(nextMsg).length) next[mid] = nextMsg;
      else delete next[mid];
      return next;
    }
    case "echo": {
      // Our own `reaction:update` broadcast: confirms the op if it matches.
      const p = cur[emoji];
      if (!p) return s;
      const confirmed = (p.op === "add" && !action.removed) || (p.op === "remove" && action.removed);
      if (!confirmed) return s;
      return reactionsReducer(s, { type: "settle", messageId: mid, emoji, reqId: p.reqId });
    }
    default:
      return s;
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

let state = {};
const listeners = new Set();
const boundSockets = new WeakSet();
let selfUserId = null;
let seq = 0;

function dispatch(action) {
  const next = reactionsReducer(state, action);
  if (next === state) return;
  state = next;
  for (const fn of listeners) {
    try { fn(); } catch { /* listener errors never break the store */ }
  }
}

export function subscribePending(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPendingSnapshot() {
  return state;
}

export function pendingFor(messageId) {
  return state[messageId] || null;
}

function bindEcho(socket) {
  if (!socket || typeof socket.on !== "function" || boundSockets.has(socket)) return;
  boundSockets.add(socket);
  socket.on("reaction:update", (p = {}) => {
    if (!p.messageId || !p.emoji || !p.userId) return;
    if (selfUserId && p.userId !== selfUserId) return;
    dispatch({ type: "echo", messageId: p.messageId, emoji: p.emoji, removed: !!p.removed });
  });
}

/**
 * Toggle `emoji` for the current user on a message, optimistically.
 * Returns the op that was started ("add" | "remove") or null.
 * `onFail(op)` runs on a rejected ack or timeout (after the rollback).
 */
export function toggleReaction({
  socket,
  messageId,
  conversationType,
  conversationId,
  emoji,
  userId,
  baseReactions,
  onFail,
  timeoutMs = REACTION_ACK_TIMEOUT_MS,
}) {
  if (!messageId || !conversationType || !conversationId || !emoji || !userId) return null;
  if (String(messageId).startsWith("temp-")) return null;
  selfUserId = userId;
  const effective = applyPending(baseReactions, pendingFor(messageId), userId, messageId);
  const op = hasMine(effective, emoji, userId) ? "remove" : "add";
  const reqId = `rx-${Date.now().toString(36)}-${(seq += 1)}`;
  dispatch({ type: "begin", messageId, emoji, op, reqId });

  if (!socket || typeof socket.emit !== "function" || socket.connected === false) {
    // Offline: roll back on the next tick so the user still sees the tap land
    // and then revert, with the toast explaining why.
    setTimeout(() => {
      dispatch({ type: "settle", messageId, emoji, reqId });
      onFail?.(op);
    }, 0);
    return op;
  }

  bindEcho(socket);
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const stillMine = state[messageId]?.[emoji]?.reqId === reqId;
    dispatch({ type: "settle", messageId, emoji, reqId });
    if (!ok && stillMine) onFail?.(op);
  };
  const timer = setTimeout(() => {
    // An old server (no ack support) still confirms through its echo, which
    // already settled the entry; only a still-pending op is a real failure.
    finish(false);
  }, timeoutMs);
  socket.emit(
    op === "add" ? "reaction:add" : "reaction:remove",
    { messageId, conversationType, conversationId, emoji, clientReqId: reqId },
    (res) => finish(res?.ok !== false),
  );
  return op;
}

/** Test hook: reset module state. */
export function __resetReactionsStore() {
  state = {};
  listeners.clear();
  selfUserId = null;
}
