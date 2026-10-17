import { useState } from "react";
import { groupAvatarUrl } from "../../lib/avatarFile";
import { useHoverGif } from "../../lib/useHoverGif";
import "./GroupIcon.css";

export function groupInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/**
 * Group photo tile. GIF group photos animate on hover like profile avatars.
 * Falls back to initials when there is no photo or it fails to load.
 */
export default function GroupIcon({ group, size = 36, radius, className = "", initials, hoverTarget = "self" }) {
  const url = groupAvatarUrl(group);
  const [failedUrl, setFailedUrl] = useState(null);
  const { src, hoverProps } = useHoverGif(url && failedUrl !== url ? url : null);
  const r = radius ?? Math.round(size * 0.3);
  const label = initials ?? groupInitials(group?.name);
  return (
    <span
      className={`group-photo-icon ${src ? "has-photo" : ""} ${className}`.trim()}
      style={{ width: size, height: size, borderRadius: r, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      {...(hoverTarget === "self" ? hoverProps : {})}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" draggable={false} onError={() => setFailedUrl(url)} />
      ) : (
        <span className="group-photo-initials">{label}</span>
      )}
    </span>
  );
}
