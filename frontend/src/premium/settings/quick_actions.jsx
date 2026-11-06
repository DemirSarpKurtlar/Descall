import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, Field, PanelShell } from "../gaming/ui.jsx";
import { useAppBridge } from "../gaming/bridge.js";
import { QUICK_TYPES, STATUSES, cacheQuickActions, runAction } from "../gaming/actions.js";
import { profileName, useProfiles } from "../gaming/workspaceProfiles.js";
import { Play, Trash2 } from "../../components/ui/Icon.jsx";
import { hasPremiumFeature } from "../usePremium.js";

export const key = "quick_actions";
const MAX = 12;

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

  return (
    <PanelShell title={t("premiumGaming.quickActions.title")} desc={t("premiumGaming.quickActions.desc")} testId="pg-panel-quick_actions">
      <div className="pg-card">
        <Field label={t("premiumGaming.quickActions.type")}>
          <select className="pg-select" value={type} onChange={(e) => { setType(e.target.value); setArg(""); }}>
            {QUICK_TYPES.filter((q) => q !== "workspace" || hasPremiumFeature("workspace_profiles")).map((q) => <option key={q} value={q}>{t(`premiumGaming.quickActions.types.${q}`)}</option>)}
          </select>
        </Field>
        {type === "set_status" ? (
          <Field label={t("premiumGaming.quickActions.choose")}>
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              <option value="">-</option>
              {STATUSES.map((st) => <option key={st} value={st}>{statusLabel(t, st)}</option>)}
            </select>
          </Field>
        ) : null}
        {type === "open_dm" ? (
          <Field label={t("premiumGaming.quickActions.choose")}>
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              <option value="">-</option>
              {friends.slice(0, 200).map((f) => <option key={f.id} value={String(f.id)}>{f.displayName || f.display_name || f.username}</option>)}
            </select>
          </Field>
        ) : null}
        {type === "join_channel" ? (
          <Field label={t("premiumGaming.quickActions.choose")}>
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              <option value="">-</option>
              {channels.map((c) => <option key={`${c.serverId}:${c.id}`} value={`${c.serverId}:${c.id}`}>{c.serverName ? `${c.serverName} / ${c.name}` : c.name}</option>)}
            </select>
          </Field>
        ) : null}
        {type === "join_channel" && !channels.length ? <p className="pg-muted">{t("premiumGaming.quickActions.noChannels")}</p> : null}
        {type === "workspace" ? (
          <Field label={t("premiumGaming.quickActions.choose")}>
            <select className="pg-select" value={arg} onChange={(e) => setArg(e.target.value)}>
              <option value="">-</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{profileName(t, p)}</option>)}
            </select>
          </Field>
        ) : null}
        <div className="pg-row">
          <button type="button" className="pg-btn is-primary is-small" onClick={add} disabled={!build() || items.length >= MAX}>{t("premiumGaming.quickActions.add")}</button>
        </div>
      </div>
      {items.length ? (
        <ul className="pg-list" data-testid="pg-quick-actions">
          {items.map((it) => (
            <li key={it.id}>
              <span className="pg-grow">{it.label}</span>
              <button type="button" className="pg-btn is-small" onClick={() => runAction(it.action)} aria-label={t("premiumGaming.quickActions.run")}><Play size={14} /></button>
              <button type="button" className="pg-btn is-small" onClick={() => update({ items: items.filter((x) => x.id !== it.id) })} aria-label={t("premiumGaming.common.remove")}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.quickActions.empty")}</p>}
      <p className="pg-help">{t("premiumGaming.quickActions.help")}</p>
    </PanelShell>
  );
}

export default Panel;
