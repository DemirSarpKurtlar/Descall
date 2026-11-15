/**
 * Small shared pieces of the Moderasyon page: the ticking clock, labels in the
 * admin's language (durations, time left, categories), the square avatar, the
 * dropdown (opaque menu, closes on outside click / Esc) and the toggle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../../ui/Avatar";
import { ChevronDown, Check } from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import { durationParts, remainingParts } from "./modDeskModel.js";

/** Date.now() that re-renders every `ms` (1 s for countdowns), paused while the tab is hidden. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") setNow(Date.now());
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "1 saat", "30 dk", "7 gün". */
export function durationText(seconds, t) {
  if (seconds == null) return t("modDesk.permanent");
  const p = durationParts(seconds);
  return t(`modDesk.du.${p.unit}`, { n: p.n });
}

/** Short form for tables / cards: "1 sa", "30 dk", "7 gün". */
export function durationShort(seconds, t) {
  if (seconds == null) return t("modDesk.permanent");
  const p = durationParts(seconds);
  return t(`modDesk.ds.${p.unit}`, { n: p.n });
}

/** "04:12", "2 sa 06 dk", "6 gün 23 sa", "29 gün". */
export function remainingText(ms, t) {
  const p = remainingParts(ms);
  if (p.kind === "mmss") return p.text;
  if (p.kind === "hm") return t("modDesk.left.hm", { h: p.h, m: p.m });
  if (p.kind === "dh") return t("modDesk.left.dh", { d: p.d, h: p.h });
  if (p.kind === "d") return t("modDesk.left.d", { d: p.d });
  return t("modDesk.left.over");
}

/** Category label (short desk wording, translated), falling back to the server label. */
export function categoryText(id, t, categories) {
  if (!id) return "";
  const key = `modDesk.cat.${id}`;
  const v = t(key);
  if (v && v !== key) return v;
  const c = (categories || []).find((x) => x.id === id);
  return c?.label ? t(c.label) : String(id);
}

export function ModAvatar({ user, size = 30 }) {
  const name = user?.displayName || user?.username || "?";
  return (
    <span className="mdk-av" style={{ "--mdk-av": `${size}px` }}>
      <Avatar name={name} size={size} user={{ id: user?.id, username: user?.username, displayName: name, avatarUrl: user?.avatarUrl, avatar_url: user?.avatarUrl }} animate="never" />
    </span>
  );
}

export function Chip({ tone = "gray", children, title }) {
  return (
    <span className={`mdk-chip is-${tone}`} title={title}>
      {children}
    </span>
  );
}

/**
 * Dropdown button + opaque menu (DossierMenu). `options` = [{ id, label, sub? }].
 */
export function Select({ value, options, onChange, label, prefix, width = 240, className = "", testId, disabled = false }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`mdk-dd ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {prefix ? `${prefix}: ` : ""}
          {current?.label ?? ""}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <DossierMenu
        open={open}
        anchorRef={ref}
        onClose={close}
        label={label}
        width={width}
        testId={testId ? `${testId}-menu` : undefined}
        items={options.map((o) => ({
          id: o.id || "none",
          label: o.label,
          sub: o.sub,
          icon: o.id === value ? Check : o.icon,
          onSelect: () => onChange(o.id),
        }))}
      />
    </>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={`mdk-tog${checked ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

/** Text with filter matches highlighted (.mdk-hl red for high, amber otherwise). */
export function Highlighted({ segments }) {
  return segments.map((s, i) =>
    s.sev ? (
      <mark key={i} className={`mdk-hl is-${s.sev}`}>
        {s.text}
      </mark>
    ) : (
      <span key={i}>{s.text}</span>
    )
  );
}
