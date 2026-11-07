/* App lock screen (Descall+). Main holds the locked flag; this only draws the PIN prompt.
 * Approved draft B (2026-11-06): a phone-style lock screen. Big clock and date at the top,
 * the person's avatar and name below, and a row of PIN dots fed by a hidden input. The
 * background is opaque, so nothing of the app shows through while it is locked. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../context/LocaleContext";
import { pinvoke, pon, logPremiumEvent } from "./bridge.js";
import { Avatar } from "../../components/ui/Avatar.jsx";
import { resolveDisplayName } from "../../lib/userProfile.js";
import { DescallMark } from "../../components/polls/dsxShared.jsx";
import "./gaming.css";

const MIN = 4;
const MAX = 12;
const BASE_SLOTS = 6;

/**
 * While locked, everything on the page except the lock is inert and hidden from assistive
 * tech, so Tab, Enter and a screen reader's virtual cursor cannot reach the app behind it.
 * Returns a function that restores exactly what it changed.
 */
export function shieldBehind(lockEl, doc = typeof document !== "undefined" ? document : null) {
  if (!doc?.body || !lockEl) return () => {};
  const changed = [];
  for (const el of Array.from(doc.body.children)) {
    if (el === lockEl || el.contains(lockEl)) continue;
    if (el.inert && el.getAttribute("aria-hidden") === "true") continue;
    changed.push([el, el.inert, el.getAttribute("aria-hidden")]);
    el.inert = true;
    el.setAttribute("aria-hidden", "true");
  }
  return () => {
    for (const [el, inert, hidden] of changed) {
      el.inert = inert;
      if (hidden == null) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", hidden);
    }
  };
}

/** How many dots to draw: exactly the PIN's length when known (a 4-digit PIN shows 4 dots),
 *  otherwise six to start with and one more for each digit past six. */
export function pinSlots(length, known = null) {
  const k = Number(known);
  if (Number.isInteger(k) && k >= MIN && k <= MAX) return k;
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
  const [pinLen, setPinLen] = useState(null);
  const inputRef = useRef(null);
  const lockRef = useRef(null);
  const now = useClock(locked);

  useEffect(() => {
    pinvoke("premium:app_lock:status").then((r) => {
      if (r?.ok) setPinLen(r.pinLength || null);
      if (r?.ok && r.locked) setLocked(true);
    });
    return pon("premium:app_lock:locked", (m) => {
      setLocked(Boolean(m?.locked));
      if (m?.locked) {
        setPin(""); setErr(""); logPremiumEvent("lock", "");
        pinvoke("premium:app_lock:status").then((r) => { if (r?.ok) setPinLen(r.pinLength || null); });
      }
    });
  }, []);
  useEffect(() => { if (locked) setTimeout(() => inputRef.current?.focus(), 50); }, [locked]);
  // The lock is portaled to <body>; the app (#root) and any other body-level layer become
  // inert while it is up. New layers added while locked (toasts, call cards) are caught too.
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;
    const el = lockRef.current;
    let restore = shieldBehind(el);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => { restore(); restore = shieldBehind(el); }) : null;
    mo?.observe(document.body, { childList: true });
    return () => { mo?.disconnect(); restore(); };
  }, [locked]);

  if (!locked) return null;

  const submit = async (e, value = pin) => {
    e?.preventDefault();
    if (value.length < MIN || busy) return;
    setBusy(true);
    const r = await pinvoke("premium:app_lock:unlock", value);
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
  const slots = pinSlots(pin.length, pinLen);
  const maxLen = pinLen || MAX;

  const onKeyDown = (e) => {
    // Keep focus inside the lock: the PIN field and, once enabled, the unlock arrow.
    if (e.key !== "Tab") return;
    const items = [inputRef.current, lockRef.current?.querySelector(".pgl-go:not(:disabled)")].filter(Boolean);
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
  };

  const view = (
    <div
      ref={lockRef}
      className="pg-lock"
      data-testid="pg-app-lock"
      role="dialog"
      aria-modal="true"
      aria-label={t("premiumGaming.appLock.lockedTitle")}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => { if (e.target !== inputRef.current && !e.target.closest?.(".pgl-go")) { e.preventDefault(); inputRef.current?.focus(); } }}
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
            maxLength={maxLen}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, maxLen);
              setPin(next);
              if (err) setErr("");
              // Known length: the last digit unlocks on its own, like a phone.
              if (pinLen && next.length === pinLen) submit(null, next);
            }}
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
  return typeof document !== "undefined" && document.body ? createPortal(view, document.body) : view;
}
