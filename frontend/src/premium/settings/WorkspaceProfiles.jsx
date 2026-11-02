import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, Field, HotkeyInput, PanelShell } from "../gaming/ui.jsx";
import { pinvoke } from "../gaming/bridge.js";
import { AUDIO_CHOICES, NOTIFICATION_CHOICES, applyProfile, mergeProfiles, profileName } from "../gaming/workspaceProfiles.js";
import { STATUSES } from "../gaming/actions.js";
import { statusLabel } from "./QuickActions.jsx";

export const key = "workspace_profiles";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.workspace_profiles);
  const profiles = mergeProfiles(s.profiles);
  const [layouts, setLayouts] = useState([]);
  const [busy, setBusy] = useState("");
  useEffect(() => { pinvoke("premium:custom_layouts:list").then((r) => setLayouts(r?.ok ? r.layouts : [])); }, []);

  const patch = (id, change) => {
    update({ profiles: profiles.map((p) => (p.id === id ? { ...p, ...change } : p)) });
  };
  return (
    <PanelShell title={t("premiumGaming.workspace.title")} desc={t("premiumGaming.workspace.desc")} testId="pg-panel-workspace_profiles">
      {profiles.map((p) => (
        <div className="pg-card" key={p.id} data-testid={`pg-profile-${p.id}`}>
          <div className="pg-row">
            <b className="pg-grow">{profileName(t, p)}</b>
            {s.active === p.id ? <span className="pg-chip is-on">{t("premiumGaming.workspace.active")}</span> : null}
            <button type="button" className="pg-btn is-small is-primary" disabled={busy === p.id} onClick={async () => { setBusy(p.id); await applyProfile(p.id); setBusy(""); }}>{t("premiumGaming.workspace.switch")}</button>
          </div>
          <Field label={t("premiumGaming.workspace.status")}>
            <select className="pg-select" value={p.status} onChange={(e) => patch(p.id, { status: e.target.value })}>
              {STATUSES.map((st) => <option key={st} value={st}>{statusLabel(t, st)}</option>)}
            </select>
          </Field>
          <Field label={t("premiumGaming.workspace.notifications")}>
            <select className="pg-select" value={p.notification} onChange={(e) => patch(p.id, { notification: e.target.value })}>
              {NOTIFICATION_CHOICES.map((n) => <option key={n} value={n}>{t(`premiumGaming.workspace.notif.${n}`)}</option>)}
            </select>
          </Field>
          <Field label={t("premiumGaming.workspace.audio")}>
            <select className="pg-select" value={p.audio} onChange={(e) => patch(p.id, { audio: e.target.value })}>
              {AUDIO_CHOICES.map((a) => <option key={a} value={a}>{t(`premiumGaming.workspace.audioChoice.${a}`)}</option>)}
            </select>
          </Field>
          <Field label={t("premiumGaming.workspace.layout")}>
            <select className="pg-select" value={p.layout || ""} onChange={(e) => patch(p.id, { layout: e.target.value })}>
              <option value="">{t("premiumGaming.common.none")}</option>
              {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label={t("premiumGaming.common.hotkey")}>
            <HotkeyInput value={p.hotkey} onChange={(hotkey) => patch(p.id, { hotkey })} />
          </Field>
        </div>
      ))}
      <p className="pg-help">{t("premiumGaming.workspace.help")}</p>
    </PanelShell>
  );
}

export default Panel;
