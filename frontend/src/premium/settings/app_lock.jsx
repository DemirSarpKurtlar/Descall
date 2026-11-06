import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { DesktopOnly, Field, PanelShell, Switch } from "../gaming/ui.jsx";
import { failMessage, isDesktop, pinvoke, reportFailure } from "../gaming/bridge.js";

export const key = "app_lock";
const PIN_RE = /^\d{4,12}$/;

export function Panel() {
  const t = useT();
  const [st, setSt] = useState(null);
  const [pin, setPin] = useState("");
  const [current, setCurrent] = useState("");
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const desktop = isDesktop();

  const reload = useCallback(async () => {
    const r = await pinvoke("premium:app_lock:status");
    if (r?.ok) setSt(r);
  }, []);
  useEffect(() => { if (desktop) reload(); }, [desktop, reload]);

  const config = async (patch) => {
    const r = await pinvoke("premium:app_lock:config", { ...(st?.config || {}), ...patch });
    if (r?.ok) setSt(r);
  };
  const savePin = async (e) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) { setMsg({ ok: "", err: t("premiumGaming.appLock.invalid") }); return; }
    const r = await pinvoke("premium:app_lock:set-pin", pin, current);
    if (r?.ok) {
      setPin(""); setCurrent("");
      setMsg({ ok: t("premiumGaming.appLock.saved"), err: "" });
      await reload();
    } else {
      if (r?.error !== "wrong_pin") reportFailure("app_lock", r);
      setMsg({ ok: "", err: r?.error === "wrong_pin" ? t("premiumGaming.appLock.wrong") : failMessage(t, r) });
    }
  };
  const removePin = async () => {
    const r = await pinvoke("premium:app_lock:clear-pin", current);
    if (r?.ok) { setCurrent(""); setMsg({ ok: "", err: "" }); await reload(); }
    else setMsg({ ok: "", err: t("premiumGaming.appLock.wrong") });
  };

  const c = st?.config || {};
  return (
    <PanelShell title={t("premiumGaming.appLock.title")} desc={t("premiumGaming.appLock.desc")} testId="pg-panel-app_lock">
      {!desktop ? <DesktopOnly /> : null}
      <form className="pg-card" onSubmit={savePin}>
        {st?.hasPin ? (
          <Field label={t("premiumGaming.appLock.currentPin")}>
            <input className="pg-input" type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, "").slice(0, 12))} />
          </Field>
        ) : null}
        <Field label={t("premiumGaming.appLock.newPin")}>
          <input className="pg-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))} data-testid="pg-lock-newpin" />
        </Field>
        <div className="pg-row">
          <button type="submit" className="pg-btn is-primary is-small" disabled={!desktop}>{st?.hasPin ? t("premiumGaming.appLock.changePin") : t("premiumGaming.appLock.setPin")}</button>
          {st?.hasPin ? <button type="button" className="pg-btn is-small is-danger" onClick={removePin}>{t("premiumGaming.appLock.removePin")}</button> : null}
          {msg.ok ? <span className="pg-ok">{msg.ok}</span> : null}
          {msg.err ? <span className="pg-error">{msg.err}</span> : null}
        </div>
      </form>
      <div className="pg-card">
        <Switch checked={c.enabled} disabled={!st?.hasPin} onChange={(enabled) => config({ enabled })} label={t("premiumGaming.appLock.enable")} testId="pg-lock-on" />
        <Field label={t("premiumGaming.appLock.idle")}>
          <select className="pg-select" value={String(c.idleMinutes ?? 10)} onChange={(e) => config({ idleMinutes: Number(e.target.value) })} disabled={!c.enabled}>
            <option value="0">{t("premiumGaming.appLock.idleOff")}</option>
            {[1, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{t("premiumGaming.common.minutes", { count: m })}</option>)}
          </select>
        </Field>
        <Switch checked={c.onMinimize !== false} disabled={!c.enabled} onChange={(onMinimize) => config({ onMinimize })} label={t("premiumGaming.appLock.onMinimize")} />
        <Switch checked={c.onSystemLock !== false} disabled={!c.enabled} onChange={(onSystemLock) => config({ onSystemLock })} label={t("premiumGaming.appLock.onSystemLock")} />
        <div className="pg-row">
          <button type="button" className="pg-btn is-small" disabled={!c.enabled} onClick={() => pinvoke("premium:app_lock:lock")}>{t("premiumGaming.appLock.lockNow")}</button>
        </div>
      </div>
      <p className="pg-help">{t("premiumGaming.appLock.help")}</p>
    </PanelShell>
  );
}

export default Panel;
