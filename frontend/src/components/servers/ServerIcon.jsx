import { SkeletonImage } from "../ui/Skeleton";

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
  ...rest
}) {
  const label = name || server?.name || "?";
  const src = iconUrl ?? server?.iconUrl;
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
    />
  );
}

export default ServerIcon;
