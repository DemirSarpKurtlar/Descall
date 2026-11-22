/**
 * Quick launcher vs command center: both default to Ctrl+Shift+K (product decision, not
 * changed here). A global shortcut can belong to one owner only, so with both features on and
 * the same keys, whichever registers first wins and the other stays silent (Electron
 * globalShortcut.register returns false, Tauri's global-shortcut plugin refuses the second
 * registration). These helpers let the settings panels say so instead.
 *
 * Pure apart from the small store for the shell's answer to premium:command_center:hotkey.
 */
import { useSyncExternalStore } from "react";

const MOD = { commandorcontrol: "ctrl", cmdorctrl: "ctrl", control: "ctrl", ctrl: "ctrl", command: "ctrl", cmd: "ctrl", alt: "alt", option: "alt", altgr: "alt", shift: "shift", super: "meta", meta: "meta", win: "meta" };
const ORDER = ["ctrl", "alt", "shift", "meta"];

/** Comparable form of an Electron accelerator: "ctrl+shift+k". Empty for none. */
export function accelKey(accel) {
  const parts = String(accel || "").split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return "";
  const mods = new Set();
  const keys = [];
  for (const p of parts) {
    if (MOD[p]) mods.add(MOD[p]);
    else keys.push(p);
  }
  return [...ORDER.filter((m) => mods.has(m)), ...keys].join("+");
}

export function sameAccel(a, b) {
  const x = accelKey(a);
  return Boolean(x) && x === accelKey(b);
}

/**
 * The accelerator both features want, or "" when there is no clash. Both features must be
 * unlocked for this plan (`has`) and switched on; quick_launcher is off by default, the
 * command center on.
 */
export function launcherCommandCenterClash({ has, launcher, commandCenter, custom }) {
  const allowed = typeof has === "function" ? has : () => false;
  if (!allowed("quick_launcher") || !allowed("command_center")) return "";
  if (!launcher || launcher.enabled !== true) return "";
  if (commandCenter && commandCenter.enabled === false) return "";
  const b = custom && custom.bindings && typeof custom.bindings === "object" ? custom.bindings : {};
  const customOn = !custom || custom.enabled !== false;
  const launcherAccel = customOn && Object.prototype.hasOwnProperty.call(b, "quick_launcher") ? b.quick_launcher : "CommandOrControl+Shift+K";
  const ccAccel = commandCenter && typeof commandCenter.hotkey === "string" ? commandCenter.hotkey : "CommandOrControl+Shift+K";
  return sameAccel(launcherAccel, ccAccel) ? String(ccAccel) : "";
}

// ---- the shell's answer to premium:command_center:hotkey ------------------------------------

let ccResult = null; // { ok, hotkey, accel, conflict? } of the last registration
const subs = new Set();

/** PremiumGamingHost passes the answer here; `accel` is what it asked for. */
export function setCommandCenterHotkeyResult(accel, r) {
  // "locked": the shell has not started the feature yet (its own membership check is still
  // running); the Tauri bridge sends the hotkey again once it runs. Not a registration answer.
  // Electron answers the same case with "No handler registered" (a thrown invoke).
  if (r && r.ok === false && /^(locked|web)$|no handler registered/i.test(String(r.error || ""))) return;
  const next = accel ? { ok: Boolean(r && r.ok), accel: String(accel), conflict: (r && typeof r.conflict === "string" && r.conflict) || "" } : null;
  if (JSON.stringify(next) === JSON.stringify(ccResult)) return;
  ccResult = next;
  for (const fn of [...subs]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function commandCenterHotkeyResult() {
  return ccResult;
}

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** null until the shell answered; { ok:false, accel } when the shortcut is not registered. */
export function useCommandCenterHotkeyResult() {
  return useSyncExternalStore(subscribe, commandCenterHotkeyResult, () => null);
}
