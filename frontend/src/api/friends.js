import { authedRequest } from "./authedHttp";
import { bootPrefetchOr } from "../lib/bootPrefetch.js";
import { getToken } from "../lib/storage";

export const blockUser = (userId) => authedRequest("/api/friends/block", { method: "POST", body: { userId } });
export const unblockUser = (userId) => authedRequest("/api/friends/unblock", { method: "POST", body: { userId } });
export const getBlockedUsers = () => authedRequest("/api/friends/blocked");
export const getFriendSuggestions = (limit = 12) =>
  authedRequest(`/api/friends/suggestions?limit=${limit}`);

/** REST bootstrap for chats/friends sidebar when socket friend:list is delayed. */
export const FRIENDS_LIST_PATH = "/api/friends/list";
export const getFriendsList = () =>
  bootPrefetchOr("friends", getToken(), () => authedRequest(FRIENDS_LIST_PATH));
export const getFriendRequestsList = () => authedRequest("/api/friends/requests");
export const sendFriendRequest = (username) =>
  authedRequest("/api/friends/request", { method: "POST", body: { username } });
