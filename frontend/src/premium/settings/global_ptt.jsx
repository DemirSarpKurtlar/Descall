import { useEffect } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readVoiceProfile, writeVoiceProfile } from "../../lib/voiceProfile";
import { DesktopOnly, KeyCaps, Note, Row, Section, Slider, Toggle, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";

export const key = "global_ptt";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, releaseDelayMs: 150, toggleTimeoutMs: 10000, forceToggle: false });
  const [status] = usePremiumStatus(s.enabled ? "premium:global_ptt:status" : null, [s.enabled, s.forceToggle]);

  // The panel shows while global PTT is on: calls start muted until the key is held
  // (the existing push-to-talk flag of the voice profile).
  useEffect(() => {
    if (s.enabled && !readVoiceProfile().pushToTalk) writeVoiceProfile({ pushToTalk: true });
  }, [s.enabled]);

  let modeNote = null;
  if (status?.mode === "hold") modeNote = <Note tone="ok">{t("premiumAudio.ptt.modeHold")}</Note>;
  else if (status?.mode === "toggle") {
    modeNote = (
      <Note tone="warn">
        {status.nativeError ? t("premiumAudio.ptt.modeToggleNative") : t("premiumAudio.ptt.modeToggle")}
        {status.mouseNeedsNative ? ` ${t("premiumAudio.ptt.mouseNeedsNative")}` : ""}
      </Note>
    );
  }

  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.ptt.title")} hint={t("premiumAudio.ptt.hint")}>
          <Row title={t("premiumAudio.hotkeys.actions.push_to_talk")} description={t("premiumAudio.ptt.bindingDesc")}>
            <KeyCaps accel={status?.binding || "Mouse4"} />
          </Row>
          <Row title={t("premiumAudio.ptt.releaseDelay")} description={t("premiumAudio.ptt.releaseDelayDesc")}>
            <Slider value={s.releaseDelayMs} min={0} max={600} step={10} onChange={(v) => update({ releaseDelayMs: v })} label={t("premiumAudio.ptt.releaseDelay")} format={(v) => t("premiumAudio.common.ms", { n: v })} />
          </Row>
          <Row title={t("premiumAudio.ptt.forceToggle")} description={t("premiumAudio.ptt.forceToggleDesc")}>
            <Toggle value={s.forceToggle} onChange={(v) => update({ forceToggle: v })} label={t("premiumAudio.ptt.forceToggle")} />
          </Row>
          {(s.forceToggle || status?.mode === "toggle") ? (
            <Row title={t("premiumAudio.ptt.toggleTimeout")} description={t("premiumAudio.ptt.toggleTimeoutDesc")}>
              <Slider value={Math.round(s.toggleTimeoutMs / 1000)} min={1} max={120} onChange={(v) => update({ toggleTimeoutMs: v * 1000 })} label={t("premiumAudio.ptt.toggleTimeout")} format={(v) => t("premiumAudio.common.seconds", { n: v })} />
            </Row>
          ) : null}
        </Section>
        {modeNote}
        <Note>{t("premiumAudio.ptt.elevated")}</Note>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
