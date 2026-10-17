import { SkeletonImage } from "../ui/Skeleton";
import { useHoverGif } from "../../lib/useHoverGif";

function serverInitials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Server squircle icon that holds a shimmer until the custom photo decodes.
 */
export function ServerIcon({
  server,
  iconUrl,
  name,
  className = "server-list-icon",
  fallbackClassName = "server-list-icon-fallback",
  fallback = null,
  animate = false,
  ...rest
}) {
  const label = name || server?.name || "?";
  const rawSrc = iconUrl ?? server?.iconUrl;
  // GIF server icons behave like profile avatars: first frame, animate on hover.
  const { src, hoverProps } = useHoverGif(rawSrc || null, { forceAnimate: Boolean(animate) });
  const fallbackNode =
    fallback ?? (
      <div className={`${className} ${fallbackClassName}`.trim()}>
        {serverInitials(label)}
      </div>
    );

  return (
    <SkeletonImage
      src={src}
      alt=""
      className={className}
      fallback={fallbackNode}
      {...rest}
      onMouseEnter={(e) => { hoverProps.onMouseEnter(); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { hoverProps.onMouseLeave(); rest.onMouseLeave?.(e); }}
    />
  );
}

export default ServerIcon;
