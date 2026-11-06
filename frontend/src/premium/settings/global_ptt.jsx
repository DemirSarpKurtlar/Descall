import { useEffect } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readVoiceProfile, writeVoiceProfile } from "../../lib/voiceProfile";
import { isDesktopApp, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";
import { DesktopOnlyHint, Group, Hint, KeyRow, Note, SetRow, Slider, Switch } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "global_ptt";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, releaseDelayMs: 150, toggleTimeoutMs: 10000, forceToggle: false });
  const [status] = usePremiumStatus(s.enabled ? "premium:global_ptt:status" : null, [s.enabled, s.forceToggle]);
  usePublish("global_ptt.binding", status?.binding || "Mouse4");

  // The panel shows while global PTT is on: calls start muted until the key is held
  // (the existing push-to-talk flag of the voice profile).
  useEffect(() => {
    if (s.enabled && !readVoiceProfile().pushToTalk) writeVoiceProfile({ pushToTalk: true });
  }, [s.enabled]);

  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;

  let modeNote = null;
  if (status?.mode === "hold") modeNote = <Hint tone="ok" ds={ds("mode")}>{t("premiumAudio.ptt.modeHold")}</Hint>;
  else if (status?.mode === "toggle") {
    modeNote = (
      <Hint tone="warn" ds={ds("mode")}>
        {status.nativeError ? t("premiumAudio.ptt.modeToggleNative") : t("premiumAudio.ptt.modeToggle")}
        {status.mouseNeedsNative ? ` ${t("premiumAudio.ptt.mouseNeedsNative")}` : ""}
      </Hint>
    );
  }

  return (
    <>
      <Group title={t("premiumAudio.ptt.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.ptt.hint")}</Note>
        <KeyRow icon="mouse" label={t("premiumAudio.hotkeys.actions.push_to_talk")} desc={t("premiumAudio.ptt.bindingDesc")} accel={status?.binding || "Mouse4"} ds={ds("binding")} />
      </Group>
      <Group title={t("premiumStory.g.pttTiming")}>
        <SetRow label={t("premiumAudio.ptt.releaseDelay")} desc={t("premiumAudio.ptt.releaseDelayDesc")} stack>
          <Slider value={s.releaseDelayMs} min={0} max={600} step={10} ds={ds("releaseDelay")} onChange={(v) => update({ releaseDelayMs: v })} label={t("premiumAudio.ptt.releaseDelay")} format={(v) => t("premiumAudio.common.ms", { n: v })} />
        </SetRow>
        <SetRow label={t("premiumAudio.ptt.forceToggle")} desc={t("premiumAudio.ptt.forceToggleDesc")}>
          <Switch checked={s.forceToggle} onChange={(v) => update({ forceToggle: v })} label={t("premiumAudio.ptt.forceToggle")} ds={ds("forceToggle")} />
        </SetRow>
        {(s.forceToggle || status?.mode === "toggle") ? (
          <SetRow label={t("premiumAudio.ptt.toggleTimeout")} desc={t("premiumAudio.ptt.toggleTimeoutDesc")} stack>
            <Slider value={Math.round(s.toggleTimeoutMs / 1000)} min={1} max={120} ds={ds("toggleTimeout")} onChange={(v) => update({ toggleTimeoutMs: v * 1000 })} label={t("premiumAudio.ptt.toggleTimeout")} format={(v) => t("premiumAudio.common.seconds", { n: v })} />
          </SetRow>
        ) : null}
      </Group>
      {modeNote}
      <Hint ds={ds("elevated")}>{t("premiumAudio.ptt.elevated")}</Hint>
    </>
  );
}

export default Panel;
