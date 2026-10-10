/** English system previews the API stores on DM and group rows. */
const LIST_PREVIEW_KEYS = ["📞 Call", "📷 Photo", "🎤 Voice message", "📎 Attachment"];

function localizePreviewBody(body, t) {
  if (LIST_PREVIEW_KEYS.includes(body)) return t(body);
  return body;
}

/**
 * Conversation-list subtitles. The server always sends the English token
 * ("📞 Call", "📎 Attachment"). Opening the chat used to replace that with
 * the translated string, so the same list mixed "Call" and "Arama".
 * Translate only those tokens, including "name: 📞 Call". Real messages stay.
 */
export function localizeListPreview(preview, t = (key) => key) {
  const raw = String(preview ?? "");
  if (!raw) return "";
  const splitAt = raw.indexOf(": ");
  if (splitAt > 0 && splitAt <= 64) {
    const name = raw.slice(0, splitAt);
    const body = raw.slice(splitAt + 2);
    const localized = localizePreviewBody(body, t);
    if (localized !== body) return `${name}: ${localized}`;
  }
  return localizePreviewBody(raw, t);
}
