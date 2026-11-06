import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, Field, HotkeyInput, PanelShell } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";

export const key = "command_center";

export function openCommandCenter() {
  try { window.dispatchEvent(new CustomEvent("descall:premium:command-center", { detail: { open: true } })); } catch { /* ignore */ }
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.command_center);
  return (
    <PanelShell title={t("premiumGaming.commandCenter.title")} desc={t("premiumGaming.commandCenter.desc")} testId="pg-panel-command_center">
      <div className="pg-row">
        <button type="button" className="pg-btn is-primary" onClick={openCommandCenter} data-testid="pg-cc-open">{t("premiumGaming.commandCenter.open")}</button>
      </div>
      {isDesktop() ? (
        <Field label={t("premiumGaming.common.hotkey")}>
          <HotkeyInput value={s.hotkey} onChange={(hotkey) => update({ hotkey })} />
        </Field>
      ) : null}
      <p className="pg-help">{t("premiumGaming.commandCenter.help")}</p>
    </PanelShell>
  );
}

export default Panel;
