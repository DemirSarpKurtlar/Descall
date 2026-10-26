import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import OverlayPortal from "../ui/OverlayPortal";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { X, UserPlus, MessageSquare, Check, UserMinus, Flag } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import { getPresenceStatus } from "../../lib/presence";
import AdminBadge from "./AdminBadge";
import { BadgeIcon, NameEffectText } from "../ui/Cosmetics";
import { ProfileBadgeRow } from "../badges/BadgeVault.jsx";
import { useT } from "../../context/LocaleContext";
import { useGlassShell } from "../layout/glass/GlassShell";
import { useGlassDesktop } from "../../hooks/useGlassDesktop";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { isUserAdmin } from "../../lib/userProfile";
import {
  acceptProfilePayload,
  friendStateFor,
  memberSinceIso,
  ownedList,
  sameUserId,
  seedProfile,
  visibleProfile,
} from "../../lib/profileModalState";
import { cssUrl } from "../../lib/cssUrl";
import { useLocale } from "../../context/LocaleContext";
import ParallaxBanner from "../ui/ParallaxBanner";
import ReportUserModal from "./ReportUserModal";
import BlockUserButton from "./BlockUserButton";
import { confirmAction } from "../../lib/glassConfirm";

function formatMemberSince(iso, t, locale) {
  if (!iso) return t("Unknown");
  try {
    return new Date(iso).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return t("Unknown");
  }
}

function generateBannerGradient(username) {
  const hues = [220, 260, 280, 200, 340, 180, 30];
  let h = 0;
  for (let i = 0; i < (username || "").length; i++) {
    h = (Math.imul(31, h) + username.charCodeAt(i)) | 0;
  }
  const hue = hues[Math.abs(h) % hues.length];
  return `linear-gradient(135deg, hsl(${hue}, 65%, 28%) 0%, hsl(${(hue + 40) % 360}, 55%, 18%) 100%)`;
}

const STATUS_COLOR = { online: "#23a55a", offline: "#80848e", idle: "#f0b232", dnd: "#f23f43" };

function ProfileGlassSkeleton({ label }) {
  return (
    <div className="profile-glass-skeleton-block" aria-busy="true" aria-label={label}>
      <span className="profile-glass-skeleton" style={{ width: "34%", height: 10 }} />
      <span className="profile-glass-skeleton" style={{ width: "54%", height: 14 }} />
    </div>
  );
}

