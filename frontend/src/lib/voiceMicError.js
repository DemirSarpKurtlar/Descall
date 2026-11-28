import { isNativeIosShell } from "./voiceCaptureRegistry.js";

/** Map getUserMedia failures to existing i18n source strings. */
export function voiceMicErrorCopy(err) {
  const name = String(err?.name || "");
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphones found";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission required";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Microphone is already in use by another app.";
  }
  if (name === "OverconstrainedError") {
    return "The selected microphone was not found.";
  }
  return "Could not access the microphone.";
}

export function isVoiceMicError(err) {
  const name = String(err?.name || "");
  return (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotReadableError" ||
    name === "TrackStartError"
  );
}

/** The capture was refused (by the user, the OS or the browser), not a device problem. */
export function isMicPermissionError(err) {
  const name = String(err?.name || "");
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

export const MIC_OFF_IN_SETTINGS = "Microphone is off for Descall. Turn it on in Settings.";
export const MIC_STILL_BLOCKED = "Microphone is still blocked. Allow it in your browser or system settings.";
export const MIC_ALLOWED_TRY_AGAIN = "Microphone allowed. Try again.";

const MIC_STATES = ["granted", "denied", "restricted", "prompt"];

function displayPlugin(win) {
  try {
    return win?.Capacitor?.Plugins?.DescallDisplay || null;
  } catch {
    return null;
  }
}

/**
 * iOS app: the system (TCC) microphone permission, "granted" | "denied" |
 * "restricted" | "prompt", or null where it cannot be read (web, Android,
 * desktop, or an iOS binary without DescallDisplay.getMicrophonePermission).
 */
export async function nativeMicPermission(win = typeof window !== "undefined" ? window : null) {
  if (!isNativeIosShell(win)) return null;
  const plugin = displayPlugin(win);
  if (typeof plugin?.getMicrophonePermission !== "function") return null;
  try {
    const r = await plugin.getMicrophonePermission();
    return MIC_STATES.includes(r?.state) ? r.state : null;
  } catch {
    return null;
  }
}

/** iOS app: open Descall's page in the Settings app. False where that is not possible. */
export async function openNativeAppSettings(win = typeof window !== "undefined" ? window : null) {
  const plugin = displayPlugin(win);
  if (!isNativeIosShell(win) || typeof plugin?.openAppSettings !== "function") return false;
  try {
    await plugin.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * What a refused microphone offers (pure).
 *
 * iOS asks for the microphone once. After "Don't Allow" (or Screen Time
 * "restricted") getUserMedia fails at once and nothing is shown again: only
 * the Settings app can turn it back on. The old "Allow" button called
 * getUserMedia again, which on iOS can never prompt, so tapping it did
 * nothing and the user kept "allowing" (4.1.4 feedback). There the toast
 * opens Settings instead.
 */
export function micBlockedPlan({ nativeIos = false, permission = null, canOpenSettings = false } = {}) {
  if (nativeIos && (permission === "denied" || permission === "restricted")) {
    return { message: MIC_OFF_IN_SETTINGS, action: canOpenSettings ? "settings" : null };
  }
  return { message: null, action: "ask" };
}

function settingsToast({ toast, t, icon, win }) {
  const canOpen = typeof displayPlugin(win)?.openAppSettings === "function";
  toast(t(MIC_OFF_IN_SETTINGS), "error", {
    icon,
    duration: 10000,
    ...(canOpen ? { actionLabel: t("Open Settings"), onOpen: () => { openNativeAppSettings(win); } } : {}),
  });
}

/**
 * "Allow" tapped: ask for the microphone again. Granted -> run `retry` (the
 * call / voice join / recording the user wanted), or say it is allowed now.
 * Still refused -> say where to turn it on; never a silent no-op.
 */
export async function askMicAgain({ toast, t, icon, retry, win = typeof window !== "undefined" ? window : null, getUserMedia } = {}) {
  const gum = getUserMedia || ((c) => win?.navigator?.mediaDevices?.getUserMedia?.(c) ?? Promise.reject(Object.assign(new Error("no getUserMedia"), { name: "NotFoundError" })));
  try {
    const stream = await gum({ audio: true });
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch (err) {
    if (isMicPermissionError(err)) {
      if (isNativeIosShell(win)) settingsToast({ toast, t, icon, win });
      else toast(t(MIC_STILL_BLOCKED), "error", { icon, duration: 8000 });
      return "blocked";
    }
    toast(t(voiceMicErrorCopy(err)), "error");
    return "failed";
  }
  if (typeof retry === "function") {
    try {
      retry();
    } catch {
      /* the retried action reports its own errors */
    }
    return "retried";
  }
  toast(t(MIC_ALLOWED_TRY_AGAIN), "info");
  return "allowed";
}

/**
 * Toast for a failed microphone capture (UI audit #66, 4.2.1). A refused
 * microphone gets the MicOff icon and either "Open Settings" (iOS, refused
 * in the system) or "Allow", which asks again and then retries the action.
 * Other errors keep their plain message. Resolves with what it showed.
 *
 * @param {object} o
 * @param {(msg: string, type?: string, opts?: object) => void} o.toast
 * @param {(key: string) => string} o.t
 * @param {any} [o.MicOffIcon]
 * @param {() => void} [o.retry]  run again once the microphone is allowed
 * @param {string} [o.askMessage] i18n source string of the "Allow" toast
 */
export async function voiceMicErrorToast(err, { toast, t, MicOffIcon, retry, askMessage = "Allow microphone access to call", win = typeof window !== "undefined" ? window : null, getUserMedia } = {}) {
  if (!isMicPermissionError(err)) {
    toast(t(voiceMicErrorCopy(err)), "error");
    return "copy";
  }
  const nativeIos = isNativeIosShell(win);
  const permission = nativeIos ? await nativeMicPermission(win) : null;
  const plan = micBlockedPlan({ nativeIos, permission, canOpenSettings: typeof displayPlugin(win)?.openAppSettings === "function" });
  if (plan.message) {
    settingsToast({ toast, t, icon: MicOffIcon, win });
    return plan.action || "settings-text";
  }
  toast(t(askMessage), "error", {
    icon: MicOffIcon,
    duration: 8000,
    actionLabel: t("Allow"),
    onOpen: () => {
      askMicAgain({ toast, t, icon: MicOffIcon, retry, win, getUserMedia });
    },
  });
  return "ask";
}
