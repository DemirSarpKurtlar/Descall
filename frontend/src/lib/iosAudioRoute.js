/**
 * Native iOS call audio output (receiver / speaker / Bluetooth / headset).
 *
 * WKWebView on iOS ignores HTMLMediaElement.setSinkId and lists no audio
 * outputs, so the in-call audio menu talks to DescallAudioRouter
 * (ios/App/App/DescallCallManager.swift) through the DescallCallKit plugin.
 * Inert on web, Electron and Android (IOS_NATIVE is false there).
 */
import { IOS_NATIVE, callKitPlugin, initIosCallKit, tapCallKitEvents } from "./iosCallKit";

const EMPTY = Object.freeze({ active: false, current: "", selected: "", routes: Object.freeze([]) });

let state = EMPTY;
const subscribers = new Set();
let tapped = false;
let begun = false;

function normalize(raw) {
  if (!raw || typeof raw !== "object") return EMPTY;
  const routes = Array.isArray(raw.routes)
    ? raw.routes
        .filter((r) => r && typeof r.id === "string" && r.id)
        .map((r) => Object.freeze({ id: r.id, kind: String(r.kind || "other"), name: String(r.name || "") }))
    : [];
  return Object.freeze({
    active: Boolean(raw.active),
    current: String(raw.current || ""),
    selected: String(raw.selected || ""),
    routes: Object.freeze(routes),
  });
}

function setState(raw) {
  const next = normalize(raw);
  const same =
    next.active === state.active &&
    next.current === state.current &&
    next.selected === state.selected &&
    next.routes.length === state.routes.length &&
    next.routes.every((r, i) => r.id === state.routes[i].id && r.kind === state.routes[i].kind && r.name === state.routes[i].name);
  if (same) return;
  state = next;
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function ensureTap() {
  if (!IOS_NATIVE || tapped) return;
  tapped = true;
  tapCallKitEvents((name, data) => {
    if (name === "audioRoute") setState(data);
  });
}

export function subscribeIosAudioRoute(fn) {
  ensureTap();
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getIosAudioRouteSnapshot() {
  return state;
}

const owners = new Set();

/**
 * Settings default for call audio on this iPhone: "speaker" | "receiver" | ""
 * (system default = loudspeaker unless headphones / Bluetooth). Mirrored to
 * native (UserDefaults) so a call answered with the app closed honours it.
 */
export const IOS_OUTPUT_PREF_KEY = "descall:ios-call-output";

function prefStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readIosCallAudioPreference(storage = prefStorage()) {
  try {
    const v = storage?.getItem(IOS_OUTPUT_PREF_KEY) || "";
    return v === "receiver" || v === "speaker" ? v : "";
  } catch {
    return "";
  }
}

export async function writeIosCallAudioPreference(route, storage = prefStorage()) {
  const v = route === "receiver" || route === "speaker" ? route : "";
  try {
    if (v) storage?.setItem(IOS_OUTPUT_PREF_KEY, v);
    else storage?.removeItem(IOS_OUTPUT_PREF_KEY);
  } catch {
    /* private mode */
  }
  if (!IOS_NATIVE) return;
  try {
    await initIosCallKit();
    setState(await callKitPlugin.setCallAudioPreference({ route: v }));
  } catch {
    /* older native build without the method: the next call's begin carries it */
  }
}

/** Re-read the live route (e.g. a settings screen opened mid-call). */
export async function refreshIosAudioRoute() {
  if (!IOS_NATIVE) return;
  ensureTap();
  try {
    await initIosCallKit();
    setState(await callKitPlugin.getAudioRoute());
  } catch {
    /* ignore */
  }
}

/**
 * A call is ringing out or active. Output is the loudspeaker unless wired
 * headphones or Bluetooth are connected. `owner` lets a DM and a group call
 * share the route without one ending the other's session.
 */
export async function beginIosCallAudio({ video = false, owner = "dm" } = {}) {
  if (!IOS_NATIVE) return;
  ensureTap();
  owners.add(owner);
  begun = true;
  try {
    await initIosCallKit();
    const preferred = readIosCallAudioPreference();
    setState(await callKitPlugin.beginCallAudio({ video: Boolean(video), ...(preferred ? { preferred } : {}) }));
  } catch (err) {
    console.warn("[CallAudio] route begin failed:", err?.message || err);
  }
}

export async function endIosCallAudio(owner = "dm") {
  if (!IOS_NATIVE) return;
  owners.delete(owner);
  if (owners.size || !begun) return;
  begun = false;
  setState(EMPTY);
  try {
    await callKitPlugin.endCallAudio();
  } catch {
    /* ignore */
  }
}

/** id: "receiver" | "speaker" | "system" | "input:<uid>" */
export async function selectIosAudioRoute(id) {
  if (!IOS_NATIVE || !id) return;
  ensureTap();
  try {
    setState(await callKitPlugin.setAudioRoute({ route: String(id) }));
  } catch (err) {
    console.warn("[CallAudio] route select failed:", err?.message || err);
  }
  // iOS settles on the new route a moment later (the native side also emits
  // an "audioRoute" event then); read it so the menu shows what is playing.
  setTimeout(() => void refreshIosAudioRoute(), 700);
}

/** Owners currently holding the call audio route ("dm" | "group" | "server"). */
export function iosCallAudioOwners() {
  return [...owners];
}

/** Route list in the shape of enumerateDevices() output for the existing menus. */
export function iosRoutesAsOutputDevices(snapshot, t) {
  const label = (route) => {
    switch (route.kind) {
      case "receiver":
        return "iPhone";
      case "speaker":
        return t("Loudspeaker");
      case "bluetooth":
        return route.name || "Bluetooth";
      case "headphones":
        return route.name || t("Headphones");
      case "car":
        return route.name || "CarPlay";
      case "airplay":
        return route.name || "AirPlay";
      default:
        return route.name || t("Default");
    }
  };
  return (snapshot?.routes || []).map((route) => ({
    deviceId: route.id,
    kind: "audiooutput",
    label: label(route),
    groupId: "",
  }));
}

/** Non-personal audio session snapshot for diagnostics (no device names). */
export async function getIosAudioDiagnostics() {
  if (!IOS_NATIVE) return null;
  try {
    return await callKitPlugin.getAudioDiagnostics();
  } catch {
    return null;
  }
}

/** Ask WebKit to resume microphone capture it muted (audio session interruption). */
export async function reactivateIosCapture() {
  if (!IOS_NATIVE) return null;
  try {
    return await callKitPlugin.reactivateCapture();
  } catch {
    return null;
  }
}
