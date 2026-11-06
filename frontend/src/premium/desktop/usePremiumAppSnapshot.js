/**
 * App.jsx -> Descall+ desktop windows. Publishes a small, capped snapshot (unread total,
 * online friends, recent DMs, my status) into desktopBus.appSlot and registers the app
 * actions the windows and the tray may run. Electron only; a no-op elsewhere.
 * Cheap on purpose: the work runs only when its inputs change, lists are capped at 40.
 */
import { useEffect, useMemo } from "react";
import { getPresenceStatus } from "../../lib/presence.js";
import { resolveAvatarUrl, resolveDisplayName } from "../../lib/userProfile.js";
import { publishAppState, setAppActions } from "./desktopBus.js";

const isElectron = typeof window !== "undefined" && Boolean(window.descallPremium);
const CAP = 40;

function sum(map) {
  let n = 0;
  for (const v of Object.values(map || {})) n += Math.max(0, Number(v) || 0);
  return n;
}

function slim(user, onlineUsers, unread = 0) {
  return {
    id: user.id,
    username: user.username || "",
    name: resolveDisplayName(user) || user.username || "",
    avatarUrl: resolveAvatarUrl(user) || "",
    presence: getPresenceStatus(onlineUsers, user.id),
    unread,
  };
}

export function usePremiumAppSnapshot({ me, friends, onlineUsers, dmUnread, groupUnread, dmLastActivity, myStatus, navigate, setStatus }) {
  const snapshot = useMemo(() => {
    if (!isElectron) return null;
    const list = Array.isArray(friends) ? friends : [];
    const online = list
      .filter((f) => f && f.id && getPresenceStatus(onlineUsers, f.id) !== "offline")
      .slice(0, CAP)
      .map((f) => slim(f, onlineUsers, Number(dmUnread?.[f.id]) || 0));
    const recent = list
      .filter((f) => f && f.id && (dmLastActivity?.[f.id] || dmUnread?.[f.id]))
      .sort((a, b) => (Number(dmUnread?.[b.id]) || 0) - (Number(dmUnread?.[a.id]) || 0) ||
        String(dmLastActivity?.[b.id] || "").localeCompare(String(dmLastActivity?.[a.id] || "")))
      .slice(0, CAP)
      .map((f) => slim(f, onlineUsers, Number(dmUnread?.[f.id]) || 0));
    return {
      meId: me?.id || null,
      unread: sum(dmUnread) + sum(groupUnread),
      friends: online,
      dms: recent,
      status: myStatus || "online",
    };
  }, [me?.id, friends, onlineUsers, dmUnread, groupUnread, dmLastActivity, myStatus]);

  useEffect(() => {
    if (snapshot) publishAppState(snapshot);
  }, [snapshot]);

  useEffect(() => {
    if (!isElectron) return;
    setAppActions({ navigate, setStatus });
  }, [navigate, setStatus]);
}

export default usePremiumAppSnapshot;
