import { useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, gameState } from "../notify/premiumNotify.js";
import { ACTIVITIES, CATEGORIES, currentActivity, resolveProfile } from "../notify/notifyRules.js";
import { ChoiceTiles, Group, Note, Seg, SetRow, Switch } from "../story/kit.jsx";

export const key = "notification_profiles";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const ACT_ICON = { default: "bell", gaming: "gamepad", working: "calendar" };

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
  const activityOptions = ACTIVITIES.map((a) => ({ value: a, label: t(`premiumAudio.rules.activity.${a}`), icon: ACT_ICON[a] || "bell" }));

  return (
    <>
      <Group title={t("premiumAudio.rules.mode")}>
        <Note ds={ds("hint")}>{t("premiumAudio.rules.hint")}</Note>
        <ChoiceTiles
          mini
          value={s.mode || "auto"}
          onChange={(v) => update({ mode: v })}
          label={t("premiumAudio.rules.mode")}
          ds={ds("mode")}
          options={[{ value: "auto", label: t("premiumAudio.rules.auto"), icon: "sparkle" }, ...activityOptions]}
        />
        <Note ds={ds("now")}>{t("premiumAudio.rules.now", { profile: t(`premiumAudio.rules.activity.${now}`) })}</Note>
      </Group>
      <Group title={t("premiumAudio.rules.schedule")}>
        <SetRow icon="clock" label={t("premiumAudio.rules.schedule")} desc={t("premiumAudio.rules.scheduleDesc")}>
          <Switch checked={Boolean(s.scheduleOn)} onChange={(v) => update({ scheduleOn: v })} label={t("premiumAudio.rules.schedule")} ds={ds("schedule")} />
        </SetRow>
        {s.scheduleOn ? (
          <>
            <div className="ps-form">
              <input className="ps-in is-time" type="time" value={schedule.start} aria-label={t("premiumAudio.rules.start")} data-s={ds("start")} onChange={(e) => setSchedule({ start: e.target.value })} />
              <span className="ps-dash" aria-hidden="true" />
              <input className="ps-in is-time" type="time" value={schedule.end} aria-label={t("premiumAudio.rules.end")} data-s={ds("end")} onChange={(e) => setSchedule({ end: e.target.value })} />
            </div>
            <div className="ps-days" role="group" aria-label={t("premiumAudio.rules.schedule")} data-s={ds("days")}>
              {DAYS.map((d) => {
                const on = (schedule.workingDays || []).includes(d);
                return <button key={d} type="button" role="checkbox" aria-checked={on} className="ps-day" onClick={() => toggleDay(d)}>{t(`premiumAudio.rules.day.${d}`)}</button>;
              })}
            </div>
          </>
        ) : null}
      </Group>
      <Group title={t("premiumAudio.rules.edit")}>
        <Seg value={editing} onChange={setEditing} label={t("premiumAudio.rules.edit")} ds={ds("edit")} options={activityOptions} />
        <SetRow label={t("premiumAudio.rules.style")}>
          <Seg
            value={profile.style}
            onChange={setStyle}
            label={t("premiumAudio.rules.style")}
            ds={ds("style")}
            options={[{ value: "capsule", label: t("premiumAudio.rules.styleCapsule") }, { value: "toast", label: t("premiumAudio.rules.styleToast") }]}
          />
        </SetRow>
        <table className="ps-matrix" data-s={ds("matrix")}>
          <thead>
            <tr>
              <th scope="col">{t("premiumAudio.rules.category")}</th>
              <th scope="col" className="c">{t("premiumAudio.rules.show")}</th>
              <th scope="col" className="c">{t("premiumAudio.rules.sound")}</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat}>
                <th scope="row">{t(`premiumAudio.rules.cat.${cat}`)}</th>
                <td className="c">
                  <Switch small checked={profile.rules[cat].show} disabled={cat === "call"} onChange={(v) => setRule(cat, "show", v)} label={`${t(`premiumAudio.rules.cat.${cat}`)}: ${t("premiumAudio.rules.show")}`} />
                </td>
                <td className="c">
                  <Switch small checked={profile.rules[cat].sound} onChange={(v) => setRule(cat, "sound", v)} label={`${t(`premiumAudio.rules.cat.${cat}`)}: ${t("premiumAudio.rules.sound")}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
    </>
  );
}

export default Panel;
