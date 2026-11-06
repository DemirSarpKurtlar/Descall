import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { useAppBridge } from "../gaming/bridge.js";
import { QUICK_TYPES, STATUSES, cacheQuickActions, runAction } from "../gaming/actions.js";
import { profileName, useProfiles } from "../gaming/workspaceProfiles.js";
import { hasPremiumFeature } from "../usePremium.js";
import { Actions, Btn, ChoiceTiles, Group, Hint, IconBtn, Item, List, Note, Picker, Seg } from "../story/kit.jsx";

export const key = "quick_actions";
const ds = (s) => `${key}.${s}`;
const MAX = 12;
const TYPE_ICON = { join_channel: "vol", set_status: "user", open_dm: "chat", toggle_focus: "moon", workspace: "layout" };

export function statusLabel(t, s) {
  return { online: t("Online"), idle: t("Idle"), dnd: t("Do Not Disturb"), invisible: t("Invisible") }[s] || s;
}

export function Panel() {
  const t = useT();
  const app = useAppBridge();
  const [s, update] = useFeatureSettings(key, DEFAULTS.quick_actions);
  const profiles = useProfiles();
  const [type, setType] = useState("set_status");
  const [arg, setArg] = useState("");
  const items = Array.isArray(s.items) ? s.items : [];
  useEffect(() => { cacheQuickActions(items); }, [items]);

  const friends = app.friends || [];
  const channels = app.voiceChannels || [];

  const build = () => {
    if (type === "set_status") return STATUSES.includes(arg) ? { action: { type, status: arg }, label: statusLabel(t, arg) } : null;
    if (type === "open_dm") {
      const f = friends.find((x) => String(x.id) === arg);
      return f ? { action: { type, user: { id: f.id, username: f.username, displayName: f.displayName || f.display_name || "" } }, label: t("premiumGaming.quickActions.labelDm", { name: f.displayName || f.display_name || f.username }) } : null;
    }
    if (type === "join_channel") {
      const c = channels.find((x) => `${x.serverId}:${x.id}` === arg);
      return c ? { action: { type, serverId: c.serverId, channel: { id: c.id, name: c.name, type: c.type || "voice" } }, label: t("premiumGaming.quickActions.labelJoin", { name: c.name }) } : null;
    }
    if (type === "toggle_focus") return { action: { type }, label: t("premiumGaming.quickActions.types.toggle_focus") };
    if (type === "workspace") {
      const p = profiles.find((x) => x.id === arg);
      return p ? { action: { type, profileId: p.id }, label: profileName(t, p) } : null;
    }
    return null;
  };
  const add = () => {
    const b = build();
    if (!b || items.length >= MAX) return;
    update({ items: [...items, { id: `qa${Date.now().toString(36)}`, ...b }] });
    setArg("");
  };
  const choose = t("premiumGaming.quickActions.choose");
  const types = QUICK_TYPES.filter((q) => q !== "workspace" || hasPremiumFeature("workspace_profiles"));

  return (
    <>
      <Group title={t("premiumStory.g.newAction")}>
        <Note ds={ds("desc")}>{t("premiumGaming.quickActions.desc")}</Note>
        <ChoiceTiles
          mini
          value={type}
          onChange={(v) => { setType(v); setArg(""); }}
          label={t("premiumGaming.quickActions.type")}
          ds={ds("type")}
          options={types.map((q) => ({ value: q, label: t(`premiumGaming.quickActions.types.${q}`), icon: TYPE_ICON[q] }))}
        />
        {type === "set_status" ? (
          <Seg wrap value={arg} onChange={setArg} label={choose} ds={ds("choose")} options={STATUSES.map((st) => ({ value: st, label: statusLabel(t, st) }))} />
        ) : null}
        {type === "open_dm" ? (
          <Picker value={arg} onChange={setArg} label={choose} ds={ds("choose")} options={[{ value: "", label: choose }, ...friends.slice(0, 200).map((f) => ({ value: String(f.id), label: f.displayName || f.display_name || f.username }))]} />
        ) : null}
        {type === "join_channel" ? (
          channels.length ? (
            <Picker value={arg} onChange={setArg} label={choose} ds={ds("choose")} options={[{ value: "", label: choose }, ...channels.map((c) => ({ value: `${c.serverId}:${c.id}`, label: c.serverName ? `${c.serverName} / ${c.name}` : c.name }))]} />
          ) : <Note>{t("premiumGaming.quickActions.noChannels")}</Note>
        ) : null}
        {type === "workspace" ? (
          <Seg wrap value={arg} onChange={setArg} label={choose} ds={ds("choose")} options={profiles.map((p) => ({ value: p.id, label: profileName(t, p) }))} />
        ) : null}
        <Actions>
          <Btn kind="primary" icon="plus" ds={ds("add")} onClick={add} disabled={!build() || items.length >= MAX}>{t("premiumGaming.quickActions.add")}</Btn>
        </Actions>
      </Group>
      <Group title={t("premiumGaming.quickActions.title")} aside={<span className="tnum">{`${items.length} / ${MAX}`}</span>}>
        <List ds={ds("list")} empty={items.length ? null : t("premiumGaming.quickActions.empty")}>
          {items.map((it) => (
            <Item key={it.id} icon={TYPE_ICON[it.action?.type] || "zap"} title={it.label}>
              <IconBtn icon="play" label={t("premiumGaming.quickActions.run")} onClick={() => runAction(it.action)} />
              <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} onClick={() => update({ items: items.filter((x) => x.id !== it.id) })} />
            </Item>
          ))}
        </List>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.quickActions.help")}</Hint>
    </>
  );
}

export default Panel;
