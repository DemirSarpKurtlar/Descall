import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, Field, PanelShell, Switch } from "../gaming/ui.jsx";
import { TRIGGERS, HUDS, MAX_RULES, normalizeRules } from "../gaming/ruleEngine.js";
import { STATUSES } from "../gaming/actions.js";
import { mergeProfiles, profileName } from "../gaming/workspaceProfiles.js";
import { statusLabel } from "./quick_actions.jsx";
import { Trash2 } from "../../components/ui/Icon.jsx";

export const key = "desktop_automations";
const ACTION_CHOICES = ["switch_profile", "focus_on", "focus_off", "set_status", "open_hud"];

export function describeRule(t, r, profiles) {
  const tr = r.trigger;
  let when = t(`premiumGaming.automations.triggers.${tr.type}`);
  if (tr.game) when += ` (${tr.game})`;
  if (tr.type === "time_window") when += ` ${tr.from}-${tr.to}`;
  if (tr.type === "idle") when += ` ${t("premiumGaming.common.minutes", { count: tr.minutes })}`;
  const then = r.actions.map((a) => {
    if (a.type === "switch_profile") return profileName(t, profiles.find((p) => p.id === a.profileId) || { id: a.profileId });
    if (a.type === "focus") return t(a.on ? "premiumGaming.automations.actions.focus_on" : "premiumGaming.automations.actions.focus_off");
    if (a.type === "set_status") return statusLabel(t, a.status);
    if (a.type === "open_hud") return t(`premiumGaming.automations.hud.${a.hud}`);
    return a.type;
  }).join(", ");
  return { when, then };
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.desktop_automations);
  const [wp] = useFeatureSettings("workspace_profiles", { profiles: [] });
  const profiles = mergeProfiles(wp.profiles);
  const rules = normalizeRules(s.rules);
  const [trig, setTrig] = useState("game_started");
  const [game, setGame] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [mins, setMins] = useState(10);
  const [act, setAct] = useState("switch_profile");
  const [arg, setArg] = useState("game");

  const buildAction = () => {
    if (act === "switch_profile") return { type: "switch_profile", profileId: arg || "game" };
    if (act === "focus_on") return { type: "focus", on: true };
    if (act === "focus_off") return { type: "focus", on: false };
    if (act === "set_status") return { type: "set_status", status: STATUSES.includes(arg) ? arg : "dnd" };
    return { type: "open_hud", hud: HUDS.includes(arg) ? arg : "gaming_hud" };
  };
  const add = () => {
    const trigger = { type: trig };
    if ((trig === "game_started" || trig === "game_stopped") && game.trim()) trigger.game = game.trim();
    if (trig === "time_window") Object.assign(trigger, { from, to });
    if (trig === "idle") trigger.minutes = mins;
    const next = normalizeRules([...rules, { id: `r${Date.now().toString(36)}`, enabled: true, trigger, actions: [buildAction()] }]);
    update({ rules: next });
  };
  const onAct = (v) => {
    setAct(v);
    setArg(v === "switch_profile" ? "game" : v === "set_status" ? "dnd" : v === "open_hud" ? "gaming_hud" : "");
  };

  return (
    <PanelShell title={t("premiumGaming.automations.title")} desc={t("premiumGaming.automations.desc")} testId="pg-panel-desktop_automations">
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.automations.enable")} testId="pg-auto-on" />
      <div className="pg-card">
        <Field label={t("premiumGaming.automations.when")}>
          <select className="pg-select" value={trig} onChange={(e) => setTrig(e.target.value)}>
            {TRIGGERS.map((x) => <option key={x} value={x}>{t(`premiumGaming.automations.triggers.${x}`)}</option>)}
          </select>
        </Field>
        {trig === "game_started" || trig === "game_stopped" ? (
          <Field label={t("premiumGaming.automations.gameFilter")}>
            <input className="pg-input" value={game} maxLength={80} onChange={(e) => setGame(e.target.value)} />
          </Field>
        ) : null}
        {trig === "time_window" ? (
          <Field label={t("premiumGaming.automations.between")}>
            <input className="pg-input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="pg-input" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        ) : null}
        {trig === "idle" ? (
          <Field label={t("premiumGaming.automations.afterMinutes")}>
            <input className="pg-input" type="number" min="1" max="240" value={mins} onChange={(e) => setMins(Number(e.target.value) || 1)} style={{ width: 80 }} />
          </Field>
        ) : null}
        <Field label={t("premiumGaming.automations.then")}>
          <select className="pg-select" value={act} onChange={(e) => onAct(e.target.value)}>
            {ACTION_CHOICES.map((x) => <option key={x} value={x}>{t(`premiumGaming.automations.actions.${x}`)}</option>)}
          </select>
          {act === "switch_profile" ? (
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{profileName(t, p)}</option>)}
            </select>
          ) : null}
          {act === "set_status" ? (
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              {STATUSES.map((x) => <option key={x} value={x}>{statusLabel(t, x)}</option>)}
            </select>
          ) : null}
          {act === "open_hud" ? (
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              {HUDS.map((x) => <option key={x} value={x}>{t(`premiumGaming.automations.hud.${x}`)}</option>)}
            </select>
          ) : null}
        </Field>
        <div className="pg-row">
          <button type="button" className="pg-btn is-primary is-small" onClick={add} disabled={rules.length >= MAX_RULES}>{t("premiumGaming.automations.add")}</button>
        </div>
      </div>
      {rules.length ? (
        <ul className="pg-list" data-testid="pg-rules">
          {rules.map((r) => {
            const d = describeRule(t, r, profiles);
            return (
              <li key={r.id}>
                <Switch checked={r.enabled} label={t("premiumGaming.automations.ruleOn")} onChange={(on) => update({ rules: rules.map((x) => (x.id === r.id ? { ...x, enabled: on } : x)) })} testId={`pg-rule-${r.id}`} />
                <span className="pg-grow">{t("premiumGaming.automations.ruleText", { when: d.when, then: d.then })}</span>
                <button type="button" className="pg-btn is-small" aria-label={t("premiumGaming.common.remove")} onClick={() => update({ rules: rules.filter((x) => x.id !== r.id) })}><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.automations.empty")}</p>}
      <p className="pg-help">{t("premiumGaming.automations.help")}</p>
    </PanelShell>
  );
}

export default Panel;
