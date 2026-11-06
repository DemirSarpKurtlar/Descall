/**
 * Call screen buttons for Descall+ (Electron only): open the call in the picture-in-picture
 * window. Shows only with its entitlement; nothing renders on web, mobile, in pop-out
 * windows, or for free users. (Mini mode is the in-app floating call card, CallOverlay.)
 */
import { useT } from "../../context/LocaleContext";
import { usePremium } from "../usePremium.js";
import { Layers } from "../../components/ui/Icon.jsx";
import { requestAux } from "./desktopBus.js";
import { isPopoutWindow } from "./popout.js";

export default function CallWindowButtons({ className = "", style, size = 18 }) {
  const t = useT();
  const { has } = usePremium();
  if (typeof window === "undefined" || !window.descallPremium || isPopoutWindow()) return null;
  if (!has("pip_call")) return null;
  return (
    <button type="button" className={className} style={style} aria-label={t("premium.panel.openCall")} title={t("premium.panel.openCall")} data-testid="premium-call-pip" onClick={() => requestAux("call", true)}>
      <Layers size={size} />
    </button>
  );
}
