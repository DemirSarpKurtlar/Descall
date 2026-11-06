import { useCallback, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs } from "../../lib/callAudioDevices";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { gateParams, stepGate } from "../audio/noiseGateMath.js";
import { Button, LevelMeter, Note, Row, Section, Slider, Toggle, useMicTestStream } from "../ui/PremiumAudioKit.jsx";

export const key = "noise_gate";

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

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.gate.title")} hint={t("premiumAudio.gate.hint")}>
        <Row title={t("premiumAudio.gate.enable")} description={t("premiumAudio.gate.enableDesc")}>
          <Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.gate.enable")} />
        </Row>
        <Row title={t("premiumAudio.gate.threshold")} description={t("premiumAudio.gate.thresholdDesc")}>
          <Slider value={s.thresholdDb} min={-80} max={-10} onChange={(v) => update({ thresholdDb: v })} label={t("premiumAudio.gate.threshold")} format={(v) => t("premiumAudio.common.db", { n: v })} />
        </Row>
        <div className="pa-inline">
          <LevelMeter stream={stream} thresholdDb={params.openThreshold} label={t("premiumAudio.gate.meter")} onLevel={onLevel} />
        </div>
        <div className="pa-inline">
          <Button onClick={() => setTesting((v) => !v)}>{testing ? t("premiumAudio.gate.stopTest") : t("premiumAudio.gate.startTest")}</Button>
          {testing && stream ? <span className={`pa-badge ${open ? "pa-badge-ok" : ""}`}>{open ? t("premiumAudio.gate.open") : t("premiumAudio.gate.closed")}</span> : null}
        </div>
        <Row title={t("premiumAudio.gate.hysteresis")} description={t("premiumAudio.gate.hysteresisDesc")}>
          <Slider value={s.hysteresisDb} min={0} max={30} onChange={(v) => update({ hysteresisDb: v })} label={t("premiumAudio.gate.hysteresis")} format={(v) => t("premiumAudio.common.db", { n: v })} />
        </Row>
        <Row title={t("premiumAudio.gate.hold")} description={t("premiumAudio.gate.holdDesc")}>
          <Slider value={s.holdMs} min={0} max={1000} step={10} onChange={(v) => update({ holdMs: v })} label={t("premiumAudio.gate.hold")} format={(v) => t("premiumAudio.common.ms", { n: v })} />
        </Row>
      </Section>
      {error ? <Note tone="warn">{t("premiumAudio.common.micError")}</Note> : null}
    </div>
  );
}

export default Panel;
