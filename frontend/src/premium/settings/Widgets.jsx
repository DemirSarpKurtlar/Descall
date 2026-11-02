import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, PanelShell, Switch } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Plus, Trash2 } from "../../components/ui/Icon.jsx";

export const key = "widgets";
const KINDS = ["friends", "calls", "notifications"];
const MAX = 4;

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.widgets);
  const list = Array.isArray(s.widgets) ? s.widgets : [];
  const set = (id, patch) => update({ widgets: list.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const add = (kind) => {
    if (list.length >= MAX) return;
    const i = list.length;
    update({ widgets: [...list, { id: `${kind}${Date.now().toString(36)}`, kind, x: 60 + i * 40, y: 120 + i * 40, width: 240, height: 220, opacity: 0.95 }] });
  };
  return (
    <PanelShell title={t("premiumGaming.widgets.title")} desc={t("premiumGaming.widgets.desc")} testId="pg-panel-widgets">
      {!isDesktop() ? <DesktopOnly /> : null}
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.widgets.show")} disabled={!isDesktop()} testId="pg-widgets-on" />
      <div className="pg-row">
        {KINDS.map((k) => (
          <button key={k} type="button" className="pg-btn is-small" onClick={() => add(k)} disabled={list.length >= MAX} data-testid={`pg-widget-add-${k}`}>
            <Plus size={14} />{t(`premiumGaming.widgets.kinds.${k}`)}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="pg-list" data-testid="pg-widget-list">
          {list.map((w) => (
            <li key={w.id} style={{ flexWrap: "wrap" }}>
              <b className="pg-grow">{t(`premiumGaming.widgets.kinds.${w.kind}`)}</b>
              <label className="pg-label">{t("premiumGaming.widgets.x")} <input className="pg-input" type="number" style={{ width: 70 }} value={w.x} onChange={(e) => set(w.id, { x: num(e.target.value, w.x) })} /></label>
              <label className="pg-label">{t("premiumGaming.widgets.y")} <input className="pg-input" type="number" style={{ width: 70 }} value={w.y} onChange={(e) => set(w.id, { y: num(e.target.value, w.y) })} /></label>
              <label className="pg-label">{t("premiumGaming.widgets.w")} <input className="pg-input" type="number" style={{ width: 64 }} value={w.width} onChange={(e) => set(w.id, { width: num(e.target.value, w.width) })} /></label>
              <label className="pg-label">{t("premiumGaming.widgets.h")} <input className="pg-input" type="number" style={{ width: 64 }} value={w.height} onChange={(e) => set(w.id, { height: num(e.target.value, w.height) })} /></label>
              <button type="button" className="pg-btn is-small" aria-label={t("premiumGaming.common.remove")} onClick={() => update({ widgets: list.filter((x) => x.id !== w.id) })}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.widgets.empty")}</p>}
      <p className="pg-help">{t("premiumGaming.widgets.help", { max: MAX })}</p>
    </PanelShell>
  );
}

export default Panel;
