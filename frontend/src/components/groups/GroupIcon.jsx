import { useState } from "react";
import { groupAvatarUrl } from "../../lib/avatarFile";
import { useHoverGif } from "../../lib/useHoverGif";
import { avatarColor, avatarInitials, avatarKey } from "../../lib/avatarFallback.js";
import "./GroupIcon.css";

export function groupInitials(name) {
  return avatarInitials(name);
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
      style={{ width: size, height: size, borderRadius: r, fontSize: Math.max(11, Math.round(size * 0.36)), "--avatar-bg": avatarColor(avatarKey(group, group?.name)) }}
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
