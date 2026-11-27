/*
 * Wallet history (Cüzdan geçmişi): right-side drawer on desktop, bottom sheet on narrow
 * screens. GET /api/shop/ledger, newest first; call earnings are one receipt row per call
 * (ledger rows carry meta.callSession / meta.receipt). Opened from the end-of-call summary
 * at that call's receipt, which is highlighted and scrolled into view.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatNumber, formatDate, formatTime } from "../../i18n/format.js";
import { groupWalletEntries } from "../../lib/callCoinPrefs.js";
import { CcsIcon } from "./callCoinIcons.jsx";
import useModalFocus from "../../hooks/useModalFocus";

const REASONS = new Set([
  "voice_activity",
  "screenshare_activity",
  "message_activity",
  "shop_purchase",
  "shop_refund",
  "daily_claim",
  "streak_bonus",
  "admin_grant",
  "admin_revoke",
  "referral_invite",
  "referral_welcome",
  "onboarding_reward",
  "promo",
  "premium_gift",
]);

export default function WalletHistoryDrawer({ open, receipt = null, sessionId = null, onClose, load, entries: given }) {
  const t = useT();
  const { locale } = useLocale();
  const titleId = useId();
  const [state, setState] = useState({ status: given ? "ready" : "loading", rows: given ? groupWalletEntries(given) : [] });
  const listRef = useRef(null);
  const drawerRef = useRef(null);
  // Focus lands on the drawer itself, Tab stays inside, focus returns to the opener.
  useModalFocus(open, drawerRef, { initialFocus: drawerRef });

  const fetchRows = useCallback(async () => {
    if (given) return;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const fn = load || (await import("../../api/shop.js")).getDesCoinLedger;
      const res = await fn(200);
      setState({ status: "ready", rows: groupWalletEntries(res?.entries || []) });
    } catch {
      setState({ status: "error", rows: [] });
    }
  }, [given, load]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  useEffect(() => {
    if (!open || state.status !== "ready") return;
    const el = listRef.current?.querySelector(".ccw-row.is-hit");
    el?.scrollIntoView?.({ block: "center" });
  }, [open, state.status]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const fmt = (n) => formatNumber(Math.abs(Math.round(Number(n) || 0)), locale);
  const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${formatDate(d, locale, { day: "numeric", month: "short" })} · ${formatTime(d, locale)}`;
  };

  return (
    <div className="ccw-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="ccw-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={drawerRef}>
        <header className="ccw-hd">
          <span className="ccw-hd-ic" aria-hidden="true">
            <CcsIcon name="list" size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t("coinpop.wallet.title")}</h2>
            <p>{t("coinpop.wallet.sub")}</p>
          </div>
          <button type="button" className="ccs-x" onClick={onClose} aria-label={t("coinpop.close")}>
            <CcsIcon name="x" size={15} />
          </button>
        </header>
        <div className="ccw-list" ref={listRef}>
          {state.status === "loading" ? <p className="ccw-empty">{t("coinpop.wallet.loading")}</p> : null}
          {state.status === "error" ? (
            <div className="ccw-empty">
              <p>{t("coinpop.wallet.error")}</p>
              <button type="button" className="ccs-btn" onClick={fetchRows}>
                {t("coinpop.wallet.retry")}
              </button>
            </div>
          ) : null}
          {state.status === "ready" && !state.rows.length ? <p className="ccw-empty">{t("coinpop.wallet.empty")}</p> : null}
          {state.status === "ready"
            ? state.rows.map((r) => {
                const hit = r.kind === "call" && ((sessionId && r.id === sessionId) || (receipt && r.receipt === receipt));
                const plus = r.amount >= 0;
                const title =
                  r.kind === "call"
                    ? t("coinpop.wallet.call")
                    : r.shop2
                      ? t(`coinpop.wallet.shop2.${r.shop2}`)
                      : t(`coinpop.wallet.reason.${REASONS.has(r.reason) ? r.reason : "other"}`);
                const sub =
                  r.kind === "call"
                    ? r.voice && r.screen
                      ? t("coinpop.wallet.callSub", { v: fmt(r.voice), s: fmt(r.screen) })
                      : r.screen
                        ? t("coinpop.wallet.callSubScreen", { s: fmt(r.screen) })
                        : t("coinpop.wallet.callSubVoice", { v: fmt(r.voice) })
                    : null;
                return (
                  <div key={`${r.kind}:${r.id}`} className={`ccw-row${hit ? " is-hit" : ""}`} aria-current={hit ? "true" : undefined}>
                    <span className={`ccw-ic${r.kind === "call" ? " is-call" : plus ? " is-in" : " is-out"}`} aria-hidden="true">
                      <CcsIcon name={r.kind === "call" ? (r.context === "server" ? "volume" : r.context === "group" ? "users" : "phone") : plus ? "trend" : "bag"} size={15} />
                    </span>
                    <span className="ccw-t">
                      <b>
                        {title}
                        {hit ? <span className="ccs-chip is-gold">{t("coinpop.wallet.highlight")}</span> : null}
                      </b>
                      <small className="num">
                        {r.kind === "call" && r.receipt ? `${t("coinpop.foot.receiptShort", { id: r.receipt })} · ` : ""}
                        {sub ? `${sub} · ` : ""}
                        {when(r.at)}
                      </small>
                    </span>
                    <span className="ccw-amt">
                      <em className={`num${plus ? "" : " is-out"}`}>
                        {plus ? "+" : "-"}
                        {fmt(r.amount)}
                      </em>
                      {r.balanceAfter != null ? <small className="num">{t("coinpop.wallet.balanceAfter", { n: fmt(r.balanceAfter) })}</small> : null}
                    </span>
                  </div>
                );
              })
            : null}
        </div>
      </aside>
    </div>
  );
}
