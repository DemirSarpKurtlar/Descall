import { localizeMemberEventPreview } from "./groupMemberEvents.js";

/** English system previews the API stores on DM and group rows. */
const LIST_PREVIEW_KEYS = ["📞 Call", "📷 Photo", "🎤 Voice message", "📎 Attachment"];

function localizePreviewBody(body, t) {
  if (LIST_PREVIEW_KEYS.includes(body)) return t(body);
  return stripPreviewMarkdown(body);
}

/**
 * A one-line preview shows the words, not the formatting (UI audit #96):
 * "**Önemli:** yarın `22:00`" -> "Önemli: yarın 22:00". Covers the composer's
 * markdown (bold, italic, underline, strike, spoiler, inline/fenced code,
 * quotes, headings, list bullets) and keeps everything else as typed.
 */
export function stripPreviewMarkdown(text) {
  let s = String(text ?? "");
  if (!s) return s;
  s = s.replace(/```[a-z0-9_+-]*\n?([\s\S]*?)```/gi, "$1");
  s = s.replace(/`([^`\n]+)`/g, "$1");
  s = s.replace(/\|\|([\s\S]+?)\|\|/g, "$1");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+)__/g, "$1");
  s = s.replace(/~~([^~\n]+)~~/g, "$1");
  s = s.replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\s][^_\n]*?)_(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/^\s{0,3}(?:>+|#{1,6}|[-*+])\s+/gm, "");
  return s.replace(/\s*\n+\s*/g, " ").trim();
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