function UserProfileModal({
  open,
  onClose,
  userId,
  username,
  displayName: displayNameProp,
  avatarUrl,
  createdAt: createdAtProp,
  me,
  friends = [],
  onlineUsers = [],
  onStartDm,
  onFriendSent,
}) {
  const t = useT();
  const glassShell = useGlassShell();
  const glassDesktop = useGlassDesktop();
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const dismissV = useRef(0);
  const { locale } = useLocale();
  const [profile, setProfile] = useState(null);
  const [settledFor, setSettledFor] = useState(null);
  const [friendOverride, setFriendOverride] = useState(null);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState({ userId: null, message: "" });
  const [mutualState, setMutualState] = useState({ forId: null, list: [] });
  const [reportFor, setReportFor] = useState(null);

  const isSelf = sameUserId(me?.id, userId);
  const status = getPresenceStatus(onlineUsers, userId);
  const friendState = friendStateFor(userId, friends, friendOverride);
  const friendErrorText = sameUserId(friendError.userId, userId) ? friendError.message : "";
  const reportOpen = sameUserId(reportFor, userId);

  useEffect(() => {
    if (!open || !userId) return undefined;
    const ctrl = new AbortController();
    const requestedId = userId;
    let active = true;
    setSettledFor((current) => (sameUserId(current, requestedId) ? current : null));

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/users/${requestedId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (!active) return;
        const accepted = acceptProfilePayload(requestedId, data.user);
        if (!accepted) return;
        setProfile(accepted);
      } catch (err) {
        if (err?.name === "AbortError" || !active) return;
        setProfile(null);
      } finally {
        if (active) setSettledFor(requestedId);
      }
    })();

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open || !userId || !username || isSelf) return undefined;
    const ctrl = new AbortController();
    const requestedId = userId;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/friends/mutual/${encodeURIComponent(username)}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: ctrl.signal,
        });
        if (!active) return;
        if (!res.ok) {
          setMutualState({ forId: requestedId, list: [] });
          return;
        }
        const data = await res.json();
        if (!active) return;
        setMutualState({ forId: requestedId, list: data.mutualFriends || [] });
      } catch (err) {
        if (err?.name === "AbortError" || !active) return;
        setMutualState({ forId: requestedId, list: [] });
      }
    })();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [open, userId, username, isSelf]);

  useEffect(() => {
    if (!open) return undefined;
    hapticImpactLight();
    return undefined;
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const noteFriendError = (forId, message) => {
    setFriendError({ userId: forId, message });
    if (!message) return;
    setTimeout(() => {
      setFriendError((prev) => (
        sameUserId(prev.userId, forId) ? { userId: forId, message: "" } : prev
      ));
    }, 3000);
  };

  const handleAddFriend = async () => {
    if (friendLoading || friendState !== "none") return;
    const forId = userId;
    setFriendLoading(true);
    noteFriendError(forId, "");
    try {
      const res = await fetch(`${API_BASE_URL}/friends/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ username: fetched?.username || username }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to send request");
      setFriendOverride({ userId: forId, state: "sent" });
      onFriendSent?.();
    } catch (err) {
      noteFriendError(forId, err.message);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (friendLoading || friendState !== "friend") return;
    const ok = await confirmAction({
      title: t("Remove Friend"),
      message: t("Remove {username} from your friends?", { username: displayUsername }),
      confirmLabel: t("Remove Friend"),
      cancelLabel: t("Cancel"),
      danger: true,
    });
    if (!ok) return;
    const forId = userId;
    setFriendLoading(true);
    noteFriendError(forId, "");
    try {
      const res = await fetch(`${API_BASE_URL}/friends/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ friendId: forId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to remove friend");
      setFriendOverride({ userId: forId, state: "none" });
      onFriendSent?.();
    } catch (err) {
      noteFriendError(forId, err.message);
    } finally {
      setFriendLoading(false);
    }
  };

  const fetched = visibleProfile(profile, userId, null);
  const known = (friends || []).find((f) => f && sameUserId(f.id, userId)) || null;
  const seed = seedProfile({
    userId,
    username: username || known?.username,
    displayName: displayNameProp || known?.displayName || known?.display_name,
    avatarUrl: avatarUrl ?? known?.avatarUrl ?? known?.avatar_url ?? null,
    createdAt: createdAtProp || known?.createdAt || known?.created_at || null,
  });
  const viewUser = visibleProfile(profile, userId, seed);
  const badgeUser = fetched ? { ...fetched, id: fetched.id || userId } : { id: userId };
  const pending = Boolean(open && userId && !sameUserId(settledFor, userId));
  const mutualFriends = ownedList(mutualState.forId, userId, mutualState.list);
  const memberSince = memberSinceIso(userId, [fetched, seed, known]);
  const customStatus = fetched?.customStatus || fetched?.custom_status || (sameUserId(known?.id, userId) ? (known?.customStatus || known?.custom_status) : "") || "";
  const showMemberSkeleton = pending && !memberSince;
  const showMutualSkeleton = pending && !isSelf;

  const displayUsername = viewUser?.username || username || t("Unknown");
  const displayName =
    viewUser?.displayName || viewUser?.display_name || displayNameProp || displayUsername;
  const displayAvatar = viewUser?.avatarUrl ?? avatarUrl ?? null;
  const equippedBannerUrl = fetched?.equippedBanner?.asset_url || fetched?.bannerUrl || fetched?.banner_url || null;
  const equippedBackgroundUrl = fetched?.equippedBackground?.asset_url || null;
  const bannerGradient = generateBannerGradient(username || displayUsername);
  const statusLabel = {
    online: t("Online"),
    offline: t("Offline"),
    idle: t("Idle"),
    dnd: t("Do Not Disturb"),
  }[status] || t("Offline");
  const statusClass = status === "online" ? "is-on" : status === "idle" ? "is-idle" : status === "dnd" ? "is-dnd" : "is-off";

  if (glassShell) {
    const dismissSheet = (velocity = 0) => {
      dismissV.current = Number.isFinite(velocity) ? velocity : 0;
      onClose?.();
    };
    const tree = (
      <>
        <AnimatePresence custom={dismissV.current}>
          {open && (
            <motion.div
              className="g-profile-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? REDUCED_MOTION_FADE : { duration: 0.2 }}
              onClick={() => dismissSheet(0)}
            >
              <motion.div
                key={userId || "profile"}
                className="g-profile-sheet g-glass g-heavy"
                custom={dismissV.current}
                variants={{
                  initial: reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 },
                  animate: reduceMotion
                    ? { opacity: 1, transition: REDUCED_MOTION_FADE }
                    : { y: 0, opacity: 1, transition: framerSpring(SPRINGS.sheet) },
                  exit: (velocity) => (
                    reduceMotion
                      ? { opacity: 0, transition: REDUCED_MOTION_FADE }
                      : {
                          y: 560,
                          opacity: 0,
                          transition: framerSpring(SPRINGS.sheet, Number.isFinite(velocity) ? velocity : undefined),
                        }
                  ),
                }}
                initial="initial"
                animate="animate"
                exit="exit"
                drag={reduceMotion ? false : "y"}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.04, bottom: 0.55 }}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 88 || info.velocity.y > 750) {
                  hapticImpactLight();
                  dismissSheet(info.velocity.y);
                }
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={displayName}
              >
                <div
                  className="g-profile-banner"
                  onPointerDown={(event) => {
                    if (reduceMotion) return;
                    if (event.target.closest("button, a, input, textarea")) return;
                    dragControls.start(event);
                  }}
                  style={equippedBannerUrl ? {
                    backgroundImage: cssUrl(equippedBannerUrl),
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  } : { background: bannerGradient }}
                >
                  <div className="g-profile-grabber" aria-hidden="true" />
                  <button
                    type="button"
                    className="g-profile-close g-chip"
                    onClick={() => dismissSheet(0)}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={t("Close")}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="g-profile-body">
                  <div className="g-profile-avatar" style={{ "--av-size": "88px" }}>
                    <Avatar
                      key={userId || "profile"}
                      name={displayName}
                      size={88}
                      user={viewUser}
                    />
                    <StatusBadge status={status} />
                  </div>
                  <div className="g-profile-name">
                    <span className="g-profile-name-text">
                      <NameEffectText user={fetched}>{displayName}</NameEffectText>
                    </span>
                    <BadgeIcon user={fetched} />
                  </div>
                  <div className="g-profile-handle">
                    @{displayUsername} · <span className={statusClass}>{statusLabel}</span>
                  </div>
                  <ProfileBadgeRow user={badgeUser} me={me} size="ios" className="g-profile-badges" />
                  {isUserAdmin(viewUser) && (
                    <div className="g-profile-chips">
                      <AdminBadge user={viewUser} variant="chip" />
                    </div>
                  )}
                  {fetched?.bio ? <p className="g-profile-bio">{fetched.bio}</p> : null}
                  {!isSelf && (
                    <div className="g-profile-actions">
                      <button
                        type="button"
                        className="is-brand"
                        onClick={() => {
                          onStartDm?.({ id: userId, username: displayUsername, avatarUrl: displayAvatar });
                          onClose();
                        }}
                      >
                        <MessageSquare size={16} />
                        <span>{t("Send Message")}</span>
                      </button>
                      <button
                        type="button"
                        className="is-fill"
                        disabled={friendLoading || friendState === "sent"}
                        onClick={friendState === "friend" ? handleRemoveFriend : handleAddFriend}
                      >
                        {friendState === "friend" ? <UserMinus size={16} /> : friendState === "sent" ? <Check size={16} /> : <UserPlus size={16} />}
                        <span>{friendState === "friend" ? t("Friends") : friendState === "sent" ? t("Sent") : t("Add Friend")}</span>
                      </button>
                    </div>
                  )}
                  <div className="g-profile-group">
                    {showMemberSkeleton ? (
                      <ProfileGlassSkeleton label={t("Loading…")} />
                    ) : memberSince ? (
                      <div className="g-profile-grow">
                        <b>{t("Member Since")}</b>
                        <span>{formatMemberSince(memberSince, t, locale)}</span>
                      </div>
                    ) : null}
                    {showMutualSkeleton ? (
                      <ProfileGlassSkeleton label={t("Loading…")} />
                    ) : !isSelf && mutualFriends.length > 0 ? (
                      <div className="g-profile-grow">
                        <b>{t("Mutual Friends")}</b>
                        <span>{mutualFriends.length}</span>
                      </div>
                    ) : null}
                    {customStatus ? (
                      <div className="g-profile-grow">
                        <b>{t("Custom status")}</b>
                        <span>{customStatus}</span>
                      </div>
                    ) : null}
                  </div>
                  {friendErrorText ? <p className="g-profile-bio">{friendErrorText}</p> : null}
                  {!isSelf && (
                    <div className="g-profile-safety">
                      <BlockUserButton
                        userId={userId}
                        username={displayUsername}
                        onChange={(nowBlocked) => {
                          if (nowBlocked) setFriendOverride({ userId, state: "none" });
                        }}
                      />
                      <button type="button" className="user-profile-report-btn" onClick={() => setReportFor(userId)}>
                        <Flag size={13} />
                        <span>{t("report.action")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <ReportUserModal
          open={open && reportOpen}
          onClose={() => setReportFor(null)}
          targetId={userId}
          targetUsername={displayUsername}
          contextType="profile"
        />
      </>
    );
    if (typeof document === "undefined") return tree;
    return createPortal(tree, document.body);
  }

  return (
    <OverlayPortal>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="user-profile-scrim"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
          }}
          onClick={onClose}
        >
          <motion.div
            key={userId || "profile"}
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.94, opacity: 0, y: 12 }}
            animate={reduceMotion ? { opacity: 1, transition: REDUCED_MOTION_FADE } : { scale: 1, opacity: 1, y: 0, transition: framerSpring(SPRINGS.sheet) }}
            exit={reduceMotion ? { opacity: 0, transition: REDUCED_MOTION_FADE } : { scale: 0.96, opacity: 0, y: 8, transition: framerSpring(SPRINGS.sheet) }}
            role="dialog"
            aria-modal="true"
            aria-label={displayName}
            className={[
              "user-profile-card",
              glassDesktop ? "is-gd" : "",
              equippedBackgroundUrl ? "has-custom-bg" : "",
              fetched?.equippedProfileAura?.effect_key
                ? `cosmetic-profile-aura aura-${fetched.equippedProfileAura.effect_key}`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: glassDesktop ? 560 : 300,
              maxWidth: glassDesktop ? "calc(100vw - 48px)" : undefined,
              // A purchased profile background shows through everywhere the card
              // isn't otherwise opaque, gently tinted so text stays legible.
              background: equippedBackgroundUrl
                ? `linear-gradient(180deg, rgba(18,18,24,0.35) 0%, rgba(18,18,24,0.82) 65%, rgba(18,18,24,0.94) 100%), ${cssUrl(equippedBackgroundUrl)} center/cover no-repeat`
                : (glassDesktop ? "transparent" : "var(--surface-1)"),
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
              border: "1px solid var(--border-3)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="user-profile-close" onClick={onClose} aria-label={t("Close")}>
              <X size={14} />
            </button>

            {/* Banner */}
            <ParallaxBanner
              height={glassDesktop ? 150 : 80}
              imageUrl={equippedBannerUrl ? cssUrl(equippedBannerUrl) : null}
              fallbackStyle={{ background: bannerGradient }}
              strength={12}
            />

            {/* Avatar overlapping banner */}
            <div className={`user-profile-card-top${glassDesktop ? " is-gd" : ""}`} style={glassDesktop ? undefined : { position: "relative", padding: "0 16px" }}>
              <div
                className="profile-avatar-shell"
                style={glassDesktop ? { "--av-size": "104px" } : {
                  "--av-size": "72px",
                  position: "absolute",
                  top: -36,
                  left: 16,
                }}
              >
                <Avatar
                  key={userId || "profile"}
                  name={displayName}
                  size={glassDesktop ? 104 : 72}
                  user={viewUser}
                />
                {/* No presence-flare on the corner dot, its glow skews the avatar ring. */}
                <StatusBadge status={status} />
              </div>

              {glassDesktop ? null : (
              /* Spacer clears avatar + frame/effect overflow (~16% each side). */
              <div style={{ height: 56 }} />
              )}

              <div className="user-profile-identity">
                <div className="user-profile-name-row">
                  <NameEffectText user={fetched}>{displayName}</NameEffectText>
                  <BadgeIcon user={fetched} />
                </div>
                {displayName !== displayUsername && (
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    @{displayUsername}
                  </div>
                )}
                <div className="user-profile-badges">
                  <ProfileBadgeRow
                    user={badgeUser}
                    me={me}
                    trailing={isUserAdmin(viewUser) ? <AdminBadge user={viewUser} variant="chip" /> : null}
                  />
                </div>
                <div
                  className="user-profile-status-line"
                  style={{ color: STATUS_COLOR[status] || STATUS_COLOR.offline }}
                >
                  <span
                    className="user-profile-status-dot"
                    style={{ background: STATUS_COLOR[status] || STATUS_COLOR.offline }}
                  />
                  {statusLabel}
                </div>
              </div>

              {/* Divider */}
              <div className="user-profile-divider" style={{ height: 1, background: "var(--border-2)", margin: "0 -16px 12px" }} />

              {glassDesktop ? (
                <div className="user-profile-about">
                  {fetched?.bio ? (
                    <div className="user-profile-about-row">
                      <div className="user-profile-about-label">{t("About me")}</div>
                      <div>{fetched.bio}</div>
                    </div>
                  ) : null}
                  {customStatus ? (
                    <div className="user-profile-about-row">
                      <div className="user-profile-about-label">{t("Custom status")}</div>
                      <div>{customStatus}</div>
                    </div>
                  ) : null}
                  <div className="user-profile-about-split">
                    {showMemberSkeleton ? (
                      <ProfileGlassSkeleton label={t("Loading…")} />
                    ) : memberSince ? (
                      <div>
                        <div className="user-profile-about-label">{t("Member Since")}</div>
                        <div>{formatMemberSince(memberSince, t, locale)}</div>
                      </div>
                    ) : null}
                    {showMutualSkeleton ? (
                      <ProfileGlassSkeleton label={t("Loading…")} />
                    ) : !isSelf && mutualFriends.length > 0 ? (
                      <div>
                        <div className="user-profile-about-label">{t("Mutual Friends")}</div>
                        <div className="user-profile-mutual">
                          <div className="user-profile-mutual-faces">
                            {mutualFriends.slice(0, 3).map((f, i) => (
                              <span key={f.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 4 - i }}>
                                <Avatar name={f.username} size={24} user={f} />
                              </span>
                            ))}
                          </div>
                          <span>
                            {mutualFriends.length === 1
                              ? (mutualFriends[0].displayName || mutualFriends[0].username)
                              : t("{name} and {count} others", {
                                  name: mutualFriends[0].displayName || mutualFriends[0].username,
                                  count: mutualFriends.length - 1,
                                })}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="user-profile-legacy-meta">
              {/* Member since */}
              {showMemberSkeleton ? (
                <ProfileGlassSkeleton label={t("Loading…")} />
              ) : memberSince ? (
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      color: "var(--text-muted)",
                      marginBottom: 3,
                    }}
                  >
                    {t("Member Since")}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>
                    {formatMemberSince(memberSince, t, locale)}
                  </div>
                </div>
              ) : null}

              {/* Mutual friends */}
              {showMutualSkeleton ? (
                <ProfileGlassSkeleton label={t("Loading…")} />
              ) : !isSelf && mutualFriends.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      color: "var(--text-muted)",
                      marginBottom: 6,
                    }}
                  >
                    {t("Mutual Friends")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex" }}>
                      {mutualFriends.slice(0, 4).map((f, i) => (
                        <div
                          key={f.id}
                          title={f.username}
                          style={{
                            marginLeft: i === 0 ? 0 : -8,
                            zIndex: 4 - i,
                            position: "relative",
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            border: "2px solid var(--surface-1)",
                            overflow: "hidden",
                            background: "var(--surface-3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--text-1)",
                          }}
                        >
                          <Avatar name={f.username} size={24} user={f} />
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500 }}>
                      {mutualFriends.length === 1
                        ? `${mutualFriends[0].username}`
                        : mutualFriends.length - 1 === 1
                        ? t("{name} and {count} other", {
                            name: mutualFriends[0].username,
                            count: 1,
                          })
                        : t("{name} and {count} others", {
                            name: mutualFriends[0].username,
                            count: mutualFriends.length - 1,
                          })}
                    </span>
                  </div>
                </div>
              )}
              </div>

              {/* Action buttons (skip for self) */}
              {!isSelf && (
                <div className="user-profile-actions" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {/* Add / Remove Friend button */}
                  <motion.button
                    className="user-profile-friend"
                    whileTap={{ scale: 0.96 }}
                    onClick={friendState === "friend" ? handleRemoveFriend : handleAddFriend}
                    disabled={friendLoading || friendState === "sent"}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "none",
                      cursor: (friendLoading || friendState === "sent") ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "all 0.15s",
                      background:
                        friendState === "friend"
                          ? "var(--surface-3)"
                          : friendState === "sent"
                          ? "rgba(35,165,90,0.15)"
                          : "var(--primary)",
                      color:
                        friendState === "friend"
                          ? "var(--text-1)"
                          : friendState === "sent"
                          ? "#23a55a"
                          : "white",
                    }}
                    onMouseEnter={(e) => {
                      if (friendState === "friend") {
                        e.currentTarget.style.background = "rgba(242,63,67,0.15)";
                        e.currentTarget.style.color = "var(--danger)";
                      } else if (friendState === "none") {
                        e.currentTarget.style.filter = "brightness(1.12)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      if (friendState === "friend") {
                        e.currentTarget.style.background = "var(--surface-3)";
                        e.currentTarget.style.color = "var(--text-1)";
                      }
                    }}
                  >
                    {friendState === "friend" ? (
                      <><UserMinus size={15} /><span>{friendLoading ? t("Removing…") : t("Friends")}</span></>
                    ) : friendState === "sent" ? (
                      <><Check size={15} /><span>{t("Sent")}</span></>
                    ) : (
                      <><UserPlus size={15} /><span>{friendLoading ? t("Sending…") : t("Add Friend")}</span></>
                    )}
                  </motion.button>

                  {/* Message button */}
                  <motion.button
                    className="user-profile-msg"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => { onStartDm?.({ id: userId, username: displayUsername, avatarUrl: displayAvatar }); onClose(); }}
                    style={{
                      width: 38,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      padding: "9px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      background: "var(--surface-3)",
                      color: "var(--text-1)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-0)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-1)"; }}
                    title={t("Send Message")} aria-label={t("Send Message")}
                  >
                    <MessageSquare size={16} />
                    {glassDesktop ? <span>{t("Send Message")}</span> : null}
                  </motion.button>
                </div>
              )}

              {!isSelf && (
                <div className="user-profile-safety-row">
                  <BlockUserButton
                    userId={userId}
                    username={displayUsername}
                    onChange={(nowBlocked) => {
                      if (nowBlocked) setFriendOverride({ userId, state: "none" });
                    }}
                  />
                  <button
                    type="button"
                    className="user-profile-report-btn"
                    onClick={() => setReportFor(userId)}
                  >
                    <Flag size={13} />
                    <span>{t("report.action")}</span>
                  </button>
                </div>
              )}

              {/* Friend error */}
              {friendErrorText && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "7px 10px",
                    borderRadius: 6,
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {friendErrorText}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      <ReportUserModal
        open={open && reportOpen}
        onClose={() => setReportFor(null)}
        targetId={userId}
        targetUsername={displayUsername}
        contextType="profile"
      />
    </AnimatePresence>
    </OverlayPortal>
  );
}

export default function ProfileModalHost(props) {
  const latched = useRef(null);
  if (props.userId) latched.current = props;
  const active = props.userId ? props : (latched.current || props);
  return (
    <UserProfileModal
      key={active.userId || "closed"}
      {...active}
      open={Boolean(props.open && props.userId)}
      onClose={props.onClose}
    />
  );
}
