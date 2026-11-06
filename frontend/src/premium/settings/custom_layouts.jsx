import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, PanelShell } from "../gaming/ui.jsx";
import { isDesktop, pinvoke } from "../gaming/bridge.js";
import { Trash2 } from "../../components/ui/Icon.jsx";

export const key = "custom_layouts";

export function Panel() {
  const t = useT();
  const [w, updateWidgets] = useFeatureSettings("widgets", DEFAULTS.widgets);
  const [data, setData] = useState({ layouts: [], active: null });
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    const r = await pinvoke("premium:custom_layouts:list");
    if (r?.ok) setData({ layouts: r.layouts || [], active: r.active });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const save = async () => {
    const r = await pinvoke("premium:custom_layouts:save", { name, widgets: w.widgets || [] });
    if (r?.ok) { setName(""); setErr(""); setData({ layouts: r.layouts, active: r.active }); }
    else setErr(r?.error === "limit" ? t("premiumGaming.layouts.limit") : t("premiumGaming.common.failed"));
  };
  const apply = async (l) => {
    await updateWidgets({ widgets: l.widgets || [], on: true });
    await pinvoke("premium:custom_layouts:apply", l.id);
    reload();
  };
  return (
    <PanelShell title={t("premiumGaming.layouts.title")} desc={t("premiumGaming.layouts.desc")} testId="pg-panel-custom_layouts">
      {!isDesktop() ? <DesktopOnly /> : null}
      <div className="pg-row">
        <input className="pg-input pg-grow" value={name} maxLength={40} placeholder={t("premiumGaming.layouts.name")} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="pg-btn is-primary is-small" disabled={!name.trim() || !isDesktop()} onClick={save}>{t("premiumGaming.layouts.save")}</button>
      </div>
      {err ? <p className="pg-error">{err}</p> : null}
      {data.layouts.length ? (
        <ul className="pg-list">
          {data.layouts.map((l) => (
            <li key={l.id}>
              <span className="pg-grow">{l.name}</span>
              <span className="pg-muted">{t("premiumGaming.layouts.count", { count: (l.widgets || []).length })}</span>
              {data.active === l.id ? <span className="pg-chip is-on">{t("premiumGaming.workspace.active")}</span> : null}
              <button type="button" className="pg-btn is-small" onClick={() => apply(l)}>{t("premiumGaming.layouts.apply")}</button>
              <button type="button" className="pg-btn is-small" aria-label={t("premiumGaming.common.remove")} onClick={async () => { await pinvoke("premium:custom_layouts:remove", l.id); reload(); }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.layouts.empty")}</p>}
    </PanelShell>
  );
}

export default Panel;
