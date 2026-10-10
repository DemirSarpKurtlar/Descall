/**
 * Success / error haptics for a message edit the user just saved from the
 * composer. Only the initiator is tracked. No ack within the timeout counts
 * as a failure and leaves the edit open (the caller decides that).
 */
import { hapticError, hapticSuccess } from "./fluid/haptics.js";

const DEFAULT_TIMEOUT_MS = 8000;

/** @type {null | { id: string, timer: ReturnType<typeof setTimeout>, onSuccess?: () => void, onError?: () => void }} */
let pending = null;

export function trackMessageEdit(messageId, { onSuccess, onError, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const id = String(messageId || "");
  if (!id) return;
  clearPending();
  const timer = setTimeout(() => {
    if (pending?.id !== id) return;
    const fail = pending.onError;
    pending = null;
    hapticError();
    fail?.();
  }, timeoutMs);
  pending = { id, timer, onSuccess, onError };
}

export function resolveMessageEdited(messageId) {
  const id = String(messageId || "");
  if (!pending || pending.id !== id) return false;
  const ok = pending.onSuccess;
  clearPending();
  hapticSuccess();
  ok?.();
  return true;
}

export function resolveMessageEditFailed(messageId) {
  const id = String(messageId || "");
  if (!pending || pending.id !== id) return false;
  const fail = pending.onError;
  clearPending();
  hapticError();
  fail?.();
  return true;
}

/** Drop a pending edit without a haptic (the user cancelled, or left the chat). */
export function cancelMessageEdit(messageId) {
  if (!pending) return;
  if (messageId && pending.id !== String(messageId)) return;
  clearPending();
}

function clearPending() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending = null;
}

export function _resetMessageEditFeedback() {
  clearPending();
}
