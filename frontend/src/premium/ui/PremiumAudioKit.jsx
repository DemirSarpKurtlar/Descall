/**
 * Small building blocks for the Descall+ hotkey / audio / notification
 * settings panels. They reuse the Settings classes (us-section, us-card,
 * us-row, us-toggle) so panels look native inside Settings, plus a few
 * pa-* classes in premiumAudio.css for meters, key caps and lists.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../context/localeContextInstance";
import { linearToDb, meterPercent, rms, smoothLevel } from "../audio/noiseGateMath.js";
import RangeSlider from "./RangeSlider.jsx";
import "./premiumAudio.css";

export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.descallPremium);
}

export function Section({ title, children, hint }) {
  return (
    <section className="us-section pa-section">
      {title ? <h4 className="us-section-label">{title}</h4> : null}
      <div className="us-card stack">{children}</div>
      {hint ? <p className="pa-hint">{hint}</p> : null}
    </section>
  );
}

export function Row({ title, description, children, id }) {
  return (
    <div className="us-row pa-row">
      <div className="us-row-text">
        <div className="us-row-copy">
          <span className="us-row-title" id={id}>{title}</span>
          {description ? <span className="us-row-desc">{description}</span> : null}
        </div>
      </div>
      <div className="us-row-control">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange, label, disabled = false }) {
  return (
    <button
      className={`us-toggle ${value ? "active" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      type="button"
      role="switch"
      aria-checked={Boolean(value)}
      aria-label={label}
      disabled={disabled}
    >
      <span className="us-toggle-knob" />
    </button>
  );
}

export function Slider({ value, min, max, step = 1, onChange, label, format = (v) => String(v) }) {
  return (
    <span className="pa-slider">
      <RangeSlider value={value} min={min} max={max} step={step} label={label} valueText={format(value)} onChange={onChange} />
      <span className="pa-slider-value tnum">{format(value)}</span>
    </span>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <select className="pa-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Button({ children, onClick, kind = "default", disabled = false, label }) {
  return (
    <button type="button" className={`pa-btn pa-btn-${kind}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  );
}

/** Compact toggle chip (weekday pickers). */
export function GlassCheckboxLite({ checked, onChange, label }) {
  return (
    <button type="button" className={`pa-chip${checked ? " is-on" : ""}`} role="checkbox" aria-checked={Boolean(checked)} onClick={() => onChange(!checked)}>
      {label}
    </button>
  );
}

export function Note({ tone = "info", children }) {
  return <p className={`pa-note pa-note-${tone}`} role={tone === "warn" ? "alert" : undefined}>{children}</p>;
}

/** Desktop-only feature on the web: one line instead of the controls. */
export function DesktopOnly({ children }) {
  const t = useT();
  if (isDesktopApp()) return children;
  return <Note>{t("premiumAudio.common.desktopOnly")}</Note>;
}

/** Key cap display for an accelerator ("CommandOrControl+Alt+M"). */
export function KeyCaps({ accel }) {
  const t = useT();
  if (!accel) return <span className="pa-keycaps pa-muted">{t("premiumAudio.hotkeys.unbound")}</span>;
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  const parts = String(accel).split("+").map((p) => {
    if (p === "CommandOrControl") return mac ? "Cmd" : "Ctrl";
    if (p === "Control") return "Ctrl";
    if (p === "Mouse4") return t("premiumAudio.hotkeys.mouse4");
    if (p === "Mouse5") return t("premiumAudio.hotkeys.mouse5");
    if (p === "Mouse3") return t("premiumAudio.hotkeys.mouse3");
    return p;
  });
  return (
    <span className="pa-keycaps">
      {parts.map((p, i) => <kbd key={`${p}-${i}`}>{p}</kbd>)}
    </span>
  );
}

const CODE_KEYS = {
  Space: "Space", Enter: "Return", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End",
  PageUp: "PageUp", PageDown: "PageDown", Backquote: "Backquote", Minus: "Minus", Equal: "Equal",
  BracketLeft: "BracketLeft", BracketRight: "BracketRight", Semicolon: "Semicolon", Quote: "Quote",
  Comma: "Comma", Period: "Period", Slash: "Slash", Backslash: "Backslash", CapsLock: "CapsLock",
  NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult", NumpadDivide: "numdiv", NumpadDecimal: "numdec",
};

