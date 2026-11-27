/**
 * The suggestion from GET /api/winback/suggestion, or null. Only an object with an id and a
 * target object counts: an empty list, an error body or an older server hides the card
 * instead of throwing on target.name (that took the whole screen down via the error boundary).
 */
export function parseSuggestion(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!raw.id || !raw.target || typeof raw.target !== "object" || Array.isArray(raw.target)) return null;
  return raw;
}

/** Growth 3B "Arkadaştan çağrı": the default message, in the caller's own words (editable). */
export function defaultCallMessage(s, t) {
  const name = s?.target?.name || "";
  const reward = s?.reward || 50;
  return s?.serverName ? t("rg3.winback.defaultMsgServer", { name, server: s.serverName, amount: reward }) : t("rg3.winback.defaultMsg", { name, amount: reward });
}
