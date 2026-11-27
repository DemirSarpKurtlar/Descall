/**
 * Davet Merkezi atoms: icons, DesCoin chip, sparkline, funnel stage bar, pills, segmented
 * control, presence avatar. Styles: styles/invites.css (".dvt-*").
 */
import { useId } from "react";
import { Avatar } from "../ui/Avatar";
import { ICON_PATHS, BRAND_PATHS } from "./iconPaths.js";
import { sparkPath, stageSegments } from "../../lib/inviteShare.js";

export function Ico({ name, className = "", size, title }) {
  return (
    <svg
      className={`dvt-i ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      focusable="false"
      // Bundled path strings from the approved draft (iconPaths.js), never user content.
      dangerouslySetInnerHTML={{ __html: `${title ? `<title>${title}</title>` : ""}${ICON_PATHS[name] || ""}` }}
    />
  );
}

/** WhatsApp / Instagram / TikTok glyphs (filled, white on the brand tile). */
export function Brand({ name, className = "" }) {
  const key = { wa: "b-wa", ig: "b-ig", tt: "b-tt" }[name];
  return (
    <svg className={`dvt-b ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: BRAND_PATHS[key] || "" }} />
  );
}

/** Reward art for milestone 3 (shield badge). */
export function BadgeArt({ size = 28 }) {
  const id = useId().replace(/[:]/g, "");
  const svg = BRAND_PATHS["r-badge"].replace(/url\(#gb1\)/g, `url(#g${id})`);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="dvt-art"
      dangerouslySetInnerHTML={{
        __html: `<defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA6FF"/><stop offset="1" stop-color="#4A62E0"/></linearGradient></defs>${svg}`,
      }}
    />
  );
}

export function Coin({ size = "" }) {
  return <i className={`dvt-coin ${size}`.trim()} aria-hidden="true" />;
}

/** "D 600" style amount. */
export function Dc({ amount, tone = "", sign = false, gray = false, size = "", locale }) {
  const n = Math.round(Number(amount) || 0);
  let text;
  try {
    text = new Intl.NumberFormat(locale || undefined).format(Math.abs(n));
  } catch {
    text = String(Math.abs(n));
  }
  const prefix = sign && n > 0 ? "+" : n < 0 ? "−" : "";
  return (
    <span className={`dvt-dc ${tone}`.trim()}>
      <Coin size={`${size}${gray ? " gray" : ""}`} />
      {prefix}
      {text}
    </span>
  );
}

export function Spark({ values, color = "#8FA6FF", label }) {
  const d = sparkPath(values, 100, 28, 2);
  if (!d) return <svg className="dvt-spk" aria-hidden="true" />;
  return (
    <svg className="dvt-spk" viewBox="0 0 100 28" preserveAspectRatio="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StageBar({ stage, waiting, status, label }) {
  const segs = stageSegments({ stage, waiting, status });
  return (
    <span className="dvt-stg" role="img" aria-label={label}>
      {segs.map((s, i) => (
        <i key={i} className={s} />
      ))}
    </span>
  );
}

export function Pill({ tone = "", icon, children, title }) {
  return (
    <span className={`dvt-pl ${tone}`.trim()} title={title}>
      {icon ? <Ico name={icon} /> : null}
      {children}
    </span>
  );
}

/** Segmented control: items [{ id, label, count }]. */
export function Seg({ items, value, onChange, label }) {
  return (
    <span className="dvt-seg" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={value === it.id ? "on" : ""}
          onClick={() => onChange?.(it.id)}
        >
          {it.label}
          {it.count != null ? <b>{it.count}</b> : null}
        </button>
      ))}
    </span>
  );
}

/** App avatar with the presence dot of the draft (online / idle / dnd, nothing when offline). */
export function PAvatar({ user, size = 22, online = null, className = "" }) {
  const name = user?.displayName || user?.display_name || user?.username || "?";
  return (
    <span className={`dvt-av ${className}`.trim()} style={{ width: size, height: size }}>
      <Avatar name={name} size={size} user={user ? { ...user, display_name: name, avatar_url: user.avatarUrl || user.avatar_url || null } : null} imageUrl={user?.avatarUrl || user?.avatar_url || undefined} frame={false} />
      {online ? <i className={`dvt-dot ${online === "online" ? "" : online}`.trim()} /> : null}
    </span>
  );
}

/** Progress ring for the phone header (count / target). */
export function Ring({ count, target, pct, size = 76 }) {
  const id = useId().replace(/[:]/g, "");
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" className="dvt-ring" aria-hidden="true">
      <defs>
        <linearGradient id={`ring${id}`}>
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#E2A93B" />
        </linearGradient>
      </defs>
      <circle cx="38" cy="38" r={r} fill="none" className="dvt-ring-track" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={`url(#ring${id})`} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * Math.max(0, Math.min(1, pct))).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 38 38)" />
      <text x="38" y="37" textAnchor="middle" className="dvt-ring-n">{count}</text>
      <text x="38" y="52" textAnchor="middle" className="dvt-ring-t">/ {target}</text>
    </svg>
  );
}
