import { t } from "../i18n/runtime.js";
import { serverMessage } from "../i18n/serverText.js";

/**
 * Message for a failed API response, in the viewer's language.
 *
 * The server speaks English (backend/lib/apiError.js): `{ error }` or
 * `{ error, errorKey, errorVars }`, sometimes `{ message }`. Every fetch
 * wrapper builds its Error with this, so the many `setError(err.message)`
 * call sites show Turkish / German / ... text instead of the raw English.
 * The untranslated server text stays on `err.serverText`.
 */
export function serverErrorText(body) {
  if (!body || typeof body !== "object") return typeof body === "string" ? t(body) : "";
  return serverMessage(body, "error") || serverMessage(body, "message") || "";
}

/** Error for a non-OK response: translated message, status, code and the raw body fields. */
export function httpError(body, status) {
  const data = body && typeof body === "object" ? body : {};
  const err = new Error(serverErrorText(data) || t("Something went wrong."));
  err.status = status;
  err.serverText = (typeof data.error === "string" && data.error) || (typeof data.message === "string" && data.message) || "";
  return err;
}