/** KeyboardEvent -> accelerator, or "" while only modifiers are down. */
export function acceleratorFromEvent(e) {
  const code = String(e.code || "");
  let key = "";
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`;
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  if (!key) return "";
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}

/**
 * Click, then press a combination (or a mouse side button when allowMouse).
 * Esc cancels, Backspace / Delete alone clears.
 */
export function KeyRecorder({ value, onChange, allowMouse = false, label }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setRecording(false);
        onChange("");
        return;
      }
      const accel = acceleratorFromEvent(e);
      if (!accel) return;
      setRecording(false);
      onChange(accel);
    };
    const onMouse = (e) => {
      if (!allowMouse) return;
      // Browser buttons: 1 middle, 3 back (Mouse4), 4 forward (Mouse5).
      const map = { 1: "Mouse3", 3: "Mouse4", 4: "Mouse5" };
      const accel = map[e.button];
      if (!accel) return;
      e.preventDefault();
      setRecording(false);
      onChange(accel);
    };
    const onBlur = () => setRecording(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, allowMouse, onChange]);
  return (
    <button
      ref={ref}
      type="button"
      className={`pa-recorder${recording ? " is-recording" : ""}`}
      onClick={() => setRecording((r) => !r)}
      aria-label={label}
      aria-pressed={recording}
    >
      {recording ? <span className="pa-muted">{allowMouse ? t("premiumAudio.hotkeys.pressKeyOrMouse") : t("premiumAudio.hotkeys.pressKey")}</span> : <KeyCaps accel={value} />}
    </button>
  );
}

/**
 * Live level meter. Pass a MediaStream (meters it with one AnalyserNode, only
 * while mounted and visible) or a static `db`. Optional threshold marker.
 */
export function LevelMeter({ stream = null, db = null, thresholdDb = null, label, compact = false, onLevel = null }) {
  const [level, setLevel] = useState(-100);
  const smoothRef = useRef(-100);
  useEffect(() => {
    if (!stream || typeof window === "undefined") return undefined;
    const track = stream.getAudioTracks?.()[0];
    if (!track) return undefined;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return undefined;
    let ctx;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch { return undefined; }
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 50 || document.hidden) return; // ~20 fps is plenty for a meter
      last = now;
      an.getFloatTimeDomainData(buf);
      const d = linearToDb(rms(buf));
      smoothRef.current = smoothLevel(smoothRef.current, d);
      setLevel(smoothRef.current);
      if (onLevel) onLevel(d);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      try { src.disconnect(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
    };
  }, [stream, onLevel]);
  const shown = db != null ? db : level;
  const pct = meterPercent(shown);
  const mark = thresholdDb != null ? meterPercent(thresholdDb) : null;
  const open = thresholdDb != null && shown >= thresholdDb;
  return (
    <div
      className={`pa-meter${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="pa-meter-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      {mark != null ? <div className="pa-meter-mark" style={{ left: `${mark}%` }} /> : null}
    </div>
  );
}

/** Microphone test stream for meters in settings (released on unmount). */
export function useMicTestStream(active, deviceId = "") {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active || !navigator?.mediaDevices?.getUserMedia) return undefined;
    let live = true;
    let s = null;
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: false, autoGainControl: true }, video: false })
      .then((st) => {
        if (!live) { st.getTracks().forEach((tr) => tr.stop()); return; }
        s = st;
        setStream(st);
      })
      .catch((err) => { if (live) setError(err?.name || "error"); });
    return () => {
      live = false;
      s?.getTracks().forEach((tr) => tr.stop());
      setStream(null);
    };
  }, [active, deviceId]);
  return { stream, error };
}

/** enumerateDevices, refreshed on devicechange while mounted. */
export function useAudioDevices() {
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    const md = navigator?.mediaDevices;
    if (!md?.enumerateDevices) return undefined;
    let live = true;
    const load = () => md.enumerateDevices().then((d) => { if (live) setDevices(d); }).catch(() => {});
    load();
    md.addEventListener?.("devicechange", load);
    return () => { live = false; md.removeEventListener?.("devicechange", load); };
  }, []);
  return devices;
}

/** Status object from a premium:<key>:status channel (desktop), refreshed on demand. */
export function usePremiumStatus(channel, deps = []) {
  const [status, setStatus] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const b = typeof window !== "undefined" ? window.descallPremium : null;
    if (!b || !channel) return undefined;
    let live = true;
    b.invoke(channel).then((r) => { if (live) setStatus(r && r.ok !== false ? r : null); }).catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, n, ...deps]);
  return [status, () => setN((x) => x + 1)];
}
