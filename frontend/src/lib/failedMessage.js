/**
 * Messages the server refused (polish messaging-20). The optimistic row gets
 * `failed: true` from dm:error / group:message:error; the bubble then shows
 * "Gönderilemedi" with "Tekrar gönder" and "Sil" instead of a "sent" tick.
 *
 * The bubble asks the app shell through a window event (like the chat sheets):
 *   requestFailedAction("retry" | "discard", message, { conversationType, conversationId })
 * App.jsx turns a retry into the same socket emit as the first send (retryEmit)
 * with a fresh tempId, and flips the row back to "sending".
 */
import { encodeVoiceContent } from "./voiceMessage.js";

export const FAILED_ACTION_EVENT = "descall:message-failed-action";

export function isRetryable(message, conversationType) {
  if (!message?.failed) return false;
  if (conversationType !== "dm" && conversationType !== "group") return false;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  return Boolean(text || message.mediaUrl || message.poll);
}

export function newTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** [event, payload] for a resend of `message`, or null when it cannot be resent. */
export function retryEmit(message, { conversationType, conversationId, tempId }) {
  if (!isRetryable(message, conversationType) || !conversationId || !tempId) return null;
  const isVoice = message.mediaType === "voice" || message.mediaType === "audio";
  const text = isVoice ? encodeVoiceContent(message.duration || 0) : (typeof message.text === "string" ? message.text : "");
  const replyTo = message.replyTo && message.replyTo.id ? { id: message.replyTo.id } : undefined;
  const media = message.mediaUrl
    ? { mediaUrl: message.mediaUrl, mediaType: isVoice ? "voice" : message.mediaType, duration: message.duration }
    : {};
  if (conversationType === "dm") {
    return ["dm:send", {
      toUserId: conversationId,
      tempId,
      text,
      ...media,
      ...(message.mediaUrl ? { mimeType: message.mimeType, size: message.size, originalName: message.originalName } : {}),
      replyTo,
    }];
  }
  return ["group:message", { groupId: conversationId, tempId, content: text, ...media, replyTo }];
}

export function requestFailedAction(action, message, { conversationType, conversationId }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAILED_ACTION_EVENT, { detail: { action, message, conversationType, conversationId } }));
}
