/**
 * Settings > Desktop app > "Unread count on the app icon" (every user, on by default). The
 * desktop shells draw the Discord-like badge (electron/taskbarBadge.cjs, Tauri
 * crate::taskbar) from the tray state's badgeCount, which hooks/useDesktopTray.js fills with
 * badgeCountFor(). Kept per device in localStorage, like the other desktop look switches.
 */

export const TASKBAR_BADGE_KEY = "descall:taskbar-badge";

const listeners = new Set();

/** On unless the user turned it off on this device. */
export function readTaskbarBadge() {
  try {
    return globalThis.localStorage?.getItem(TASKBAR_BADGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setTaskbarBadge(on) {
  try {
    if (on) globalThis.localStorage?.removeItem(TASKBAR_BADGE_KEY);
    else globalThis.localStorage?.setItem(TASKBAR_BADGE_KEY, "0");
  } catch {
    /* private mode: this session only */
  }
  for (const fn of [...listeners]) {
    try {
      fn(Boolean(on));
    } catch {
      /* ignore */
    }
  }
}

export function subscribeTaskbarBadge(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The count the shell shows: the unread total the tray panel and the rail already use (DMs +
 * groups), for every plan; 0 (no badge) when signed out or turned off.
 */
export function badgeCountFor({ signedIn, unread, enabled }) {
  if (!signedIn || !enabled) return 0;
  const n = Math.floor(Number(unread));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
