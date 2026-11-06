import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { failMessage, isDesktop, pinvoke, reportFailure } from "../gaming/bridge.js";
import { Btn, Group, Hint, Note, Seg, SetRow, Switch, TextField, ToggleTiles } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "app_lock";
const ds = (s) => `${key}.${s}`;
const PIN_RE = /^\d{4,12}$/;
const IDLE = [0, 1, 5, 10, 15, 30, 60];

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
  const lockState = useMemo(() => ({ hasPin: Boolean(st?.hasPin), enabled: Boolean(c.enabled) }), [st?.hasPin, c.enabled]);
  usePublish("app_lock.state", lockState);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 12);
  return (
    <>
      <Group title={t("premiumGaming.appLock.pin")}>
        <Note ds={ds("desc")}>{t("premiumGaming.appLock.desc")}</Note>
        {!desktop ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <form className="ps-fields" onSubmit={savePin}>
          {st?.hasPin ? (
            <label className="ps-field">
              <small>{t("premiumGaming.appLock.currentPin")}</small>
              <TextField className="ps-pin-in" type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(v) => setCurrent(digits(v))} label={t("premiumGaming.appLock.currentPin")} ds={ds("currentPin")} />
            </label>
          ) : null}
          <label className="ps-field">
            <small>{t("premiumGaming.appLock.newPin")}</small>
            <TextField className="ps-pin-in" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(v) => setPin(digits(v))} label={t("premiumGaming.appLock.newPin")} ds={ds("newPin")} data-testid="pg-lock-newpin" />
          </label>
          <div className="ps-act ps-span">
            <Btn type="submit" kind="primary" icon="lock" ds={ds("setPin")} disabled={!desktop}>{st?.hasPin ? t("premiumGaming.appLock.changePin") : t("premiumGaming.appLock.setPin")}</Btn>
            {st?.hasPin ? <Btn className="is-danger" ds={ds("removePin")} onClick={removePin}>{t("premiumGaming.appLock.removePin")}</Btn> : null}
          </div>
        </form>
        {msg.ok ? <Hint tone="ok" live>{msg.ok}</Hint> : null}
        {msg.err ? <Hint tone="err" live>{msg.err}</Hint> : null}
      </Group>
      <Group title={t("premiumStory.g.locking")}>
        <SetRow icon="lock" label={t("premiumGaming.appLock.enable")}>
          <Switch checked={c.enabled} disabled={!st?.hasPin} onChange={(enabled) => config({ enabled })} label={t("premiumGaming.appLock.enable")} testId="pg-lock-on" ds={ds("lock")} />
        </SetRow>
        <SetRow icon="clock" label={t("premiumGaming.appLock.idle")} stack>
          <Seg
            wrap
            value={c.idleMinutes ?? 10}
            disabled={!c.enabled}
            onChange={(v) => config({ idleMinutes: Number(v) })}
            label={t("premiumGaming.appLock.idle")}
            ds={ds("idle")}
            options={IDLE.map((m) => ({ value: m, label: m ? t("premiumGaming.common.minutes", { count: m }) : t("premiumGaming.appLock.idleOff") }))}
          />
        </SetRow>
        <ToggleTiles
          items={[
            { id: "onMinimize", icon: "down", label: t("premiumGaming.appLock.onMinimize"), ds: ds("onMinimize"), checked: c.onMinimize !== false, disabled: !c.enabled, onChange: (onMinimize) => config({ onMinimize }) },
            { id: "onSystemLock", icon: "monitor", label: t("premiumGaming.appLock.onSystemLock"), ds: ds("onSystemLock"), checked: c.onSystemLock !== false, disabled: !c.enabled, onChange: (onSystemLock) => config({ onSystemLock }) },
          ]}
        />
        <div className="ps-act">
          <Btn icon="lock" ds={ds("lockNow")} disabled={!c.enabled} onClick={() => pinvoke("premium:app_lock:lock")}>{t("premiumGaming.appLock.lockNow")}</Btn>
        </div>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.appLock.help")}</Hint>
    </>
  );
}

export default Panel;
