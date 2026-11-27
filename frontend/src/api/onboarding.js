/** "Başla panosu" API (frontend/backend/routes/onboarding.js). */
import { authedRequest } from "./authedHttp";

export const getOnboardingState = () => authedRequest("/api/onboarding/state");
export const saveOnboardingInterests = (interests) =>
  authedRequest("/api/onboarding/interests", { method: "PUT", body: { interests } });
export const getServerPreview = (serverId, channelId) =>
  authedRequest(
    `/api/onboarding/servers/${encodeURIComponent(serverId)}/preview${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`
  );
export const trackFirstMessage = ({ serverId, channelId, messageId }) =>
  authedRequest(
    `/api/onboarding/track?serverId=${encodeURIComponent(serverId)}&channelId=${encodeURIComponent(channelId)}&messageId=${encodeURIComponent(messageId)}`
  );
export const sendOnboardingEvent = (event, props = {}) =>
  authedRequest("/api/onboarding/event", { method: "POST", body: { event, props } }).catch(() => null);
export const setOnboardingHidden = (hidden) => authedRequest("/api/onboarding/hide", { method: "POST", body: { hidden } });
export const undoOnboardingJoin = ({ messageId, serverId }) =>
  authedRequest("/api/onboarding/undo", { method: "POST", body: { messageId, serverId } }).catch(() => null);
export const getInviteQr = () => authedRequest("/api/onboarding/invite-qr");
