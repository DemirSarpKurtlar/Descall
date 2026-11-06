import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { DesktopOnly, PanelShell } from "../gaming/ui.jsx";
import { failMessage, isDesktop, pinvoke, reportFailure } from "../gaming/bridge.js";
import { Trash2 } from "../../components/ui/Icon.jsx";

export const key = "multi_account";

export function Panel() {
  const t = useT();
  const [data, setData] = useState({ accounts: [], max: 3 });
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    const r = await pinvoke("premium:multi_account:list");
    if (r?.ok) setData({ accounts: r.accounts || [], max: r.max || 3 });
  }, []);
  useEffect(() => { if (isDesktop()) reload(); }, [reload]);
  const add = async () => {
    const r = await pinvoke("premium:multi_account:add");
    if (!r?.ok && r?.error !== "limit") reportFailure("multi_account", r);
    setErr(r?.ok ? "" : r?.error === "limit" ? t("premiumGaming.multiAccount.limit", { max: data.max }) : failMessage(t, r));
    reload();
  };
  return (
    <PanelShell title={t("premiumGaming.multiAccount.title")} desc={t("premiumGaming.multiAccount.desc")} testId="pg-panel-multi_account">
      {!isDesktop() ? <DesktopOnly /> : null}
      <div className="pg-row">
        <button type="button" className="pg-btn is-primary is-small" disabled={!isDesktop() || data.accounts.length >= data.max} onClick={add}>{t("premiumGaming.multiAccount.add")}</button>
        {err ? <span className="pg-error">{err}</span> : null}
      </div>
      {data.accounts.length ? (
        <ul className="pg-list">
          {data.accounts.map((a) => (
            <li key={a.id}>
              <span className="pg-grow">{a.label || t("premiumGaming.multiAccount.unnamed")}</span>
              <span className="pg-chip">{a.signedIn ? t("premiumGaming.multiAccount.signedIn") : t("premiumGaming.multiAccount.notSignedIn")}</span>
              <button type="button" className="pg-btn is-small" onClick={() => pinvoke("premium:multi_account:open", a.id)}>{t("premiumGaming.multiAccount.open")}</button>
              <button type="button" className="pg-btn is-small is-danger" aria-label={t("premiumGaming.common.remove")} onClick={async () => { await pinvoke("premium:multi_account:remove", a.id); reload(); }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.multiAccount.empty")}</p>}
      <p className="pg-help">{t("premiumGaming.multiAccount.help", { max: data.max })}</p>
    </PanelShell>
  );
}

export default Panel;
