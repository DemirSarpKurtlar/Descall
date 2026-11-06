/**
 * Fixed action set shared by quick actions, workspace profiles and automations. Every action
 * goes through the app's own handlers (published by the host on the app bridge); nothing
 * here can run a program or open a URL.
 *
 * Focus mode, notification profiles and audio profiles belong to other Descall+ features;
 * they are asked through window events so whichever module owns them applies the change:
 *   descall:premium:focus                  { on: boolean | null }  (null = toggle)
 *   descall:premium:notification-profile   { id }
 *   descall:premium:audio-profile          { id }
 */
import { getAppBridge, readLocal, writeLocal, logPremiumEvent } from "./bridge.js";

export const QUICK_TYPES = ["join_channel", "set_status", "open_dm", "toggle_focus", "workspace"];
export const STATUSES = ["online", "idle", "dnd", "invisible"];

function emit(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
}

export function focusOn() {
  return Boolean(readLocal("focus", false));
}

export function setFocus(on) {
  const next = on == null ? !focusOn() : Boolean(on);
  writeLocal("focus", next);
  emit("descall:premium:focus", { on: next });
  return next;
}

/** Run one action. Returns true when something was done. */
export function runAction(action) {
  const app = getAppBridge();
  const a = app.actions || {};
  if (!action || !action.type) return false;
  switch (action.type) {
    case "set_status":
      if (!STATUSES.includes(action.status)) return false;
      a.setStatus?.(action.status);
      return true;
    case "open_dm":
      if (!action.user?.id) return false;
      a.openDm?.(action.user);
      return true;
    case "join_channel":
      if (!action.serverId || !action.channel?.id) return false;
      a.joinVoice?.(action.serverId, action.channel);
      return true;
    case "toggle_focus":
      setFocus(null);
      return true;
    case "focus":
      setFocus(action.on !== false);
      return true;
    case "workspace":
    case "switch_profile":
      if (!(action.profileId)) return false;
      a.switchProfile?.(action.profileId);
      return true;
    case "open_hud":
      a.openHud?.(action.hud);
      return true;
    case "notification_profile":
      emit("descall:premium:notification-profile", { id: action.id });
      return true;
    case "audio_profile":
      emit("descall:premium:audio-profile", { id: action.id });
      return true;
    default:
      return false;
  }
}

/** Quick actions for the quick launcher (another Descall+ feature): [{ id, label, run }]. */
export function listQuickActions() {
  const items = readLocal("quickActionsCache", []);
  return (Array.isArray(items) ? items : []).map((it) => ({ id: it.id, label: it.label, run: () => { logPremiumEvent("action", it.label); return runAction(it.action); } }));
}

export function cacheQuickActions(items) {
  writeLocal("quickActionsCache", (items || []).map((i) => ({ id: i.id, label: i.label, action: i.action })));
}
