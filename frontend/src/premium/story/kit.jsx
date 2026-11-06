/**
 * Controls of the Descall+ category pages (approved draft E, "Hikaye"). Panels in
 * ../settings/*.jsx build their settings from these: titled groups, visual choice tiles,
 * corner / edge pickers, segmented controls, toggle tiles, key caps and the RangeSlider.
 * Every control can carry `ds` ("<feature>.<setting>"), written to data-s so the settings
 * checklist (../settingsChecklist.js) can find it in the page.
 */
import { useId, useState } from "react";
import RangeSlider from "../ui/RangeSlider.jsx";
import { KeyCaps } from "../ui/PremiumAudioKit.jsx";
import { Ico } from "./icons.jsx";
import "./kit.css";

export { Ico, KeyCaps };

/** A titled settings group (right column of an open card). */
export function Group({ title, children, ds, aside, className = "" }) {
  const id = useId();
  return (
    <section className={`ps-g ${className}`.trim()} aria-labelledby={title ? id : undefined} data-s={ds}>
      {title || aside ? (
        <div className="ps-gh">
          {title ? <h4 className="ps-gt" id={id}>{title}</h4> : null}
          {aside ? <span className="ps-gaside">{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Plain explanatory line inside a group. */
export function Note({ children, ds, dim = false }) {
  return <p className={`ps-note${dim ? " is-dim" : ""}`} data-s={ds}>{children}</p>;
}

/** Tinted hint with an icon: info, ok, warn. */
export function Hint({ tone = "info", children, ds, live = false }) {
  const n = tone === "warn" ? "warn" : tone === "ok" ? "check" : "info";
  return (
    <p className={`ps-hint is-${tone}`} data-s={ds} role={live ? (tone === "warn" ? "alert" : "status") : undefined}>
      <Ico n={n} size={14} />
      <span>{children}</span>
    </p>
  );
}

/** Label (+ description) on the left, control on the right; `stack` puts a slider under it. */
export function SetRow({ icon, label, desc, children, ds, stack = false, labelId }) {
  return (
    <div className={`ps-r${stack ? " is-stack" : ""}`} data-s={ds}>
      {icon ? <span className="ps-ri" aria-hidden="true"><Ico n={icon} size={15} /></span> : null}
      <div className="ps-rc">
        <b id={labelId}>{label}</b>
        {desc ? <small>{desc}</small> : null}
      </div>
      {children != null ? <div className="ps-rx">{children}</div> : null}
    </div>
  );
}

/** The app's switch (us-toggle). */
export function Switch({ checked, onChange, label, disabled = false, ds, testId, small = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={`us-toggle${checked ? " active" : ""}${small ? " ps-sw-sm" : ""}`}
      data-s={ds}
      data-testid={testId}
      onClick={() => { if (!disabled) onChange(!checked); }}
    >
      <span className="us-toggle-knob" />
    </button>
  );
}

/** Slider with its value in a pill. Reaches both ends (RangeSlider). */
export function Slider({ value, min, max, step = 1, onChange, label, format = (v) => String(v), ds, disabled }) {
  return (
    <span className="ps-slider" data-s={ds}>
      <RangeSlider value={value} min={min} max={max} step={step} onChange={onChange} label={label} valueText={format(value)} disabled={disabled} />
      <output className="ps-val tnum" aria-hidden="true">{format(value)}</output>
    </span>
  );
}

/** Segmented control. options: [{ value, label, icon? }]. */
export function Seg({ value, options, onChange, label, ds, wrap = false, disabled = false }) {
  return (
    <div className={`ps-seg${wrap ? " is-wrap" : ""}`} role="radiogroup" aria-label={label} data-s={ds}>
      {options.map((o) => {
        const on = String(o.value) === String(value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.icon ? <Ico n={o.icon} size={14} /> : null}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One switch per item, as tiles. items: [{ id, label, icon, sub, checked, onChange, disabled, ds }]. */
export function ToggleTiles({ items, cols = false }) {
  return (
    <div className={`ps-tt${cols ? " is-cols" : ""}`}>
      {items.map((it) => (
        <div key={it.id} className={`ps-ttile${it.checked ? " is-on" : ""}${it.disabled ? " is-disabled" : ""}`} data-s={it.ds}>
          <span className="ti" aria-hidden="true"><Ico n={it.icon} size={16} /></span>
          <span className="tc">
            <b>{it.label}</b>
            {it.sub ? <small>{it.sub}</small> : null}
          </span>
          <Switch checked={it.checked} onChange={it.onChange} label={it.label} disabled={it.disabled} small />
        </div>
      ))}
    </div>
  );
}

/** Visual single choice (devices, presets, kinds). options: [{ value, label, icon, sub }]. */
export function ChoiceTiles({ value, options, onChange, label, ds, mini = false, disabled = false }) {
  return (
    <div className={`ps-tiles${mini ? " is-mini" : ""}`} role="radiogroup" aria-label={label} data-s={ds}>
      {options.map((o) => {
        const on = String(o.value) === String(value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            className="ps-tile"
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
          >
            <span className="ti" aria-hidden="true"><Ico n={o.icon || "sparkle"} size={mini ? 14 : 16} /></span>
            <span className="tl">{o.label}</span>
            {o.sub ? <span className="ts">{o.sub}</span> : null}
            <span className="tk" aria-hidden="true"><Ico n="check" size={11} sw={3} /></span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Spots on a small screen (corner picker, dock picker). spots: [{ id, label }];
 * each spot id is also its CSS position class (tl, tr, bl, br, top-left, mid-right ...).
 */
export function SpotPicker({ value, spots, onChange, label, ds, testIdPrefix, showLabel = true }) {
  const cur = spots.find((s) => s.id === value);
  return (
    <div className="ps-spots" role="radiogroup" aria-label={label} data-s={ds}>
      {spots.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={s.id === value}
          aria-label={s.label}
          title={s.label}
          className={`ps-spot at-${s.id}`}
          data-testid={testIdPrefix ? `${testIdPrefix}${s.id}` : undefined}
          onClick={() => onChange(s.id)}
        >
          <i aria-hidden="true" />
        </button>
      ))}
      {showLabel && cur ? <span className="ps-spots-lbl" aria-hidden="true">{cur.label}</span> : null}
    </div>
  );
}

/** Left / right screen edge. */
export function EdgePicker({ value, onChange, left, right, label, ds }) {
  return (
    <div className="ps-edges" role="radiogroup" aria-label={label} data-s={ds}>
      {[["left", left], ["right", right]].map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`e-${v}`} onClick={() => onChange(v)}>
          <i aria-hidden="true" />
          <span>{l}</span>
        </button>
      ))}
    </div>
  );
}

/** us-btn with an optional icon. */
export function Btn({ kind = "ghost", icon, children, className = "", ds, small = true, ...rest }) {
  return (
    <button type="button" className={`us-btn ${kind}${small ? " sm" : ""} ps-btn ${className}`.trim()} data-s={ds} {...rest}>
      {icon ? <Ico n={icon} size={14} /> : null}
      {children}
    </button>
  );
}

/** Square icon-only button (move up / down, remove). */
export function IconBtn({ icon, label, danger = false, ds, ...rest }) {
  return (
    <button type="button" className={`us-btn ghost sm ps-ib${danger ? " is-danger" : ""}`} aria-label={label} title={label} data-s={ds} {...rest}>
      <Ico n={icon} size={14} />
    </button>
  );
}

/** Text field in the page style. */
export function TextField({ value, onChange, placeholder, label, ds, className = "", ...rest }) {
  return (
    <input
      className={`ps-in ${className}`.trim()}
      value={value}
      placeholder={placeholder}
      aria-label={label || placeholder}
      data-s={ds}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

/** Native select in the page style (long, data-driven lists: friends, channels, devices). */
export function Picker({ value, onChange, options, label, ds, disabled }) {
  return (
    <select className="ps-select" value={value} aria-label={label} data-s={ds} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** A row of a list (layouts, presets, devices, history): thumb / icon, title, sub, actions. */
export function Item({ icon, thumb, title, sub, children, ds, active = false, unread = false, num }) {
  return (
    <li className={`ps-item${active ? " is-active" : ""}${unread ? " is-unread" : ""}`} data-s={ds}>
      {num != null ? <span className="ps-num tnum" aria-hidden="true">{num}</span> : null}
      {thumb || (icon ? <span className="ps-ii" aria-hidden="true"><Ico n={icon} size={15} /></span> : null)}
      <div className="ps-ic">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </div>
      {children ? <div className="ps-ia">{children}</div> : null}
    </li>
  );
}

export function List({ children, ds, label, empty }) {
  return (
    <ul className="ps-list" data-s={ds} aria-label={label}>
      {children}
      {empty ? <li className="ps-empty">{empty}</li> : null}
    </ul>
  );
}

/** Small status badge. */
export function Badge({ tone = "", children, ds }) {
  return <span className={`ps-badge${tone ? ` is-${tone}` : ""}`} data-s={ds}>{children}</span>;
}

/** Key caps in the page style, with a label above (shortcut display). */
export function KeyRow({ icon, label, desc, accel, children, ds }) {
  return (
    <SetRow icon={icon} label={label} desc={desc} ds={ds}>
      <span className="ps-keys"><KeyCaps accel={accel} /></span>
      {children}
    </SetRow>
  );
}

/** Hotkeys that could not be registered (duplicate, reserved, taken ...), as one warning. */
export function HotkeyFailureHint({ failures, t, ds }) {
  if (!Array.isArray(failures) || !failures.length) return null;
  return (
    <Hint tone="warn" ds={ds} live>
      {failures.map((f) => (
        <span key={`${f.action}-${f.accel}`} className="ps-block">
          {t(`premiumAudio.hotkeys.reason.${f.reason}`, {
            action: t(`premiumAudio.hotkeys.actions.${f.action}`),
            accel: f.accel,
            other: f.other ? t(`premiumAudio.hotkeys.actions.${f.other}`) : "",
          })}
        </span>
      ))}
    </Hint>
  );
}

/**
 * Global shortcut field (instant clip, command center, workspace profiles): shows the keys as
 * key caps; focus it and press a combination with Ctrl / Alt / Shift. Esc or Backspace clears.
 * Same accepted keys as the previous text field (gaming/ui.jsx HotkeyInput).
 */
export function HotkeyField({ value, onChange, label, ds, none, pressKey }) {
  const [rec, setRec] = useState(false);
  const onKeyDown = (e) => {
    if (e.key === "Tab") return;
    e.preventDefault();
    if (e.key === "Escape" || e.key === "Backspace") { onChange(""); return; }
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (!parts.length) return;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!/^([A-Z0-9]|F\d{1,2})$/.test(k)) return;
    onChange([...parts, k].join("+"));
  };
  return (
    <button
      type="button"
      className={`pa-recorder ps-hotkey${rec ? " is-recording" : ""}`}
      aria-label={label}
      data-s={ds}
      onFocus={() => setRec(true)}
      onBlur={() => setRec(false)}
      onKeyDown={onKeyDown}
    >
      {value ? <span className="ps-keys"><KeyCaps accel={value} /></span> : <span className="pa-muted">{rec ? pressKey : none}</span>}
    </button>
  );
}

/** Desktop-only panel content on the web. */
export function DesktopOnlyHint({ t }) {
  return <Group><Hint>{t("premiumAudio.common.desktopOnly")}</Hint></Group>;
}

/** Lay out several groups in a row when there is room. */
export function Cols({ children }) {
  return <div className="ps-cols">{children}</div>;
}

/** Inline actions row. */
export function Actions({ children, ds }) {
  return <div className="ps-act" data-s={ds}>{children}</div>;
}
