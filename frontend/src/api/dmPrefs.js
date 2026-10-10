import { authedRequest } from "./authedHttp";

export const getDmPrefs = () => authedRequest("/api/dm/prefs");

export const patchDmPref = (peerId, body) =>
  authedRequest(`/api/dm/prefs/${encodeURIComponent(peerId)}`, {
    method: "PATCH",
    body,
  });

export { getDmMessages } from "./dm";
