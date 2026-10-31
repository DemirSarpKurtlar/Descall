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
import { trDative } from "../../lib/trSuffix";
import { formatDate } from "../../i18n/format";
import {
  cachedHoverProfile,
  cachedMutual,
  currentActivity,
  hoverCardModel,
  loadHoverProfile,
  loadMutual,
  mergeHoverProfile,
} from "../../lib/hoverProfile";
import { useHoverCardContext } from "./HoverCardContext";
import { Gamepad2, Volume2, Monitor, Send } from "../ui/Icon.jsx";
import "../../styles/user-hover-card.css";

/*
 * Desktop hover profile card, design C "Detaylı" (3.7.13, owner pick).
 * Banner, avatar with the name below the banner seam (it used to touch it),
 * badges, "Şu an" (voice channel or shared activity), Hakkında, Üyelik ·
 * Ortak (mutual friends + servers) and a message box that sends a DM
 * without leaving the chat. Shop items come from the full profile
 * (lib/hoverProfile.js). The card is interactive: MessageList keeps it open
 * while the pointer travels to it or is on it.
 */

const STATUS_CLASS = { online: "st-online", idle: "st-idle", dnd: "st-dnd", invisible: "st-invisible", offline: "st-offline" };
const CARD_WIDTH = 340;
const PAD = 8;

