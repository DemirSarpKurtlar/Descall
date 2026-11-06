import { useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, gameState } from "../notify/premiumNotify.js";
import { ACTIVITIES, CATEGORIES, currentActivity, resolveProfile } from "../notify/notifyRules.js";
import { GlassCheckboxLite, Row, Section, Select, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "notification_profiles";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

const DAYS = [1, 2, 3, 4, 5, 6, 0];

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, NOTIFY_DEFAULTS.notification_profiles);
  const [editing, setEditing] = useState("gaming");
  const profile = resolveProfile(editing, s.profiles);
  const schedule = s.schedule || NOTIFY_DEFAULTS.notification_profiles.schedule;
  const now = currentActivity({ mode: s.mode, gameActive: gameState().active, schedule: s.scheduleOn ? schedule : null });

  const setRule = (cat, field, value) => {
    const all = { ...(s.profiles || {}) };
    const p = { ...(all[editing] || {}) };
    p.rules = { ...(p.rules || {}), [cat]: { ...((p.rules || {})[cat] || {}), [field]: value } };
    all[editing] = p;
    update({ profiles: all });
  };
  const setStyle = (style) => {
    const all = { ...(s.profiles || {}) };
    all[editing] = { ...(all[editing] || {}), style };
    update({ profiles: all });
  };
  const setSchedule = (patch) => update({ schedule: { ...schedule, ...patch } });
  const toggleDay = (d) => {
    const days = new Set(schedule.workingDays || []);
    if (days.has(d)) days.delete(d); else days.add(d);
    setSchedule({ workingDays: [...days].sort() });
  };

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.rules.title")} hint={t("premiumAudio.rules.hint")}>
        <Row title={t("premiumAudio.rules.mode")} description={t("premiumAudio.rules.now", { profile: t(`premiumAudio.rules.activity.${now}`) })}>
          <Select
            value={s.mode || "auto"}
            onChange={(v) => update({ mode: v })}
            label={t("premiumAudio.rules.mode")}
            options={[{ value: "auto", label: t("premiumAudio.rules.auto") }, ...ACTIVITIES.map((a) => ({ value: a, label: t(`premiumAudio.rules.activity.${a}`) }))]}
          />
        </Row>
        <Row title={t("premiumAudio.rules.schedule")} description={t("premiumAudio.rules.scheduleDesc")}>
          <Toggle value={Boolean(s.scheduleOn)} onChange={(v) => update({ scheduleOn: v })} label={t("premiumAudio.rules.schedule")} />
        </Row>
        {s.scheduleOn ? (
          <div className="pa-inline">
            <input className="pa-input" type="time" value={schedule.start} aria-label={t("premiumAudio.rules.start")} onChange={(e) => setSchedule({ start: e.target.value })} />
            <input className="pa-input" type="time" value={schedule.end} aria-label={t("premiumAudio.rules.end")} onChange={(e) => setSchedule({ end: e.target.value })} />
            {DAYS.map((d) => (
              <GlassCheckboxLite key={d} checked={(schedule.workingDays || []).includes(d)} onChange={() => toggleDay(d)} label={t(`premiumAudio.rules.day.${d}`)} />
            ))}
          </div>
        ) : null}
      </Section>
      <Section title={t("premiumAudio.rules.edit")}>
        <div className="pa-inline">
          <Select value={editing} onChange={setEditing} label={t("premiumAudio.rules.edit")} options={ACTIVITIES.map((a) => ({ value: a, label: t(`premiumAudio.rules.activity.${a}`) }))} />
          <Select
            value={profile.style}
            onChange={setStyle}
            label={t("premiumAudio.rules.style")}
            options={[{ value: "capsule", label: t("premiumAudio.rules.styleCapsule") }, { value: "toast", label: t("premiumAudio.rules.styleToast") }]}
          />
        </div>
        <table className="pa-matrix">
          <thead>
            <tr>
              <th scope="col">{t("premiumAudio.rules.category")}</th>
              <th scope="col" className="pa-c">{t("premiumAudio.rules.show")}</th>
              <th scope="col" className="pa-c">{t("premiumAudio.rules.sound")}</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat}>
                <th scope="row">{t(`premiumAudio.rules.cat.${cat}`)}</th>
                <td className="pa-c">
                  <Toggle value={profile.rules[cat].show} disabled={cat === "call"} onChange={(v) => setRule(cat, "show", v)} label={`${t(`premiumAudio.rules.cat.${cat}`)}: ${t("premiumAudio.rules.show")}`} />
                </td>
                <td className="pa-c">
                  <Toggle value={profile.rules[cat].sound} onChange={(v) => setRule(cat, "sound", v)} label={`${t(`premiumAudio.rules.cat.${cat}`)}: ${t("premiumAudio.rules.sound")}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

export default Panel;
