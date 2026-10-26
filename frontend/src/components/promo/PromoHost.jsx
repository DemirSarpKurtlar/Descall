import { useCallback, useEffect, useRef, useState } from "react";
import { getPromoPopup, markPromoPopup } from "../../api/promo";
import { PROMO_CELEBRATE_EVENT, PROMO_REDEEM_EVENT } from "../../lib/promoBus";
import { getPromoBadges } from "../../lib/promoBadges";
import { PROMO_NUDGE_EVENT } from "../../lib/promoAvailable";
import { PromoGiftPopup, RedeemSheet } from "./PromoUi.jsx";

/**
 * App-level owner of the promo overlays:
 * - asks GET /api/promo/popup after sign-in and whenever the server nudges
 *   with "promo:popup" (the nudge never carries the code itself),
 * - opens the redeem sheet for openPromoRedeem() calls (shop button, settings, popup).
 */
export default function PromoHost({ socket, enabled, onOpenShop, onOpenProfile, onBalance }) {
  const [popup, setPopup] = useState(null);
  const [sheet, setSheet] = useState(null);
  const sheetOpen = useRef(false);
  sheetOpen.current = Boolean(sheet);

  const fetchPopup = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await getPromoPopup();
      if (!sheetOpen.current) setPopup(data?.popup || null);
    } catch { /* popup is optional; never block the app */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setTimeout(fetchPopup, 1500);
    return () => clearTimeout(id);
  }, [enabled, fetchPopup]);

  useEffect(() => {
    if (!socket || !enabled) return undefined;
    const onNudge = () => {
      fetchPopup();
      window.dispatchEvent(new CustomEvent(PROMO_NUDGE_EVENT)); // Ayarlar → Kodlarım + its badge refresh
    };
    socket.on("promo:popup", onNudge);
    return () => socket.off("promo:popup", onNudge);
  }, [socket, enabled, fetchPopup]);

  useEffect(() => {
    const onOpen = (e) => { setPopup(null); setSheet({ code: e?.detail?.code || "", key: Date.now() }); };
    const onCelebrate = (e) => {
      const result = e?.detail?.result;
      if (!result?.reward) return;
      setPopup(null);
      setSheet({ code: "", result, key: Date.now() });
    };
    window.addEventListener(PROMO_REDEEM_EVENT, onOpen);
    window.addEventListener(PROMO_CELEBRATE_EVENT, onCelebrate);
    return () => {
      window.removeEventListener(PROMO_REDEEM_EVENT, onOpen);
      window.removeEventListener(PROMO_CELEBRATE_EVENT, onCelebrate);
    };
  }, []);

  const mark = (snooze) => {
    if (popup?.id) markPromoPopup(popup.id, snooze).catch(() => {});
  };

  return (
    <>
      {popup && !sheet ? (
        <PromoGiftPopup
          popup={popup}
          onClose={() => { mark(false); setPopup(null); }}
          onLater={() => { mark(true); setPopup(null); }}
          onUse={() => { mark(false); setSheet({ code: popup.code, key: Date.now() }); setPopup(null); }}
        />
      ) : null}
      {sheet ? (
        <RedeemSheet
          key={sheet.key}
          initialCode={sheet.code}
          initialResult={sheet.result || null}
          onClose={() => setSheet(null)}
          onGoShop={() => { setSheet(null); onOpenShop?.(); }}
          onWearBadge={getPromoBadges()?.onWear || onOpenProfile ? () => { setSheet(null); const w = getPromoBadges()?.onWear; if (w) w(); else onOpenProfile(); } : undefined}
          onDone={(out) => {
            if (typeof out?.balance === "number") onBalance?.(out.balance);
            window.dispatchEvent(new CustomEvent("descall:promo-redeemed", { detail: { codeId: out?.codeId } }));
          }}
        />
      ) : null}
    </>
  );
}
