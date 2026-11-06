import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop, pinvoke } from "../gaming/bridge.js";
import { measureClipCost, saveClip, useClipState } from "../gaming/clipController.js";
import { memoryCapBytes } from "../gaming/clipRing.js";
import { clipSupported } from "../gaming/instantClip.js";
import { Actions, Badge, Btn, Group, Hint, HotkeyField, Seg, SetRow, Switch } from "../story/kit.jsx";

export const key = "instant_clip";
const ds = (s) => `${key}.${s}`;
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
  const hotkeyText = (s.hotkey || "").replace("CommandOrControl", "Ctrl") || t("premiumGaming.common.none");
  return (
    <>
      <Group title={t("premiumGaming.instantClip.source")}>
        {!desktop ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        {desktop && !clipSupported() ? <Hint tone="err">{t("premiumGaming.instantClip.unsupported")}</Hint> : null}
        <SetRow icon="monitor" label={s.sourceName || t("premiumGaming.common.none")} ds={ds("source")}>
          <Btn icon="target" ds={ds("pick")} onClick={loadSources} disabled={!desktop}>{t("premiumGaming.instantClip.pickSource")}</Btn>
        </SetRow>
        {sources ? (
          <div className="ps-src" data-testid="pg-clip-sources" data-s={ds("sources")}>
            {sources.map((src) => (
              <button type="button" key={src.id} aria-pressed={src.id === s.sourceId} onClick={() => { update({ sourceId: src.id, sourceName: src.name }); setSources(null); }}>
                {src.thumb ? <img src={src.thumb} alt="" /> : null}
                <span>{src.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Group>
      <Group title={t("premiumStory.g.recording")}>
        <SetRow icon="clock" label={t("premiumGaming.instantClip.length")}>
          <Seg value={s.windowSec} onChange={(v) => update({ windowSec: Number(v) })} label={t("premiumGaming.instantClip.length")} ds={ds("length")} options={[{ value: 30, label: t("premiumGaming.instantClip.sec30") }, { value: 60, label: t("premiumGaming.instantClip.sec60") }]} />
        </SetRow>
        <SetRow icon="film" label={t("premiumGaming.instantClip.quality")} ds={ds("quality")}>
          <Badge>{t("premiumGaming.instantClip.qualityValue")}</Badge>
        </SetRow>
        <SetRow icon="keyboard" label={t("premiumGaming.common.hotkey")}>
          <HotkeyField value={s.hotkey} onChange={(hotkey) => update({ hotkey })} label={t("premiumGaming.common.hotkey")} ds={ds("hotkey")} none={t("premiumGaming.common.none")} pressKey={t("premiumAudio.hotkeys.pressKey")} />
        </SetRow>
        <SetRow icon="play" label={t("premiumGaming.instantClip.enable")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.instantClip.enable")} disabled={!desktop || !s.sourceId} testId="pg-clip-on" ds={ds("on")} />
        </SetRow>
        {clip.error ? <Hint tone="err" live>{t(`premiumGaming.instantClip.error.${clip.error}`)}</Hint> : null}
      </Group>
      {info ? (
        <Group title={t("premiumStory.g.buffer")}>
          <div className="ps-clipstat" data-testid="pg-clip-status" data-s={ds("status")}>
            <SetRow label={t("premiumGaming.instantClip.status", { seconds: Math.round(info.bufferedSec), mb: (info.bytes / MB).toFixed(1), cap: Math.round(cap / MB) })}>
              <Badge tone="ok">{info.hardware ? t("premiumGaming.instantClip.hw") : t("premiumGaming.instantClip.sw")}</Badge>
            </SetRow>
            <Actions>
              <Btn kind="primary" icon="film" data-testid="pg-clip-save" onClick={() => saveClip()}>{t("premiumGaming.instantClip.saveNow")}</Btn>
              <Btn icon="activity" data-testid="pg-clip-measure" onClick={() => measureClipCost()}>{t("premiumGaming.instantClip.measure")}</Btn>
              {clip.cost?.main ? (
                <span className="ps-note tnum" data-testid="pg-clip-cost">
                  {t("premiumGaming.instantClip.cost", { cpu: clip.cost.main.renderer?.cpuPercent ?? clip.cost.main.total.cpuPercent, mem: Math.round((clip.cost.main.renderer?.privateMB || clip.cost.main.renderer?.workingSetMB) ?? clip.cost.main.total.workingSetMB), dropped: info.dropped })}
                </span>
              ) : null}
            </Actions>
          </div>
        </Group>
      ) : null}
      <Hint ds={ds("help")}>{t("premiumGaming.instantClip.help", { seconds: s.windowSec, hotkey: hotkeyText })}</Hint>
      <Hint ds={ds("audioNote")}>{t("premiumGaming.instantClip.audioNote")}</Hint>
    </>
  );
}

export default Panel;
