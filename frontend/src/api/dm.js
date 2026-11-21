import { authedRequest } from "./authedHttp";
import { bootPrefetchOr } from "../lib/bootPrefetch.js";
import { getToken } from "../lib/storage";

const dmMessageFlight = new Map();

export function getDmMessages(peerId, { before, since, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (since && !before) params.set("since", since);
  params.set("limit", String(limit));
  const path = `/api/dm/${encodeURIComponent(peerId)}/messages?${params.toString()}`;
  const existing = dmMessageFlight.get(path);
  if (existing) return existing;
  const pending = authedRequest(path).finally(() => {
    if (dmMessageFlight.get(path) === pending) dmMessageFlight.delete(path);
  });
  dmMessageFlight.set(path, pending);
  return pending;
}

export const DM_PREVIEWS_PATH = "/api/dm/previews";
export function getDmPreviews() {
  return bootPrefetchOr("dmPreviews", getToken(), () => authedRequest(DM_PREVIEWS_PATH));
}
