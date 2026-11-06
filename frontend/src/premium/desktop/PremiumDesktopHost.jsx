/**
 * Descall+ desktop host, mounted once by App.jsx in the Electron main window (lazy).
 *
 * - Renders the portal windows (mini mode, call window, sidebar) that are open.
 * - Pushes call state and the unread count / status to Electron main
 *   (premium:call-state, premium:app-state) for the tray, taskbar and sidebar modules.
 * - Runs what main asks for: premium:open / premium:close {kind}, premium:action
 *   {action: mute|deafen|leave|status|navigate, value}.
 * Nothing opens without the entitlement: the host checks hasPremiumFeature and main
 * checks its own gate before it lets window.open through.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "../../context/LocaleContext";
import AuxWindow from "./AuxWindow.jsx";
import { CallView, SidebarView } from "./AuxViews.jsx";
import { appAction, appSlot, AUX_KINDS, callSlot, onAuxRequest, runCallAction, setAuxOpen } from "./desktopBus.js";
import { getPremiumState, hasPremiumFeature, subscribePremium } from "../premiumStore.js";

export const AUX_FEATURE = Object.freeze({ call: "pip_call", sidebar: "desktop_sidebar" });
const VIEWS = { call: CallView, sidebar: SidebarView };
const TITLES = { mini: "premium.win.mini", call: "premium.win.call", sidebar: "premium.win.sidebar" };

const bridge = () => (typeof window !== "undefined" ? window.descallPremium : null);

export default function PremiumDesktopHost() {
  const t = useT();
  const [open, setOpen] = useState([]);
  const premium = useSyncExternalStore(subscribePremium, getPremiumState, getPremiumState);

  const setKind = useCallback((kind, want) => {
    if (!AUX_KINDS.includes(kind)) return;
    setOpen((cur) => {
      const has = cur.includes(kind);
      const next = want === undefined ? !has : Boolean(want);
      if (next && !hasPremiumFeature(AUX_FEATURE[kind])) return cur;
      if (next === has) return cur;
      return next ? [...cur, kind] : cur.filter((k) => k !== kind);
    });
  }, []);

  // Requests from the app (settings panels, call UI) and from main (tray, restore, edge).
  useEffect(() => onAuxRequest(setKind), [setKind]);
  useEffect(() => {
    const b = bridge();
    if (!b) return undefined;
    const offs = [
      b.on("premium:open", (msg) => setKind(msg?.kind, true)),
      b.on("premium:close", (msg) => setKind(msg?.kind, false)),
      b.on("premium:toggle", (msg) => setKind(msg?.kind)),
      b.on("premium:action", (msg) => {
        const action = String(msg?.action || "");
        if (action === "status") appAction("setStatus", String(msg?.value || ""));
        else if (action === "navigate" && typeof msg?.value === "string" && msg.value.startsWith("/")) appAction("navigate", msg.value);
        else runCallAction(action);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [setKind]);

  // Lost access: close what the plan no longer covers.
  useEffect(() => {
    setOpen((cur) => {
      const keep = cur.filter((k) => premium.features.includes(AUX_FEATURE[k]));
      return keep.length === cur.length ? cur : keep;
    });
  }, [premium.features]);

  useEffect(() => {
    for (const k of AUX_KINDS) setAuxOpen(k, open.includes(k));
  }, [open]);

  // State for main (tray / taskbar). Call state is pushed on change; app state at most once a second.
  useEffect(() => {
    const b = bridge();
    if (!b) return undefined;
    const pushCall = (c) => {
      b.invoke("premium:call-state", { active: c.active, title: c.title, muted: c.muted, deafened: c.deafened, pending: c.pending, kind: c.kind, since: c.since }).catch(() => {});
    };
    pushCall(callSlot.get());
    const offCall = callSlot.subscribe(pushCall);
    let last = "";
    let timer = null;
    const pushApp = () => {
      timer = null;
      const a = appSlot.get();
      const key = `${a.unread}|${a.status}`;
      if (key === last) return;
      last = key;
      b.invoke("premium:app-state", { unread: a.unread, status: a.status }).catch(() => {});
    };
    pushApp();
    const offApp = appSlot.subscribe(() => { if (!timer) timer = window.setTimeout(pushApp, 1000); });
    return () => {
      offCall();
      offApp();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return open.map((kind) => {
    const View = VIEWS[kind];
    return (
      <AuxWindow key={kind} kind={kind} title={t(TITLES[kind])} onClosed={() => setKind(kind, false)}>
        <View onClose={() => setKind(kind, false)} />
      </AuxWindow>
    );
  });
}
