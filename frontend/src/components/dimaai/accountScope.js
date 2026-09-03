/**
 * Guards so DimaAI history/messages from account A cannot land on account B
 * after a fast logout → login (stale fetch, HTTP cache, leftover URL).
 */

export function shouldApplyAccountFetch({
  startedUserId,
  currentUserId,
  aborted = false,
  startedGen,
  currentGen,
} = {}) {
  if (aborted) return false;
  if (!startedUserId || !currentUserId) return false;
  if (String(startedUserId) !== String(currentUserId)) return false;
  if (startedGen != null && currentGen != null && startedGen !== currentGen) return false;
  return true;
}

export function shouldWipeConversationOnError(err) {
  if (!err) return false;
  const status = Number(err.status || err.statusCode || 0);
  if (status === 401 || status === 403 || status === 404) return true;
  const msg = String(err.message || "");
  return /\b(401|403|404)\b|not found|forbidden|unauthorized|not authorized/i.test(msg);
}
