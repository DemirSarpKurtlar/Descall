import { localizeMemberEventPreview } from "./groupMemberEvents.js";
import { plainText } from "./messageMarkdown.js";

/** English system previews the API stores on DM and group rows. */
const LIST_PREVIEW_KEYS = ["📞 Call", "📷 Photo", "🎤 Voice message", "📎 Attachment"];

/** Translated label for a message that only carries media ("Fotoğraf", not "image"). */
export function mediaTypeLabel(mediaType, t = (key) => key) {
  const type = String(mediaType || "").toLowerCase();
  if (type === "image" || type === "photo") return t("📷 Photo");
  if (type === "voice" || type === "audio") return t("🎤 Voice message");
  return t("📎 Attachment");
}

function localizePreviewBody(body, t) {
  if (LIST_PREVIEW_KEYS.includes(body)) return t(body);
  return stripPreviewMarkdown(body);
}

/**
 * A one-line preview shows the words, not the formatting (UI audit #96):
 * "**Önemli:** yarın `22:00`" -> "Önemli: yarın 22:00". Uses the same parser
 * as the message renderer (lib/messageMarkdown.js), so the preview strips
 * exactly the syntax a sent message would format, then folds lines.
 */
export function stripPreviewMarkdown(text) {
  const s = String(text ?? "");
  if (!s) return s;
  return plainText(s).replace(/\s*\n+\s*/g, " ").trim();
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
  const memberEvent = localizeMemberEventPreview(raw, t);
  if (memberEvent) return memberEvent;
  const splitAt = raw.indexOf(": ");
  if (splitAt > 0 && splitAt <= 64) {
    const name = raw.slice(0, splitAt);
    const body = raw.slice(splitAt + 2);
    const localized = localizePreviewBody(body, t);
    if (localized !== body) return `${name}: ${localized}`;
  }
  return localizePreviewBody(raw, t);
}
