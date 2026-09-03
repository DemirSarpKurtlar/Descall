import descallIcon from "../../assets/descall-icon.jpeg";

/**
 * Canonical in-app Descall mark (login, titlebar, nav rail).
 * JPEG is bundled via Vite import so Electron file:// / asar still paints it
 * (absolute /brand/*.png 404'd on desktop — #147). Public copy lives at
 * frontend/public/brand/descall-icon.jpeg for non-module consumers.
 */
function DescallMark() {
  return (
    <img
      className="descall-brand-mark"
      src={descallIcon}
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
