/**
 * Moment 2 (screen share quality picker): once Descall+ is on sale for this platform, the free
 * tier shares at 1080p / 30 (admin-editable); the 1440p and 60 options show "Descall+ ile" and a
 * tap opens this card instead of a silent downgrade:
 *   - in a server close to the level that gives everyone 1080p 60, the boost comes first
 *     ("1 takviye uzak: Kod Atölyesi Seviye 1 olunca buradaki herkes 1080p 60 paylaşır"),
 *   - "Sadece ben: Descall+" (or the trial) for the person alone.
 * useScreenCeiling feeds the capture code (plus2/screenCeiling.js) so the next share respects it.
 */
import { useEffect, useState } from "react";
import { useT } from "../context/LocaleContext";
import { Rocket, Sparkles } from "../components/ui/Icon.jsx";
import { usePlus } from "./plusStore.js";
import { decidePaywall, getLimits, trackPaywall } from "./plusApi.js";
import { setScreenCeiling } from "./screenCeiling.js";
import { openPlus } from "./openPlus.js";
import "./plus2.css";

export function useScreenCeiling(serverId, { enabled = true } = {}) {
  const { offer } = usePlus({ load: "offer" });
  const active = Boolean(enabled && offer?.salesOn && offer?.features?.qualityLimits);
  const [state, setState] = useState({ ceiling: null, upsell: null, serverLevel: 0 });
  useEffect(() => {
    if (!active) {
      setState({ ceiling: null, upsell: null, serverLevel: 0 });
      return undefined;
    }
    let alive = true;
    getLimits(serverId || null)
      .then((d) => {
        if (!alive) return;
        const l = d?.limits;
        const ceiling = l?.active && l.screen?.locked ? { height: l.screen.height, fps: l.screen.fps, locked: true } : null;
        setScreenCeiling(ceiling, serverId || "");
        setState({ ceiling, upsell: l?.upsell || null, serverLevel: l?.serverLevel || 0 });
      })
      .catch(() => { /* keep the last known ceiling */ });
    return () => { alive = false; };
  }, [active, serverId]);
  return { ...state, active };
}

export function ScreenQualityMoment({ ceiling, upsell, serverId, serverName = "", onDone }) {
  const t = useT();
  const { offer } = usePlus({ load: "offer" });
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    decidePaywall("screen_quality", serverId || null).then((v) => setCompact(v?.show === "compact")).catch(() => {});
  }, [serverId]);
  const missing = upsell?.missingFor60;
  const boostFirst = Boolean(serverId && missing != null && missing > 0 && missing <= 2);
  const plusH = offer?.tiers?.plus?.screenHeight || 1440;
  const plusFps = offer?.tiers?.plus?.screenFps || 60;
  const total = Number(upsell?.progress?.next?.boosts) || 0;
  const count = Number(upsell?.progress?.count) || 0;
  return (
    <div className="p2" style={{ marginTop: 10 }}>
      <div className="p2-moment">
        {boostFirst ? (
          <>
            <div className="p2-h"><Rocket />{t("plus2.screen.away", { n: missing })}</div>
            {!compact ? <div className="p2-small" style={{ color: "var(--p2-t2)" }}>{t("plus2.screen.awayBody", { server: serverName || t("plus2.screen.thisServer"), level: upsell.serverLevelFor60 })}</div> : null}
            {total ? (
              <div className="p2-row">
                <div className="p2-bar is-thin p2-grow"><i style={{ width: `${Math.round(Math.min(1, count / total) * 100)}%` }} /></div>
                <span className="p2-small p2-muted tnum">{count}/{total}</span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="p2-h"><Sparkles />{t("plus2.screen.title", { h: plusH, fps: plusFps })}</div>
            {!compact ? <div className="p2-small" style={{ color: "var(--p2-t2)" }}>{t("plus2.screen.body", { h: ceiling?.height || 1080, fps: ceiling?.fps || 30 })}</div> : null}
          </>
        )}
        <div className="p2-row">
          {boostFirst ? <button type="button" className="p2-btn is-sm is-cta" onClick={() => { trackPaywall("screen_quality", "clicked", { serverId, meta: { action: "boost" } }); openPlus({ view: "server", serverId, mode: "paywall" }); onDone?.(); }}>{t("plus2.cta.boost")}</button> : null}
          <button type="button" className={`p2-btn is-sm${boostFirst ? " is-ghost" : " is-cta"}`} onClick={() => { trackPaywall("screen_quality", "clicked", { serverId, meta: { action: "plus" } }); openPlus({ view: "checkout", tab: "self", plan: "plus", moment: "screen_quality", serverId }); onDone?.(); }}>{t("plus2.screen.onlyMe")}</button>
        </div>
      </div>
    </div>
  );
}
