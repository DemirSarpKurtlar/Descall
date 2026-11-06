import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { isDesktopApp, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";
import { DesktopOnlyHint, Group, Hint, Note, Seg, SetRow } from "../story/kit.jsx";

export const key = "media_keys";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

const KEYS = [["playPause", "play"], ["next", "next"], ["previous", "prev"], ["stop", "stop"]];

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, playPause: "toggle_mute", next: "toggle_deafen", previous: "none", stop: "none" });
  const [status] = usePremiumStatus(s.enabled ? "premium:media_keys:status" : null, [s.enabled]);
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  const options = [
    { value: "toggle_mute", label: t("premiumAudio.hotkeys.actions.toggle_mute"), icon: "micOff" },
    { value: "toggle_deafen", label: t("premiumAudio.hotkeys.actions.toggle_deafen"), icon: "head" },
    { value: "none", label: t("premiumAudio.mediaKeys.none"), icon: "x" },
  ];
  return (
    <>
      <Group title={t("premiumAudio.mediaKeys.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.mediaKeys.hint")}</Note>
        {KEYS.map(([k, icon]) => (
          <SetRow key={k} icon={icon} label={t(`premiumAudio.mediaKeys.keys.${k}`)} stack>
            <Seg value={s[k]} options={options} onChange={(v) => update({ [k]: v })} label={t(`premiumAudio.mediaKeys.keys.${k}`)} ds={ds(k)} wrap />
          </SetRow>
        ))}
      </Group>
      {status?.failed?.length ? <Hint tone="warn" live ds={ds("taken")}>{t("premiumAudio.mediaKeys.taken")}</Hint> : null}
    </>
  );
}

export default Panel;
