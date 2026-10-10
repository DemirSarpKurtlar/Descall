/**
 * Success / error haptics for a message delete the user just confirmed.
 * Only the initiator is tracked, so the other participants stay quiet.
 * No ack within the timeout counts as a failure.
 */
import { hapticError, hapticSuccess } from "./fluid/haptics.js";

const DEFAULT_TIMEOUT_MS = 8000;
/** @type {Map<string, { timer: ReturnType<typeof setTimeout>, scope: string }>} */
const pending = new Map();
/** @type {Map<string, string>} */
const byScope = new Map();

export function trackMessageDelete(messageId, scope, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const id = String(messageId || "");
  if (!id) return;
  clearPending(id);
  const timer = setTimeout(() => {
    if (pending.has(id)) {
      clearPending(id);
      hapticError();
    }
  }, timeoutMs);
  pending.set(id, { timer, scope: scope ? String(scope) : "" });
  if (scope) byScope.set(String(scope), id);
}

export function resolveMessageDeleted(messageId) {
  const id = String(messageId || "");
  if (!pending.has(id)) return false;
  clearPending(id);
  hapticSuccess();
  return true;
}

export function resolveMessageDeleteFailed(messageId) {
  const id = String(messageId || "");
  if (!pending.has(id)) return false;
  clearPending(id);
  hapticError();
  return true;
}

export function resolveMessageDeleteFailedForScope(scope) {
  const id = byScope.get(String(scope || ""));
  if (!id) return false;
  return resolveMessageDeleteFailed(id);
}

function clearPending(id) {
  const row = pending.get(id);
  if (!row) return;
  clearTimeout(row.timer);
  pending.delete(id);
  if (row.scope && byScope.get(row.scope) === id) byScope.delete(row.scope);
}

export function _resetMessageDeleteFeedback() {
  for (const id of [...pending.keys()]) clearPending(id);
}
