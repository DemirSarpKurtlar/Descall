import { getLocale } from "../i18n/runtime.js";

/**
 * The app's UI language as Accept-Language (the browser's own can differ from it).
 * Server lists, channel history, invite previews and directory cards of localized
 * servers answer in it (backend/lib/serverL10n/decorate.js, draft C).
 */
export function uiLanguageHeaders() {
  try {
    const loc = String(getLocale() || "").trim();
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(loc) ? { "Accept-Language": loc } : {};
  } catch {
    return {};
  }
}
