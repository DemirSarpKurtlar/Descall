import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { pinvoke } from "../gaming/bridge.js";
import { AUDIO_CHOICES, NOTIFICATION_CHOICES, applyProfile, mergeProfiles, profileName } from "../gaming/workspaceProfiles.js";
import { STATUSES } from "../gaming/actions.js";
import { statusLabel } from "./quick_actions.jsx";
import { Badge, Btn, Group, Hint, HotkeyField, Ico, Note, Picker, Seg } from "../story/kit.jsx";

export const key = "workspace_profiles";
const ds = (s) => `${key}.${s}`;
const ICON = { game: "gamepad", work: "calendar", daily: "sparkle" };

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
    <>
      <Group title={t("premiumGaming.workspace.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.workspace.desc")}</Note>
        <div className="ps-profiles" data-s={ds("profiles")}>
          {profiles.map((p) => (
            <div className={`ps-profile${s.active === p.id ? " is-active" : ""}`} key={p.id} data-testid={`pg-profile-${p.id}`}>
              <div className="ps-profile-h">
                <span className="ps-ii" aria-hidden="true"><Ico n={ICON[p.id] || "layout"} size={15} /></span>
                <b>{profileName(t, p)}</b>
                {s.active === p.id ? <Badge tone="ok">{t("premiumGaming.workspace.active")}</Badge> : null}
                <Btn kind="primary" ds={ds("switch")} disabled={busy === p.id} onClick={async () => { setBusy(p.id); await applyProfile(p.id); setBusy(""); }}>{t("premiumGaming.workspace.switch")}</Btn>
              </div>
              <div className="ps-field">
                <small>{t("premiumGaming.workspace.status")}</small>
                <Seg wrap value={p.status} onChange={(v) => patch(p.id, { status: v })} label={t("premiumGaming.workspace.status")} ds={ds("status")} options={STATUSES.map((st) => ({ value: st, label: statusLabel(t, st) }))} />
              </div>
              <div className="ps-fields">
                <label className="ps-field">
                  <small>{t("premiumGaming.workspace.notifications")}</small>
                  <Picker value={p.notification} onChange={(v) => patch(p.id, { notification: v })} label={t("premiumGaming.workspace.notifications")} ds={ds("notifications")} options={NOTIFICATION_CHOICES.map((n) => ({ value: n, label: t(`premiumGaming.workspace.notif.${n}`) }))} />
                </label>
                <label className="ps-field">
                  <small>{t("premiumGaming.workspace.audio")}</small>
                  <Picker value={p.audio} onChange={(v) => patch(p.id, { audio: v })} label={t("premiumGaming.workspace.audio")} ds={ds("audio")} options={AUDIO_CHOICES.map((a) => ({ value: a, label: t(`premiumGaming.workspace.audioChoice.${a}`) }))} />
                </label>
                <label className="ps-field">
                  <small>{t("premiumGaming.workspace.layout")}</small>
                  <Picker value={p.layout || ""} onChange={(v) => patch(p.id, { layout: v })} label={t("premiumGaming.workspace.layout")} ds={ds("layout")} options={[{ value: "", label: t("premiumGaming.common.none") }, ...layouts.map((l) => ({ value: l.id, label: l.name }))]} />
                </label>
                <div className="ps-field">
                  <small>{t("premiumGaming.common.hotkey")}</small>
                  <HotkeyField value={p.hotkey} onChange={(hotkey) => patch(p.id, { hotkey })} label={`${profileName(t, p)}: ${t("premiumGaming.common.hotkey")}`} ds={ds("hotkey")} none={t("premiumGaming.common.none")} pressKey={t("premiumAudio.hotkeys.pressKey")} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.workspace.help")}</Hint>
    </>
  );
}

export default Panel;
