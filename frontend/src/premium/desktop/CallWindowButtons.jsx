/**
 * Call screen buttons for Descall+ (Electron only): open the call in the picture-in-picture
 * window, or switch to mini mode. Each shows only with its entitlement; nothing renders on
 * web, mobile, in pop-out windows, or for free users.
 */
import { useT } from "../../context/LocaleContext";
import { usePremium } from "../usePremium.js";
import { Minimize2, Layers } from "../../components/ui/Icon.jsx";
import { requestAux } from "./desktopBus.js";
import { isPopoutWindow } from "./popout.js";

export default function CallWindowButtons({ className = "", style, size = 18 }) {
  const t = useT();
  const { has } = usePremium();
  if (typeof window === "undefined" || !window.descallPremium || isPopoutWindow()) return null;
  const pip = has("pip_call");
  const mini = has("mini_mode");
  if (!pip && !mini) return null;
  return (
    <>
      {pip ? (
        <button type="button" className={className} style={style} aria-label={t("premium.panel.openCall")} title={t("premium.panel.openCall")} data-testid="premium-call-pip" onClick={() => requestAux("call", true)}>
          <Layers size={size} />
        </button>
      ) : null}
      {mini ? (
        <button type="button" className={className} style={style} aria-label={t("premium.panel.openMini")} title={t("premium.panel.openMini")} data-testid="premium-call-mini" onClick={() => requestAux("mini", true)}>
          <Minimize2 size={size} />
        </button>
      ) : null}
    </>
  );
}
