import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { TRIGGERS, HUDS, MAX_RULES, normalizeRules } from "../gaming/ruleEngine.js";
import { STATUSES } from "../gaming/actions.js";
import { mergeProfiles, profileName } from "../gaming/workspaceProfiles.js";
import { statusLabel } from "./quick_actions.jsx";
import { Actions, Btn, ChoiceTiles, Group, Hint, IconBtn, Item, List, Note, Seg, SetRow, Switch, TextField } from "../story/kit.jsx";

export const key = "desktop_automations";
const ds = (s) => `${key}.${s}`;
const ACTION_CHOICES = ["switch_profile", "focus_on", "focus_off", "set_status", "open_hud"];
const TRIGGER_ICON = { game_started: "gamepad", game_stopped: "stop", call_joined: "phone", call_left: "x", time_window: "clock", idle: "moon" };
const ACTION_ICON = { switch_profile: "layout", focus_on: "moon", focus_off: "bell", set_status: "user", open_hud: "hud" };

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
    <>
      <Group title={t("premiumGaming.automations.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.automations.desc")}</Note>
        <SetRow icon="wand" label={t("premiumGaming.automations.enable")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.automations.enable")} testId="pg-auto-on" ds={ds("on")} />
        </SetRow>
      </Group>
      <Group title={t("premiumStory.g.newRule")}>
        <div className="ps-field">
          <small>{t("premiumGaming.automations.when")}</small>
          <ChoiceTiles mini value={trig} onChange={setTrig} label={t("premiumGaming.automations.when")} ds={ds("when")} options={TRIGGERS.map((x) => ({ value: x, label: t(`premiumGaming.automations.triggers.${x}`), icon: TRIGGER_ICON[x] }))} />
        </div>
        {trig === "game_started" || trig === "game_stopped" ? (
          <label className="ps-field">
            <small>{t("premiumGaming.automations.gameFilter")}</small>
            <TextField value={game} maxLength={80} onChange={setGame} label={t("premiumGaming.automations.gameFilter")} ds={ds("gameFilter")} />
          </label>
        ) : null}
        {trig === "time_window" ? (
          <div className="ps-field">
            <small>{t("premiumGaming.automations.between")}</small>
            <div className="ps-form" data-s={ds("between")}>
              <input className="ps-in is-time" type="time" value={from} aria-label={t("premiumGaming.automations.between")} onChange={(e) => setFrom(e.target.value)} />
              <span className="ps-dash" aria-hidden="true" />
              <input className="ps-in is-time" type="time" value={to} aria-label={t("premiumGaming.automations.between")} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        ) : null}
        {trig === "idle" ? (
          <label className="ps-field">
            <small>{t("premiumGaming.automations.afterMinutes")}</small>
            <input className="ps-in is-num" type="number" min="1" max="240" value={mins} data-s={ds("afterMinutes")} onChange={(e) => setMins(Number(e.target.value) || 1)} />
          </label>
        ) : null}
        <div className="ps-field">
          <small>{t("premiumGaming.automations.then")}</small>
          <ChoiceTiles mini value={act} onChange={onAct} label={t("premiumGaming.automations.then")} ds={ds("then")} options={ACTION_CHOICES.map((x) => ({ value: x, label: t(`premiumGaming.automations.actions.${x}`), icon: ACTION_ICON[x] }))} />
        </div>
        {act === "switch_profile" ? (
          <Seg wrap value={arg} onChange={setArg} label={t("premiumGaming.automations.actions.switch_profile")} ds={ds("thenArg")} options={profiles.map((p) => ({ value: p.id, label: profileName(t, p) }))} />
        ) : null}
        {act === "set_status" ? (
          <Seg wrap value={arg} onChange={setArg} label={t("premiumGaming.automations.actions.set_status")} ds={ds("thenArg")} options={STATUSES.map((x) => ({ value: x, label: statusLabel(t, x) }))} />
        ) : null}
        {act === "open_hud" ? (
          <Seg wrap value={arg} onChange={setArg} label={t("premiumGaming.automations.actions.open_hud")} ds={ds("thenArg")} options={HUDS.map((x) => ({ value: x, label: t(`premiumGaming.automations.hud.${x}`) }))} />
        ) : null}
        <Actions>
          <Btn kind="primary" icon="plus" ds={ds("add")} onClick={add} disabled={rules.length >= MAX_RULES}>{t("premiumGaming.automations.add")}</Btn>
        </Actions>
      </Group>
      <Group title={t("premiumStory.g.yourRules")} aside={<span className="tnum">{`${rules.length} / ${MAX_RULES}`}</span>}>
        <List ds={ds("rules")} empty={rules.length ? null : t("premiumGaming.automations.empty")}>
          {rules.map((r) => {
            const d = describeRule(t, r, profiles);
            return (
              <Item key={r.id} icon={TRIGGER_ICON[r.trigger?.type] || "wand"} title={d.when} sub={d.then}>
                <Switch small checked={r.enabled} label={`${t("premiumGaming.automations.ruleOn")}: ${t("premiumGaming.automations.ruleText", { when: d.when, then: d.then })}`} onChange={(on) => update({ rules: rules.map((x) => (x.id === r.id ? { ...x, enabled: on } : x)) })} testId={`pg-rule-${r.id}`} />
                <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} onClick={() => update({ rules: rules.filter((x) => x.id !== r.id) })} />
              </Item>
            );
          })}
        </List>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.automations.help")}</Hint>
    </>
  );
}

export default Panel;
