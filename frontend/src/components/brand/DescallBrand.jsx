import { brandIconUrl } from "./brandIconUrl";

/**
 * Canonical in-app Descall mark (login, titlebar, nav rail).
 * Points at public `brand/descall-icon.jpeg` (= repo-root Descall Icon.jpeg)
 * via BASE_URL so Electron file:// and web both paint it. See brandIconUrl.js.
 */
function DescallMark() {
  return (
    <img
      className="descall-brand-mark"
      src={brandIconUrl()}
      width={64}
      height={64}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export default function DescallBrand({ compact = false, className = "" }) {
  return (
    <span className={`descall-brand ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <DescallMark />
      {!compact && <strong>Descall</strong>}
    </span>
  );
}
