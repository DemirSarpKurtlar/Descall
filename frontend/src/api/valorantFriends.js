/**
 * Adım 4 — friends / presence API surface for Dima's Companion panel.
 * List/requests: Electron local chat (valorantSecureStore).
 * Party invite: Render GLZ proxy (/api/valorant/friends/party-invite).
 */
export {
  getValorantFriendsStatus,
  shapeValorantFriends,
  inviteValorantFriendToParty,
  inviteValorantParty,
  getValorantStoreStatus,
} from "./valorant";

export {
  hasLocalFriendsApi,
  localFriends,
  localFriendRequestSend,
  localFriendRequestRemove,
  localFriendRequestAccept,
  localGetTokens,
  localStatus,
  isElectronValorant,
} from "../lib/valorantSecureStore";
