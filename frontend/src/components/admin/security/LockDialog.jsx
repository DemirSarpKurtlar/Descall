/**
 * "Acil kilit başlat" (Draft A frame A2): pick the locks, auto-expiry, the required
 * reason (audited), the 6-digit code, the info band switch; on the right the impact
 * preview (online now, last-hour sign-ups and DMs, auto end) and the band users will see
 * on desktop or phone. Locks that are already on show as active and cannot be picked
 * again (A1 shows "Kayıt dondurma" on while A2 picks it as new: the real dialog is
 * consistent with the live state).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, History, Lock, Monitor, Smartphone } from "../../ui/Icon.jsx";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { Dialog, ICONS } from "./ui.jsx";
import { securityApi } from "./securityApi.js";
import {
  LOCK_DURATIONS,
  LOCK_META,
  LOCK_MODES,
  OTP_LENGTH,
  autoEndAt,
  bandModeFor,
  bandText,
  cleanOtp,
  errorKey,
  fmtNum,
  fmtStamp,
  initialModes,
  lockConfirmLabel,
  lockFormErrors,
  remainingText,
  toggleMode,
} from "./securityModel.js";

function Otp({ value, onChange, invalid, label, describedBy }) {
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || "");
  const focusAt = (i) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();
  return (
    <div className={`sc-otp${invalid ? " is-bad" : ""}`} role="group" aria-label={label} aria-describedby={describedBy}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={OTP_LENGTH}
          aria-label={`${label} ${i + 1}`}
          className={d ? "is-filled" : ""}
          data-testid={`sc-otp-${i}`}
          onChange={(e) => {
            const raw = cleanOtp(e.target.value);
            if (raw.length > 1) {
              const next = cleanOtp(value.slice(0, i) + raw);
              onChange(next);
              focusAt(next.length);
              return;
            }
            const arr = value.split("");
            arr[i] = raw;
            const next = cleanOtp(arr.join("").slice(0, OTP_LENGTH));
            onChange(next);
            if (raw) focusAt(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              focusAt(i - 1);
            } else if (e.key === "ArrowLeft") focusAt(i - 1);
            else if (e.key === "ArrowRight") focusAt(i + 1);
          }}
        />
      ))}
    </div>
  );
}

export default function LockDialog({ open, onClose, t, locale, now, preselect, activeLocks, needCode = true, onStarted }) {
  const titleId = useId();
  const errId = useId();
  const [modes, setModes] = useState([]);
  const [duration, setDuration] = useState("1h");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState(true);
  const [device, setDevice] = useState("desktop");
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeBad, setCodeBad] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setModes(initialModes(preselect, activeLocks));
    setDuration("1h");
    setReason("");
    setCode("");
    setBanner(true);
    setError("");
    setCodeBad(false);
    setTried(false);
    setImpact(null);
    let alive = true;
    securityApi
      .impact()
      .then((d) => alive && setImpact(d))
      .catch(() => alive && setImpact({ online: null, signupsLastHour: null, dmsLastHour: null }));
    return () => {
      alive = false;
    };
    // preselect / activeLocks are read once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = lockFormErrors({ modes, reason, code, needCode });
  const endAt = autoEndAt(duration, now);
  const bandMode = bandModeFor(modes);
  const band = bandText(bandMode, duration, t);
  const confirm = lockConfirmLabel(t, modes.length, duration);
  const num = (v) => (v == null ? "—" : fmtNum(v, locale));

  const submit = async () => {
    setTried(true);
    if (errors.length || busy) return;
    setBusy(true);
    setError("");
    setCodeBad(false);
    try {
      if (needCode) {
        try {
          await securityApi.verifyCode(code);
        } catch (err) {
          setCodeBad(true);
          setCode("");
          setError(t(err?.code === "replay" ? "secCenter.err.replay" : "secCenter.err.invalid"));
          return;
        }
      }
      const res = await securityApi.startLocks({ modes, duration, reason: reason.trim(), banner });
      onStarted?.(res);
    } catch (err) {
      const key = errorKey(err);
      setError(key ? t(key) : err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const durationLabel = useMemo(() => Object.fromEntries(LOCK_DURATIONS.map((d) => [d, t(`secCenter.duration.${d}`)])), [t]);

  return (
    <Dialog open={open} onClose={onClose} busy={busy} labelledBy={titleId} className="sc-lockdlg" testId="sc-lock-dialog">
      <div className="sc-dlg-l">
        <header className="sc-dh">
          <span className="sc-dh-ic is-red" aria-hidden="true">
            <Lock size={20} />
          </span>
          <div>
            <h2 id={titleId}>{t("secCenter.lockDlg.title")}</h2>
            <p>{t("secCenter.lockDlg.sub")}</p>
          </div>
        </header>
        <div>
          <div className="sc-lab" id={`${titleId}-modes`}>{t("secCenter.lockDlg.modes")}</div>
          <div className="sc-modes" role="group" aria-labelledby={`${titleId}-modes`}>
            {LOCK_MODES.map((mode, i) => {
              const meta = LOCK_META[mode];
              const Icon = ICONS[meta.icon];
              const active = activeLocks?.[mode];
              const on = modes.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  role="checkbox"
                  aria-checked={active ? "mixed" : on}
                  aria-disabled={Boolean(active)}
                  className={`sc-mode${on ? " is-on" : ""}${active ? " is-active" : ""}`}
                  onClick={() => !active && setModes((m) => toggleMode(m, mode, activeLocks))}
                  data-autofocus={i === 0 ? true : undefined}
                  data-testid={`sc-mode-${mode}`}
                >
                  <span className={`sc-ic is-${meta.tone}`} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className="sc-mode-txt">
                    <b>{t(`secCenter.lockMode.${mode}.name`)}</b>
                    <small>{t(`secCenter.lockMode.${mode}.long`)}</small>
                  </span>
                  {active ? (
                    <span className="sc-chip is-amber">{t("secCenter.lockDlg.alreadyOn", { time: remainingText(active.until, t, now) })}</span>
                  ) : (
                    <span className="sc-chk2" aria-hidden="true">{on ? <Check size={12} /> : null}</span>
                  )}
                </button>
              );
            })}
          </div>
          {tried && errors.includes("modes") ? <p className="sc-field-err">{t("secCenter.lockDlg.pickOne")}</p> : null}
        </div>
        <div>
          <div className="sc-lab" id={`${titleId}-dur`}>{t("secCenter.lockDlg.duration")}</div>
          <div className="sc-pills" role="radiogroup" aria-labelledby={`${titleId}-dur`}>
            {LOCK_DURATIONS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={duration === d} className={duration === d ? "is-onr" : ""} onClick={() => setDuration(d)} data-testid={`sc-dur-${d}`}>
                {durationLabel[d]}
              </button>
            ))}
          </div>
        </div>
        <label className="sc-field">
          <span className="sc-lab">{t("secCenter.lockDlg.reason")}</span>
          <textarea
            className={`sc-ta${tried && errors.includes("reason") ? " is-bad" : ""}`}
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("secCenter.lockDlg.reasonPh")}
            data-testid="sc-lock-reason"
          />
        </label>
        <div className="sc-otp-row">
          {needCode ? (
            <div>
              <div className="sc-lab">{t("secCenter.lockDlg.code")}</div>
              <Otp value={code} onChange={(v) => { setCode(v); setCodeBad(false); }} invalid={codeBad || (tried && errors.includes("code"))} label={t("secCenter.lockDlg.code")} describedBy={error ? errId : undefined} />
            </div>
          ) : null}
          <label className="sc-check">
            <GlassCheckbox checked={banner} onChange={(e) => setBanner(e.target.checked)} data-testid="sc-lock-banner" />
            <span>{t("secCenter.lockDlg.banner")}</span>
          </label>
        </div>
        {error ? <p className="sc-err" id={errId} role="alert">{error}</p> : null}
        <div className="sc-row">
          <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
            {t("secCenter.cancel")}
          </button>
          <button type="button" className="sc-btn is-r" onClick={submit} disabled={busy || (tried && errors.length > 0)} aria-disabled={errors.length > 0} data-testid="sc-lock-submit">
            <Lock size={15} aria-hidden="true" />
            {busy ? t("secCenter.lockDlg.starting") : confirm}
          </button>
        </div>
      </div>
      <aside className="sc-dlg-r" aria-label={t("secCenter.lockDlg.impact")}>
        <div className="sc-lab sc-lab-ic">
          <Eye size={15} aria-hidden="true" />
          {t("secCenter.lockDlg.impact")}
        </div>
        <div className="sc-kv2">
          <div><span>{t("secCenter.lockDlg.online")}</span><b className="tnum">{impact ? num(impact.online) : "…"}</b></div>
          <div><span>{t("secCenter.lockDlg.signups")}</span><b className="tnum">{impact ? num(impact.signupsLastHour) : "…"}</b></div>
          <div><span>{t("secCenter.lockDlg.dms")}</span><b className="tnum">{impact ? num(impact.dmsLastHour) : "…"}</b></div>
          <div><span>{t("secCenter.lockDlg.autoEnd")}</span><b>{endAt ? fmtStamp(endAt, t, locale, now) : t("secCenter.duration.manual")}</b></div>
        </div>
        <div className="sc-band-h">
          <div className="sc-lab">{t("secCenter.lockDlg.bandTitle")}</div>
          <div className="sc-seg" role="radiogroup" aria-label={t("secCenter.lockDlg.device")}>
            <button type="button" role="radio" aria-checked={device === "desktop"} className={device === "desktop" ? "is-on" : ""} onClick={() => setDevice("desktop")} title={t("secCenter.lockDlg.desktop")} aria-label={t("secCenter.lockDlg.desktop")}>
              <Monitor size={13} />
            </button>
            <button type="button" role="radio" aria-checked={device === "phone"} className={device === "phone" ? "is-on" : ""} onClick={() => setDevice("phone")} title={t("secCenter.lockDlg.phone")} aria-label={t("secCenter.lockDlg.phone")}>
              <Smartphone size={13} />
            </button>
          </div>
        </div>
        <div className={`sc-mock is-${device}`} data-testid="sc-band-preview">
          {device === "phone" ? <span className="sc-mock-notch" aria-hidden="true" /> : null}
          {bandMode && banner ? (
            <div className="sc-band">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{band}</span>
            </div>
          ) : (
            <div className="sc-band is-none">{bandMode ? t("secCenter.lockDlg.noBand") : t("secCenter.lockDlg.pickForBand")}</div>
          )}
          {bandMode === "registration" && banner ? <p className="sc-mock-note">{t("secCenter.lockDlg.registrationWhere")}</p> : null}
          <div className="sc-ln" style={{ width: "70%" }} />
          <div className="sc-ln" style={{ width: "52%" }} />
          <div className="sc-ln" style={{ width: "84%" }} />
          <div className="sc-ln" style={{ width: "40%" }} />
        </div>
        <div className="sc-warn">
          <History size={16} aria-hidden="true" />
          <span>{duration === "manual" ? t("secCenter.lockDlg.noteManual") : t("secCenter.lockDlg.noteAuto")}</span>
        </div>
      </aside>
    </Dialog>
  );
}
