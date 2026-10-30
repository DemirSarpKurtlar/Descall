import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import OverlayPortal from "../ui/OverlayPortal";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { X, UserPlus, MessageSquare, Check, UserMinus, Flag, Ban, MoreHorizontal } from "../ui/Icon.jsx";
import GlassActionMenu from "../ui/GlassActionMenu";
import { confirmToggleBlock, useIsBlocked } from "../../lib/blockedUsers";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";
import { getPresenceStatus } from "../../lib/presence";
import AdminBadge from "./AdminBadge";
import { NameEffectText } from "../ui/Cosmetics";
import { ProfileBadgeRow } from "../badges/BadgeVault.jsx";
import { useT } from "../../context/LocaleContext";
import { useGlassShell } from "../layout/glass/GlassShell";
import { useGlassDesktop } from "../../hooks/useGlassDesktop";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { isUserAdmin, resolveDisplayName } from "../../lib/userProfile";
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
import { confirmAction, promptAction } from "../../lib/glassConfirm";
import { trAccusative, trDative, trGenitive } from "../../lib/trSuffix";
import { useNickname, setNickname, NICKNAME_MAX } from "../../lib/friendNicknames";
import { copyText } from "../../lib/copyText";
import { buildFriendInviteUrl, toPublicShareUrl } from "../../lib/referral";
import { useToast } from "../../context/ToastContext";
import "./ProfileSheet.css";
import { MIX, MIMore, MIShare, MICopy, MIPen, MIFlag, MIBan, MIMsg, MIPhone, MICam, MIUser, MIUserPlus, MICheck, MIChevL } from "./ProfileSheetIcons.jsx";

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
const MENU_FORM_OFFSET = { x: 10, y: -8 };

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
  onStartCall,
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
  const [mutualState, setMutualState] = useState({ forId: null, list: [], servers: [] });
  // Pushed page inside the sheet: "servers" | "friends" | null.
  const [page, setPage] = useState(null);
  const nickname = useNickname(userId);
  const { toast } = useToast();
  const [reportFor, setReportFor] = useState(null);
  // A2 §4.6: Engelle / Şikayet et live in a "⋯" menu at the top AND as red
  // buttons at the bottom of the profile.
  const moreRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockError, setBlockError] = useState("");
  const blockedByMe = useIsBlocked(userId);

  const isSelf = sameUserId(me?.id, userId);
  const status = getPresenceStatus(onlineUsers, userId);
  const friendState = friendStateFor(userId, friends, friendOverride);
  const friendErrorText = sameUserId(friendError.userId, userId) ? friendError.message : "";
  const reportOpen = sameUserId(reportFor, userId);
  const toggleBlock = async () => {
    setBlockError("");
    try {
      const next = await confirmToggleBlock({ userId, username: profile?.username || username, t });
      if (next) setFriendOverride({ userId, state: "none" });
    } catch (err) {
      setBlockError(err?.message || t("Something went wrong."));
    }
  };
  const profileHandle = () => profile?.username || username || "";
  const shareProfile = async () => {
    const handle = profileHandle();
    if (!handle) return;
    const url = toPublicShareUrl(buildFriendInviteUrl(handle));
    const data = { title: "Descall", text: t("profile.shareText", { username: handle }), url };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        let payload = data;
        try {
          if (navigator.canShare && !navigator.canShare(data)) payload = { title: data.title, url };
        } catch {
          payload = { title: data.title, url };
        }
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
      }
    }
    const ok = await copyText(url);
    toast(ok ? t("profile.linkCopied") : t("Something went wrong."), ok ? "success" : "error", { duration: 1800 });
  };
  const copyUsername = async () => {
    const handle = profileHandle();
    if (!handle) return;
    const ok = await copyText(handle);
    toast(ok ? t("profile.usernameCopied") : t("Something went wrong."), ok ? "success" : "error", { duration: 1800 });
  };
  const editNickname = async () => {
    const base = profile?.displayName || profile?.display_name || displayNameProp || profileHandle();
    const value = await promptAction({
      title: t("profile.nicknameTitle"),
      message: t("profile.nicknameBody"),
      defaultValue: nickname,
      placeholder: base,
      confirmLabel: t("Save"),
      cancelLabel: t("Cancel"),
    });
    if (value == null) return;
    const saved = setNickname(userId, String(value).slice(0, NICKNAME_MAX));
    toast(saved ? t("profile.nicknameSaved") : t("profile.nicknameCleared"), "success", { duration: 1600 });
  };
  const moreSections = [[
    { id: "share", label: t("profile.share"), icon: MIShare, onSelect: shareProfile },
    { id: "copy", label: t("profile.copyUsername"), icon: MICopy, onSelect: copyUsername },
    { id: "nickname", label: t("profile.nickname"), icon: MIPen, onSelect: editNickname },
  ], [
    { id: "report", label: t("Report user"), icon: MIFlag, danger: true, onSelect: () => setReportFor(userId) },
    { id: "block", label: blockedByMe ? t("Unblock user") : t("Block user"), icon: MIBan, danger: !blockedByMe, onSelect: toggleBlock },
  ]];

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
          setMutualState({ forId: requestedId, list: [], servers: [] });
          return;
        }
        const data = await res.json();
        if (!active) return;
        setMutualState({
          forId: requestedId,
          list: data.mutualFriends || [],
          servers: Array.isArray(data.mutualServers) ? data.mutualServers : [],
        });
      } catch (err) {
        if (err?.name === "AbortError" || !active) return;
        setMutualState({ forId: requestedId, list: [], servers: [] });
      }
    })();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [open, userId, username, isSelf]);

  useEffect(() => {
    if (open) return;
    setPage(null);
    setMoreOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    hapticImpactLight();
    return undefined;
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    // The report sheet and the ⋯ menu handle their own Escape (top layer first).
    if (reportOpen || moreOpen) return;
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, reportOpen, moreOpen]);

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
    nickname || viewUser?.displayName || viewUser?.display_name || displayNameProp || displayUsername;
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

  if (glassShell || glassDesktop) {
    const layout = glassShell ? "sheet" : "form";
    const dismissSheet = (velocity = 0) => {
      dismissV.current = Number.isFinite(velocity) ? velocity : 0;
      onClose?.();
    };
    const nameAcc = locale === "tr" ? trAccusative(displayName) : displayName;
    const nameDat = locale === "tr" ? trDative(displayName) : displayName;
    const nameGen = locale === "tr" ? trGenitive(displayName) : displayName;
    const statusKey = statusClass;
    const canCall = typeof onStartCall === "function" && !isSelf;
    const callTarget = { id: userId, username: displayUsername, avatarUrl: displayAvatar, displayName };
    const tiles = isSelf ? [] : [
      { id: "message", icon: MIMsg, label: t("profile.tileMessage"), onClick: () => { onStartDm?.({ id: userId, username: displayUsername, avatarUrl: displayAvatar }); onClose(); } },
      canCall ? { id: "call", icon: MIPhone, label: t("profile.tileCall"), disabled: blockedByMe, onClick: () => { onClose(); onStartCall(callTarget, "voice"); } } : null,
      canCall ? { id: "video", icon: MICam, label: t("profile.tileVideo"), disabled: blockedByMe, onClick: () => { onClose(); onStartCall(callTarget, "video"); } } : null,
      {
        id: "friend",
        icon: friendState === "friend" ? MIUser : friendState === "sent" ? MICheck : MIUserPlus,
        label: friendState === "friend" ? t("profile.tileFriend") : friendState === "sent" ? t("Sent") : t("profile.tileAdd"),
        disabled: friendLoading || friendState === "sent" || (friendState === "none" && blockedByMe),
        onClick: friendState === "friend" ? handleRemoveFriend : handleAddFriend,
      },
    ].filter(Boolean);
    const mutualServers = ownedList(mutualState.forId, userId, mutualState.servers || []);
    const mutualReady = sameUserId(mutualState.forId, userId);
    const chev = (
      <svg className="chev" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
    const countRow = (id, label, list) => {
      const n = list.length;
      const value = !mutualReady ? <span className="pfs-skel" aria-label={t("Loading…")} /> : <span className="val">{n}</span>;
      if (!mutualReady || n === 0) {
        return <div className="pfs-row" data-testid={`profile-row-${id}`}><span className="lab">{label}</span>{value}</div>;
      }
      return (
        <button type="button" className="pfs-row" data-testid={`profile-row-${id}`} onClick={() => setPage(id)}>
          <span className="lab">{label}</span>{value}{chev}
        </button>
      );
    };
    const heroStyle = equippedBannerUrl ? { backgroundImage: cssUrl(equippedBannerUrl) } : undefined;
    const startDrag = (event) => {
      if (layout !== "sheet" || reduceMotion) return;
      if (event.target.closest("button, a, input, textarea")) return;
      dragControls.start(event);
    };
    const listPage = page === "servers" || page === "friends" ? (
      <>
        <div className="pfs-grab" aria-hidden="true" />
        <div className="pfs-nav">
          <button type="button" className="l" onClick={() => setPage(null)} data-testid="profile-sub-back">
            <MIChevL />
            <span>{t("profile.back")}</span>
          </button>
          <span className="t">{page === "servers" ? t("profile.mutualServers") : t("profile.mutualFriends")}</span>
          <span />
        </div>
        <div className="pfs-scroll">
          <div className="pfs-group" style={{ "--inset": "60px" }}>
            {(page === "servers" ? mutualServers : mutualFriends).map((item) => (
              <div className="pfs-row" key={item.id} style={{ minHeight: 54 }}>
                {page === "servers" ? (
                  <span className="pfs-srv" style={{ width: 34, height: 34, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: item.iconUrl ? `${cssUrl(item.iconUrl)} center/cover` : "#587AF6", fontWeight: 700, fontSize: 14 }}>
                    {item.iconUrl ? null : String(item.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <Avatar name={item.displayName || item.username} size={34} user={item} />
                )}
                <span className="lab">{page === "servers" ? item.name : resolveDisplayName(item)}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    ) : null;
    const body = (
      <>
        <div className="pfs-top">
          <button type="button" className="pfs-cb" onClick={() => dismissSheet(0)} aria-label={t("Close")} data-testid="profile-close">
            <MIX />
          </button>
          {!isSelf ? (
            <button
              ref={moreRef}
              type="button"
              className={`pfs-cb${moreOpen ? " is-on" : ""}`}
              data-testid="profile-more"
              onClick={() => setMoreOpen((v) => !v)}
              aria-label={t("Profile options")}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MIMore />
            </button>
          ) : <span />}
        </div>
        <div className="pfs-scroll" style={{ paddingTop: 0 }}>
          <div className="pfs-hero" style={heroStyle} onPointerDown={startDrag}>
            <div className="pfs-av">
              <Avatar key={userId || "profile"} name={displayName} size={92} user={viewUser} />
              <i className={`pfs-av-dot ${statusKey}`} aria-hidden="true" />
            </div>
          </div>
          <div className="pfs-name" data-testid="profile-name">
            <NameEffectText user={fetched}>{displayName}</NameEffectText>
          </div>
          <div className="pfs-h">
            @{displayUsername} · <b className={statusKey}>{statusLabel}</b>
          </div>
          <div className="pfs-badges">
            <ProfileBadgeRow user={badgeUser} me={me} size={glassShell ? "ios" : "md"} />
            {isUserAdmin(viewUser) ? <AdminBadge user={viewUser} variant="chip" /> : null}
          </div>
          {fetched?.bio ? <p className="pfs-bio">{fetched.bio}</p> : null}
          {tiles.length ? (
            <div className="pfs-acts" style={{ "--n": tiles.length }} data-testid="profile-actions">
              {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <button key={tile.id} type="button" className="pfs-act" data-testid={`profile-act-${tile.id}`} disabled={tile.disabled} onClick={tile.onClick}>
                    <Icon />
                    <span>{tile.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {friendErrorText ? <p className="pfs-err" role="alert">{friendErrorText}</p> : null}
          <div className="pfs-sec">{t("profile.about")}</div>
          <div className="pfs-group is-plain" data-testid="profile-about">
            <div className="pfs-row">
              <span className="lab">{t("profile.memberSince")}</span>
              {showMemberSkeleton ? <span className="pfs-skel" aria-label={t("Loading…")} /> : <span className="val">{memberSince ? formatMemberSince(memberSince, t, locale) : t("Unknown")}</span>}
            </div>
            {customStatus ? (
              <div className="pfs-row"><span className="lab">{t("Custom status")}</span><span className="val">{customStatus}</span></div>
            ) : null}
            {!isSelf ? countRow("servers", t("profile.mutualServers"), mutualServers) : null}
            {!isSelf ? countRow("friends", t("profile.mutualFriends"), mutualFriends) : null}
          </div>
          {!isSelf ? (
            <>
              <div className="pfs-sec" aria-hidden="true" />
              <div className="pfs-group" data-testid="profile-safety">
                <button type="button" className="pfs-row is-red" data-testid="profile-safety-report" onClick={() => setReportFor(userId)}>
                  <span className="pfs-ico"><MIFlag /></span>
                  <span className="lab">{t("Report user")}</span>
                </button>
                <button type="button" className="pfs-row is-red" data-testid="profile-safety-block" aria-pressed={blockedByMe} onClick={toggleBlock}>
                  <span className="pfs-ico"><MIBan /></span>
                  <span className="lab">{blockedByMe ? t("profile.unblockName", { nameGen }) : t("profile.blockName", { nameAcc })}</span>
                </button>
              </div>
              <div className="pfs-foot">{t("profile.blockFoot", { nameDat })}</div>
              {blockError ? <p className="pfs-err" role="alert">{blockError}</p> : null}
            </>
          ) : null}
        </div>
      </>
    );
    const surfaceMotion = layout === "sheet"
      ? {
          variants: {
            initial: reduceMotion ? { opacity: 0 } : { y: 60, opacity: 0 },
            animate: reduceMotion
              ? { opacity: 1, transition: REDUCED_MOTION_FADE }
              : { y: 0, opacity: 1, transition: framerSpring(SPRINGS.sheet) },
            exit: (velocity) => (
              reduceMotion
                ? { opacity: 0, transition: REDUCED_MOTION_FADE }
                : { y: 700, opacity: 0, transition: framerSpring(SPRINGS.sheet, Number.isFinite(velocity) ? velocity : undefined) }
            ),
          },
          drag: reduceMotion ? false : "y",
          dragControls,
          dragListener: false,
          dragConstraints: { top: 0, bottom: 0 },
          dragElastic: { top: 0.04, bottom: 0.55 },
          dragMomentum: false,
          onDragEnd: (_, info) => {
            if (info.offset.y > 88 || info.velocity.y > 750) {
              hapticImpactLight();
              dismissSheet(info.velocity.y);
            }
          },
        }
      : {
          variants: {
            initial: reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0, y: 10 },
            animate: reduceMotion ? { opacity: 1, transition: REDUCED_MOTION_FADE } : { scale: 1, opacity: 1, y: 0, transition: framerSpring(SPRINGS.sheet) },
            exit: reduceMotion ? { opacity: 0, transition: REDUCED_MOTION_FADE } : { scale: 0.97, opacity: 0, y: 6, transition: framerSpring(SPRINGS.sheet) },
          },
        };
    const tree = (
      <>
        <AnimatePresence custom={dismissV.current}>
          {open && (
            <motion.div
              className={`pfs-scrim${layout === "form" ? " is-form" : ""}`}
              data-testid="profile-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? REDUCED_MOTION_FADE : { duration: 0.2 }}
              onClick={() => dismissSheet(0)}
            >
              <motion.div
                key={userId || "profile"}
                className={`${layout === "sheet" ? "pfs-sheet" : "pfs-form"} pfs-heavy`}
                data-testid="profile-sheet"
                custom={dismissV.current}
                initial="initial"
                animate="animate"
                exit="exit"
                {...surfaceMotion}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={displayName}
              >
                {listPage || body}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <ReportUserModal
          open={open && reportOpen}
          onClose={() => setReportFor(null)}
          targetId={userId}
          targetUsername={displayUsername}
          targetDisplayName={displayName}
          targetUser={viewUser}
          contextType="profile"
          onBlocked={() => setFriendOverride({ userId, state: "none" })}
        />
        {!isSelf ? (
          <GlassActionMenu
            open={open && moreOpen}
            anchorRef={moreRef}
            onClose={() => setMoreOpen(false)}
            sections={moreSections}
            ariaLabel={t("Profile options")}
            testId="profile-menu"
            zIndex={100066}
            variant="ios"
            // Mockup #29 (iPad): the menu hangs from the ⋯ button, 10px past its right edge.
            offset={layout === "form" ? MENU_FORM_OFFSET : undefined}
          />
        ) : null}
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
            {!isSelf && (
              <button
                ref={moreRef}
                type="button"
                className="user-profile-close user-profile-more"
                data-testid="profile-more"
                onClick={() => setMoreOpen((v) => !v)}
                aria-label={t("Profile options")}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal size={16} />
              </button>
            )}

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
                <div className="user-profile-safety-row" data-testid="profile-safety">
                  <button type="button" className="user-profile-report-btn is-danger" aria-pressed={blockedByMe} onClick={toggleBlock}>
                    <Ban size={13} />
                    <span>{blockedByMe ? t("Unblock user") : t("Block user")}</span>
                  </button>
                  <button
                    type="button"
                    className="user-profile-report-btn is-danger"
                    onClick={() => setReportFor(userId)}
                  >
                    <Flag size={13} />
                    <span>{t("Report user")}</span>
                  </button>
                  {blockError ? <p className="auth-field-hint" role="alert" style={{ color: "var(--danger)" }}>{blockError}</p> : null}
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
        onBlocked={() => setFriendOverride({ userId, state: "none" })}
      />
    </AnimatePresence>
      {!isSelf ? (
        <GlassActionMenu
          open={open && moreOpen}
          anchorRef={moreRef}
          onClose={() => setMoreOpen(false)}
          sections={moreSections}
          ariaLabel={t("Profile options")}
          testId="profile-menu"
          zIndex={10030}
        />
      ) : null}
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
