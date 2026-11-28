// Server member list side panel ("ÜYELER"): open or closed, remembered.
//
// Owner, 28 Nov 2026: with the panel open, switching text channel, server or app
// tab (and an app reload) closed it. ChatPanel kept it in component state, reset it
// on every channel switch and remounted on every tab switch.
//
// One global choice per device (localStorage, like the voice panel's deafen pref):
// it is a layout choice, and a phone or a narrow window never shows the docked
// panel, so it does not sync between devices. It applies only where the panel docks
// beside a server: desktop layout (not the phone layout, lib/deviceLayout.js), the
// servers view, a server open, and its text channel (or the server shell with no
// channel picked). Voice / stage rooms, groups and the phone sheet keep their own
// short-lived state and neither force the panel nor change the saved choice.

export const SERVER_MEMBERS_PANEL_KEY = "descall.serverMembersPanel.v1";

const listeners = new Set();
let memory = null; // private mode: keep the choice for this session

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readServerMembersPanelOpen(store = storage()) {
  try {
    const raw = store?.getItem(SERVER_MEMBERS_PANEL_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* fall through */
  }
  return memory === true;
}

export function writeServerMembersPanelOpen(open, store = storage()) {
  const next = Boolean(open);
  memory = next;
  try {
    store?.setItem(SERVER_MEMBERS_PANEL_KEY, next ? "1" : "0");
  } catch {
    /* private mode: memory keeps it */
  }
  for (const fn of listeners) fn(next);
  return next;
}

/** useSyncExternalStore subscriber; also follows other windows (Electron pop-out, a second tab). */
export function subscribeServerMembersPanel(fn) {
  listeners.add(fn);
  const onStorage = (event) => {
    if (event?.key === SERVER_MEMBERS_PANEL_KEY) fn(readServerMembersPanelOpen());
  };
  const win = typeof window !== "undefined" ? window : null;
  win?.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(fn);
    win?.removeEventListener?.("storage", onStorage);
  };
}

/**
 * True when the docked server member list follows the saved choice.
 * channelType: the open channel's type, or "" / null for the server shell.
 */
export function serverMembersPanelDocks({ isMobile = false, activeView = "", hasServer = false, channelType = null } = {}) {
  if (isMobile) return false;
  if (activeView !== "servers" || !hasServer) return false;
  if (!channelType) return true;
  return channelType === "text" || channelType === "announcement";
}

/**
 * What the panel shows. Docked: the saved choice, hidden (not forgotten) while the
 * search bar or the pinned popover is open, as before. Elsewhere: the local state.
 */
export function resolveMembersPanelOpen({ docks = false, saved = false, local = false, searchOpen = false, pinnedOpen = false } = {}) {
  if (!docks) return Boolean(local);
  return Boolean(saved) && !searchOpen && !pinnedOpen;
}

/** Test hook. */
export function __resetServerMembersPanelPref() {
  memory = null;
  listeners.clear();
}
