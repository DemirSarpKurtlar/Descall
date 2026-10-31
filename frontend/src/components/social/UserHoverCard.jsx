import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { pickAvatarUrl, resolveDisplayName } from "../../lib/userProfile";
import { cssUrl } from "../../lib/cssUrl";
import AdminBadge from "./AdminBadge";
import { NameEffectText, CountryBadge } from "../ui/Cosmetics";
import { useLocale, useT } from "../../context/LocaleContext";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import { acceptProfilePayload } from "../../lib/profileModalState";
import { cachedHoverProfile, hoverCardModel, loadHoverProfile, mergeHoverProfile } from "../../lib/hoverProfile";
import "../../styles/user-hover-card.css";

/*
 * Desktop hover card (3.7.11). Shows what the person bought in the shop:
 * banner, profile background or card colour, aura, avatar effect, presence
 * flare, name effect, country + special badge. The base user comes from the
 * message list; the full public profile (`/auth/users/:id`) is loaded on
 * hover, cached for a minute and merged on top (lib/hoverProfile.js).
 */

const STATUS_CLASS = {
  online: "st-online",
  idle: "st-idle",
  dnd: "st-dnd",
  invisible: "st-invisible",
  offline: "st-offline",
};

const CARD_WIDTH = 320;
const PAD = 8;

function clampPos(anchor, cardH = 260) {
  if (!anchor) return { left: PAD, top: PAD };
  let left = typeof anchor.x === "number" ? anchor.x : PAD;
  let top = typeof anchor.y === "number" ? anchor.y : PAD;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + CARD_WIDTH > vw - PAD) left = Math.max(PAD, (anchor.flipX ?? left) - CARD_WIDTH);
  if (left < PAD) left = PAD;
  if (top + cardH > vh - PAD) top = Math.max(PAD, vh - cardH - PAD);
  if (top < PAD) top = PAD;
  return { left, top };
}

function fallbackBanner(seed) {
  const hues = [220, 260, 280, 200, 340, 180, 30];
  let h = 0;
  for (const ch of String(seed || "user")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = hues[Math.abs(h) % hues.length];
  return `linear-gradient(135deg, hsl(${hue}, 65%, 30%) 0%, hsl(${(hue + 40) % 360}, 55%, 18%) 100%)`;
}

async function fetchPublicProfile(id) {
  const res = await fetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return acceptProfilePayload(id, data?.user);
}

function formatDate(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

function formatLastSeen(iso, locale) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function UserHoverCard({ user, anchor }) {
  const t = useT();
  const { locale } = useLocale();
  const ref = useRef(null);
  const userId = user?.id;
  const [full, setFull] = useState(() => (userId ? cachedHoverProfile(userId) : null));
  const [pos, setPos] = useState(() => clampPos(anchor));

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    setFull(cachedHoverProfile(userId));
    loadHoverProfile(userId, fetchPublicProfile).then((data) => {
      if (live && data) setFull(data);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const merged = mergeHoverProfile(user, full);
  const model = hoverCardModel(merged);

  useLayoutEffect(() => {
    if (!anchor) return;
    const h = ref.current?.offsetHeight || 260;
    setPos(clampPos(anchor, h));
  }, [anchor, userId, full, model?.bio, model?.customStatus]);

  if (!merged || !anchor || !model) return null;

  const statusKey = merged.status && STATUS_CLASS[merged.status] ? merged.status : "offline";
  const statusLabel = {
    online: t("Online"),
    idle: t("Idle"),
    dnd: t("Do Not Disturb"),
    invisible: t("Invisible"),
    offline: t("Offline"),
  }[statusKey];
  const lastSeenLabel = statusKey === "offline" ? formatLastSeen(merged.lastSeen, locale) : null;
  const display = resolveDisplayName(merged);
  const memberSince = formatDate(model.createdAt, locale);
  const hasAbout = Boolean(model.bio || memberSince);

  const surfaceStyle = model.backgroundUrl
    ? {
        background: `linear-gradient(180deg, rgba(14,15,22,0.30) 0%, rgba(14,15,22,0.80) 55%, rgba(14,15,22,0.94) 100%), ${cssUrl(model.backgroundUrl)} center/cover no-repeat`,
      }
    : model.colorStyle || {};

  const node = (
    <motion.div
      ref={ref}
      className={[
        "user-hover-card",
        "uhc2",
        "glass",
        model.auraClass,
        model.colorClass,
        model.backgroundUrl ? "has-custom-bg" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="user-hover-card"
      style={{
        ...surfaceStyle,
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 4000,
        width: CARD_WIDTH,
        maxWidth: `calc(100vw - ${PAD * 2}px)`,
        maxHeight: `calc(100vh - ${PAD * 2}px)`,
      }}
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="uhc2-banner"
        style={{ background: model.bannerUrl ? `${cssUrl(model.bannerUrl)} center/cover no-repeat` : fallbackBanner(merged.username || display) }}
      />
      <div className="uhc2-head">
        <div className="uhc2-avatar">
          <Avatar name={display} size={80} user={merged} imageUrl={pickAvatarUrl(merged)} animate="always" loading="eager" />
          <StatusBadge status={statusKey} user={merged} />
        </div>
        <span className="uhc-badges uhc2-badges"><CountryBadge user={merged} /></span>
      </div>
      <div className="uhc2-body">
        <div className="uhc2-name">
          <NameEffectText user={merged}>{display}</NameEffectText>
          <AdminBadge user={merged} variant="inline" />
        </div>
        <div className="uhc2-handle">
          @{merged.username || t("user")}
          <span className={`uhc2-status ${STATUS_CLASS[statusKey]}`}>
            <span className="uhc2-dot" /> {statusLabel}
          </span>
        </div>
        {model.customStatus ? <div className="uhc2-custom">{model.customStatus}</div> : null}
        {hasAbout ? (
          <div className="uhc2-panel">
            {model.bio ? (
              <div className="uhc2-sec">
                <div className="uhc2-label">{t("profile.about")}</div>
                <p className="uhc2-bio">{model.bio}</p>
              </div>
            ) : null}
            {memberSince ? (
              <div className="uhc2-sec">
                <div className="uhc2-label">{t("profile.memberSince")}</div>
                <div className="uhc2-value">{memberSince}</div>
              </div>
            ) : null}
          </div>
        ) : null}
        {lastSeenLabel ? <div className="uhc2-last">{t("Last seen {time}", { time: lastSeenLabel })}</div> : null}
        <div className="uhc2-hint">{t("profile.hoverOpenHint")}</div>
      </div>
    </motion.div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
