import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";

export function SkeletonLine({ width = "100%", height = 12, circle = false }) {
  return (
    <div
      className="skeleton-line"
      style={{
        width,
        height: circle ? width : height,
        borderRadius: circle ? "50%" : undefined,
      }}
    />
  );
}

function imgIsReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

/**
 * Keeps layout reserved and shows the shared shimmer until the bitmap is decoded.
 * Cached images are treated as ready via img.complete (onLoad often does not fire).
 */
export function SkeletonImage({
  src,
  alt = "",
  className = "",
  fallback = null,
  ...rest
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);

  const sync = useCallback((el) => {
    if (!el) return;
    if (imgIsReady(el)) {
      setReady(true);
      setFailed(false);
    }
  }, []);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    const id = requestAnimationFrame(() => sync(imgRef.current));
    return () => cancelAnimationFrame(id);
  }, [src, sync]);

  if (!src || failed) return fallback;

  return (
    <span className={`skeleton-media ${className}`.trim()}>
      {!ready && <span className="skeleton-line skeleton-media-shimmer" aria-hidden />}
      <img
        ref={(el) => {
          imgRef.current = el;
          sync(el);
        }}
        src={src}
        alt={alt}
        className="skeleton-media-img"
        decoding="async"
        draggable={false}
        onLoad={() => {
          setReady(true);
          setFailed(false);
        }}
        onError={() => {
          setFailed(true);
          setReady(false);
        }}
        style={{ opacity: ready || imgIsReady(imgRef.current) ? 1 : 0 }}
        {...rest}
      />
    </span>
  );
}

/** Replaces blank/spinner message loading states */
export function MessageSkeleton({ count = 6 }) {
  const t = useT();
  return (
    <div className="skeleton-messages" aria-busy="true" aria-label={t("Loading messages")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <SkeletonLine width={40} circle />
          <div className="skeleton-col">
            <SkeletonLine width={`${28 + (i % 3) * 10}%`} />
            <SkeletonLine width={`${70 + (i % 4) * 6}%`} />
            {i % 2 === 0 && <SkeletonLine width={`${48 + (i % 3) * 8}%`} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Sidebar DM / group conversation-row placeholders — same shimmer language
 * as MessageSkeleton, sized like `.conv-row` / `.dm-item`.
 */
export function ConversationListSkeleton({ count = 6, label }) {
  const t = useT();
  return (
    <div
      className="skeleton-conversations"
      aria-busy="true"
      aria-label={label || t("Loading conversations")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-conv-row">
          <SkeletonLine width={40} circle />
          <div className="skeleton-conv-body">
            <div className="skeleton-conv-top">
              <SkeletonLine width={`${42 + (i % 4) * 8}%`} height={12} />
              <SkeletonLine width={28 + (i % 3) * 4} height={10} />
            </div>
            <SkeletonLine width={`${58 + (i % 5) * 7}%`} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Servers list placeholders — same shimmer as ConversationListSkeleton,
 * sized like `.server-list-item` (40×40 squircle icon + name/subtitle).
 */
export function ServerListSkeleton({ count = 6, label }) {
  const t = useT();
  return (
    <div
      className="skeleton-server-list"
      aria-busy="true"
      aria-label={label || t("Loading servers")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-server-row">
          <div className="skeleton-line skeleton-server-icon" />
          <div className="skeleton-server-body">
            <SkeletonLine width={`${46 + (i % 4) * 9}%`} height={13} />
            <SkeletonLine width={`${34 + (i % 3) * 8}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** DimaAI history rows — orb + title + time, matching `.dima-history-item`. */
export function DimaHistorySkeleton({ count = 8, label }) {
  const t = useT();
  return (
    <div
      className="skeleton-dima-history"
      aria-busy="true"
      aria-label={label || t("Loading conversations")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-dima-history-item">
          <div className="skeleton-line skeleton-dima-orb" />
          <div className="skeleton-dima-copy">
            <SkeletonLine width={`${48 + (i % 5) * 7}%`} height={12} />
            <SkeletonLine width={`${26 + (i % 3) * 6}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** DimaAI thread — user/assistant bubbles, not Discord-style avatar rows. */
export function DimaThreadSkeleton({ count = 5, label }) {
  const t = useT();
  return (
    <div className="skeleton-dima-thread" aria-busy="true" aria-label={label || t("Loading messages")}>
      {Array.from({ length: count }).map((_, i) => {
        const isUser = i % 2 === 0;
        return (
          <div key={i} className={`skeleton-dima-msg ${isUser ? "is-user" : "is-assistant"}`}>
            <div className="skeleton-dima-bubble">
              <SkeletonLine width={isUser ? `${62 + (i % 3) * 8}%` : "92%"} height={12} />
              {!isUser && <SkeletonLine width={`${64 + (i % 4) * 7}%`} height={12} />}
              {!isUser && i % 3 === 0 && <SkeletonLine width="44%" height={12} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ShopGridSkeleton({ count = 6, label }) {
  const t = useT();
  return (
    <div className="skeleton-shop-grid" aria-busy="true" aria-label={label || t("Loading…")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-shop-card">
          <div className="skeleton-line skeleton-shop-preview" />
          <div className="skeleton-shop-body">
            <SkeletonLine width={`${52 + (i % 3) * 10}%`} height={12} />
            <SkeletonLine width="28%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LfgListSkeleton({ count = 5, label }) {
  const t = useT();
  return (
    <div className="skeleton-lfg-list" aria-busy="true" aria-label={label || t("Loading lobbies…")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-lfg-card">
          <div className="skeleton-lfg-top">
            <SkeletonLine width={`${34 + (i % 3) * 8}%`} height={12} />
            <SkeletonLine width={40} height={10} />
          </div>
          <SkeletonLine width="46%" height={11} />
          <SkeletonLine width={`${54 + (i % 4) * 8}%`} height={10} />
        </div>
      ))}
    </div>
  );
}

export function DetailPaneSkeleton({ label }) {
  const t = useT();
  return (
    <div className="skeleton-detail-pane" aria-busy="true" aria-label={label || t("Loading…")}>
      <SkeletonLine width="38%" height={18} />
      <SkeletonLine width="64%" height={12} />
      <div className="skeleton-line skeleton-detail-hero" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <SkeletonLine width={36} circle />
          <div className="skeleton-col">
            <SkeletonLine width={`${42 + i * 7}%`} />
            <SkeletonLine width={`${58 + i * 5}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChannelListSkeleton({ count = 8, label }) {
  const t = useT();
  return (
    <div className="skeleton-channel-list" aria-busy="true" aria-label={label || t("Loading channels…")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-channel-row">
          <div className="skeleton-line skeleton-channel-hash" />
          <SkeletonLine width={`${36 + (i % 5) * 10}%`} height={11} />
        </div>
      ))}
    </div>
  );
}

export function BlockListSkeleton({ count = 6, label }) {
  const t = useT();
  return (
    <div className="skeleton-block-list" aria-busy="true" aria-label={label || t("Loading…")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-block-row">
          <SkeletonLine width={16} height={16} />
          <div className="skeleton-block-body">
            <SkeletonLine width={`${48 + (i % 4) * 9}%`} height={12} />
            <SkeletonLine width={`${68 + (i % 3) * 7}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
