import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { OPEN_FORWARD_EVENT } from "../../lib/forwardMessage";
import { storeReceiptsSetting } from "../../lib/readReceipts";
import { allowedIn, matchShortcut, stepConversation, OPEN_SHORTCUTS_EVENT } from "../../lib/shortcuts";
import { JUMP_UNREAD_EVENT } from "../../lib/unreadJump";
import { OPEN_NOTIFY_OPTIONS_EVENT, putPref, replaceAllPrefs } from "../../lib/notifyPrefs";
import { useToast } from "../../context/ToastContext";
import { useT } from "../../context/LocaleContext";

// Sheets load on first use (messaging phase 4): none of this is in the first paint.
const ForwardSheet = lazy(() => import("./ForwardSheet.jsx"));
const ShortcutsSheet = lazy(() => import("./ShortcutsSheet.jsx"));
const NotifyOptionsSheet = lazy(() => import("./NotifyOptionsSheet.jsx"));

const api = (path, opts) => import("../../api/authedHttp").then((m) => m.authedRequest(path, opts));

const ROW_SELECTOR = ".dm-item.conv-row, .group-item.conv-row";

/** Run a messaging shortcut (lib/shortcuts). Returns true when it did something. */
function runShortcut(id, { openHelp }) {
  if (id === "help") { openHelp(); return true; }
  if (id === "jumpUnread") { window.dispatchEvent(new CustomEvent(JUMP_UNREAD_EVENT)); return true; }
  if (id === "search") {
    const btn = document.querySelector('[data-shortcut="chat-search"]');
    if (!btn) return false;
    btn.click();
    return true;
  }
  const rows = [...document.querySelectorAll(ROW_SELECTOR)].filter((el) => el.getBoundingClientRect().width > 0);
  const active = rows.findIndex((el) => el.classList.contains("active"));
  const dir = id === "prevChat" || id === "prevUnread" ? -1 : 1;
  const unreadOnly = id === "prevUnread" || id === "nextUnread";
  const next = stepConversation(rows, active, dir, { unreadOnly, isUnread: (el) => el.classList.contains("has-unread") });
  if (!next) return false;
  next.click();
  next.scrollIntoView?.({ block: "nearest" });
  return true;
}

/**
 * App-level host for the messaging phase 4 sheets. Message menus and
 * keyboard shortcuts open them with window events, so the deep bubble tree
 * needs no new props. A sheet stays mounted after it closes so its exit
 * spring can play.
 */
export default function ChatSheetsHost({ getSocket, friends, groups, activeServer }) {
  const t = useT();
  const { toast } = useToast();
  const [forward, setForward] = useState({ open: false, message: null });
  const [help, setHelp] = useState({ open: false, mounted: false });
  const [notify, setNotify] = useState({ open: false, target: null });
  const socket = getSocket?.() || null;

  // Notification options (messaging phase 4): load mine, follow my other devices, open the sheet.
  useEffect(() => {
    api("/api/notify-prefs").then((r) => { if (Array.isArray(r?.prefs)) replaceAllPrefs(r.prefs); }).catch(() => {});
    const onOpen = (e) => { if (e?.detail?.convId) setNotify({ open: true, target: e.detail }); };
    window.addEventListener(OPEN_NOTIFY_OPTIONS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NOTIFY_OPTIONS_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdate = (pref) => putPref(pref);
    socket.on("notify-prefs:update", onUpdate);
    return () => socket.off("notify-prefs:update", onUpdate);
  }, [socket]);

  // Keyboard shortcuts (messaging phase 4, lib/shortcuts): Ctrl+/ help, Alt+↑/↓ chats,
  // Alt+Shift+↑/↓ unread chats, Shift+PageUp first unread, Ctrl+Shift+F search.
  useEffect(() => {
    const openHelp = () => setHelp({ open: true, mounted: true });
    const onKey = (e) => {
      if (e.defaultPrevented || e.repeat) return;
      const id = matchShortcut(e);
      if (!id || !allowedIn(id, e.target)) return;
      if (runShortcut(id, { openHelp })) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    };
  }, []);

  // Mirror my "Görüldü" switch so the labels follow it from the first chat on.
  useEffect(() => {
    import("../../api/authedHttp")
      .then((m) => m.authedRequest("/api/read-receipts"))
      .then((r) => { if (typeof r?.enabled === "boolean") storeReceiptsSetting(r.enabled); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onForward = (e) => {
      const message = e?.detail?.message;
      if (message) setForward({ open: true, message });
    };
    window.addEventListener(OPEN_FORWARD_EVENT, onForward);
    return () => window.removeEventListener(OPEN_FORWARD_EVENT, onForward);
  }, []);

  const channels = useMemo(() => {
    if (!activeServer?.id) return [];
    return (activeServer.channels || [])
      .filter((c) => c && c.type === "text")
      .map((c) => ({ id: c.id, name: c.name, serverId: activeServer.id, serverName: activeServer.name }));
  }, [activeServer]);

  return (
    <Suspense fallback={null}>
      {forward.message ? (
        <ForwardSheet
          open={forward.open}
          message={forward.message}
          friends={friends}
          groups={groups}
          channels={channels}
          emit={(event, data) => getSocket?.()?.emit(event, data)}
          onClose={() => setForward((f) => ({ ...f, open: false }))}
          onDone={(count) => toast(t("msg4.forward.done", { count }), "success")}
        />
      ) : null}
      {notify.target ? (
        <NotifyOptionsSheet
          open={notify.open}
          target={notify.target}
          save={(pref) => api("/api/notify-prefs", { method: "PUT", body: pref })}
          onClose={() => setNotify((n) => ({ ...n, open: false }))}
        />
      ) : null}
      {help.mounted ? <ShortcutsSheet open={help.open} onClose={() => setHelp((h) => ({ ...h, open: false }))} /> : null}
    </Suspense>
  );
}
