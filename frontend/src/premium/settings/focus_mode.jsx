import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, setFocus } from "../notify/premiumNotify.js";
import { Btn, Group, Hint, Note, SetRow, ToggleTiles } from "../story/kit.jsx";

export const key = "focus_mode";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;
const DURATIONS = [15, 30, 60, 120, 240];

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
    <>
      <Group title={t("premiumAudio.focus.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.focus.hint")}</Note>
        <SetRow icon="moon" label={t("premiumAudio.focus.status")} desc={active ? t("premiumAudio.focus.activeFor", { minutes: minutesLeft }) : t("premiumAudio.focus.inactive")} ds={ds("status")}>
          {active ? <Btn className="is-danger" ds={ds("end")} onClick={() => start(0)}>{t("premiumAudio.focus.end")}</Btn> : null}
        </SetRow>
        <div className="ps-seg is-wrap" role="group" aria-label={t("premiumAudio.focus.status")} data-s={ds("durations")}>
          {DURATIONS.map((m) => (
            <button key={m} type="button" aria-pressed={!active && m === s.lastMinutes} onClick={() => start(m)}>
              <span>{m < 60 ? t("premiumAudio.common.minutes", { n: m }) : t("premiumAudio.common.hours", { n: m / 60 })}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title={t("premiumStory.g.allow")}>
        <ToggleTiles
          items={[
            { id: "allowCalls", icon: "phone", label: t("premiumAudio.focus.allowCalls"), ds: ds("allowCalls"), checked: s.allowCalls !== false, onChange: (v) => update({ allowCalls: v }) },
            { id: "allowDms", icon: "chat", label: t("premiumAudio.focus.allowDms"), sub: t("premiumAudio.focus.allowDmsDesc"), ds: ds("allowDms"), checked: Boolean(s.allowDms), onChange: (v) => update({ allowDms: v }) },
          ]}
        />
      </Group>
      <Hint ds={ds("trayNote")}>{t("premiumAudio.focus.trayNote")}</Hint>
    </>
  );
}

export default Panel;
