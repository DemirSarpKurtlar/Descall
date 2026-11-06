import { useCallback, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs } from "../../lib/callAudioDevices";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { gateParams, stepGate } from "../audio/noiseGateMath.js";
import { LevelMeter, useMicTestStream } from "../ui/PremiumAudioKit.jsx";
import { Badge, Btn, Group, Hint, Note, SetRow, Slider } from "../story/kit.jsx";

export const key = "noise_gate";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.noise_gate);
  const [testing, setTesting] = useState(false);
  const { stream, error } = useMicTestStream(testing, readAudioPrefs().input);
  const [open, setOpen] = useState(false);
  const gateRef = useState(() => ({ state: null }))[0];
  const params = gateParams(s);
  const onLevel = useCallback((db) => {
    gateRef.state = stepGate(gateRef.state, db, performance.now(), params);
    setOpen((prev) => (prev === gateRef.state.open ? prev : gateRef.state.open));
  }, [gateRef, params.openThreshold, params.closeThreshold, params.holdMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const db = (v) => t("premiumAudio.common.db", { n: v });

  return (
    <>
      <Group title={t("premiumAudio.gate.threshold")}>
        <Note ds={ds("hint")}>{t("premiumAudio.gate.hint")}</Note>
        <SetRow icon="gate" label={t("premiumAudio.gate.threshold")} desc={t("premiumAudio.gate.thresholdDesc")} stack>
          <Slider value={s.thresholdDb} min={-80} max={-10} ds={ds("threshold")} onChange={(v) => update({ thresholdDb: v })} label={t("premiumAudio.gate.threshold")} format={db} />
        </SetRow>
        <div className="ps-test" data-s={ds("meter")}>
          <LevelMeter stream={stream} thresholdDb={params.openThreshold} label={t("premiumAudio.gate.meter")} onLevel={onLevel} />
        </div>
        <div className="ps-act">
          <Btn icon={testing ? "x" : "mic"} ds={ds("test")} onClick={() => setTesting((v) => !v)}>{testing ? t("premiumAudio.gate.stopTest") : t("premiumAudio.gate.startTest")}</Btn>
          {testing && stream ? <Badge tone={open ? "ok" : ""} ds={ds("state")}>{open ? t("premiumAudio.gate.open") : t("premiumAudio.gate.closed")}</Badge> : null}
        </div>
      </Group>
      <Group title={t("premiumStory.g.closing")}>
        <SetRow label={t("premiumAudio.gate.hysteresis")} desc={t("premiumAudio.gate.hysteresisDesc")} stack>
          <Slider value={s.hysteresisDb} min={0} max={30} ds={ds("hysteresis")} onChange={(v) => update({ hysteresisDb: v })} label={t("premiumAudio.gate.hysteresis")} format={db} />
        </SetRow>
        <SetRow label={t("premiumAudio.gate.hold")} desc={t("premiumAudio.gate.holdDesc")} stack>
          <Slider value={s.holdMs} min={0} max={1000} step={10} ds={ds("hold")} onChange={(v) => update({ holdMs: v })} label={t("premiumAudio.gate.hold")} format={(v) => t("premiumAudio.common.ms", { n: v })} />
        </SetRow>
      </Group>
      {error ? <Hint tone="warn" live ds={ds("micError")}>{t("premiumAudio.common.micError")}</Hint> : null}
    </>
  );
}

export default Panel;
