/*
 * Descall 3.0.0 grouped-list kit (Settings › Görünüm, the settings sidebar,
 * the admin panel). Mirrors the approved mockup kit 1:1; styles live in
 * styles/settings-v3.css under the .s3 prefix.
 */
import { S3_ICON_PATHS, S3_EXTRA_ICON_PATHS } from "./s3IconPaths";

const PATHS = { ...S3_ICON_PATHS, ...S3_EXTRA_ICON_PATHS };

export function S3Glyph({ name, size = 18, stroke = 2, className, style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
      // Static, bundled path strings only (never user content).
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }}
    />
  );
}

export function S3Chevron() {
  return (
    <svg className="s3-chev" viewBox="0 0 8 13" aria-hidden="true" focusable="false">
      <path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function S3Tile({ icon, color = "gray" }) {
  return (
    <span className={`s3-ico c-${color}`} aria-hidden="true">
      <S3Glyph name={icon} size={18} stroke={2.1} />
    </span>
  );
}

export function S3Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={`s3-tg${checked ? " on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
    />
  );
}

export function S3Sec({ children, first }) {
  return <div className={`s3-sec${first ? " first" : ""}`}>{children}</div>;
}

export function S3Foot({ children }) {
  return <div className="s3-foot">{children}</div>;
}

export function S3Group({ children, className = "", style }) {
  return (
    <div className={`s3-group ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

/** One grouped row. `onClick` makes it a button; `toggle` renders a switch. */
export function S3Row({
  icon,
  color,
  lead,
  title,
  sub,
  value,
  chevron,
  selected,
  tone,
  toggle,
  onToggle,
  check,
  badge,
  onClick,
  className = "",
  dataNav,
  ariaLabel,
}) {
  const tall = Boolean(sub);
  const cls = [
    "s3-row",
    icon || lead ? "" : "noico",
    tall ? "tall" : "",
    selected ? "sel" : "",
    tone ? `tone-${tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      {icon ? <S3Tile icon={icon} color={color} /> : lead || null}
      <span className="lab">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {badge != null ? badge : null}
      {value != null ? <span className="val">{value}</span> : null}
      {toggle !== undefined ? <S3Toggle checked={toggle} onChange={onToggle} label={typeof title === "string" ? title : ariaLabel} /> : null}
      {check ? <S3Glyph name="check" size={18} stroke={2.6} className="s3-check" /> : null}
      {chevron ? <S3Chevron /> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} data-nav={dataNav} aria-label={ariaLabel} aria-current={selected ? "page" : undefined}>
        {body}
      </button>
    );
  }
  if (toggle !== undefined) {
    return (
      <div className={cls} onClick={() => onToggle?.(!toggle)} role="presentation">
        {body}
      </div>
    );
  }
  return <div className={cls}>{body}</div>;
}
