import { useEffect, useState } from "react";
import { getStaticAvatarFrame, isAnimatedAvatarUrl } from "./gifAvatar";

/**
 * Profile-avatar behaviour for any image: a GIF shows its first frame and
 * only animates while hovered (or when `forceAnimate`). Still images pass through.
 * Returns { src, animated, hoverProps }.
 */
export function useHoverGif(url, { forceAnimate = false } = {}) {
  const [hovered, setHovered] = useState(false);
  const [frame, setFrame] = useState(undefined); // undefined = loading, null = failed
  const animated = isAnimatedAvatarUrl(url);
  const play = forceAnimate || hovered;

  useEffect(() => {
    setFrame(undefined);
    if (!url || !animated) return undefined;
    let alive = true;
    getStaticAvatarFrame(url).then((f) => {
      if (alive) setFrame(f ?? null);
    });
    return () => {
      alive = false;
    };
  }, [url, animated]);

  let src = url || null;
  // While the first frame is being captured, keep showing the GIF; if capture
  // fails (CORS), fall back to the GIF itself rather than a blank tile.
  if (animated && !play && frame) src = frame;

  return {
    src,
    animated,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setHovered(true),
      onBlur: () => setHovered(false),
    },
  };
}
