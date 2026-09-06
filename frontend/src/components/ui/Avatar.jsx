import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { resolveAvatarUrl, resolveDisplayName } from "../../lib/userProfile";
import { getStaticAvatarFrame, isAnimatedAvatarUrl } from "../../lib/gifAvatar";
import { avatarEffectClass } from "./Cosmetics";

const PALETTES = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#9b59b6", "#3498db"];

export function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function imgIsReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

/**
 * Discord-like avatar.
 *
 * animate:
 *  - "hover" (default): GIFs play while hovered (message avatars)
 *  - "always": GIFs always loop (nav rail profile)
 *  - "speaking": GIFs play while isSpeaking is true (voice chat)
 *  - "never": never animate GIFs
 */
export function Avatar({
  name,
  size = 36,
  imageUrl,
  user,
  onClick,
  animate = "hover",
  isSpeaking = false,
  className = "",
  loading: loadingProp,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [staticFrame, setStaticFrame] = useState(null);
  const [useBareUrl, setUseBareUrl] = useState(false);
  const [stickySrc, setStickySrc] = useState(null);
  const imgRef = useRef(null);

  const displayName = name || resolveDisplayName(user);
  const letter = (displayName && displayName[0] ? displayName[0] : "?").toUpperCase();
  const bg = PALETTES[hashString(displayName || "") % PALETTES.length];

  const source = useMemo(() => {
    if (user) {
      const hasAvatar = Boolean(user.avatarUrl || user.avatar_url || user.initiatorAvatarUrl);
      if (hasAvatar) return user;
      if (imageUrl) return { ...user, avatarUrl: imageUrl };
      return user;
    }
    if (imageUrl) return { avatarUrl: imageUrl };
    return null;
  }, [user, imageUrl]);

  const resolvedUrl = source ? resolveAvatarUrl(source) : null;
  const bareUrl = resolvedUrl ? resolvedUrl.split("?")[0] : null;
  const activeUrl = useBareUrl && bareUrl ? bareUrl : resolvedUrl;
  const animated = isAnimatedAvatarUrl(activeUrl || resolvedUrl);

  const shouldAnimate = useMemo(() => {
    if (!animated) return false;
    if (animate === "always") return true;
    if (animate === "never") return false;
    if (animate === "speaking") return Boolean(isSpeaking);
    return hovered || Boolean(isSpeaking);
  }, [animated, animate, hovered, isSpeaking]);

  const identityKey = String(user?.id || user?.userId || "") + "|" + String(resolvedUrl || imageUrl || "");
  // stickySrc is only valid for the identity that produced it — never paint
  // peer A's bitmap while React is committing peer B (DM switch).
  const stickyIdentityRef = useRef(null);

  // Always keep a concrete src when avatar URL is known — never letter-only "loading gap".
  // Never reuse another user's stickySrc.
  const displaySrc = useMemo(() => {
    const stickyOk = stickyIdentityRef.current === identityKey ? stickySrc : null;
    if (!activeUrl) return stickyOk;
    if (!animated) return activeUrl;
    if (shouldAnimate) return activeUrl;
    if (staticFrame) return staticFrame;
    return activeUrl;
  }, [identityKey, activeUrl, animated, shouldAnimate, staticFrame, stickySrc]);

  useEffect(() => {
    setFailed(false);
    setUseBareUrl(false);
    setStaticFrame(null);
  }, [resolvedUrl]);

  useEffect(() => {
    if (!activeUrl || !animated || shouldAnimate) return undefined;
    let cancelled = false;
    getStaticAvatarFrame(activeUrl).then((frame) => {
      if (cancelled || !frame) return;
      setStaticFrame(frame);
    });
    return () => {
      cancelled = true;
    };
  }, [activeUrl, animated, shouldAnimate]);

  const noteGoodSrc = useCallback((src) => {
    if (!src || src.startsWith("data:")) return;
    const origin = (resolvedUrl || activeUrl || "").split("?")[0];
    if (origin && !(src === resolvedUrl || src === activeUrl || src.split("?")[0] === origin)) {
      return;
    }
    stickyIdentityRef.current = identityKey;
    setStickySrc(src);
  }, [resolvedUrl, activeUrl, identityKey]);

  const syncLoadedFromEl = useCallback(
    (el) => {
      if (!el) return;
      if (imgIsReady(el)) {
        noteGoodSrc(el.currentSrc || el.src);
        setLoaded(true);
        setFailed(false);
      }
    },
    [noteGoodSrc]
  );

  const setImgNode = useCallback(
    (el) => {
      imgRef.current = el;
      syncLoadedFromEl(el);
    },
    [syncLoadedFromEl]
  );

  useEffect(() => {
    stickyIdentityRef.current = null;
    setStickySrc(null);
    setStaticFrame(null);
    setUseBareUrl(false);
    setFailed(false);
    setLoaded(false);
  }, [identityKey]);

  // Critical: cached images often skip onLoad after React updates.
  // Re-read img.complete whenever src changes so we never stick on the letter.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !displaySrc) {
      setLoaded(false);
      return undefined;
    }
    if (imgIsReady(el)) {
      noteGoodSrc(el.currentSrc || el.src || displaySrc);
      setLoaded(true);
      return undefined;
    }
    setLoaded(false);
    const id = requestAnimationFrame(() => syncLoadedFromEl(imgRef.current));
    return () => cancelAnimationFrame(id);
  }, [displaySrc, noteGoodSrc, syncLoadedFromEl]);

  const eager =
    loadingProp === "eager" ||
    loadingProp === true ||
    animate === "always" ||
    size >= 56;

  const showImage = Boolean(displaySrc) && !failed;
  const frameUrl = user?.equippedAvatarFrame?.asset_url || null;
  const effectClass = avatarEffectClass(user);

  const avatarClass = `ui-avatar ${frameUrl ? "has-frame" : ""} ${isSpeaking ? "is-speaking" : ""} ${className}`.trim();
  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    aspectRatio: "1 / 1",
    fontSize: size,
  };
  const avatarHandlers = {
    onClick,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    role: onClick ? "button" : undefined,
  };

  // Only use Framer while speaking. Idle avatars stay as plain divs so Electron
  // DM→group switches cannot leave projected letter ghosts in the chat header.
  const Root = isSpeaking ? motion.div : "div";
  const motionProps = isSpeaking
    ? {
        layout: false,
        animate: { scale: [1, 1.1, 1.03, 1.1, 1] },
        transition: { duration: 0.85, repeat: Infinity, ease: "easeInOut" },
      }
    : {};

  return (
    <Root
      className={avatarClass}
      style={avatarStyle}
      {...avatarHandlers}
      {...motionProps}
    >
      {effectClass && (
        <div
          className={effectClass}
          aria-hidden
          style={{
            // Pixel insets stay concentric at every avatar size (avoids % subpixel drift).
            inset: -Math.max(6, Math.round(size * 0.12)),
          }}
        />
      )}
      <div
        className="ui-avatar-inner"
        style={{
          // Always paint the letter palette — never a blank surface-2 hole while
          // a broken/pending URL sits at opacity 0 (looks like a black circle).
          background: bg,
        }}
      >
        {!(showImage && loaded) ? (
          <span className="ui-avatar-letter">{letter}</span>
        ) : null}
        {showImage ? (
          <img
            key={identityKey}
            ref={setImgNode}
            src={displaySrc}
            alt=""
            className="ui-avatar-img"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              if (!imgIsReady(el)) {
                setStickySrc(null);
                setFailed(true);
                setLoaded(false);
                return;
              }
              noteGoodSrc(el.currentSrc || el.src || displaySrc);
              setLoaded(true);
              setFailed(false);
            }}
            onError={() => {
              if (!useBareUrl && bareUrl && displaySrc !== bareUrl) {
                setUseBareUrl(true);
                setFailed(false);
                return;
              }
              setStickySrc(null);
              setFailed(true);
              setLoaded(false);
            }}
            style={{
              position: loaded ? "relative" : "absolute",
              inset: loaded ? undefined : 0,
              opacity: loaded || (imgRef.current && imgIsReady(imgRef.current)) ? 1 : 0,
              transition: "opacity 0.12s ease",
            }}
          />
        ) : null}
      </div>
      {frameUrl && (
        <img
          className="ui-avatar-frame-overlay"
          src={frameUrl}
          alt=""
          draggable={false}
          aria-hidden
          style={{
            // Explicit px size — never fall back to the SVG intrinsic 256×256.
            width: Math.round(size * 1.32),
            height: Math.round(size * 1.32),
          }}
        />
      )}
    </Root>
  );
}

export default Avatar;
