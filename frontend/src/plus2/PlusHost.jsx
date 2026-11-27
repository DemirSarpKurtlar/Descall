/**
 * Mounted once in App.jsx (signed in, after boot). Opens the Descall+ surfaces on openPlus(...)
 * (a stack: e.g. the checkout over the hub), keeps the store live from the socket ("plus:event",
 * "plus:server", "premium:updated"), shows short live toasts (gift received / opened, boost
 * leaving, trial ending, payment problem), starts the StoreKit listener on iOS and sets the
 * account-wide screen ceiling. Renders nothing while Descall+ 2.0 is off and nothing is open.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import { Gift, Rocket, Sparkles, X } from "../components/ui/Icon.jsx";
import OverlayPortal from "../components/ui/OverlayPortal.jsx";
import { PLUS_OPEN_EVENT } from "./openPlus.js";
import { attachPlusSocket, refreshHub, refreshOffer, getPlusState } from "./plusStore.js";
import { onPlusServerEvent } from "./PlusBits.jsx";
import { setScreenCeiling } from "./screenCeiling.js";
import { startStoreListener } from "./storeKit.js";
import PlusHub from "./PlusHub.jsx";
import ServerBoostPage from "./ServerBoostPage.jsx";
import CheckoutWindow from "./CheckoutWindow.jsx";
import ManageMembership from "./ManageMembership.jsx";
import GiftTracker from "./GiftTracker.jsx";
import "./plus2.css";

const TOAST_KINDS = {
  gift_received: { key: "plus2.toast.giftReceived", icon: Gift, open: (p) => ({ view: "gift", giftId: p.giftId }) },
  gift_opened: { key: "plus2.toast.giftOpened", icon: Gift, open: (p) => ({ view: "gift", giftId: p.giftId }) },
  gift_returned: { key: "plus2.toast.giftReturned", icon: Gift, open: (p) => ({ view: "gift", giftId: p.giftId }) },
  ticket_received: { key: "plus2.toast.ticket", icon: Sparkles, open: () => ({ view: "hub" }) },
  boost_leaving: { key: "plus2.toast.boostLeaving", icon: Rocket, open: (p) => ({ view: "server", serverId: p.serverId }) },
  boost_ending: { key: "plus2.toast.boostEnding", icon: Rocket, open: (p) => ({ view: "server", serverId: p.serverId }) },
  boost_grace: { key: "plus2.toast.boostEnding", icon: Rocket, open: (p) => ({ view: "server", serverId: p.serverId }) },
  trial_ending: { key: "plus2.toast.trialEnding", icon: Sparkles, open: () => ({ view: "hub" }) },
  payment_failed: { key: "plus2.toast.paymentFailed", icon: Sparkles, open: () => ({ view: "manage" }) },
  thanks: { key: "plus2.toast.thanks", icon: Gift, open: (p) => ({ view: "server", serverId: p.serverId }) },
  streak_ticket: { key: "plus2.toast.streakTicket", icon: Sparkles, open: () => ({ view: "hub" }) },
};

export default function PlusHost({ socket, me }) {
  const t = useT();
  const [stack, setStack] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (!me?.id) return undefined;
    refreshOffer();
    const stopStore = startStoreListener();
    return () => stopStore?.();
  }, [me?.id]);

  useEffect(() => {
    const onOpen = (e) => {
      const d = e?.detail || {};
      setStack((s) => {
        if (d.view === "hub" && s.some((x) => x.view === "hub")) return s;
        return [...s, { ...d, key: `${d.view}-${Date.now()}` }];
      });
    };
    window.addEventListener(PLUS_OPEN_EVENT, onOpen);
    // ?plus=hub deep link (descall.com/app?plus=hub, notifications)
    try {
      const q = new URLSearchParams(window.location.search).get("plus");
      if (q === "hub" || q === "manage") onOpen({ detail: { view: q } });
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener(PLUS_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const detach = attachPlusSocket(socket);
    const onEvent = (p) => {
      if (p?.kind === "screen_ceiling") setScreenCeiling({ height: p.height, fps: p.fps, locked: true }, "");
      const k = TOAST_KINDS[p?.kind];
      if (!k) return;
      clearTimeout(toastTimer.current);
      setToast({ ...k, payload: p });
      toastTimer.current = setTimeout(() => setToast(null), 7000);
      refreshHub();
    };
    const onServer = (p) => onPlusServerEvent(p);
    socket.on("plus:event", onEvent);
    socket.on("plus:server", onServer);
    return () => {
      detach();
      socket.off?.("plus:event", onEvent);
      socket.off?.("plus:server", onServer);
      clearTimeout(toastTimer.current);
    };
  }, [socket]);

  const close = (key) => setStack((s) => s.filter((x) => x.key !== key));
  const top = stack.length ? stack[stack.length - 1] : null;

  return (
    <>
      {stack.map((v) => {
        const onClose = () => close(v.key);
        // Only the top window is interactive; the ones below stay mounted (state kept) but hidden.
        if (v !== top) return null;
        switch (v.view) {
          case "server": return <ServerBoostPage key={v.key} serverId={v.serverId} mode={v.mode || "page"} onClose={onClose} />;
          case "checkout": return <CheckoutWindow key={v.key} initialTab={v.tab || "self"} initialPlan={v.plan} recipientId={v.recipientId || null} recipient={v.recipient || null} moment={v.moment || null} serverId={v.serverId || null} groupId={v.groupId || null} onClose={onClose} />;
          case "manage": return <ManageMembership key={v.key} onClose={onClose} />;
          case "gift": return <GiftTracker key={v.key} giftId={v.giftId} onClose={onClose} />;
          default: return <PlusHub key={v.key} onClose={onClose} />;
        }
      })}
      {toast ? (
        <OverlayPortal>
          <div className="p2 p2-toast" role="status">
            <toast.icon />
            <button type="button" className="p2-grow" style={{ border: 0, background: "none", textAlign: "left", padding: 0 }} onClick={() => { const o = toast.open?.(toast.payload); setToast(null); if (o) window.dispatchEvent(new CustomEvent(PLUS_OPEN_EVENT, { detail: o })); }}>
              <span className="p2-small">{t(toast.key, { server: toast.payload?.serverName || "" })}</span>
            </button>
            <button type="button" className="p2-x" style={{ width: 24, height: 24 }} onClick={() => setToast(null)} aria-label={t("plus2.close")}><X size={14} /></button>
          </div>
        </OverlayPortal>
      ) : null}
    </>
  );
}

export { getPlusState };
