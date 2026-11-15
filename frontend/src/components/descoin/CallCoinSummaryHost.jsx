/*
 * App-level glue for the end-of-call DesCoin summary: listens for `descoin:call-summary`,
 * applies the user's setting and threshold, shows each call once and only on a device
 * that was in the call (lib/callCoinPrefs.decideCallCoinSummary), one at a time.
 * Also hosts the wallet history drawer (`descall:open-wallet-history`) and the sample
 * summary from Settings › Cüzdan ve kazanç (`descall:call-coin-sample`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import OverlayPortal from "../ui/OverlayPortal";
import CallCoinSummary, { sampleCallCoinSummary } from "./CallCoinSummary.jsx";
import WalletHistoryDrawer from "./WalletHistoryDrawer.jsx";
import { decideCallCoinSummary, requestShopFocus } from "../../lib/callCoinPrefs.js";
import "../../styles/call-coin-summary.css";

export const OPEN_WALLET_EVENT = "descall:open-wallet-history";
export const SAMPLE_EVENT = "descall:call-coin-sample";

export function openWalletHistory(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_WALLET_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

export function playCallCoinSample() {
  try {
    window.dispatchEvent(new CustomEvent(SAMPLE_EVENT));
  } catch {
    /* ignore */
  }
}

export default function CallCoinSummaryHost({ socket, meId, onNavigate }) {
  const t = useT();
  const [queue, setQueue] = useState([]);
  const [wallet, setWallet] = useState(null); // { receipt, sessionId }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  const current = queue[0] || null;

  useEffect(() => {
    if (!socket || !meId) return undefined;
    const onSummary = (payload) => {
      const verdict = decideCallCoinSummary(payload);
      if (!verdict.show) return;
      setQueue((q) => (q.some((x) => x.sessionId === payload.sessionId) ? q : [...q, payload].slice(-3)));
    };
    socket.on("descoin:call-summary", onSummary);
    return () => socket.off("descoin:call-summary", onSummary);
  }, [socket, meId]);

  useEffect(() => {
    const onWallet = (e) => setWallet({ receipt: e?.detail?.receipt || null, sessionId: e?.detail?.sessionId || null });
    const onSample = () => setQueue((q) => [...q.filter((x) => !x.sample), sampleCallCoinSummary(t)]);
    window.addEventListener(OPEN_WALLET_EVENT, onWallet);
    window.addEventListener(SAMPLE_EVENT, onSample);
    return () => {
      window.removeEventListener(OPEN_WALLET_EVENT, onWallet);
      window.removeEventListener(SAMPLE_EVENT, onSample);
    };
  }, [t]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  const goShop = useCallback(
    (item, buy) => {
      dismiss();
      if (current?.sample) return;
      if (item?.id) requestShopFocus({ itemId: item.id, buy });
      onNavigate?.("/settings/shop");
    },
    [current, dismiss, onNavigate]
  );

  const showToast = useCallback((next) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const never = useCallback(async () => {
    dismiss();
    const { updateCallCoinPrefs } = await import("../../lib/appearanceSync.js");
    updateCallCoinPrefs({ callCoinSummary: false });
    showToast({
      text: t("coinpop.toast.off"),
      undo: () => {
        updateCallCoinPrefs({ callCoinSummary: true });
        showToast({ text: t("coinpop.toast.on") });
      },
    });
  }, [dismiss, showToast, t]);

  return (
    <OverlayPortal>
      {current ? (
        <CallCoinSummary
          key={current.sessionId}
          summary={current}
          onClose={dismiss}
          onBuy={(item) => goShop(item, true)}
          onSpend={(item) => goShop(item, false)}
          onWallet={(s) => {
            dismiss();
            setWallet({ receipt: s?.receipt || null, sessionId: s?.sample ? null : s?.sessionId || null });
          }}
          onSettings={() => {
            dismiss();
            onNavigate?.("/settings/wallet");
          }}
          onNever={never}
        />
      ) : null}
      <WalletHistoryDrawer open={Boolean(wallet)} receipt={wallet?.receipt} sessionId={wallet?.sessionId} onClose={() => setWallet(null)} />
      {toast ? (
        <div className="ccs-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                const fn = toast.undo;
                setToast(null);
                fn();
              }}
            >
              {t("coinpop.toast.undo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </OverlayPortal>
  );
}
