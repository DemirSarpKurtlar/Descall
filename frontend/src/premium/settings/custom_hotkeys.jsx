import { useCallback, useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { KeyRecorder, isDesktopApp } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS, HOTKEY_ACTIONS } from "../ui/hotkeyCommon.jsx";
import { Actions, Btn, DesktopOnlyHint, Group, Hint, HotkeyFailureHint, Note, SetRow } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "custom_hotkeys";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;
const ICON = { toggle_mute: "micOff", toggle_deafen: "head", push_to_talk: "mouse", quick_launcher: "command", volume_up: "vol", volume_down: "volOff" };

function bridge() {
  return typeof window !== "undefined" ? window.descallPremium : null;
}

export function Panel() {
  const t = useT();
  const [s] = useFeatureSettings(key, { enabled: true, bindings: {} });
  const [draft, setDraft] = useState({});
  const [issues, setIssues] = useState([]);
  const [failures, setFailures] = useState([]);
  const [saved, setSaved] = useState(false);

  const current = { ...DEFAULT_BINDINGS, ...(s.bindings || {}), ...draft };
  const dirty = Object.keys(draft).length > 0;
  usePublish("custom_hotkeys.current", JSON.stringify(current));

  const refresh = useCallback(() => {
    const b = bridge();
    if (!b || s.enabled === false) return;
    b.invoke("premium:hotkeys:status").then((r) => setFailures(r?.failures || [])).catch(() => {});
  }, [s.enabled]);
  useEffect(() => { refresh(); }, [refresh]);

  // Live conflict check as the user records (duplicates, reserved, held by this app).
  useEffect(() => {
    const b = bridge();
    if (!b || !dirty) { setIssues([]); return; }
    let live = true;
    b.invoke("premium:hotkeys:check", draft).then((r) => { if (live) setIssues(r?.issues || []); }).catch(() => {});
    return () => { live = false; };
  }, [draft, dirty]);

  const set = (action, accel) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [action]: accel }));
  };

  const save = async (force = false) => {
    const b = bridge();
    if (!b) return;
    // Probe each changed key: another app may already own it (register() refuses).
    const probes = [];
    for (const accel of Object.values(draft)) {
      if (accel && !/^Mouse/.test(accel)) probes.push(b.invoke("premium:hotkeys:probe", accel).catch(() => null));
    }
    const res = await Promise.all(probes);
    const taken = res.filter((r) => r && r.free === false && !r.ours).map((r) => ({ action: Object.keys(draft).find((a) => draft[a] === r.accel), accel: r.accel, reason: "taken" }));
    if (taken.length && !force) { setIssues(taken); return; }
    const r = await b.invoke("premium:hotkeys:save", draft, { force });
    if (!r?.ok) { setIssues(r?.issues || []); return; }
    setDraft({});
    setIssues([]);
    setFailures(r.issues || []);
    setSaved(true);
  };

  const reset = async () => {
    const b = bridge();
    const r = await b?.invoke("premium:hotkeys:reset");
    setDraft({});
    setIssues([]);
    setFailures(r?.status?.failures || []);
  };

  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  const hard = issues.filter((i) => i.reason !== "registered" && i.reason !== "taken");
  return (
    <>
      <Group title={t("premiumAudio.hotkeys.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.hotkeys.hint")}</Note>
        {HOTKEY_ACTIONS.map(({ action, hold }) => (
          <SetRow key={action} icon={ICON[action]} label={t(`premiumAudio.hotkeys.actions.${action}`)} desc={hold ? t("premiumAudio.hotkeys.holdDesc") : undefined} ds={ds(action)}>
            <span className="ps-keys"><KeyRecorder value={current[action]} onChange={(v) => set(action, v)} allowMouse={Boolean(hold)} label={t(`premiumAudio.hotkeys.actions.${action}`)} /></span>
          </SetRow>
        ))}
        <Actions>
          <Btn kind="primary" icon="check" ds={ds("save")} onClick={() => save(false)} disabled={!dirty || hard.length > 0 || s.enabled === false}>{t("premiumAudio.common.save")}</Btn>
          {issues.length && !hard.length ? <Btn ds={ds("saveAnyway")} onClick={() => save(true)}>{t("premiumAudio.hotkeys.saveAnyway")}</Btn> : null}
          <Btn ds={ds("cancel")} onClick={() => { setDraft({}); setIssues([]); }} disabled={!dirty}>{t("premiumAudio.common.cancel")}</Btn>
          <Btn className="is-danger" icon="restore" ds={ds("reset")} onClick={reset} disabled={s.enabled === false}>{t("premiumAudio.hotkeys.reset")}</Btn>
        </Actions>
      </Group>
      <HotkeyFailureHint failures={issues.length ? issues : failures} t={t} ds={ds("failures")} />
      {saved && !failures.length ? <Hint tone="ok" live ds={ds("saved")}>{t("premiumAudio.hotkeys.saved")}</Hint> : null}
    </>
  );
}

export default Panel;
