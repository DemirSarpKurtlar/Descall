import { authedRequest } from "./authedHttp";

export const getDmPrefs = () => authedRequest("/api/dm/prefs");

export const patchDmPref = (peerId, body) =>
  authedRequest(`/api/dm/prefs/${encodeURIComponent(peerId)}`, {
    method: "PATCH",
    body,
  });

export const getDmMessages = (peerId, { before, limit = 50 } = {}) => {
  const qs = new URLSearchParams();
  if (before) qs.set("before", before);
  qs.set("limit", String(limit));
  return authedRequest(`/api/dm/${encodeURIComponent(peerId)}/messages?${qs}`);
};
