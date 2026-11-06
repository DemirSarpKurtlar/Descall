import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { acceptServerRules } from "../../api/servers";
import GlassCheckbox from "../ui/GlassCheckbox";
import { rulesList } from "./hub/hubData";

/**
 * Community onboarding rules accept screen.
 */
export default function ServerRulesModal({ server, onClose, onAccepted }) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const accept = async () => {
    if (!server?.id || !checked) return;
    setBusy(true);
    try {
      const data = await acceptServerRules(server.id);
      onAccepted?.(data?.rulesAcceptedAt || new Date().toISOString());
      toast(t("Welcome! Rules accepted."), "success");
      onClose?.();
    } catch (err) {
      toast(err?.message || t("Something went wrong."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="server-modal-overlay server-rules-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="server-modal server-rules-modal"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
      >
        {(server?.splashUrl || server?.bannerUrl) && (
          <div
            className="server-rules-splash"
            style={{
              backgroundImage: `url(${server.splashUrl || server.bannerUrl})`,
            }}
          />
        )}
        <div className="server-rules-body">
          {/* UI audit #125: same content model as the phone sheet (welcome title,
              numbered rules, accept and join, "not now"). */}
          <h3>{t("Welcome to {name}", { name: server?.name || t("this server") })}</h3>
          <p className="server-modal-lead">{t("Read and accept the rules before you start chatting.")}</p>
          <ol className="server-rules-text server-rules-list">
            {rulesList(server?.rulesText).map((line, i) => (
              <li key={`${i}-${line}`}>
                <span className="server-rules-num" aria-hidden="true">{i + 1}</span>
                <span className="server-rules-line">{line}</span>
              </li>
            ))}
          </ol>
          <label className="server-check-row">
            <GlassCheckbox
              checked={checked}
              disabled={busy}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>{t("I agree to the server rules")}</span>
          </label>
          <div className="server-modal-actions">
            <button type="button" className="server-ghost-btn" disabled={busy} onClick={() => onClose?.()}>
              {t("Not now")}
            </button>
            <button
              type="button"
              className="server-primary-btn"
              disabled={!checked || busy}
              onClick={accept}
            >
              {busy ? t("Please wait...") : t("Accept and join")}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
