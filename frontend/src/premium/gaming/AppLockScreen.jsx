/* App lock screen (Descall+). Main holds the locked flag; this only draws the PIN prompt.
 * Approved draft B (2026-11-06): a phone-style lock screen. Big clock and date at the top,
 * the person's avatar and name below, and a row of PIN dots fed by a hidden input. The
 * background is opaque, so nothing of the app shows through while it is locked. */
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { pinvoke, pon, logPremiumEvent } from "./bridge.js";
import { Avatar } from "../../components/ui/Avatar.jsx";
import { resolveDisplayName } from "../../lib/userProfile.js";
import { DescallMark } from "../../components/polls/dsxShared.jsx";
import "./gaming.css";

const MIN = 4;
const MAX = 12;
const BASE_SLOTS = 6;

/** How many dots to draw: six to start with, one more for each digit past six. */
export function pinSlots(length) {
  return Math.min(MAX, Math.max(BASE_SLOTS, length));
}

function useClock(active) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    let timer;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return () => clearTimeout(timer);
  }, [active]);
  return now;
}

export default function AppLockScreen({ me = null }) {
  const { t, locale } = useLocale();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const now = useClock(locked);

  useEffect(() => {
    pinvoke("premium:app_lock:status").then((r) => { if (r?.ok && r.locked) setLocked(true); });
    return pon("premium:app_lock:locked", (m) => {
      setLocked(Boolean(m?.locked));
      if (m?.locked) { setPin(""); setErr(""); logPremiumEvent("lock", ""); }
    });
  }, []);
  useEffect(() => { if (locked) setTimeout(() => inputRef.current?.focus(), 50); }, [locked]);

  if (!locked) return null;

  const submit = async (e) => {
    e?.preventDefault();
    if (pin.length < MIN || busy) return;
    setBusy(true);
    const r = await pinvoke("premium:app_lock:unlock", pin);
    setBusy(false);
    setPin("");
    if (r?.ok) { setErr(""); setLocked(false); return; }
    setShake((n) => n + 1);
    if (r?.retryInMs > 0) setErr(t("premiumGaming.appLock.wait", { seconds: Math.ceil(r.retryInMs / 1000) }));
    else setErr(t("premiumGaming.appLock.wrong"));
    inputRef.current?.focus();
  };

  const name = resolveDisplayName(me) || me?.username || "";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const slots = pinSlots(pin.length);

  return (
    <div
      className="pg-lock"
      data-testid="pg-app-lock"
      role="dialog"
      aria-modal="true"
      aria-label={t("premiumGaming.appLock.lockedTitle")}
      onMouseDown={(e) => { if (e.target !== inputRef.current) { e.preventDefault(); inputRef.current?.focus(); } }}
    >
      <div className="pgl-aurora" aria-hidden="true" />
      <div className="pgl-brand" aria-hidden="true"><DescallMark size={18} /> <span>Descall</span></div>
      <div className="pgl-clock">
        <div className="pgl-date">{date}</div>
        <div className="pgl-time">{time}</div>
      </div>
      <form className="pgl-auth" onSubmit={submit}>
        {me ? <span className="pgl-avatar"><Avatar user={me} name={name} size={72} animate="never" /></span> : null}
        <h1 className="pgl-name">{name || t("premiumGaming.appLock.lockedTitle")}</h1>
        <span className="pgl-sr">{t("premiumGaming.appLock.lockedTitle")}</span>
        <div className="pgl-pin">
          <input
            ref={inputRef}
            className="pgl-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("premiumGaming.appLock.pin")}
            aria-describedby="pgl-hint"
            value={pin}
            maxLength={MAX}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, MAX)); if (err) setErr(""); }}
          />
          <div key={shake} className={`pgl-dots${err ? " is-error" : ""}${shake ? " is-shake" : ""}`} aria-hidden="true">
            {Array.from({ length: slots }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
          </div>
          <button type="submit" className={`pgl-go${pin.length >= MIN ? " is-ready" : ""}`} disabled={pin.length < MIN || busy} aria-label={t("premiumGaming.appLock.unlock")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div id="pgl-hint" className={`pgl-hint${err ? " is-error" : ""}`} role="status" aria-live="polite">
          {err || t("premiumGaming.appLock.hint")}
        </div>
      </form>
    </div>
  );
}
