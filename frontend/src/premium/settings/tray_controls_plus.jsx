/** Descall+ tray controls: nothing to set, the tray menu gains the entries while it is on. */
import { useT } from "../../context/LocaleContext";
import { Group, Ico, Note } from "../story/kit.jsx";

export const key = "tray_controls_plus";
const ENTRIES = [["mic", "premium.win.mute"], ["head", "premium.win.deafen"], ["user", "premiumAudio.launcher.status"], ["card", "premium.panel.openMini"]];

export function Panel() {
  const t = useT();
  return (
    <Group title={t("premiumStory.g.tray")}>
      <Note ds={`${key}.lead`}>{t("premium.panel.trayLead")}</Note>
      <ul className="ps-chiprow" aria-label={t("premiumStory.g.tray")}>
        {ENTRIES.map(([icon, label]) => <li key={label}><Ico n={icon} size={12} />{t(label)}</li>)}
      </ul>
      <Note dim>{t("premiumStory.n.nothingElse")}</Note>
    </Group>
  );
}
