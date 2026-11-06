import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, OverlayPlacement, PanelShell, Switch } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";

export const key = "voice_hud";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.voice_hud);
  return (
    <PanelShell title={t("premiumGaming.voiceHud.title")} desc={t("premiumGaming.voiceHud.desc")} testId="pg-panel-voice_hud">
      {!isDesktop() ? <DesktopOnly /> : null}
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.voiceHud.show")} disabled={!isDesktop()} testId="pg-voicehud-on" />
      <OverlayPlacement value={s} onChange={update} />
      <p className="pg-help">{t("premiumGaming.voiceHud.help")}</p>
    </PanelShell>
  );
}

export default Panel;
