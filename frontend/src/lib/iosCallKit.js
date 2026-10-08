/**
 * Native iOS only: CallKit + PushKit VoIP bridge (plugin "DescallCallKit",
 * frontend/ios/App/App/DescallCallKitPlugin.swift).
 *
 * Everything here is inert on web, Electron and Android: IOS_NATIVE is false
 * there and no plugin method is ever called.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { API_BASE_URL } from "../config/api";
import { getToken } from "./storage";
import { setCallKitEnabled } from "./iosCallKitState";

export const IOS_NATIVE =
  typeof window !== "undefined" &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios";

export const VOIP_PLATFORM = "ios_voip";
const STORED_TOKEN_KEY = "descall.iosVoipToken";

function storedToken() {
  try {
    return window.localStorage?.getItem(STORED_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function storeToken(value) {
  try {
    if (value) window.localStorage?.setItem(STORED_TOKEN_KEY, value);
    else window.localStorage?.removeItem(STORED_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const callKitPlugin = registerPlugin("DescallCallKit");

let initPromise = null;
let enabled = false;
let voipToken = null;
let uploadedFor = ""; // `${authToken}|${voipToken}` already registered
const handlers = new Set();
const backlog = []; // events that arrived before the hook subscribed

function dispatch(name, data) {
  if (!name) return;
  if (name === "voipToken") {
    voipToken = data?.token || null;
    void syncIosVoipToken();
  } else if (name === "voipTokenInvalidated") {
    const old = data?.token || voipToken;
    voipToken = null;
    uploadedFor = "";
    if (old) void deleteVoipToken(getToken(), old);
  }
  if (!handlers.size) {
    backlog.push([name, data || {}]);
    if (backlog.length > 64) backlog.shift();
    return;
  }
  handlers.forEach((fn) => {
    try {
      fn(name, data || {});
    } catch (err) {
      console.warn("[CallKit] handler failed:", err?.message || err);
    }
  });
}

/** Subscribe to CallKit events (answer / end / mute / ...). Flushes the backlog. */
export function onCallKitEvent(fn) {
  handlers.add(fn);
  if (backlog.length) {
    const pending = backlog.splice(0, backlog.length);
    pending.forEach(([name, data]) => {
      try {
        fn(name, data);
      } catch (err) {
        console.warn("[CallKit] handler failed:", err?.message || err);
      }
    });
  }
  return () => handlers.delete(fn);
}

export function isIosCallKitEnabled() {
  return enabled;
}

export function initIosCallKit() {
  if (!IOS_NATIVE) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const res = await callKitPlugin.isAvailable();
      if (!res?.available) {
        // e.g. device region changed to mainland China: stop VoIP rings for
        // a token registered earlier (the app no longer handles them).
        enabled = false;
        setCallKitEnabled(false);
        void cleanupStaleVoipToken();
        return false;
      }
      await callKitPlugin.addListener("callkitEvent", (e) => dispatch(e?.event, e?.data));
      enabled = true;
      setCallKitEnabled(true);
      const { events } = (await callKitPlugin.drainEvents()) || {};
      (events || []).forEach((e) => dispatch(e?.event, e?.data));
      if (!voipToken) {
        const t = await callKitPlugin.getVoipToken().catch(() => null);
        if (t?.token) voipToken = t.token;
      }
      void syncIosVoipToken();
      return true;
    } catch (err) {
      console.warn("[CallKit] init failed:", err?.message || err);
      enabled = false;
      setCallKitEnabled(false);
      return false;
    }
  })();
  return initPromise;
}

async function deleteVoipToken(authToken, token) {
  if (!authToken || !token) return;
  try {
    await fetch(`${API_BASE_URL}/api/web-push/fcm-token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* best effort */
  }
}

/** Register this iPhone's VoIP token for the signed-in user (platform ios_voip). */
export async function syncIosVoipToken() {
  if (!IOS_NATIVE || !enabled || !voipToken) return false;
  const auth = getToken();
  if (!auth) return false;
  const key = `${auth}|${voipToken}`;
  if (uploadedFor === key) return true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/web-push/fcm-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: voipToken, platform: VOIP_PLATFORM }),
    });
    if (!response.ok) throw new Error(`VoIP token upload failed (${response.status})`);
    uploadedFor = key;
    storeToken(voipToken);
    return true;
  } catch (err) {
    console.warn("[CallKit] VoIP token upload failed:", err?.message || err);
    return false;
  }
}

/** CallKit unavailable here: remove a VoIP token this app registered before. */
export async function cleanupStaleVoipToken() {
  if (!IOS_NATIVE || enabled) return;
  const stale = storedToken();
  const auth = getToken();
  if (!stale || !auth) return;
  await deleteVoipToken(auth, stale);
  storeToken("");
}

/** On logout: stop ringing this iPhone for the account being signed out. */
export async function unregisterIosVoipToken(authToken) {
  if (!IOS_NATIVE || !voipToken) return;
  uploadedFor = "";
  await deleteVoipToken(authToken, voipToken);
}

export function newCallUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (IOS_NATIVE) void initIosCallKit();
