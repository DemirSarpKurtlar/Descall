import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, X } from "../ui/Icon.jsx";
import RippleButton from "../ui/RippleButton";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import OverlayPortal from "../ui/OverlayPortal";
import { openWalletHistory } from "../descoin/CallCoinSummaryHost.jsx";

/**
 * Full-screen celebratory popup shown when an admin grants a user DesCoin
 * with a message attached, e.g. via /api/admin/descoin/grant. Mirrors
 * ShopGiftPopup's shape so DesCoin grants feel like the same "gift" flow as
 * gifting a cosmetic item, just with a coin amount instead of an item card.
 */
export default function DesCoinGiftPopup({ gift, onDismiss }) {
  const t = useT();
  const { locale } = useLocale();
  const titleId = useId();
  const primaryRef = useRef(null);
  // A real dialog: focus moves in, Escape closes it.
  useEffect(() => {
    if (!gift) return undefined;
    const prev = document.activeElement;
    const timer = window.setTimeout(() => primaryRef.current?.querySelector?.(".btn-primary")?.focus?.({ preventScroll: true }), 60);
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      if (prev && typeof prev.focus === "function" && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [gift, onDismiss]);
  if (!gift) return null;
  const { amount, message, from } = gift;
  // Follow-up: the grant is a wallet row; open the wallet history at it.
  const openWallet = () => {
    onDismiss?.();
    openWalletHistory({});
  };

  return (
    <OverlayPortal>
    <AnimatePresence>
      <motion.div
        className="shop-gift-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={primaryRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="shop-gift-card descoin-gift-card"
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 20, stiffness: 260 }}
        >
          <button className="shop-gift-close" onClick={onDismiss} aria-label={t("Close")}>
            <X size={18} />
          </button>

          <div className="shop-gift-icon descoin-gift-icon">
            <Coins size={28} />
          </div>

          <h3 id={titleId}>{t("You received DesCoin!")}</h3>
          <p className="shop-gift-from">
            {t("{name} sent you", { name: from?.username || t("Descall staff") })}
          </p>

          <div className="descoin-gift-amount">
            <Coins size={22} />
            <span>+{formatNumber(amount || 0, locale)}</span>
          </div>

          {message && <p className="shop-gift-message">“{message}”</p>}

          <div className="shop-gift-actions">
            <RippleButton className="btn-secondary" onClick={openWallet}>
              {t("coinpop.btn.wallet")}
            </RippleButton>
            <RippleButton className="btn-primary" onClick={onDismiss}>
              {t("Nice!")}
            </RippleButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </OverlayPortal>
  );
}
