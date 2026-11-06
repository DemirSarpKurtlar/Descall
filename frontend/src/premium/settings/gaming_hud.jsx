import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, OverlayPlacement, PanelShell, Switch } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";

export const key = "gaming_hud";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.gaming_hud);
  return (
    <PanelShell title={t("premiumGaming.gamingHud.title")} desc={t("premiumGaming.gamingHud.desc")} testId="pg-panel-gaming_hud">
      {!isDesktop() ? <DesktopOnly /> : null}
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.gamingHud.show")} disabled={!isDesktop()} testId="pg-gaminghud-on" />
      <div className="pg-card">
        <Switch checked={s.showClock} onChange={(v) => update({ showClock: v })} label={t("premiumGaming.gamingHud.clock")} />
        <Switch checked={s.showPing} onChange={(v) => update({ showPing: v })} label={t("premiumGaming.gamingHud.ping")} />
        <Switch checked={s.showCall} onChange={(v) => update({ showCall: v })} label={t("premiumGaming.gamingHud.call")} />
        <Switch checked={s.showFriends} onChange={(v) => update({ showFriends: v })} label={t("premiumGaming.gamingHud.friends")} />
      </div>
      <OverlayPlacement value={s} onChange={update} />
      <p className="pg-help">{t("premiumGaming.gamingHud.help")}</p>
      <p className="pg-help">{t("premiumGaming.gamingHud.noFps")}</p>
    </PanelShell>
  );
}

export default Panel;
