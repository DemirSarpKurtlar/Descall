/**
 * Chat header button (Descall+ multi_window): opens the current DM, group or channel in
 * its own window. Renders nothing outside Electron, without the entitlement, or inside a
 * pop-out window.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useT } from "../../context/LocaleContext";
import { ExternalLink } from "../../components/ui/Icon.jsx";
import { usePremium } from "../usePremium.js";
import { isPopoutWindow, popoutRouteFor } from "./popout.js";

export default function PopOutButton() {
  const t = useT();
  const { has } = usePremium();
  const location = useLocation();
  const [note, setNote] = useState("");
  const bridge = typeof window !== "undefined" ? window.descallPremium : null;
  const route = popoutRouteFor(location.pathname);
  if (!bridge || !route || isPopoutWindow() || !has("multi_window")) return null;
  const label = note || t("premium.win.popOut");
  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      data-testid="premium-popout"
      onClick={async () => {
        const r = await bridge.invoke("premium:popout:open", route).catch(() => null);
        if (r && r.error === "limit") {
          setNote(t("premium.win.popOutLimit"));
          window.setTimeout(() => setNote(""), 4000);
        }
      }}
    >
      <ExternalLink size={20} />
    </button>
  );
}
