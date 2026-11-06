/* App lock screen (Descall+). Main holds the locked flag; this only draws the PIN prompt. */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { pinvoke, pon, logPremiumEvent } from "./bridge.js";
import { Lock } from "../../components/ui/Icon.jsx";
import "./gaming.css";

export default function AppLockScreen() {
  const t = useT();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    pinvoke("premium:app_lock:status").then((r) => { if (r?.ok && r.locked) setLocked(true); });
    return pon("premium:app_lock:locked", (m) => {
      setLocked(Boolean(m?.locked));
      if (m?.locked) logPremiumEvent("lock", "");
    });
  }, []);
  useEffect(() => { if (locked) setTimeout(() => inputRef.current?.focus(), 50); }, [locked]);

  if (!locked) return null;
  const submit = async (e) => {
    e.preventDefault();
    const r = await pinvoke("premium:app_lock:unlock", pin);
    setPin("");
    if (r?.ok) { setErr(""); setLocked(false); return; }
    if (r?.retryInMs > 0) setErr(t("premiumGaming.appLock.wait", { seconds: Math.ceil(r.retryInMs / 1000) }));
    else setErr(t("premiumGaming.appLock.wrong"));
  };
  return (
    <div className="pg-lock" data-testid="pg-app-lock">
      <form onSubmit={submit}>
        <Lock size={28} />
        <b>{t("premiumGaming.appLock.lockedTitle")}</b>
        <input ref={inputRef} className="pg-input" type="password" inputMode="numeric" autoComplete="off" aria-label={t("premiumGaming.appLock.pin")} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))} />
        {err ? <span className="pg-error">{err}</span> : null}
        <button type="submit" className="pg-btn is-primary" disabled={pin.length < 4}>{t("premiumGaming.appLock.unlock")}</button>
      </form>
    </div>
  );
}
