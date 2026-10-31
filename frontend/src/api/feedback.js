import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { authedRequest } from "./authedHttp";

/** Geri bildirim, sender side (3.7.14): submit, my list, one thread, reply. */
export const submitFeedback = (body) => authedRequest("/api/feedback/submit", { method: "POST", body });
export const listMyFeedback = () => authedRequest("/api/me/feedback");
export const getMyFeedbackUnread = () => authedRequest("/api/me/feedback/unread");
export const getMyFeedback = (id) => authedRequest(`/api/me/feedback/${encodeURIComponent(id)}`);
export const replyMyFeedback = (id, text, attachments = []) =>
  authedRequest(`/api/me/feedback/${encodeURIComponent(id)}/reply`, { method: "POST", body: { text, attachments } });

/** One screenshot to public media storage (same endpoint the old wizard used). Returns the URL. */
export async function uploadFeedbackShot(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", "feedback");
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw new Error(data?.error || "upload failed");
  return data.url;
}
