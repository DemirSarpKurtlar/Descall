import { useT } from "../../context/LocaleContext";
import { isUserAdmin } from "../../lib/userProfile";
import "./AdminBadge.css";

/**
 * Descall staff badge (3.7.4, owner pick "D · Ekip etiketi"): a two-part tag,
 * brand square with the Descall mark + "EKİP" (inline) / "DESCALL EKİBİ"
 * (chip); "mark" is the square alone on the avatar corner. Narrow layouts
 * hide .dsc-admin-badge-label and keep the square.
 */
export function DescallMark({ size = 11, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="12.25 12.25 75.5 75.5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z" />
    </svg>
  );
}

export default function AdminBadge({
  user,
  force = false,
  variant = "inline",
  className = "",
  title,
}) {
  const t = useT();
  if (!force && !isUserAdmin(user)) return null;

  const tip = title || t("staffBadge.tip");
  const label = variant === "chip" ? t("staffBadge.long") : t("staffBadge.short");
  const classes = ["dsc-admin-badge", `dsc-admin-badge--${variant}`, className].filter(Boolean).join(" ");

  return (
    <span className={classes} title={tip} aria-label={tip} role="img">
      <span className="dsc-admin-badge-mark">
        <DescallMark size={variant === "chip" ? 13 : 11} />
      </span>
      {variant === "mark" ? null : <span className="dsc-admin-badge-label">{label}</span>}
    </span>
  );
}
