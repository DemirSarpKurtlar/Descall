import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, Field, HotkeyInput, PanelShell, Switch } from "../gaming/ui.jsx";
import { isDesktop, pinvoke } from "../gaming/bridge.js";
import { measureClipCost, saveClip, useClipState } from "../gaming/clipController.js";
import { memoryCapBytes } from "../gaming/clipRing.js";
import { clipSupported } from "../gaming/instantClip.js";

export const key = "instant_clip";
const MB = 1024 * 1024;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.instant_clip);
  const clip = useClipState();
  const [sources, setSources] = useState(null);
  const desktop = isDesktop();

  const loadSources = async () => {
    const r = await pinvoke("premium:instant_clip:sources");
    setSources(r?.ok ? r.sources : []);
  };
  useEffect(() => { if (desktop && !s.sourceId) loadSources(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [desktop]);

  const cap = memoryCapBytes({ windowSec: s.windowSec, height: 720, fps: 30 });
  const info = clip.info;
  return (
    <PanelShell title={t("premiumGaming.instantClip.title")} desc={t("premiumGaming.instantClip.desc")} testId="pg-panel-instant_clip">
      {!desktop ? <DesktopOnly /> : null}
      {desktop && !clipSupported() ? <p className="pg-error">{t("premiumGaming.instantClip.unsupported")}</p> : null}
      <div className="pg-card">
        <Field label={t("premiumGaming.instantClip.source")}>
          <span className="pg-muted">{s.sourceName || t("premiumGaming.common.none")}</span>
          <button type="button" className="pg-btn is-small" onClick={loadSources} disabled={!desktop}>{t("premiumGaming.instantClip.pickSource")}</button>
        </Field>
        {sources ? (
          <div className="pg-sources" data-testid="pg-clip-sources">
            {sources.map((src) => (
              <button type="button" key={src.id} className={src.id === s.sourceId ? "is-active" : ""} onClick={() => { update({ sourceId: src.id, sourceName: src.name }); setSources(null); }}>
                {src.thumb ? <img src={src.thumb} alt="" /> : null}
                <span>{src.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        <Field label={t("premiumGaming.instantClip.length")}>
          <select className="pg-select" value={String(s.windowSec)} onChange={(e) => update({ windowSec: Number(e.target.value) })}>
            <option value="30">{t("premiumGaming.instantClip.sec30")}</option>
            <option value="60">{t("premiumGaming.instantClip.sec60")}</option>
          </select>
        </Field>
        <Field label={t("premiumGaming.instantClip.quality")}>
          <span className="pg-muted">{t("premiumGaming.instantClip.qualityValue")}</span>
        </Field>
        <Field label={t("premiumGaming.common.hotkey")}>
          <HotkeyInput value={s.hotkey} onChange={(hotkey) => update({ hotkey })} />
        </Field>
      </div>
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.instantClip.enable")} disabled={!desktop || !s.sourceId} testId="pg-clip-on" />
      {clip.error ? <p className="pg-error">{t(`premiumGaming.instantClip.error.${clip.error}`)}</p> : null}
      {info ? (
        <div className="pg-card" data-testid="pg-clip-status">
          <div className="pg-row">
            <span className="pg-chip is-on">{info.hardware ? t("premiumGaming.instantClip.hw") : t("premiumGaming.instantClip.sw")}</span>
            <span className="pg-num pg-grow">{t("premiumGaming.instantClip.status", { seconds: Math.round(info.bufferedSec), mb: (info.bytes / MB).toFixed(1), cap: Math.round(cap / MB) })}</span>
            <button type="button" className="pg-btn is-primary is-small" data-testid="pg-clip-save" onClick={() => saveClip()}>{t("premiumGaming.instantClip.saveNow")}</button>
          </div>
          <div className="pg-row">
            <button type="button" className="pg-btn is-small" data-testid="pg-clip-measure" onClick={() => measureClipCost()}>{t("premiumGaming.instantClip.measure")}</button>
            {clip.cost?.main ? (
              <span className="pg-num pg-muted" data-testid="pg-clip-cost">
                {t("premiumGaming.instantClip.cost", { cpu: clip.cost.main.renderer?.cpuPercent ?? clip.cost.main.total.cpuPercent, mem: Math.round(clip.cost.main.renderer?.privateMB ?? clip.cost.main.total.privateMB), dropped: info.dropped })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="pg-help">{t("premiumGaming.instantClip.help", { seconds: s.windowSec, hotkey: (s.hotkey || "").replace("CommandOrControl", "Ctrl") || t("premiumGaming.common.none") })}</p>
      <p className="pg-help">{t("premiumGaming.instantClip.audioNote")}</p>
    </PanelShell>
  );
}

export default Panel;
