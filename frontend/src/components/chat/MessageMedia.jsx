import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ImageOff, VideoOff } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import {
  computeMediaBox,
  mediaBoxStyle,
  normalizeDims,
  rememberMediaDims,
  rememberedMediaDims,
} from "../../lib/mediaBox";

/**
 * Chat media with a reserved box, the shared shimmer while it loads, a short
 * fade once decoded and a tidy fallback when it fails (DMs, groups, server
 * channels, bot embeds, link previews). Box size: lib/mediaBox.js. Styles:
 * `.chat-media*` in styles/messages.css.
 *
 * States: "loading" (skeleton), "ready" (media faded in), "error" (fallback).
 * A bitmap that is already decoded when the element mounts (browser cache)
 * is "ready" before the first paint, without a fade or a skeleton flash.
 */

function imgReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

function useMediaState(src) {
  const [state, setState] = useState({ src, status: "loading", instant: false });
  const current = state.src === src ? state : { src, status: "loading", instant: false };
  const set = useCallback((status, instant = false) => {
    setState((prev) => (prev.src === src && prev.status === status ? prev : { src, status, instant }));
  }, [src]);
  return [current, set];
}

function useBox({ src, cacheKey, dims, kind, fixed }) {
  const key = cacheKey || src;
  const [measured, setMeasured] = useState(null);
  const known = normalizeDims(dims?.width, dims?.height);
  const own = measured && measured.key === key ? measured.dims : null;
  const best = known || own || rememberedMediaDims(key);
  const box = fixed ? null : computeMediaBox({ dims: best, kind });
  const record = useCallback((w, h) => {
    const d = normalizeDims(w, h);
    if (!d) return;
    rememberMediaDims(key, d.width, d.height);
    setMeasured((prev) => (prev && prev.key === key && prev.dims.width === d.width && prev.dims.height === d.height ? prev : { key, dims: d }));
  }, [key]);
  return [box, record];
}

function frameClass(kind, status, instant, extra, fixed = false) {
  return [
    "chat-media",
    `chat-media-${kind}`,
    fixed ? "is-fixed" : "is-boxed",
    `is-${status}`,
    instant ? "is-instant" : "",
    extra || "",
  ].filter(Boolean).join(" ");
}

function MediaError({ kind }) {
  const t = useT();
  const label = kind === "video" ? t("msg5.media.videoFailed") : t("msg5.media.imageFailed");
  const Glyph = kind === "video" ? VideoOff : ImageOff;
  return (
    <span className="chat-media-error" role="img" aria-label={label}>
      <Glyph size={20} aria-hidden="true" />
      <span className="chat-media-error-text">{label}</span>
    </span>
  );
}

/**
 * Photo / GIF / sticker / embed image.
 * @param {object} p
 * @param {string} p.src
 * @param {"image"|"gif"|"embed"|"sticker"|"thumb"} [p.kind]
 * @param {{width:number,height:number}|null} [p.dims] size from message / embed metadata
 * @param {string} [p.cacheKey] stable URL to remember the size under (raw, unsigned URL)
 * @param {boolean} [p.fixed] the frame's size comes from CSS (sticker, thumbnails)
 * @param {string} [p.className] extra classes on the frame
 * @param {string} [p.imgClassName] extra classes on the <img>
 * @param {(e: Event) => void} [p.onError] e.g. refresh an expired signed URL
 */
export function MessageMediaImage({
  src,
  alt = "",
  kind = "image",
  dims = null,
  cacheKey = "",
  fixed = false,
  className = "",
  imgClassName = "",
  onError,
  onLoad,
  children,
  ...imgProps
}) {
  const imgRef = useRef(null);
  const [state, setStatus] = useMediaState(src);
  const [box, record] = useBox({ src, cacheKey, dims, kind: kind === "gif" ? "gif" : kind === "embed" ? "embed" : "image", fixed });

  // Cached bitmaps: settle before the first paint so nothing flashes.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (imgReady(img)) {
      record(img.naturalWidth, img.naturalHeight);
      setStatus("ready", true);
    }
  }, [src, record, setStatus]);

  const status = state.status;
  return (
    <span
      className={frameClass(kind, status, state.instant, className, fixed)}
      style={fixed ? undefined : mediaBoxStyle(box)}
      data-media-state={status}
    >
      <span className="skeleton-line chat-media-skeleton" aria-hidden="true" />
      {status === "error" ? (
        <MediaError kind="image" />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          {...imgProps}
          className={`chat-media-el${imgClassName ? ` ${imgClassName}` : ""}`}
          onLoad={(e) => {
            const img = e.currentTarget;
            record(img.naturalWidth, img.naturalHeight);
            setStatus("ready");
            onLoad?.(e);
          }}
          onError={(e) => {
            setStatus("error");
            onError?.(e);
          }}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Video attachment: the box follows the video's own size once its metadata
 * is in; the first frame fades in over the skeleton. Some WebViews (iOS low
 * power) never preload: when loading stops with only metadata or nothing,
 * the player is shown anyway so its controls stay usable.
 */
export function MessageMediaVideo({
  src,
  dims = null,
  cacheKey = "",
  className = "",
  videoClassName = "",
  onError,
  ...videoProps
}) {
  const videoRef = useRef(null);
  const [state, setStatus] = useMediaState(src);
  const [box, record] = useBox({ src, cacheKey, dims, kind: "video", fixed: false });

  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth > 0) record(v.videoWidth, v.videoHeight);
    if (v.readyState >= 2) setStatus("ready", true);
  }, [src, record, setStatus]);

  const status = state.status;
  return (
    <span
      className={frameClass("video", status, state.instant, className)}
      style={mediaBoxStyle(box)}
      data-media-state={status}
    >
      <span className="skeleton-line chat-media-skeleton" aria-hidden="true" />
      {status === "error" ? (
        <MediaError kind="video" />
      ) : (
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          {...videoProps}
          className={`chat-media-el${videoClassName ? ` ${videoClassName}` : ""}`}
          onLoadedMetadata={(e) => record(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onLoadedData={() => setStatus("ready")}
          onPlay={() => setStatus("ready")}
          onSuspend={(e) => {
            // Stopped fetching before a frame (no preload): show the player.
            if (e.currentTarget.readyState < 2) setStatus("ready");
          }}
          onError={(e) => {
            setStatus("error");
            onError?.(e);
          }}
        />
      )}
    </span>
  );
}
