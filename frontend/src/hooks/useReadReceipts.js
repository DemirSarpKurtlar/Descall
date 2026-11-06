import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { authedRequest } from "../api/authedHttp";
import { GROUP_MARK_READ_MS, readReceiptsSetting, subscribeReceiptsSetting } from "../lib/readReceipts";

/** My own "Görüldü" switch (mirrors Settings › Gizlilik). */
export function useReceiptsSetting() {
  return useSyncExternalStore(subscribeReceiptsSetting, readReceiptsSetting, () => true);
}

/**
 * Group read receipts for the open group: reports my read position
 * (group:mark_read, throttled, only while the window is visible) and keeps
 * the members' positions (REST on open + group:read events).
 */
export function useGroupReads({ socket, groupId, lastMessageId, enabled = true }) {
  const [reads, setReads] = useState([]);
  const sentRef = useRef({ groupId: null, at: 0, last: null });

  useEffect(() => {
    setReads([]);
    if (!groupId || !enabled) return undefined;
    let alive = true;
    authedRequest(`/api/read-receipts/groups/${encodeURIComponent(groupId)}`)
      .then((res) => { if (alive && Array.isArray(res?.reads)) setReads(res.reads); })
      .catch(() => {});
    return () => { alive = false; };
  }, [groupId, enabled]);

  useEffect(() => {
    if (!socket || !groupId) return undefined;
    const onRead = (p = {}) => {
      if (p.groupId !== groupId || !p.userId || !p.at) return;
      setReads((prev) => {
        const rest = prev.filter((r) => r.userId !== p.userId);
        return [...rest, { userId: p.userId, at: p.at }];
      });
    };
    socket.on("group:read", onRead);
    return () => socket.off("group:read", onRead);
  }, [socket, groupId]);

  // Report that I read the group: on open, on a new message, when the window comes back.
  useEffect(() => {
    if (!socket || !groupId) return undefined;
    let timer = 0;
    const send = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const s = sentRef.current;
      if (s.groupId === groupId && s.last === lastMessageId && Date.now() - s.at < GROUP_MARK_READ_MS * 4) return;
      const wait = s.groupId === groupId ? Math.max(0, GROUP_MARK_READ_MS - (Date.now() - s.at)) : 0;
      clearTimeout(timer);
      timer = setTimeout(() => {
        sentRef.current = { groupId, at: Date.now(), last: lastMessageId };
        socket.emit("group:mark_read", { groupId });
      }, wait);
    };
    send();
    const onVis = () => { if (document.visibilityState === "visible") send(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [socket, groupId, lastMessageId]);

  return reads;
}
