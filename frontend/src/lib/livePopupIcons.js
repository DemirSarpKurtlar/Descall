import { Bell, ChatCircle, CheckCircle, Confetti, Lock, Megaphone, Siren, Warning, Wrench } from "@phosphor-icons/react/dist/ssr";
import { announcementIconOrDefault } from "./announcements";

/**
 * Canlı popup icon ids (backend lib/livePopup/model.js ICONS) -> line icons.
 * Popups from before the remake only carry the stored `emoji`; that still maps.
 */
export const LIVE_POPUP_ICONS = Object.freeze({
  megaphone: Megaphone,
  bell: Bell,
  chat: ChatCircle,
  party: Confetti,
  check: CheckCircle,
  warning: Warning,
  wrench: Wrench,
  lock: Lock,
  siren: Siren,
});

/** Picker rows per tone (first one is the default for that tone). */
export const TONE_ICONS = Object.freeze({
  info: ["megaphone", "bell", "chat", "lock"],
  success: ["party", "check", "megaphone", "wrench"],
  warning: ["wrench", "warning", "lock", "bell"],
  urgent: ["siren", "warning", "wrench", "lock"],
});

export function livePopupIcon(popup) {
  return LIVE_POPUP_ICONS[popup?.icon] || announcementIconOrDefault(popup?.emoji);
}
