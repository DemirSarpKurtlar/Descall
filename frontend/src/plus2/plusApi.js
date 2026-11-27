/**
 * Descall+ 2.0 API client (/api/plus/*, backend routes/plus.js). Every call carries the platform
 * header (prices and switches are per platform). Errors carry .code (the server's error code).
 */
import { apiBase, failoverOnTransportError } from "../lib/nodeRouting";
import { getToken } from "../lib/storage";
import { platformHeaders } from "./platform.js";

let fetchOverride = null;
/** Harness / tests: (path, init) => Promise<{ status, body }>. */
export function setPlusFetch(fn) {
  fetchOverride = typeof fn === "function" ? fn : null;
}

export async function plusRequest(path, { method = "GET", body, signal } = {}) {
  const init = {
    method,
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...platformHeaders(),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  let status;
  let data;
  if (fetchOverride) {
    const out = await fetchOverride(`/api/plus${path}`, init);
    status = out.status;
    data = out.body;
  } else {
    const res = await fetch(`${apiBase()}/api/plus${path}`, init).catch(failoverOnTransportError);
    status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (status < 200 || status >= 300) {
    const err = new Error(data?.code || data?.error || `http_${status}`);
    err.code = data?.code || data?.error || `http_${status}`;
    err.status = status;
    err.detail = data?.detail || null;
    throw err;
  }
  return data;
}

const P = (method, path, body) => plusRequest(path, { method, body });

export const getOffer = () => P("GET", "/offer");
export const getHub = () => P("GET", "/hub");
export const getMe = () => P("GET", "/me");
export const getLimits = (serverId) => P("GET", `/limits${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ""}`);
export const decidePaywall = (moment, serverId = null) => P("POST", "/paywall/decide", { moment, serverId });
export const trackPaywall = (moment, action, extra = {}) => P("POST", "/paywall/track", { moment, action, ...extra }).catch(() => null);

export const boost = (serverId) => P("POST", "/boosts", { serverId, requestId: `boost:${serverId}:${Date.now().toString(36)}` });
export const moveBoost = (boostId, serverId) => P("POST", `/boosts/${encodeURIComponent(boostId)}/move`, { serverId });
export const cancelBoostMove = (boostId) => P("POST", `/boosts/${encodeURIComponent(boostId)}/cancel-move`);
export const setBoostWall = (boostId, showOnWall) => P("PATCH", `/boosts/${encodeURIComponent(boostId)}`, { showOnWall });

export const getServerBoost = (serverId) => P("GET", `/servers/${encodeURIComponent(serverId)}`);
export const saveServerBoostSettings = (serverId, body) => P("PUT", `/servers/${encodeURIComponent(serverId)}/settings`, body);
export const thankBoosters = (serverId, body) => P("POST", `/servers/${encodeURIComponent(serverId)}/thanks`, body);

export const createCheckout = (body) => P("POST", "/checkout", body);
export const getCheckout = (id) => P("GET", `/checkout/${encodeURIComponent(id)}`);
export const postAppleTransaction = (jws) => P("POST", "/apple/transactions", { jws });

export const getGifts = () => P("GET", "/gifts");
export const openGift = (id) => P("POST", `/gifts/${encodeURIComponent(id)}/open`);
export const recallGift = (id) => P("POST", `/gifts/${encodeURIComponent(id)}/recall`);
export const rescheduleGift = (id, deliverAt) => P("PATCH", `/gifts/${encodeURIComponent(id)}`, { deliverAt });
export const getGroup = (id) => P("GET", `/groups/${encodeURIComponent(id)}`);

export const getTickets = () => P("GET", "/tickets");
export const sendTicket = (id, userId) => P("POST", `/tickets/${encodeURIComponent(id)}/send`, { userId });
export const redeemTicket = (id) => P("POST", `/tickets/${encodeURIComponent(id)}/redeem`);

export const getCancelImpact = () => P("GET", "/cancel/impact");
export const cancelMembership = (reason, note) => P("POST", "/cancel", { reason, note });
export const resumeMembership = () => P("POST", "/resume");

export const getAsks = () => P("GET", "/asks");
export const askForGift = (toUserId, kind = "animated_profile") => P("POST", "/asks", { toUserId, kind });
export const dismissAsk = (id) => P("POST", `/asks/${encodeURIComponent(id)}/dismiss`);
export const getPrefs = () => P("GET", "/prefs");
export const setPrefs = (body) => P("PUT", "/prefs", body);
