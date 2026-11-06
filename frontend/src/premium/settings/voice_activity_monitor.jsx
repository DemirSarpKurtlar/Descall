import { useT } from "../../context/localeContextInstance";
import { Group, Note } from "../story/kit.jsx";

export const key = "voice_activity_monitor";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  return (
    <Group title={t("premiumAudio.vam.title")}>
      <Note ds={`${key}.hint`}>{t("premiumAudio.vam.hint")}</Note>
      <Note dim>{t("premiumStory.n.noSettings")}</Note>
    </Group>
  );
}

export default Panel;
