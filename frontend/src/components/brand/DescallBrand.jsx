import { brandIconUrl, brandLockupUrl } from "./brandIconUrl";

/**
 * In-app Descall mark.
 * Compact (rail, auth): rounded Konsept 2 tile.
 * Expanded (title bar): horizontal lockup, not an icon plus the word Descall.
 * BASE_URL keeps Electron file:// and web on the same public files.
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

function DescallLockup() {
  return (
    <img
      className="descall-brand-lockup"
      src={brandLockupUrl()}
      alt="Descall"
      height={18}
      draggable={false}
    />
  );
}

export default function DescallBrand({ compact = false, className = "" }) {
  return (
    <span className={`descall-brand ${compact ? "is-compact" : ""} ${className}`.trim()}>
      {compact ? <DescallMark /> : <DescallLockup />}
    </span>
  );
}
