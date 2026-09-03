import { authedRequest } from "./authedHttp";

export function getDmMessages(peerId, { before, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  params.set("limit", String(limit));
  return authedRequest(`/api/dm/${encodeURIComponent(peerId)}/messages?${params.toString()}`);
}

export function getDmPreviews() {
  return authedRequest("/api/dm/previews");
}
