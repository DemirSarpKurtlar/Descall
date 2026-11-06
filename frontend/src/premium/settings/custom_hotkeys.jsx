import { useCallback, useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { Button, DesktopOnly, KeyRecorder, Note, Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS, HOTKEY_ACTIONS, HotkeyFailures } from "../ui/hotkeyCommon.jsx";

export const key = "custom_hotkeys";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

function bridge() {
  return typeof window !== "undefined" ? window.descallPremium : null;
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: true, bindings: {} });
  const [draft, setDraft] = useState({});
  const [issues, setIssues] = useState([]);
  const [failures, setFailures] = useState([]);
  const [saved, setSaved] = useState(false);

  const current = { ...DEFAULT_BINDINGS, ...(s.bindings || {}), ...draft };
  const dirty = Object.keys(draft).length > 0;

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

  const hard = issues.filter((i) => i.reason !== "registered" && i.reason !== "taken");
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.hotkeys.title")} hint={t("premiumAudio.hotkeys.hint")}>
          {HOTKEY_ACTIONS.map(({ action, hold }) => (
            <Row key={action} title={t(`premiumAudio.hotkeys.actions.${action}`)} description={hold ? t("premiumAudio.hotkeys.holdDesc") : undefined}>
              <KeyRecorder value={current[action]} onChange={(v) => set(action, v)} allowMouse={Boolean(hold)} label={t(`premiumAudio.hotkeys.actions.${action}`)} />
            </Row>
          ))}
          <div className="pa-inline">
            <Button kind="primary" onClick={() => save(false)} disabled={!dirty || hard.length > 0 || s.enabled === false}>{t("premiumAudio.common.save")}</Button>
            {issues.length && !hard.length ? <Button onClick={() => save(true)}>{t("premiumAudio.hotkeys.saveAnyway")}</Button> : null}
            <Button onClick={() => { setDraft({}); setIssues([]); }} disabled={!dirty}>{t("premiumAudio.common.cancel")}</Button>
            <Button kind="danger" onClick={reset} disabled={s.enabled === false}>{t("premiumAudio.hotkeys.reset")}</Button>
          </div>
        </Section>
        <HotkeyFailures failures={issues.length ? issues : failures} />
        {saved && !failures.length ? <Note tone="ok">{t("premiumAudio.hotkeys.saved")}</Note> : null}
      </DesktopOnly>
    </div>
  );
}

export default Panel;