function clampPos(anchor, cardH = 360) {
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

const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

async function fetchPublicProfile(id) {
  const res = await fetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(id)}`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return acceptProfilePayload(id, data?.user);
}

async function fetchMutual(username) {
  const res = await fetch(`${API_BASE_URL}/friends/mutual/${encodeURIComponent(username)}`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function memberSinceLabel(iso, locale) {
  if (!iso) return "";
  return formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric" });
}

function ActivityIcon({ kind }) {
  if (kind === "voice") return <Volume2 size={20} weight="bold" />;
  if (kind === "game") return <Gamepad2 size={20} weight="bold" />;
  return <Monitor size={20} weight="bold" />;
}

export default function UserHoverCard({ user, anchor, onPointerEnter, onPointerLeave, onClose, onOpenProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const ctx = useHoverCardContext();
  const ref = useRef(null);
  const inputRef = useRef(null);
  const userId = user?.id;
  const [full, setFull] = useState(() => (userId ? cachedHoverProfile(userId) : null));
  const [mutual, setMutual] = useState(() => (user?.username ? cachedMutual(user.username) : null));
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  const [pos, setPos] = useState(() => clampPos(anchor));

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    setFull(cachedHoverProfile(userId));
    setDraft("");
    setSent(false);
    loadHoverProfile(userId, fetchPublicProfile).then((data) => {
      if (live && data) setFull(data);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const isSelf = Boolean(ctx.meId && userId && String(ctx.meId) === String(userId));
  const username = user?.username || full?.username || "";
  useEffect(() => {
    if (!username || isSelf) return undefined;
    let live = true;
    setMutual(cachedMutual(username));
    loadMutual(username, fetchMutual).then((data) => {
      if (live && data) setMutual(data);
    });
    return () => {
      live = false;
    };
  }, [username, isSelf]);

  // Escape closes; a click outside closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const merged = mergeHoverProfile(user, full);
  const model = hoverCardModel(merged);
  const activity = currentActivity(userId, ctx, Date.now(), { t, locale });

  useLayoutEffect(() => {
    if (!anchor) return;
    const h = ref.current?.offsetHeight || 360;
    setPos(clampPos(anchor, h));
  }, [anchor, userId, full, mutual, activity?.title, sent]);

  if (!merged || !anchor || !model) return null;

  const statusKey = merged.status && STATUS_CLASS[merged.status] ? merged.status : "offline";
  const statusLabel = { online: t("Online"), idle: t("Idle"), dnd: t("Do Not Disturb"), invisible: t("Invisible"), offline: t("Offline") }[statusKey];
  const display = resolveDisplayName(merged);
  const memberSince = memberSinceLabel(model.createdAt, locale);
  const mutualFriends = mutual?.friends || [];
  const mutualServers = mutual?.servers || [];
  const canMessage = !isSelf && typeof ctx.sendDm === "function" && userId;
  // Turkish needs the dative ("@Ayşe'ye mesaj gönder"); other languages use {name}.
  const messageVars = { name: `@${display}`, nameDat: locale === "tr" ? `@${trDative(display)}` : `@${display}` };

  const send = () => {
    const text = draft.trim();
    if (!text || !canMessage) return;
    ctx.sendDm(userId, text);
    setDraft("");
    setSent(true);
  };

  // Keep the card while someone is typing in it, even if the pointer wanders off.
  const leave = () => {
    if (document.activeElement === inputRef.current || draft.trim()) return;
    onPointerLeave?.();
  };

  const node = (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={display}
      className={["user-hover-card", "uhc2", "uhc3", model.auraClass, model.colorClass].filter(Boolean).join(" ")}
      data-testid="user-hover-card"
      style={{
        ...(model.colorStyle || {}),
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 4000,
        width: CARD_WIDTH,
        maxWidth: `calc(100vw - ${PAD * 2}px)`,
        maxHeight: `calc(100vh - ${PAD * 2}px)`,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={leave}
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="uhc3-banner"
        style={{ background: model.bannerUrl ? `${cssUrl(model.bannerUrl)} center/cover no-repeat` : fallbackBanner(merged.username || display) }}
      />
      <div className="uhc3-top">
        <button type="button" className="uhc3-avatar" onClick={() => onOpenProfile?.(merged)} aria-label={t("profile.hoverOpenProfile")}>
          <Avatar name={display} size={84} user={merged} imageUrl={pickAvatarUrl(merged)} animate="always" loading="eager" />
          <StatusBadge status={statusKey} user={merged} />
        </button>
        <div className="uhc3-id">
          <button type="button" className="uhc3-name" onClick={() => onOpenProfile?.(merged)}>
            <NameEffectText user={merged}>{display}</NameEffectText>
            <AdminBadge user={merged} variant="inline" />
          </button>
          <div className="uhc3-handle">
            @{merged.username || t("user")}
            <span className={`uhc3-status ${STATUS_CLASS[statusKey]}`}>
              <span className="uhc3-dot" /> {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="uhc-badges uhc3-badges"><CountryBadge user={merged} /></div>
      {model.customStatus ? <div className="uhc3-custom">{model.customStatus}</div> : null}

      {activity ? (
        <div className="uhc3-sec" data-testid="hover-activity">
          <div className="uhc3-label">{t("profile.hoverNow")}</div>
          <div className="uhc3-act">
            <span className={`uhc3-act-ic is-${activity.kind}`}>
              {activity.iconUrl ? <img src={activity.iconUrl} alt="" /> : <ActivityIcon kind={activity.kind} />}
            </span>
            <span className="uhc3-act-text">
              <b>{activity.title}{activity.kind === "voice" && activity.subtitle ? ` · ${activity.subtitle}` : ""}</b>
              <span>
                {activity.kind === "voice"
                  ? t("profile.hoverPeople", { count: activity.count || 1 })
                  : activity.subtitle}
              </span>
            </span>
          </div>
        </div>
      ) : null}

      {model.bio || memberSince || mutualFriends.length || mutualServers.length ? (
        <div className="uhc3-sec">
          {model.bio ? (
            <>
              <div className="uhc3-label">{t("profile.about")}</div>
              <p className="uhc3-bio">{model.bio}</p>
            </>
          ) : null}
          {memberSince || mutualFriends.length || mutualServers.length ? (
            <>
              <div className="uhc3-label" style={model.bio ? { marginTop: 12 } : undefined}>
                {isSelf ? t("profile.memberSince") : t("profile.hoverMemberMutual")}
              </div>
              <div className="uhc3-meta">
                <span>{memberSince}</span>
                <span className="uhc3-mutual">
                  {mutualServers.length ? <em>{t("profile.hoverMutualServers", { count: mutualServers.length })}</em> : null}
                  {mutualFriends.length ? (
                    <span className="uhc3-faces" title={mutualFriends.map((f) => f.username).join(", ")}>
                      {mutualFriends.slice(0, 4).map((f) => (
                        <Avatar key={f.id} name={f.username} size={24} user={f} imageUrl={f.avatarUrl || null} />
                      ))}
                    </span>
                  ) : null}
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {canMessage ? (
        sent ? (
          <div className="uhc3-sent" role="status">
            <span>{t("profile.hoverSent")}</span>
            <button type="button" onClick={() => { onClose?.(); ctx.openDm?.(merged); }}>{t("profile.hoverGoChat")}</button>
          </div>
        ) : (
          <form
            className="uhc3-msg"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("shell.hover.message", messageVars)}
              aria-label={t("shell.hover.message", messageVars)}
            />
            <button type="submit" disabled={!draft.trim()} aria-label={t("shell.hover.message", messageVars)}>
              <Send size={18} weight="fill" />
            </button>
          </form>
        )
      ) : (
        <button type="button" className="uhc3-open" onClick={() => onOpenProfile?.(merged)}>{t("profile.hoverOpenProfile")}</button>
      )}
    </motion.div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
