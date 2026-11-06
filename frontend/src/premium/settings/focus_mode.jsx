import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, setFocus } from "../notify/premiumNotify.js";
import { Button, Note, Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "focus_mode";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, NOTIFY_DEFAULTS.focus_mode);
  const [now, setNow] = useState(() => Date.now());
  const active = Number(s.until) > now;
  // Countdown refresh only while focus is on and the panel is open.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [active]);
  const minutesLeft = active ? Math.ceil((Number(s.until) - now) / 60000) : 0;
  const start = async (m) => { await setFocus(m); setNow(Date.now()); };

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.focus.title")} hint={t("premiumAudio.focus.hint")}>
        <Row title={t("premiumAudio.focus.status")} description={active ? t("premiumAudio.focus.activeFor", { minutes: minutesLeft }) : t("premiumAudio.focus.inactive")}>
          {active ? <Button kind="danger" onClick={() => start(0)}>{t("premiumAudio.focus.end")}</Button> : null}
        </Row>
        <div className="pa-inline">
          {[15, 30, 60, 120, 240].map((m) => (
            <Button key={m} kind={!active && m === s.lastMinutes ? "primary" : "default"} onClick={() => start(m)}>
              {m < 60 ? t("premiumAudio.common.minutes", { n: m }) : t("premiumAudio.common.hours", { n: m / 60 })}
            </Button>
          ))}
        </div>
        <Row title={t("premiumAudio.focus.allowCalls")}>
          <Toggle value={s.allowCalls !== false} onChange={(v) => update({ allowCalls: v })} label={t("premiumAudio.focus.allowCalls")} />
        </Row>
        <Row title={t("premiumAudio.focus.allowDms")} description={t("premiumAudio.focus.allowDmsDesc")}>
          <Toggle value={Boolean(s.allowDms)} onChange={(v) => update({ allowDms: v })} label={t("premiumAudio.focus.allowDms")} />
        </Row>
      </Section>
      <Note>{t("premiumAudio.focus.trayNote")}</Note>
    </div>
  );
}

export default Panel;
