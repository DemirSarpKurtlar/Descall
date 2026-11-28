/**
 * Davet Merkezi host (mounted once in App for signed-in users):
 *  - opens Davet Merkezi on `descall:open-invites` (settings "Davet et", the invite card,
 *    a toast) or the /invites deep link: a window on desktop, a full-screen sheet on phones;
 *  - relays the socket events (invites:update / milestone / notice / welcome) to the open
 *    dashboard and shows toasts for paid rewards, milestones and admin notices;
 *  - after sign-up, attaches the invite channel / open (POST /api/invites/attach) once;
 *  - shows the invited friend's first-entry card once per account (InviteWelcome).
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useLocale } from "../../context/localeContextInstance.js";
import { useToast } from "../../context/ToastContext";
import { useMobile } from "../../hooks/useMobile.js";
import { useModalFocusRef } from "../../hooks/useModalFocus";
import { attachInviteOpen, getInviteWelcome, readInviteNotices } from "../../api/invites.js";
import { INVITES_UPDATE_EVENT, clearInviteOpen, peekInviteOpen } from "../../lib/inviteShare.js";
import "../../styles/invites.css";

const InviteCenter = lazy(() => import("./InviteCenter.jsx"));
const InviteWelcome = lazy(() => import("./InviteWelcome.jsx"));

export const OPEN_INVITES_EVENT = "descall:open-invites";

/** Opens Davet Merkezi from anywhere (settings row, invite card, toast action). */
export function openInviteCenter() {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_INVITES_EVENT));
  } catch {
    /* no window */
  }
}

const WELCOME_SEEN = "descall:inviteWelcomeSeen";

export default function InviteCenterHost({ socket, meId, onNavigate }) {
  const { t } = useLocale();
  const { toast } = useToast();
  const { isMobile } = useMobile();
  const [open, setOpen] = useState(false);
  const [welcome, setWelcome] = useState(null);
  const trapRef = useModalFocusRef();

  const close = useCallback(() => {
    setOpen(false);
    try {
      if (window.location.pathname === "/invites") window.history.replaceState({}, "", "/");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_INVITES_EVENT, onOpen);
    try {
      if (window.location.pathname === "/invites" || /[?&]invites=1\b/.test(window.location.search)) setOpen(true);
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener(OPEN_INVITES_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".dvt-modal-scrim, .dvt-walletpop")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Live: the dashboard refetches; the person hears about money and notices.
  useEffect(() => {
    if (!socket || !meId) return undefined;
    const ping = () => {
      try {
        window.dispatchEvent(new CustomEvent(INVITES_UPDATE_EVENT));
      } catch {
        /* ignore */
      }
    };
    const onUpdate = (p = {}) => {
      ping();
      if (p.kind === "paid" && p.amount > 0) toast(t("dvt.toast.paid", { amount: p.amount }), "success", { actionLabel: t("dvt.title"), onOpen: () => setOpen(true) });
      if (p.kind === "signup") toast(t("dvt.toast.signup"), "info", { actionLabel: t("dvt.title"), onOpen: () => setOpen(true) });
    };
    const onMilestone = (p = {}) => {
      ping();
      toast(t("dvt.toast.milestone", { at: p.at, amount: p.amount }), "success", { actionLabel: t("dvt.title"), onOpen: () => setOpen(true) });
    };
    const onNotice = (p = {}) => {
      ping();
      if (!p.text) return;
      toast(p.text, "info", {
        duration: 12000,
        actionLabel: t("dvt.title"),
        onOpen: () => setOpen(true),
      });
      if (p.id) readInviteNotices([p.id]).catch(() => {});
    };
    const onWelcome = () => {
      setWelcome((w) => (w ? { ...w, stale: true } : w));
    };
    socket.on("invites:update", onUpdate);
    socket.on("invites:milestone", onMilestone);
    socket.on("invites:notice", onNotice);
    socket.on("invites:notice-withdrawn", ping);
    socket.on("invites:welcome", onWelcome);
    return () => {
      socket.off("invites:update", onUpdate);
      socket.off("invites:milestone", onMilestone);
      socket.off("invites:notice", onNotice);
      socket.off("invites:notice-withdrawn", ping);
      socket.off("invites:welcome", onWelcome);
    };
  }, [socket, meId, t, toast]);

  // After sign-up: attach the invite's channel / open, then the first-entry card once.
  useEffect(() => {
    if (!meId) return undefined;
    let live = true;
    (async () => {
      const pending = peekInviteOpen();
      if (pending) {
        try {
          await attachInviteOpen({ openId: pending.openId || null, channel: pending.channel || null });
        } catch {
          /* best effort */
        }
        clearInviteOpen();
      }
      let seen = false;
      try {
        seen = localStorage.getItem(`${WELCOME_SEEN}:${meId}`) === "1";
      } catch {
        seen = false;
      }
      if (seen) return;
      try {
        const w = await getInviteWelcome();
        if (!live || !w?.invited) return;
        // Only while the gift is still in progress (or just opened): no stale cards later.
        if (!["waiting_message", "waiting_return", "paid", "reviewing"].includes(w.gift?.status)) return;
        // The Başla panosu shows the inviter corner with the gift card (InviteGiftSlot) instead.
        if (w.onboardingCorner) return;
        setWelcome(w);
      } catch {
        /* not invited / offline */
      }
    })();
    return () => {
      live = false;
    };
  }, [meId]);

  const closeWelcome = useCallback(() => {
    setWelcome(null);
    try {
      localStorage.setItem(`${WELCOME_SEEN}:${meId}`, "1");
    } catch {
      /* ignore */
    }
  }, [meId]);

  return (
    <>
      {open ? (
        <div className={`dvt-layer ${isMobile ? "is-phone" : "is-desk"}`} role="presentation" onClick={isMobile ? undefined : close}>
          <div
            className={`dvt-window ${isMobile ? "is-phone" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={t("dvt.title")}
            tabIndex={-1}
            ref={trapRef}
            onClick={(e) => e.stopPropagation()}
          >
            <Suspense fallback={<div className="dvt-skel">{t("dvt.loading")}</div>}>
              <InviteCenter mobile={isMobile} onClose={close} onNavigate={onNavigate} />
            </Suspense>
          </div>
        </div>
      ) : null}
      {welcome && !open ? (
        <Suspense fallback={null}>
          <InviteWelcome data={welcome} mobile={isMobile} onClose={closeWelcome} onNavigate={onNavigate} />
        </Suspense>
      ) : null}
    </>
  );
}
