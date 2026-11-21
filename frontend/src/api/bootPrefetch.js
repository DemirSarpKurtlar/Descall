import { putBootPrefetch } from "../lib/bootPrefetch.js";
import { fetchMeNow } from "./auth";
import { authedRequest } from "./authedHttp";
import { FRIENDS_LIST_PATH } from "./friends";
import { DM_PREVIEWS_PATH } from "./dm";

/**
 * Signed-in cold start (main.jsx): send the first screen's requests while the
 * App chunk downloads and parses, instead of after App mounted and ran its
 * effects. getMe / getFriendsList / getDmPreviews take these promises (once).
 */
export function startBootPrefetch(token) {
  if (!token) return;
  putBootPrefetch("me", token, fetchMeNow(token));
  putBootPrefetch("friends", token, authedRequest(FRIENDS_LIST_PATH));
  putBootPrefetch("dmPreviews", token, authedRequest(DM_PREVIEWS_PATH));
}
