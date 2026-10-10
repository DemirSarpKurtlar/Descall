import { useState, useEffect, useLayoutEffect, useRef, useCallback, forwardRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Mic, Headphones, Bell, User, LogOut, Moon, Sun,
  ChevronRight, ChevronLeft, Palette, Volume2, Camera,
  Type, Upload, Check, MonitorSpeaker, AlertTriangle,
  Copy, Image as ImageIcon, RefreshCw, Globe, Shield,
  ShoppingBag, Mail, Monitor, CheckCircle2, UserX, Sparkles, KeyRound, Smile,
  Trash2, AtSign, Lock,
} from "lucide-react";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import { copyText } from "../../lib/copyText";
import { Avatar } from "../ui/Avatar";
import { ConversationListSkeleton } from "../ui/Skeleton";
import StatusBadge from "../ui/StatusBadge";
import ImageCropModal from "../ui/ImageCropModal";
import UsernameChangeModal from "../settings/UsernameChangeModal";
import { getToken, setUser } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { normalizeUser } from "../../lib/userProfile";
import { cssUrl } from "../../lib/cssUrl";
import { readFileAsDataUrl } from "../../lib/cropImage";
import { uploadAvatar, uploadFile } from "../../api/media";
import { getMe } from "../../api/auth";
import { useEdgeSwipeBack } from "../../hooks/useEdgeSwipeBack";
import {
  setEmail as apiSetEmail,
  resendEmailCode,
  verifyEmailCode,
  enable2fa,
  disable2fa,
  getSessions,
  revokeSession,
  revokeOtherSessions,
  requestPasswordResetCode,
  confirmPasswordResetCode,
} from "../../api/security";
import { getBlockedUsers } from "../../api/friends";
import { setUserBlocked } from "../../lib/blockedUsers";
import { setSoundEnabled, getAudioSettings } from "../../lib/audioManager";
import { useMobile } from "../../hooks/useMobile";
import { useGlassShell } from "./glass/GlassShell";
import { useLocale } from "../../context/LocaleContext";
import {
  getNativePushPermission,
  isNativeIosPush,
  requestNativePushPermission,
  syncNativePushToken,
} from "../../lib/nativePush";
import { detectDefaultLocale } from "../../i18n/detect";
import RiotLinkCard from "../settings/RiotLinkCard";
import DeleteAccountSection from "../settings/DeleteAccountSection";
import ValorantBadge from "../social/ValorantBadge";
import AdminBadge from "../social/AdminBadge";
import ShopPanel from "../settings/ShopPanel";
import { getShopCatalog, getShopInventory, equipShopItem } from "../../api/shop";
import { NameEffectText, BadgeIcon, TitleTag } from "../ui/Cosmetics";
import {
  isNoiseSuppressionEnabled,
  setNoiseSuppressionEnabled,
  getNoiseSuppressionEngine,
  preloadNoiseSuppression,
} from "../../lib/noiseSuppression";

/* ─── Helpers ─── */
const SETTINGS_KEY = "descall_user_settings";
const LEGACY_SETTINGS_KEY = "descall_settings";

const loadSettings = () => {
  try {
    const primary = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (Object.keys(primary).length) return primary;
    return JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveSettings = (obj) => {
  const json = JSON.stringify(obj);
  localStorage.setItem(SETTINGS_KEY, json);
  // Keep legacy key in sync for boot-theme + older readers
  localStorage.setItem(LEGACY_SETTINGS_KEY, json);
};

const ACCENT_SWATCHES = [
  { id: "blurple", hex: "#5865F2" },
  { id: "indigo", hex: "#4752C4" },
  { id: "green", hex: "#23A55A" },
  { id: "teal", hex: "#1ABC9C" },
  { id: "fuchsia", hex: "#EB459E" },
  { id: "gold", hex: "#F0B232" },
  { id: "red", hex: "#ED4245" },
];


const STATUS_EMOJIS = ["😀", "🎮", "💼", "🎵", "📚", "☕", "🍿", "💤"];

function splitStatusEmoji(value) {
  const raw = String(value || "");
  const emoji = STATUS_EMOJIS.find((e) => e && raw.startsWith(e)) || "";
  return { emoji, text: emoji ? raw.slice(emoji.length).replace(/^\s+/, "") : raw };
}

function hexToRgba(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(88, 101, 242, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A purchased premium theme fully re-tints `--primary` (and every other
// token) via its `[data-theme="…"]` CSS block. The custom "Accent Color"
// swatch picker used to set these same properties as an *inline* style on
// <html>, which — because inline styles always beat stylesheet rules,
// regardless of selector specificity — permanently pinned every theme's
// accent back to the default/custom color and made premium themes look
// broken. When a premium theme is equipped we now clear the inline accent
// overrides instead of (re)applying them, so the theme's own CSS wins.
export function applyAppearanceSettings({ accentColor, chatFontSize, uiDensity, bubbleStyle, premiumTheme } = {}) {
  const root = document.documentElement;
  const ACCENT_PROPS = ["--primary", "--primary-2", "--primary-soft", "--primary-glow", "--shadow-glow-primary", "--accent"];
  if (accentColor && !premiumTheme) {
    root.style.setProperty("--primary", accentColor);
    root.style.setProperty("--primary-2", accentColor);
    root.style.setProperty("--primary-soft", hexToRgba(accentColor, 0.12));
    root.style.setProperty("--primary-glow", hexToRgba(accentColor, 0.35));
    root.style.setProperty("--shadow-glow-primary", `0 0 16px ${hexToRgba(accentColor, 0.24)}`);
    root.style.setProperty("--accent", accentColor);
  } else {
    ACCENT_PROPS.forEach((prop) => root.style.removeProperty(prop));
  }
  if (chatFontSize) {
    root.style.setProperty("--chat-font-size", `${chatFontSize}px`);
  }
  if (uiDensity) {
    root.setAttribute("data-density", uiDensity);
  }
  if (bubbleStyle) {
    root.setAttribute("data-bubble", bubbleStyle);
  }
}

function Toggle({ value, onChange, label }) {
  return (
    <button
      className={`us-toggle ${value ? "active" : ""}`}
      onClick={() => onChange(!value)}
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
    >
      <span className="us-toggle-knob" />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="us-row">
      <div className="us-row-text">
        {Icon && (
          <span className="us-row-icon" aria-hidden>
            <Icon size={16} />
          </span>
        )}
        <div className="us-row-copy">
          <span className="us-row-title">{title}</span>
          {description && <span className="us-row-desc">{description}</span>}
        </div>
      </div>
      <div className="us-row-control">{children}</div>
    </div>
  );
}

const NAV_GROUPS_DEF = [
  {
    labelKey: "settings.account",
    items: [
      { id: "overview", labelKey: "settings.myAccount", icon: User, hintKey: "settings.accountHint" },
      { id: "profile", labelKey: "settings.profile", icon: Type, hintKey: "settings.profileHint" },
      { id: "security", labelKey: "settings.security", icon: Shield, hintKey: "settings.securityHint" },
    ],
  },
  {
    labelKey: "settings.app",
    items: [
      { id: "appearance", labelKey: "settings.appearance", icon: Palette, hintKey: "settings.appearanceHint" },
      { id: "notifications", labelKey: "settings.notifications", icon: Bell, hintKey: "settings.notificationsHint" },
      { id: "language", labelKey: "settings.language", icon: Globe, hintKey: "settings.languageHint" },
    ],
  },
  {
    labelKey: "settings.media",
    items: [
      { id: "voice", labelKey: "settings.voiceVideo", icon: Mic, hintKey: "settings.voiceHint" },
      { id: "sound", labelKey: "settings.soundEffects", icon: Volume2, hintKey: "settings.soundHint" },
    ],
  },
  {
    labelKey: "settings.personalization",
    items: [
      { id: "shop", labelKey: "settings.shop", icon: ShoppingBag, hintKey: "settings.shopHint" },
    ],
  },
];

const TAB_TITLE_KEYS = {
  overview: "settings.myAccount",
  profile: "settings.profile",
  security: "settings.security",
  appearance: "settings.appearance",
  notifications: "settings.notifications",
  language: "settings.language",
  voice: "settings.voiceVideo",
  sound: "settings.soundEffects",
  shop: "settings.shop",
};

/** What the settings sheet covers: the open list drawer on a root tab, else the main page. */
function settingsUnderlay() {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector(".app-root.mobile-drawer-open > .app-sidebar-shell") ||
    document.querySelector(".app-root > .app-main-slot")
  );
}

const UserPanel = forwardRef(function UserPanel({
  me,
  onClose,
  onLogout,
  onProfileUpdated,
  myStatus = "online",
  onStatusChange,
  initialTab = "overview",
  onTabChange,
  activity = {},
}, ref) {
  const { isMobile } = useMobile();
  const glassShell = useGlassShell();
  const { t, locale, setLocale, locales } = useLocale();
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileDetail, setMobileDetail] = useState(false);
  const stored = loadSettings();

  const navGroups = useMemo(
    () =>
      NAV_GROUPS_DEF.map((g) => ({
        label: t(g.labelKey),
        items: g.items.map((item) => ({
          ...item,
          label: t(item.labelKey),
          hint: t(item.hintKey),
        })),
      })),
    [t]
  );

  const tabTitles = useMemo(() => {
    const out = {};
    for (const [id, key] of Object.entries(TAB_TITLE_KEYS)) out[id] = t(key);
    return out;
  }, [t]);

  const deviceDefault = useMemo(() => detectDefaultLocale(), []);

  useEffect(() => {
    if (initialTab && TAB_TITLE_KEYS[initialTab]) setActiveTab(initialTab);
  }, [initialTab]);

  /* ── Profile editor ── */
  const [displayName, setDisplayName] = useState(me?.displayName || me?.username || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [customStatus, setCustomStatus] = useState(me?.customStatus || "");
  const [statusEmojiOpen, setStatusEmojiOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl || me?.avatar_url || "");
  const [bannerUrl, setBannerUrl] = useState(me?.bannerUrl || me?.banner_url || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState("");
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [usernameFlash, setUsernameFlash] = useState("");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  // Photo/banner saves update `me`; keep unsaved text drafts instead of resetting them.
  const keepDraftsRef = useRef(null);

  /* ── Security: email verification, 2FA, sessions, blocked users ── */
  const [emailDraft, setEmailDraft] = useState(me?.email || "");
  const [emailVerified, setEmailVerified] = useState(Boolean(me?.emailVerified));
  const [emailCode, setEmailCode] = useState("");
  const [emailStage, setEmailStage] = useState(me?.email && !me?.emailVerified ? "code" : "idle");
  const [emailNotice, setEmailNotice] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [twoFactorOn, setTwoFactorOn] = useState(Boolean(me?.twoFactorEnabled));
  const [disable2faPassword, setDisable2faPassword] = useState("");
  const [show2faPasswordPrompt, setShow2faPasswordPrompt] = useState(false);
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [pwStage, setPwStage] = useState("idle"); // idle | code | done
  const [pwCode, setPwCode] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState("");
  const [pwHint, setPwHint] = useState("");
  const [pwSupportEmail, setPwSupportEmail] = useState("support@descall.com");
  const [pwNoEmail, setPwNoEmail] = useState(false);

  useEffect(() => {
    setEmailDraft(me?.email || "");
    setEmailVerified(Boolean(me?.emailVerified));
    setTwoFactorOn(Boolean(me?.twoFactorEnabled));
  }, [me?.email, me?.emailVerified, me?.twoFactorEnabled]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { sessions: list } = await getSessions();
      setSessions(list || []);
    } catch {
      /* best-effort */
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadBlocked = useCallback(async () => {
    setBlockedLoading(true);
    try {
      const { blocked } = await getBlockedUsers();
      setBlockedUsers(blocked || []);
    } catch {
      /* best-effort */
    } finally {
      setBlockedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") {
      loadSessions();
      loadBlocked();
    }
  }, [activeTab, loadSessions, loadBlocked]);

  const refreshMeFromServer = useCallback(async () => {
    try {
      const token = getToken();
      const { user } = await getMe(token);
      const normalized = normalizeUser(user);
      setUser(normalized);
      onProfileUpdated?.(normalized);
      return normalized;
    } catch {
      return null;
    }
  }, [onProfileUpdated]);

  const handleSendEmailCode = async () => {
    setEmailBusy(true);
    setEmailNotice("");
    try {
      await apiSetEmail(emailDraft.trim());
      setEmailStage("code");
      setEmailNotice(t("Verification code sent. Check your inbox."));
    } catch (err) {
      setEmailNotice(err.message || t("Failed to send verification code."));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleResendEmailCode = async () => {
    setEmailBusy(true);
    setEmailNotice("");
    try {
      await resendEmailCode();
      setEmailNotice(t("Verification code sent. Check your inbox."));
    } catch (err) {
      setEmailNotice(err.message || t("Failed to resend code."));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    setEmailBusy(true);
    setEmailNotice("");
    try {
      await verifyEmailCode(emailCode.trim());
      setEmailVerified(true);
      setEmailStage("idle");
      setEmailCode("");
      setEmailNotice(t("Email verified!"));
      await refreshMeFromServer();
    } catch (err) {
      setEmailNotice(err.message || t("Incorrect code."));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    setPwBusy(true);
    setPwNotice("");
    setPwNoEmail(false);
    try {
      const data = await requestPasswordResetCode();
      if (data?.status === "no_email") {
        setPwSupportEmail(data.supportEmail || "support@descall.com");
        setPwNoEmail(true);
        setPwNotice(
          data.message ||
            t("This account has no email on file. Contact support@descall.com to recover access.")
        );
        return;
      }
      setPwHint(data?.emailHint || "");
      setPwStage("code");
      setPwNotice(data?.message || t("We sent a 6-digit code to your email."));
    } catch (err) {
      const body = err?.body || {};
      if (body.status === "no_email") {
        setPwSupportEmail(body.supportEmail || "support@descall.com");
        setPwNoEmail(true);
        setPwNotice(body.message || err.message);
        return;
      }
      setPwNotice(err.message || t("Could not send reset code."));
    } finally {
      setPwBusy(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (pwNew !== pwConfirm) {
      setPwNotice(t("Passwords do not match."));
      return;
    }
    if (pwNew.length < 6) {
      setPwNotice(t("Password must be at least 6 characters."));
      return;
    }
    setPwBusy(true);
    setPwNotice("");
    try {
      await confirmPasswordResetCode(pwCode.trim(), pwNew);
      setPwStage("done");
      setPwCode("");
      setPwNew("");
      setPwConfirm("");
      setPwNotice(t("Password updated successfully."));
    } catch (err) {
      setPwNotice(err.message || t("Could not reset password."));
    } finally {
      setPwBusy(false);
    }
  };

  const handleToggle2fa = async (checked) => {
    if (checked) {
      setTwoFaBusy(true);
      try {
        await enable2fa();
        setTwoFactorOn(true);
        await refreshMeFromServer();
      } catch (err) {
        setEmailNotice(err.message || t("Failed to enable two-factor authentication."));
      } finally {
        setTwoFaBusy(false);
      }
    } else {
      setShow2faPasswordPrompt(true);
    }
  };

  const confirmDisable2fa = async () => {
    setTwoFaBusy(true);
    try {
      await disable2fa(disable2faPassword);
      setTwoFactorOn(false);
      setShow2faPasswordPrompt(false);
      setDisable2faPassword("");
      await refreshMeFromServer();
    } catch (err) {
      setSessionNotice(err.message || t("Incorrect password."));
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setSessionNotice(err.message || t("Failed to end session."));
    }
  };

  const handleRevokeOthers = async () => {
    try {
      const { sessions: list } = await revokeOtherSessions();
      setSessions(list || []);
      setSessionNotice(t("All other sessions were signed out."));
    } catch (err) {
      setSessionNotice(err.message || t("Failed to end other sessions."));
    }
  };

  const handleUnblock = async (userId) => {
    try {
      await setUserBlocked(userId, false);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      /* best-effort */
    }
  };

  /* ── Shop: equipped cosmetics ── */
  const equipped = useMemo(
    () => ({
      bannerId: me?.equippedBanner?.id || null,
      avatarFrameId: me?.equippedAvatarFrame?.id || null,
      backgroundId: me?.equippedBackground?.id || null,
      themeId: me?.equippedTheme?.id || null,
      badgeId: me?.equippedBadge?.id || null,
      titleId: me?.equippedTitle?.id || null,
      nameEffectId: me?.equippedNameEffect?.id || null,
      avatarEffectId: me?.equippedAvatarEffect?.id || null,
      chatBubbleId: me?.equippedChatBubble?.id || null,
      presenceFlareId: me?.equippedPresenceFlare?.id || null,
      profileAuraId: me?.equippedProfileAura?.id || null,
      soundPackId: me?.equippedSoundPack?.id || null,
      typingFlareId: me?.equippedTypingFlare?.id || null,
      reactionBurstId: me?.equippedReactionBurst?.id || null,
      callOverlayId: me?.equippedCallOverlay?.id || null,
    }),
    [
      me?.equippedBanner?.id,
      me?.equippedAvatarFrame?.id,
      me?.equippedBackground?.id,
      me?.equippedTheme?.id,
      me?.equippedBadge?.id,
      me?.equippedTitle?.id,
      me?.equippedNameEffect?.id,
      me?.equippedAvatarEffect?.id,
      me?.equippedChatBubble?.id,
      me?.equippedPresenceFlare?.id,
      me?.equippedProfileAura?.id,
      me?.equippedSoundPack?.id,
      me?.equippedTypingFlare?.id,
      me?.equippedReactionBurst?.id,
      me?.equippedCallOverlay?.id,
    ]
  );

  /* ── Appearance ── */
  const [darkMode, setDarkMode] = useState(stored.darkMode !== false);
  const [accentColor, setAccentColor] = useState(stored.accentColor || "#5865F2");
  const [chatFontSize, setChatFontSize] = useState(stored.chatFontSize || 14);
  const [uiDensity, setUiDensity] = useState(stored.uiDensity || "comfortable");
  const [bubbleStyle, setBubbleStyle] = useState(stored.bubbleStyle || "modern");
  const [ownedThemes, setOwnedThemes] = useState([]);

  const loadOwnedThemes = useCallback(async () => {
    try {
      const [{ items }, { inventory }] = await Promise.all([getShopCatalog(), getShopInventory()]);
      const ownedIds = new Set((inventory || []).map((i) => i.itemId));
      setOwnedThemes((items || []).filter((i) => i.category === "theme" && ownedIds.has(i.id)));
    } catch {
      /* best-effort — Appearance tab still works with Dark/Light only */
    }
  }, []);

  useEffect(() => {
    loadOwnedThemes();
  }, [loadOwnedThemes]);

  // A theme bought in the Shop tab must show up here without requiring a
  // full settings reopen — refresh the owned list whenever this tab is
  // opened, not just once on the panel's very first mount.
  useEffect(() => {
    if (activeTab === "appearance") loadOwnedThemes();
  }, [activeTab, loadOwnedThemes]);

  const handleEquippedChange = useCallback(() => {
    // Re-fetch /auth/me so the resolved item (name, asset_url) is available
    // app-wide immediately — nav rail, message avatars, profile modal, etc.
    // Also refresh the Appearance tab's owned-themes list, since a Shop-tab
    // purchase/equip must show up there without needing a full reopen.
    // Callers await this so their "busy" state (and any imperative
    // data-theme write) can't finish before the fresh equip data lands.
    return Promise.all([refreshMeFromServer(), loadOwnedThemes()]);
  }, [refreshMeFromServer, loadOwnedThemes]);

  // A purchased premium theme always wins over the plain Dark/Light choice —
  // picking Dark or Light explicitly clears it (see handlePickBaseTheme).
  const equippedThemeKey = me?.equippedTheme?.theme_key || null;

  const applyThemeWithCrossfade = useCallback((nextTheme) => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    if (prev !== nextTheme) {
      root.classList.add("theme-crossfade");
      root.setAttribute("data-theme", nextTheme);
      window.setTimeout(() => root.classList.remove("theme-crossfade"), 320);
    } else {
      root.setAttribute("data-theme", nextTheme);
    }
  }, []);

  useEffect(() => {
    applyThemeWithCrossfade(equippedThemeKey || (darkMode ? "dark" : "light"));
  }, [darkMode, equippedThemeKey, applyThemeWithCrossfade]);

  const handlePickBaseTheme = useCallback(
    async (wantDark) => {
      setDarkMode(wantDark);
      if (equippedThemeKey) {
        try {
          await equipShopItem("theme", null);
          await refreshMeFromServer();
        } catch {
          /* best-effort */
        }
      }
    },
    [equippedThemeKey, refreshMeFromServer]
  );

  const handlePickPremiumTheme = useCallback(
    async (themeItem) => {
      try {
        await equipShopItem("theme", themeItem.id);
        applyThemeWithCrossfade(themeItem.theme_key);
        await refreshMeFromServer();
      } catch {
        /* best-effort */
      }
    },
    [refreshMeFromServer, applyThemeWithCrossfade]
  );

  useEffect(() => {
    applyAppearanceSettings({ accentColor, chatFontSize, uiDensity, bubbleStyle, premiumTheme: !!equippedThemeKey });
  }, [accentColor, chatFontSize, uiDensity, bubbleStyle, equippedThemeKey]);

  /* ── Notifications ── */
  const [msgNotifications, setMsgNotifications] = useState(stored.msgNotifications !== false);
  const [callNotifications, setCallNotifications] = useState(stored.callNotifications !== false);

  /* ── iPhone push permission (native iOS app only) ── */
  const iosPush = isNativeIosPush();
  const [iosPushPermission, setIosPushPermission] = useState(null);
  useEffect(() => {
    if (!iosPush || activeTab !== "notifications") return undefined;
    let cancelled = false;
    getNativePushPermission().then((p) => {
      if (!cancelled) setIosPushPermission(p);
    });
    return () => {
      cancelled = true;
    };
  }, [iosPush, activeTab]);
  const handleIosPushAllow = async () => {
    const p = await requestNativePushPermission().catch(() => null);
    if (p) setIosPushPermission(p);
    if (p === "granted") syncNativePushToken().catch(() => {});
  };

  /* ── Sound ── */
  const audioDefaults = getAudioSettings?.() || {};
  const [msgSounds, setMsgSounds] = useState(
    stored.msgSounds !== undefined ? stored.msgSounds !== false : audioDefaults.message !== false
  );
  const [callSounds, setCallSounds] = useState(
    stored.callSounds !== undefined ? stored.callSounds !== false : audioDefaults.incomingCall !== false
  );

  /* ── Voice & Video ── */
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedAudioIn, setSelectedAudioIn] = useState(stored.selectedAudioIn || "");
  const [selectedAudioOut, setSelectedAudioOut] = useState(stored.selectedAudioOut || "");
  const [selectedVideoIn, setSelectedVideoIn] = useState(stored.selectedVideoIn || "");
  const [noiseSuppressionOn, setNoiseSuppressionOn] = useState(() => isNoiseSuppressionEnabled());
  const [noiseEngine, setNoiseEngine] = useState(() => getNoiseSuppressionEngine());
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [micTesting, setMicTesting] = useState(false);
  const micAnalyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const micRafRef = useRef(null);

  useEffect(() => {
    saveSettings({
      darkMode,
      accentColor,
      chatFontSize,
      uiDensity,
      bubbleStyle,
      premiumThemeKey: equippedThemeKey,
      msgNotifications,
      callNotifications,
      msgSounds,
      callSounds,
      selectedAudioIn,
      selectedAudioOut,
      selectedVideoIn,
      language: locale,
    });
  }, [
    darkMode,
    accentColor,
    chatFontSize,
    uiDensity,
    bubbleStyle,
    equippedThemeKey,
    msgNotifications,
    callNotifications,
    msgSounds,
    callSounds,
    selectedAudioIn,
    selectedAudioOut,
    selectedVideoIn,
    locale,
  ]);

  // iOS: "Message notifications" off removes this iPhone's push token; on
  // registers it again (runs after the settings above are saved).
  const msgNotifFirstRun = useRef(true);
  useEffect(() => {
    if (msgNotifFirstRun.current) {
      msgNotifFirstRun.current = false;
      return;
    }
    if (iosPush) syncNativePushToken().catch(() => {});
  }, [msgNotifications, iosPush]);

  const handleMsgSounds = (v) => {
    setMsgSounds(v);
    try {
      setSoundEnabled("message", v);
      setSoundEnabled("notification", v);
    } catch { /* audio not ready */ }
  };

  const handleCallSounds = (v) => {
    setCallSounds(v);
    try {
      setSoundEnabled("incomingCall", v);
      setSoundEnabled("outgoingCall", v);
      setSoundEnabled("callStart", v);
      setSoundEnabled("callAccept", v);
      setSoundEnabled("callReject", v);
    } catch { /* audio not ready */ }
  };

  const refreshDevices = useCallback(async () => {
    try {
      // Unlock device labels when possible; ignore if no mic/camera is available.
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          /* permission denied or no input device — still enumerate */
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput"));
    } catch (err) {
      console.warn("Device enumeration failed:", err?.message || err);
    }
  }, []);

  const startMicTest = useCallback(async () => {
    if (micStreamRef.current) return;
    try {
      const { acquireVoiceMicStream } = await import("../../lib/noiseSuppression");
      const stream = await acquireVoiceMicStream({
        audio: { deviceId: selectedAudioIn ? { exact: selectedAudioIn } : undefined },
        video: false,
      });
      micStreamRef.current = stream;
      setMicTesting(true);
      setNoiseEngine(getNoiseSuppressionEngine());
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      micAnalyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicTestLevel(avg);
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicTesting(false);
    }
  }, [selectedAudioIn]);

  const stopMicTest = useCallback(() => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    setMicTestLevel(0);
    setMicTesting(false);
    import("../../lib/noiseSuppression")
      .then(({ disposeNoiseSuppressionSession }) => {
        disposeNoiseSuppressionSession({ stopRaw: true });
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => stopMicTest(), [stopMicTest]);

  /* Only probe media devices when the Voice tab is open */
  useEffect(() => {
    if (activeTab !== "voice") {
      stopMicTest();
      return undefined;
    }
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [activeTab, refreshDevices, stopMicTest]);

  useEffect(() => {
    if (!me) return;
    const keep = keepDraftsRef.current;
    keepDraftsRef.current = null;
    setDisplayName(keep ? keep.displayName : me.displayName || me.display_name || me.username || "");
    setBio(keep ? keep.bio : me.bio || "");
    setCustomStatus(keep ? keep.customStatus : me.customStatus || me.custom_status || "");
    setAvatarUrl(me.avatarUrl || me.avatar_url || "");
    setBannerUrl(me.bannerUrl || me.banner_url || "");
  }, [me?.id, me?.avatarUrl, me?.avatar_url, me?.displayName, me?.display_name, me?.updated_at]);

  // An equipped shop banner always takes precedence over a manually-set URL —
  // matches how the rest of the app (UserProfileModal, message list) renders it.
  const effectiveBannerUrl = me?.equippedBanner?.asset_url || bannerUrl;

  const applyProfileLocally = (user) => {
    const normalized = normalizeUser(user);
    if (!normalized) return;
    setUser(normalized);
    onProfileUpdated?.(normalized);
    return normalized;
  };

  // The "admin" account's name is tied to admin access on the server, so it can't be renamed.
  const usernameLocked = String(me?.username || "").trim().toLowerCase() === "admin";

  const handleUsernameChanged = (user) => {
    keepTextDrafts();
    const normalized = applyProfileLocally(user);
    setUsernameModalOpen(false);
    setUsernameFlash(normalized?.username ? `@${normalized.username}` : "");
    setTimeout(() => setUsernameFlash(""), 4000);
  };

  const renderUsernameAction = () =>
    usernameLocked ? (
      <span className="us-username-locked" title={t("This account's username is tied to admin access and can't be changed.")}>
        <Lock size={12} aria-hidden />
        {t("Locked")}
      </span>
    ) : (
      <button type="button" className="us-username-change" onClick={() => setUsernameModalOpen(true)}>
        <AtSign size={13} aria-hidden />
        {t("Change")}
      </button>
    );

  const keepTextDrafts = () => {
    keepDraftsRef.current = { displayName, bio, customStatus };
  };

  /** Save only photo/banner changes on top of the SAVED profile (never unsaved text drafts). */
  const persistProfilePatch = async (patch) => {
    const token = getToken();
    const body = {
      displayName: me?.displayName || me?.display_name || null,
      bio: me?.bio || "",
      customStatus: me?.customStatus || me?.custom_status || "",
      avatarUrl: me?.avatarUrl || me?.avatar_url || "",
      bannerUrl: me?.bannerUrl || me?.banner_url || "",
      ...patch,
    };
    const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("Failed to save profile"));
    keepTextDrafts();
    applyProfileLocally(
      data.user || {
        ...me,
        avatarUrl: body.avatarUrl,
        avatar_url: body.avatarUrl,
        bannerUrl: body.bannerUrl,
        banner_url: body.bannerUrl,
        updated_at: new Date().toISOString(),
      }
    );
  };

  const flashProfileError = (msg) => {
    setProfileError(msg);
    setTimeout(() => setProfileError(""), 3500);
  };

  const handleRemoveAvatar = async () => {
    if (avatarUploading) return;
    setAvatarUploading(true);
    setProfileError("");
    try {
      await persistProfilePatch({ avatarUrl: "" });
      setAvatarUrl("");
    } catch (err) {
      flashProfileError(err?.message || t("Failed to save profile"));
    } finally {
      setAvatarUploading(false);
    }
  };

  const persistBannerFile = async (file) => {
    setBannerUploading(true);
    setProfileError("");
    try {
      const uploaded = await uploadFile(file);
      const url = uploaded?.url || uploaded?.mediaUrl || null;
      if (!url) throw new Error(t("Upload failed"));
      await persistProfilePatch({ bannerUrl: url });
      setBannerUrl(url);
    } catch (err) {
      flashProfileError(err?.message || t("Network error during upload"));
    } finally {
      setBannerUploading(false);
      setBannerCropSrc("");
    }
  };

  const handleBannerPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      flashProfileError(t("Please choose a JPG, PNG, WebP, or GIF image."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      flashProfileError(t("Image must be 8 MB or smaller."));
      return;
    }
    setProfileError("");
    if (file.type === "image/gif") {
      await persistBannerFile(file);
      return;
    }
    try {
      setBannerCropSrc(await readFileAsDataUrl(file));
    } catch {
      flashProfileError(t("Failed to read image."));
    }
  };

  const handleRemoveBanner = async () => {
    if (bannerUploading) return;
    setBannerUploading(true);
    setProfileError("");
    try {
      await persistProfilePatch({ bannerUrl: "" });
      setBannerUrl("");
    } catch (err) {
      flashProfileError(err?.message || t("Failed to save profile"));
    } finally {
      setBannerUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError("");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName: (displayName || "").trim() || null,
          bio,
          customStatus,
          avatarUrl,
          bannerUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const savedName = (displayName || "").trim() || null;
        const updated = applyProfileLocally(
          data.user || {
            ...me,
            displayName: savedName,
            display_name: savedName,
            bio,
            customStatus,
            avatarUrl,
            bannerUrl,
            updated_at: new Date().toISOString(),
          }
        );
        if (updated?.avatarUrl) setAvatarUrl(updated.avatarUrl);
        if (updated) {
          setDisplayName(updated.displayName || updated.username || "");
        }
        setProfileSaved(true);
        hapticSuccess();
        setTimeout(() => setProfileSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        hapticError();
        setProfileError(data.error || t("Failed to save profile"));
        setTimeout(() => setProfileError(""), 3000);
      }
    } catch {
      hapticError();
      setProfileError(t("Network error while saving profile"));
      setTimeout(() => setProfileError(""), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelProfile = () => {
    if (!me) return;
    setDisplayName(me.displayName || me.display_name || me.username || "");
    setBio(me.bio || "");
    setCustomStatus(me.customStatus || me.custom_status || "");
    setAvatarUrl(me.avatarUrl || me.avatar_url || "");
    setBannerUrl(me.bannerUrl || me.banner_url || "");
    setStatusEmojiOpen(false);
    setProfileError("");
  };

  const persistAvatarFile = async (file) => {
    setAvatarUploading(true);
    setProfileError("");
    try {
      const data = await uploadAvatar(file);
      if (data.avatarUrl) {
        setAvatarUrl(data.avatarUrl);
        keepTextDrafts();
        if (data.user) applyProfileLocally(data.user);
        else {
          applyProfileLocally({
            ...me,
            avatarUrl: data.avatarUrl,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        setProfileError(data.error || t("Upload failed"));
        setTimeout(() => setProfileError(""), 3000);
      }
    } catch (err) {
      setProfileError(err?.message || t("Network error during upload"));
      setTimeout(() => setProfileError(""), 3000);
    } finally {
      setAvatarUploading(false);
      setAvatarCropSrc("");
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setProfileError(t("Avatar must be JPG, PNG, WebP, or GIF."));
      setTimeout(() => setProfileError(""), 3000);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileError(t("Avatar must be 8 MB or smaller."));
      setTimeout(() => setProfileError(""), 3000);
      return;
    }
    setProfileError("");
    // Animated GIFs keep animation — skip crop. Still images open crop/zoom.
    if (file.type === "image/gif") {
      await persistAvatarFile(file);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarCropSrc(dataUrl);
    } catch {
      setProfileError(t("Failed to read image."));
      setTimeout(() => setProfileError(""), 3000);
    }
  };

  const handleLogoutClick = () => {
    // Native window.confirm was unreliable under the full-screen settings overlay
    // (and blocked UIBot/automation), so logout immediately end-to-end.
    onLogout?.();
  };

  const copyUserId = async () => {
    if (!me?.id) return;
    try {
      await copyText(String(me.id));
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1600);
    } catch { /* ignore */ }
  };

  const openTab = (id) => {
    setActiveTab(id);
    onTabChange?.(id);
    if (isMobile) setMobileDetail(true);
  };

  const backToMenu = () => setMobileDetail(false);

  const showMenu = !isMobile || !mobileDetail;
  const showDetail = !isMobile || mobileDetail;
  const glassProfileEdit = Boolean(glassShell && isMobile && activeTab === "profile" && mobileDetail);

  /* ─── Tab content ─── */
  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="us-tab">
            <div className="us-hero">
            <div
              className="us-hero-banner"
              style={
                effectiveBannerUrl
                  ? { backgroundImage: cssUrl(effectiveBannerUrl) }
                  : undefined
              }
            />
              <div className="us-hero-body">
                {/* Same avatar picker as the Profile tab: tap the photo → file picker →
                    crop/zoom (GIFs keep animation) → saved immediately. */}
                <button
                  type="button"
                  className="us-hero-avatar us-hero-avatar-btn"
                  onClick={() => !avatarUploading && fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label={t("Change avatar")}
                  title={t("Change avatar")}
                >
                  <Avatar
                    name={me?.username || "User"}
                    size={84}
                    user={{ ...me, avatarUrl: avatarUrl || me?.avatarUrl }}
                    animate="always"
                  />
                  <span className="us-avatar-overlay" aria-hidden="true">
                    {avatarUploading ? <RefreshCw size={20} className="us-spin" /> : <Camera size={20} />}
                  </span>
                  <span className="us-hero-camera" aria-hidden="true">
                    {avatarUploading ? <RefreshCw size={13} className="us-spin" /> : <Camera size={13} />}
                  </span>
                  <StatusBadge
                    status={myStatus === "invisible" ? "offline" : myStatus}
                  />
                </button>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  ref={fileInputRef}
                  className="us-hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  className="us-btn us-hero-edit"
                  onClick={() => openTab("profile")}
                >
                  <Type size={14} />
                  {t("Edit profile")}
                </button>
                <div className="us-hero-meta">
                  <h3 style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: "4px 6px" }}>
                    <NameEffectText user={me}>{displayName || me?.username || "User"}</NameEffectText>
                    <BadgeIcon user={me} />
                  </h3>
                  <span className="us-muted">@{me?.username?.toLowerCase() || "user"}</span>
                  <div className="user-profile-badges">
                    <TitleTag user={me} />
                    <AdminBadge user={me} variant="chip" />
                  </div>
                  {customStatus && <span className="us-status-pill">{customStatus}</span>}
                  {me?.valorant?.linked && (
                    <ValorantBadge valorant={me.valorant} compact />
                  )}
                </div>
              </div>
            </div>

            {profileError && (
              <div className="us-alert danger">
                <AlertTriangle size={15} />
                <span>{profileError}</span>
              </div>
            )}

            <RiotLinkCard />

            <section className="us-section">
              <h4 className="us-section-label">{t("Account details")}</h4>
              <div className="us-card">
                <div className="us-info-row">
                  <span className="us-muted">{t("Username")}</span>
                  <span className="us-username-value">
                    {usernameFlash ? (
                      <span className="us-username-flash">{t("Updated")}</span>
                    ) : null}
                    <span className="us-info-value">@{me?.username || "user"}</span>
                    {renderUsernameAction()}
                  </span>
                </div>
                <div className="us-info-row">
                  <span className="us-muted">{t("Email")}</span>
                  <span className="us-info-value">{me?.email || t("Not set")}</span>
                </div>
                <div className="us-info-row">
                  <span className="us-muted">{t("User ID")}</span>
                  <button type="button" className="us-copy-btn" onClick={copyUserId} title={t("Copy ID")} aria-label={t("Copy ID")}>
                    <span className="us-info-value mono">{me?.id || "—"}</span>
                    {copiedId ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="us-info-row">
                  <span className="us-muted">{t("Status")}</span>
                  <span className="us-online-dot">{t("Online")}</span>
                </div>
              </div>
            </section>

            {isMobile && (
              <section className="us-section">
                <button type="button" className="us-danger-btn" onClick={handleLogoutClick}>
                  <LogOut size={16} />
                  {t("Log Out")}
                </button>
              </section>
            )}
          </div>
        );

      case "profile": {
        const savedDisplayName = me?.displayName || me?.display_name || me?.username || "";
        const profileDirty =
          (displayName || "") !== savedDisplayName ||
          (bio || "") !== (me?.bio || "") ||
          (customStatus || "") !== (me?.customStatus || me?.custom_status || "");
        const shopBanner = Boolean(me?.equippedBanner?.asset_url);
        const hasOwnAvatar = Boolean(avatarUrl || me?.avatarUrl || me?.avatar_url);
        return (
          <div className="us-tab us-profile-tab">
            <p className="us-lead">{t("Update how others see you across Descall.")}</p>

            {/* Live profile card — tap the banner or the photo to change them.
                Photo & banner save immediately (same crop flow as Hesabım). */}
            <div className="us-pe-card">
              {glassShell && isMobile && (
                <h4 className="us-section-label g-pe-banner-kicker">{t("Banner")}</h4>
              )}
              <div
                className={`us-pe-banner${effectiveBannerUrl ? " has-image" : ""}`}
                style={effectiveBannerUrl ? { backgroundImage: cssUrl(effectiveBannerUrl) } : undefined}
              >
                <button
                  type="button"
                  className="us-pe-banner-hit"
                  onClick={() => !bannerUploading && !shopBanner && bannerInputRef.current?.click()}
                  disabled={bannerUploading || shopBanner}
                  aria-label={effectiveBannerUrl ? t("Change banner") : t("Add banner")}
                >
                  {glassShell && isMobile ? (
                    <span className="g-pe-banner-label">
                      {bannerUploading ? <RefreshCw size={15} className="us-spin" /> : <ImageIcon size={16} />}
                      {t("Change banner")}
                    </span>
                  ) : !effectiveBannerUrl ? (
                    <span className="us-pe-banner-empty">
                      {bannerUploading ? <RefreshCw size={15} className="us-spin" /> : <ImageIcon size={16} />}
                      {t("Add banner")}
                    </span>
                  ) : null}
                </button>
                {!shopBanner && effectiveBannerUrl && (
                  <div className="us-pe-banner-actions">
                    {bannerUrl && (
                      <button
                        type="button"
                        className="us-pe-chip icon"
                        onClick={handleRemoveBanner}
                        disabled={bannerUploading}
                        aria-label={t("Remove banner")}
                        title={t("Remove banner")}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="us-pe-chip"
                      onClick={() => !bannerUploading && bannerInputRef.current?.click()}
                      disabled={bannerUploading}
                    >
                      {bannerUploading ? <RefreshCw size={13} className="us-spin" /> : <Camera size={13} />}
                      <span>{t("Change banner")}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="us-pe-body">
                <button
                  type="button"
                  className="us-pe-avatar"
                  onClick={() => !avatarUploading && fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label={t("Change avatar")}
                  title={t("Change avatar")}
                >
                  <Avatar
                    name={me?.username || "User"}
                    size={88}
                    user={{ ...me, avatarUrl: avatarUrl || me?.avatarUrl }}
                    animate="always"
                  />
                  <span className="us-avatar-overlay" aria-hidden="true">
                    {avatarUploading ? <RefreshCw size={20} className="us-spin" /> : <Camera size={20} />}
                  </span>
                  <span className="us-pe-avatar-cam" aria-hidden="true">
                    {avatarUploading ? <RefreshCw size={13} className="us-spin" /> : <Camera size={13} />}
                  </span>
                </button>
                {glassShell && isMobile && (
                  <button
                    type="button"
                    className="g-pe-avatar-link"
                    onClick={() => !avatarUploading && fileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {t("Change avatar")}
                  </button>
                )}

                <div className="us-pe-meta">
                  <h3>
                    <NameEffectText user={me}>{(displayName || "").trim() || me?.username || "User"}</NameEffectText>
                    <BadgeIcon user={me} />
                  </h3>
                  <span className="us-username-value">
                    <span className="us-muted">@{me?.username?.toLowerCase() || "user"}</span>
                    {renderUsernameAction()}
                  </span>
                  {customStatus.trim() && <span className="us-status-pill">{customStatus}</span>}
                </div>

                {bio.trim() && (
                  <div className="us-pe-about">
                    <span>{t("About me")}</span>
                    <p>{bio}</p>
                  </div>
                )}

                <div className="us-pe-photo-row">
                  <button
                    type="button"
                    className="us-btn primary"
                    onClick={() => !avatarUploading && fileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    <Upload size={14} />
                    {avatarUploading ? t("Uploading…") : hasOwnAvatar ? t("Change photo") : t("Upload photo")}
                  </button>
                  {hasOwnAvatar && (
                    <button
                      type="button"
                      className="us-btn ghost"
                      onClick={handleRemoveAvatar}
                      disabled={avatarUploading}
                    >
                      <Trash2 size={14} /> {t("Remove photo")}
                    </button>
                  )}
                </div>
                <span className="us-hint">
                  {shopBanner
                    ? t("Your shop banner is equipped. Unequip it in the Shop to use your own.")
                    : t("JPG, PNG, WebP or GIF, up to 8 MB. GIFs stay animated.")}
                </span>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={fileInputRef}
                className="us-hidden"
                onChange={handleAvatarUpload}
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={bannerInputRef}
                className="us-hidden"
                onChange={handleBannerPick}
              />
            </div>

            {profileError && (
              <div className="us-alert danger">
                <AlertTriangle size={15} />
                <span>{profileError}</span>
              </div>
            )}

            {glassShell && isMobile && (
              <>
                <section className="us-section g-pe-glass" style={{ order: 2 }}>
                  <h4 className="us-section-label">{t("Identity")}</h4>
                  <div className="us-card us-form">
                    <label className="us-field">
                      <span>{t("Display name")}</span>
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={t("Your display name")}
                        maxLength={32}
                      />
                    </label>
                    <div className="us-field">
                      <span>{t("Username")}</span>
                      <em className="g-pe-readonly">@{me?.username || "user"}</em>
                    </div>
                  </div>
                </section>
                <section className="us-section g-pe-glass" style={{ order: 4 }}>
                  <h4 className="us-section-label">{t("About me")}</h4>
                  <label className="g-pe-bio">
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t("Tell others about yourself…")}
                      rows={3}
                      maxLength={190}
                    />
                  </label>
                </section>
                <section className="us-section g-pe-glass" style={{ order: 5 }}>
                  <h4 className="us-section-label">{t("Custom status")}</h4>
                  <div className="us-card us-form">
                    <div className="us-field">
                      <div className="us-status-edit-row">
                        <button
                          type="button"
                          className="us-status-emoji-btn"
                          onClick={() => setStatusEmojiOpen((v) => !v)}
                          aria-label={t("Status Emoji")}
                          aria-expanded={statusEmojiOpen}
                        >
                          {splitStatusEmoji(customStatus).emoji || <Smile size={18} />}
                        </button>
                        <input
                          value={splitStatusEmoji(customStatus).text}
                          onChange={(e) => {
                            const { emoji } = splitStatusEmoji(customStatus);
                            const next = e.target.value;
                            setCustomStatus(emoji ? `${emoji} ${next}`.trim() : next);
                          }}
                          placeholder={t("What's on your mind?")}
                          maxLength={60}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            <section className={`us-section${glassShell && isMobile ? " g-pe-classic" : ""}`}>
              <h4 className="us-section-label">{t("Identity")}</h4>
              <div className="us-card us-form">
                <label className="us-field">
                  <span><Type size={13} /> {t("Display name")}</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("Your display name")}
                    maxLength={32}
                  />
                </label>
                <label className="us-field">
                  <span><User size={13} /> {t("Bio")}</span>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("Tell others about yourself…")}
                    rows={3}
                    maxLength={190}
                  />
                  <em className="us-char">{bio.length}/190</em>
                </label>
                <div className="us-field">
                  <span><MonitorSpeaker size={13} /> {t("Custom status")}</span>
                  <div className="us-status-edit-row">
                    <button
                      type="button"
                      className="us-status-emoji-btn"
                      onClick={() => setStatusEmojiOpen((v) => !v)}
                      aria-label={t("Status Emoji")}
                      aria-expanded={statusEmojiOpen}
                    >
                      {splitStatusEmoji(customStatus).emoji || <Smile size={18} />}
                    </button>
                    <input
                      value={splitStatusEmoji(customStatus).text}
                      onChange={(e) => {
                        const { emoji } = splitStatusEmoji(customStatus);
                        const next = e.target.value;
                        setCustomStatus(emoji ? `${emoji} ${next}`.trim() : next);
                      }}
                      placeholder={t("What's on your mind?")}
                      maxLength={60}
                    />
                  </div>
                  {statusEmojiOpen && (
                    <div className="us-status-emoji-grid" role="listbox" aria-label={t("Status Emoji")}>
                      <button
                        type="button"
                        className={`us-status-emoji-choice ${!splitStatusEmoji(customStatus).emoji ? "active" : ""}`}
                        onClick={() => {
                          setCustomStatus(splitStatusEmoji(customStatus).text);
                          setStatusEmojiOpen(false);
                        }}
                       aria-label="None">
                        –
                      </button>
                      {STATUS_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`us-status-emoji-choice ${splitStatusEmoji(customStatus).emoji === emoji ? "active" : ""}`}
                          onClick={() => {
                            const { text } = splitStatusEmoji(customStatus);
                            setCustomStatus(`${emoji} ${text}`.trim());
                            setStatusEmojiOpen(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className={`us-pe-savebar${profileDirty ? " dirty" : ""}`}>
              <span className="us-pe-savebar-text">
                {profileSaved
                  ? t("Saved")
                  : profileDirty
                    ? t("You have unsaved changes")
                    : t("All changes saved")}
              </span>
              <div className="us-btn-row">
                {profileDirty && (
                  <button
                    type="button"
                    className="us-btn ghost"
                    onClick={handleCancelProfile}
                    disabled={savingProfile}
                  >
                    {t("Cancel")}
                  </button>
                )}
                <button
                  type="button"
                  className={`us-btn primary ${profileSaved ? "success" : ""}`}
                  onClick={handleSaveProfile}
                  disabled={savingProfile || (!profileDirty && !profileSaved)}
                >
                  <Check size={16} />
                  {profileSaved ? t("Saved") : savingProfile ? t("Saving…") : t("Save")}
                </button>
              </div>
            </div>
          </div>
        );
      }

      case "security":
        return (
          <div className="us-tab">
            <p className="us-lead">{t("Protect your account with email verification, password reset, and two-factor sign-in.")}</p>

            <section className="us-section">
              <h4 className="us-section-label">{t("Email address")}</h4>
              <div className="us-card us-form">
                <SettingRow
                  icon={Mail}
                  title={t("Email address")}
                  description={
                    emailVerified
                      ? t("Verified — used for sign-in codes and account alerts.")
                      : t("Verify your email to enable two-factor authentication.")
                  }
                >
                  {emailVerified && (
                    <span className="us-verified-pill">
                      <CheckCircle2 size={13} /> {t("Verified")}
                    </span>
                  )}
                </SettingRow>

                {!emailVerified && (
                  <div className="us-email-verify-flow">
                    <input
                      type="email"
                      className="us-inline-input"
                      placeholder={t("you@example.com")}
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      disabled={emailStage === "code"}
                    />
                    {emailStage !== "code" ? (
                      <button
                        type="button"
                        className="us-btn primary"
                        onClick={handleSendEmailCode}
                        disabled={emailBusy || !emailDraft.trim()}
                      >
                        {emailBusy ? t("Sending…") : t("Send code")}
                      </button>
                    ) : (
                      <>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          className="us-inline-input us-code-input"
                          placeholder="123456"
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
                        />
                        <button
                          type="button"
                          className="us-btn primary"
                          onClick={handleVerifyEmailCode}
                          disabled={emailBusy || emailCode.length !== 6}
                        >
                          {emailBusy ? t("Verifying…") : t("Verify")}
                        </button>
                        <button type="button" className="us-link-btn" onClick={handleResendEmailCode} disabled={emailBusy}>
                          {t("Resend code")}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {emailNotice && <p className="us-inline-notice">{emailNotice}</p>}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Password")}</h4>
              <div className="us-card us-form">
                <SettingRow
                  icon={KeyRound}
                  title={t("Reset password")}
                  description={t("We’ll email a 6-digit code so you can choose a new password securely.")}
                />

                {pwNoEmail ? (
                  <div className="us-email-verify-flow" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    <p className="us-inline-notice">
                      {t(
                        "This account doesn’t have an email address, so we can’t send a reset code. Contact support and we’ll help you recover access."
                      )}
                    </p>
                    <a className="us-link-btn" href={`mailto:${pwSupportEmail}`} style={{ width: "fit-content" }}>
                      {pwSupportEmail}
                    </a>
                  </div>
                ) : pwStage === "idle" || pwStage === "done" ? (
                  <div className="us-email-verify-flow">
                    <button
                      type="button"
                      className="us-btn primary"
                      onClick={handleRequestPasswordReset}
                      disabled={pwBusy}
                    >
                      {pwBusy ? t("Sending…") : t("Send reset code")}
                    </button>
                  </div>
                ) : (
                  <div className="us-email-verify-flow" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    {pwHint && (
                      <p className="us-muted" style={{ margin: 0 }}>
                        {t("Enter the code we sent to {email}", { email: pwHint })}
                      </p>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="us-inline-input us-code-input"
                      placeholder={t("6-digit code")}
                      value={pwCode}
                      onChange={(e) => setPwCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <input
                      type="password"
                      className="us-inline-input"
                      placeholder={t("New password")}
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      autoComplete="new-password"
                      maxLength={72}
                    />
                    <input
                      type="password"
                      className="us-inline-input"
                      placeholder={t("Confirm new password")}
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      autoComplete="new-password"
                      maxLength={72}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="us-btn primary"
                        onClick={handleConfirmPasswordReset}
                        disabled={pwBusy || pwCode.length !== 6 || !pwNew || !pwConfirm}
                      >
                        {pwBusy ? t("Please wait...") : t("Reset password")}
                      </button>
                      <button type="button" className="us-link-btn" onClick={handleRequestPasswordReset} disabled={pwBusy}>
                        {t("Resend code")}
                      </button>
                      <button
                        type="button"
                        className="us-link-btn"
                        onClick={() => {
                          setPwStage("idle");
                          setPwCode("");
                          setPwNew("");
                          setPwConfirm("");
                          setPwNotice("");
                        }}
                      >
                        {t("Cancel")}
                      </button>
                    </div>
                  </div>
                )}
                {pwNotice && <p className="us-inline-notice">{pwNotice}</p>}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Two-Factor Authentication")}</h4>
              <div className="us-card stack">
                <SettingRow
                  icon={Shield}
                  title={t("Two-Factor Authentication")}
                  description={
                    emailVerified
                      ? t("Get a sign-in code emailed to you on every new login.")
                      : t("Verify your email above to unlock this.")
                  }
                >
                  <Toggle
                    value={twoFactorOn}
                    onChange={handleToggle2fa}
                    label={t("Two-Factor Authentication")}
                  />
                </SettingRow>

                <AnimatePresence>
                  {show2faPasswordPrompt && (
                    <motion.div
                      className="us-email-verify-flow"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
                    >
                      <p className="us-inline-notice">{t("Enter your password to turn off two-factor authentication.")}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="password"
                          className="us-inline-input"
                          placeholder={t("Password")}
                          value={disable2faPassword}
                          onChange={(e) => setDisable2faPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="us-btn primary"
                          onClick={confirmDisable2fa}
                          disabled={twoFaBusy || !disable2faPassword}
                        >
                          {t("Confirm")}
                        </button>
                        <button
                          type="button"
                          className="us-link-btn"
                          onClick={() => { setShow2faPasswordPrompt(false); setDisable2faPassword(""); }}
                        >
                          {t("Cancel")}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section className="us-section">
              <div className="us-section-label-row">
                <h4 className="us-section-label">{t("Active sessions")}</h4>
                {sessions.length > 1 && (
                  <button type="button" className="us-link-btn" onClick={handleRevokeOthers}>
                    <LogOut size={12} /> {t("Sign out all other sessions")}
                  </button>
                )}
              </div>
              {sessionNotice && <p className="us-inline-notice">{sessionNotice}</p>}
              <div className="us-card stack">
                {sessionsLoading ? (
                  <ConversationListSkeleton count={3} label={t("Loading…")} />
                ) : sessions.length === 0 ? (
                  <p className="us-muted" style={{ padding: "8px 4px" }}>{t("No active sessions found.")}</p>
                ) : (
                  sessions.map((session) => (
                    <div className="us-list-row" key={session.id}>
                      <span className="us-row-icon"><Monitor size={16} /></span>
                      <div className="us-row-copy" style={{ flex: 1 }}>
                        <span className="us-row-title">
                          {session.device}
                          {session.current && <em className="us-current-tag"> · {t("This device")}</em>}
                        </span>
                        <span className="us-row-desc">
                          {session.ip} • {t("Last active")}{" "}
                          {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : ""}
                        </span>
                      </div>
                      {!session.current && (
                        <button type="button" className="us-btn ghost sm" onClick={() => handleRevokeSession(session.id)}>
                          {t("End session")}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Blocked users")} ({blockedUsers.length})</h4>
              <div className="us-card stack">
                {blockedLoading ? (
                  <ConversationListSkeleton count={3} label={t("Loading…")} />
                ) : blockedUsers.length === 0 ? (
                  <p className="us-muted" style={{ padding: "8px 4px" }}>{t("No blocked users")}</p>
                ) : (
                  blockedUsers.map((user) => (
                    <div className="us-list-row" key={user.id}>
                      <Avatar name={user.username} size={32} user={user} />
                      <span className="us-row-title" style={{ flex: 1 }}>{user.displayName || user.username}</span>
                      <button type="button" className="us-btn ghost sm" onClick={() => handleUnblock(user.id)}>
                        <UserX size={13} /> {t("Unblock")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <DeleteAccountSection onDeleted={() => onLogout?.()} />
          </div>
        );

      case "shop":
        return (
          <div className="us-tab">
            <ShopPanel
              equipped={equipped}
              onEquippedChange={handleEquippedChange}
              balance={me?.descoinBalance || 0}
              me={me}
              onBalanceChange={(next) => {
                if (typeof next === "number" && me) {
                  onProfileUpdated?.({ ...me, descoinBalance: next });
                }
              }}
            />
          </div>
        );

      case "appearance":
        return (
          <div className="us-tab">
            <p className="us-lead">{t("Choose how Descall looks on this device.")}</p>
            <section className="us-section">
              <h4 className="us-section-label">{t("Theme")}</h4>
              <div className="us-theme-grid">
                <button
                  type="button"
                  className={`us-theme-card dark ${darkMode && !equippedThemeKey ? "selected" : ""}`}
                  onClick={() => handlePickBaseTheme(true)}
                >
                  <div className="us-theme-swatch dark" />
                  <div className="us-theme-meta">
                    <Moon size={15} />
                    <span>{t("Dark")}</span>
                  </div>
                  {darkMode && !equippedThemeKey && <Check size={14} className="us-theme-check" />}
                </button>
                <button
                  type="button"
                  className={`us-theme-card light ${!darkMode && !equippedThemeKey ? "selected" : ""}`}
                  onClick={() => handlePickBaseTheme(false)}
                >
                  <div className="us-theme-swatch light" />
                  <div className="us-theme-meta">
                    <Sun size={15} />
                    <span>{t("Light")}</span>
                  </div>
                  {!darkMode && !equippedThemeKey && <Check size={14} className="us-theme-check" />}
                </button>
                {ownedThemes.map((themeItem) => {
                  const selected = equippedThemeKey === themeItem.theme_key;
                  return (
                    <button
                      type="button"
                      key={themeItem.id}
                      className={`us-theme-card premium theme-${themeItem.theme_key} ${selected ? "selected" : ""}`}
                      onClick={() => handlePickPremiumTheme(themeItem)}
                    >
                      <div className={`us-theme-swatch theme-${themeItem.theme_key}`} />
                      <div className="us-theme-meta">
                        <Sparkles size={15} />
                        <span>{themeItem.name}</span>
                      </div>
                      {selected && <Check size={14} className="us-theme-check" />}
                    </button>
                  );
                })}
                {!ownedThemes.length && (
                  <button
                    type="button"
                    className="us-theme-card us-theme-card-shop-link"
                    onClick={() => setActiveTab("shop")}
                  >
                    <div className="us-theme-meta">
                      <ShoppingBag size={15} />
                      <span>{t("Get more in Shop")}</span>
                    </div>
                  </button>
                )}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Accent color")}</h4>
              <div className="us-accent-grid">
                {ACCENT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    className={`us-accent-swatch ${accentColor.toLowerCase() === swatch.hex.toLowerCase() ? "selected" : ""}`}
                    style={{ background: swatch.hex, color: swatch.hex }}
                    aria-label={swatch.id}
                    onClick={() => setAccentColor(swatch.hex)}
                  />
                ))}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Chat font size")}</h4>
              <div className="us-font-size-row">
                <Type size={14} />
                <input
                  type="range"
                  min={12}
                  max={18}
                  step={1}
                  value={chatFontSize}
                  onChange={(e) => setChatFontSize(Number(e.target.value))}
                  aria-label={t("Chat font size")}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)", width: 36 }}>{chatFontSize}px</span>
              </div>
              <div className="us-font-preview" style={{ marginTop: 10 }}>
                {t("The quick brown fox jumps over the lazy dog")}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Density")}</h4>
              <div className="us-segmented">
                {[
                  { id: "compact", label: t("Compact") },
                  { id: "comfortable", label: t("Comfortable") },
                  { id: "spacious", label: t("Spacious") },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`us-segment ${uiDensity === opt.id ? "selected" : ""}`}
                    onClick={() => setUiDensity(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Message bubbles")}</h4>
              <div className="us-segmented">
                {[
                  { id: "modern", label: t("Modern") },
                  { id: "classic", label: t("Classic") },
                  { id: "minimal", label: t("Minimal") },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`us-segment ${bubbleStyle === opt.id ? "selected" : ""}`}
                    onClick={() => setBubbleStyle(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className={`us-bubble-preview bubble-${bubbleStyle}`}>
                <div className="us-bubble-demo other">{t("Hey — how’s it going?")}</div>
                <div className="us-bubble-demo own">{t("Pretty good! You?")}</div>
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Status")}</h4>
              <div className="us-card stack">
                {["online", "idle", "dnd", "invisible"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`status-picker-item ${myStatus === key ? "active" : ""}`}
                    onClick={() => onStatusChange?.(key)}
                    style={{ position: "relative" }}
                  >
                    <span
                      className="status-picker-dot"
                      style={{
                        background:
                          key === "online"
                            ? "var(--success)"
                            : key === "idle"
                            ? "var(--warning)"
                            : key === "dnd"
                            ? "var(--danger)"
                            : "var(--text-muted)",
                      }}
                    />
                    {key === "online"
                      ? t("Online")
                      : key === "idle"
                      ? t("Idle")
                      : key === "dnd"
                      ? t("Do Not Disturb")
                      : t("Invisible")}
                    {myStatus === key && <Check size={14} style={{ marginLeft: "auto" }} />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        );

      case "notifications":
        return (
          <div className="us-tab g-notif">
            <p className="us-lead">{t("Control desktop and browser alerts.")}</p>
            <section className="us-section">
              <div className="us-card stack">
                <SettingRow
                  icon={Bell}
                  title={t("Message notifications")}
                  description={t("DMs, group messages, and mentions")}
                >
                  <Toggle
                    value={msgNotifications}
                    onChange={setMsgNotifications}
                    label={t("Message notifications")}
                  />
                </SettingRow>
                {iosPush && iosPushPermission && iosPushPermission !== "granted" && (
                  <SettingRow
                    icon={AlertTriangle}
                    title={t("iPhone notifications are off")}
                    description={
                      iosPushPermission === "denied"
                        ? t("Turn them on in iPhone Settings → Descall → Notifications.")
                        : t("Allow notifications to get messages while Descall is closed.")
                    }
                  >
                    {iosPushPermission === "prompt" && (
                      <button type="button" className="us-btn primary" onClick={handleIosPushAllow}>
                        {t("Allow")}
                      </button>
                    )}
                  </SettingRow>
                )}
                <SettingRow
                  icon={Mic}
                  title={t("Call notifications")}
                  description={t("Incoming voice and video calls")}
                >
                  <Toggle
                    value={callNotifications}
                    onChange={setCallNotifications}
                    label={t("Call notifications")}
                  />
                </SettingRow>
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Activity Status")}</h4>
              <div className="us-card stack">
                {activity?.isElectron && (
                  <>
                    <SettingRow
                      icon={Monitor}
                      title={t("Game activity")}
                      description={t("Show friends what game you're playing")}
                    >
                      <Toggle
                        value={activity?.settings?.show_game_activity !== false}
                        onChange={(v) => activity?.updateSettings?.({ show_game_activity: v })}
                        label={t("Game activity")}
                      />
                    </SettingRow>
                    <SettingRow
                      icon={MonitorSpeaker}
                      title={t("App activity")}
                      description={t("Show friends what apps you have open")}
                    >
                      <Toggle
                        value={activity?.settings?.show_app_activity !== false}
                        onChange={(v) => activity?.updateSettings?.({ show_app_activity: v })}
                        label={t("App activity")}
                      />
                    </SettingRow>
                    <SettingRow
                      icon={Globe}
                      title={t("Browser activity")}
                      description={t("Show friends when you're browsing the web")}
                    >
                      <Toggle
                        value={activity?.settings?.show_browser === true}
                        onChange={(v) => activity?.updateSettings?.({ show_browser: v })}
                        label={t("Browser activity")}
                      />
                    </SettingRow>
                  </>
                )}
                <SettingRow
                  icon={MonitorSpeaker}
                  title={t("Descall usage time")}
                  description={t("Track and show time spent in Descall")}
                >
                  <Toggle
                    value={activity?.settings?.show_descall_time !== false}
                    onChange={(v) => activity?.updateSettings?.({ show_descall_time: v })}
                    label={t("Descall usage time")}
                  />
                </SettingRow>
              </div>
              {!activity?.isElectron && (
                <p className="us-row-desc g-activity-footnote">
                  {t("Install the Descall desktop app to share game and app activity automatically.")}
                </p>
              )}
            </section>
          </div>
        );

      case "language":
        return (
          <div className="us-tab">
            <p className="us-lead">{t("settings.languageDesc")}</p>
            <section className="us-section">
              <h4 className="us-section-label">{t("settings.appLanguage")}</h4>
              <div className="us-theme-grid us-lang-grid">
                {locales.map((opt) => {
                  const selected = locale === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`us-theme-card ${selected ? "selected" : ""}`}
                      onClick={() => setLocale(opt.id)}
                    >
                      <div className="us-theme-meta" style={{ gap: 10 }}>
                        <Globe size={16} />
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 700 }}>{t(opt.labelKey)}</span>
                          <span style={{ fontSize: 12, opacity: 0.65 }}>{opt.nativeLabel}</span>
                        </div>
                      </div>
                      {selected && <Check size={14} className="us-theme-check" />}
                    </button>
                  );
                })}
              </div>
              <p className="us-row-desc" style={{ marginTop: 14 }}>
                {t("settings.autoDetectHint")}{" "}
                ({t("Detected from your device")}: {deviceDefault === "tr" ? t("settings.turkish") : t("settings.english")})
              </p>
              <p className="us-row-desc" style={{ marginTop: 8 }}>
                {t("settings.appliesInstantly")}
              </p>
            </section>
          </div>
        );

      case "voice":
        return (
          <div className="us-tab">
            <p className="us-lead">{t("Pick the devices used for calls on this browser.")}</p>
            <section className="us-section">
              <div className="us-card us-form">
                <label className="us-field">
                  <span><Mic size={13} /> {t("Microphone")}</span>
                  <select value={selectedAudioIn} onChange={(e) => setSelectedAudioIn(e.target.value)}>
                    <option value="">{t("System default")}</option>
                    {audioInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="us-field">
                  <span><Headphones size={13} /> {t("Speaker")}</span>
                  <select value={selectedAudioOut} onChange={(e) => setSelectedAudioOut(e.target.value)}>
                    <option value="">{t("System default")}</option>
                    {audioOutputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="us-field">
                  <span><Camera size={13} /> {t("Camera")}</span>
                  <select value={selectedVideoIn} onChange={(e) => setSelectedVideoIn(e.target.value)}>
                    <option value="">{t("System default")}</option>
                    {videoInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="us-btn ghost" onClick={refreshDevices}>
                  <RefreshCw size={14} /> {t("Refresh devices")}
                </button>
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Noise suppression")}</h4>
              <div className="us-card stack">
                <SettingRow
                  icon={Sparkles}
                  title={t("AI noise suppression")}
                  description={t(
                    "Removes keyboard, fan, and background noise in group calls and server voice. Uses GTCRN / RNNoise when available."
                  )}
                >
                  <Toggle
                    value={noiseSuppressionOn}
                    onChange={(v) => {
                      setNoiseSuppressionOn(v);
                      setNoiseSuppressionEnabled(v);
                      if (v) preloadNoiseSuppression();
                      setNoiseEngine(getNoiseSuppressionEngine());
                    }}
                    label={t("AI noise suppression")}
                  />
                </SettingRow>
                {noiseSuppressionOn ? (
                  <p className="us-row-desc" style={{ margin: "0 4px 8px" }}>
                    {t("Active engine")}:{" "}
                    <strong>
                      {noiseEngine === "gtcrn"
                        ? "GTCRN"
                        : noiseEngine === "rnnoise"
                          ? "RNNoise"
                          : noiseEngine === "speex"
                            ? "Speex"
                            : noiseEngine === "dsp"
                              ? "DSP"
                              : t("Ready")}
                    </strong>
                  </p>
                ) : null}
              </div>
            </section>

            <section className="us-section">
              <h4 className="us-section-label">{t("Microphone test")}</h4>
              <div className="us-card us-mic-test">
                <div className="us-mic-bar">
                  <div
                    className="us-mic-fill"
                    style={{ width: `${Math.min((micTestLevel * 100) / 255, 100)}%` }}
                  />
                </div>
                <div className="us-btn-row">
                  {!micTesting ? (
                    <button type="button" className="us-btn primary" onClick={startMicTest}>
                      <Mic size={14} /> {t("Test mic")}
                    </button>
                  ) : (
                    <button type="button" className="us-btn ghost" onClick={stopMicTest}>
                      {t("Stop")}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        );

      case "sound":
        return (
          <div className="us-tab">
            <p className="us-lead">{t("Choose which in-app sounds play.")}</p>
            <section className="us-section">
              <div className="us-card stack">
                <SettingRow
                  icon={Bell}
                  title={t("Message sounds")}
                  description={t("Play a sound when a new message arrives")}
                >
                  <Toggle value={msgSounds} onChange={handleMsgSounds} label={t("Message sounds")} />
                </SettingRow>
                <SettingRow
                  icon={Volume2}
                  title={t("Call sounds")}
                  description={t("Ring and call connection sounds")}
                >
                  <Toggle value={callSounds} onChange={handleCallSounds} label={t("Call sounds")} />
                </SettingRow>
              </div>
            </section>
          </div>
        );

      default:
        return null;
    }
  };

  const panelRef = useRef(null);
  const menuPaneRef = useRef(null);
  const detailPaneRef = useRef(null);

  // iOS edge swipe-back. Section → menu runs the header ‹ (backToMenu) with the
  // live menu sliding in underneath; on the menu itself it runs the same close
  // as the ✕ and the app underneath is the previous screen.
  useEdgeSwipeBack({
    enabled: isMobile && mobileDetail,
    onBack: backToMenu,
    surfaceRef: detailPaneRef,
    underlayRef: menuPaneRef,
    priority: 30,
  });
  // Device safe-area changes the header's real height. Pin the wallet to that
  // measured bottom so a Dynamic Island inset cannot open a gap under it.
  useLayoutEffect(() => {
    const main = detailPaneRef.current;
    if (!glassShell || !isMobile || activeTab !== "shop" || !mobileDetail || !main) return undefined;
    const header = main.querySelector(".us-main-header");
    if (!header) return undefined;
    const apply = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) main.style.setProperty("--g-shop-header-h", `${h}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(header);
    return () => {
      ro?.disconnect();
      main.style.removeProperty("--g-shop-header-h");
    };
  }, [glassShell, isMobile, activeTab, mobileDetail]);
  useEdgeSwipeBack({
    enabled: isMobile && !mobileDetail,
    onBack: onClose,
    surfaceRef: panelRef,
    getUnderlay: settingsUnderlay,
    // Same dim as the sheet backdrop so the hand-over is seamless.
    dimOpacity: 0.45,
    // AnimatePresence plays the sheet exit after close — keep it hidden until it unmounts.
    persistUntilUnmount: true,
    priority: 20,
  });

  const handleShellClick = (e) => {
    // Close only when the click lands outside the dialog panel
    if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
  };

  const shellVariants = isMobile
    ? {
        // Mobile sheet: dim backdrop in parallel with the slide-up panel
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
        },
        exit: {
          opacity: 0,
          transition: { duration: 0.18, ease: [0.4, 0, 1, 1], delay: 0.04 },
        },
      }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            duration: 0.2,
            ease: [0.22, 1, 0.36, 1],
            when: "beforeChildren",
          },
        },
        exit: {
          opacity: 0,
          transition: {
            duration: 0.18,
            ease: [0.4, 0, 1, 1],
            when: "afterChildren",
          },
        },
      };

  // Mobile: full-screen sheet from the bottom (clearly visible).
  // Desktop: centered card scale + rise.
  const panelVariants = isMobile
    ? {
        hidden: { y: "100%" },
        visible: {
          y: 0,
          transition: { type: "spring", stiffness: 420, damping: 36, mass: 0.9 },
        },
        exit: {
          y: "100%",
          transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
        },
      }
    : {
        hidden: { opacity: 0, scale: 0.92, y: 24 },
        visible: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 380, damping: 30, mass: 0.85 },
        },
        exit: {
          opacity: 0,
          scale: 0.96,
          y: 14,
          transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
        },
      };

  return (
    <motion.div
      ref={ref}
      className={`user-settings-shell ${isMobile ? "is-mobile" : "is-desktop"}${glassShell && isMobile ? " g-settings" : ""}${glassShell && isMobile && !mobileDetail ? " g-settings-menu" : ""}`}
      variants={shellVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={handleShellClick}
    >
    <motion.div
      ref={panelRef}
      className={`user-settings ${isMobile ? "is-mobile" : "is-desktop"}${!isMobile && activeTab === "shop" ? " is-shop-open" : ""}${glassShell && isMobile ? " g-settings" : ""}${glassShell && isMobile && activeTab === "shop" && mobileDetail ? " g-shop-open" : ""}${glassProfileEdit ? " g-profile-edit" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
      variants={panelVariants}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sidebar / mobile menu */}
      <aside ref={menuPaneRef} className={`us-sidebar ${showMenu ? "visible" : "hidden"}`}>
        <div className="us-sidebar-top">
          <div className="us-sidebar-brand">
            <div>
              {glassShell && isMobile && (
                <button
                  type="button"
                  className="g-settings-me"
                  aria-label={t("Your status")}
                  onClick={() => window.dispatchEvent(new CustomEvent("descall:glass-status-open"))}
                >
                  <span className="g-settings-me-av">
                    <Avatar
                      name={me?.username || t("User")}
                      size={38}
                      user={{ ...me, avatarUrl: avatarUrl || me?.avatarUrl }}
                    />
                    <StatusBadge status={myStatus || "online"} />
                  </span>
                </button>
              )}
              <h2>{glassShell && isMobile ? t("Settings") : t("settings.title")}</h2>
              <p>{t("Manage your Descall account")}</p>
            </div>
            {isMobile && (
              <button type="button" className={`us-icon-btn${glassShell ? " g-settings-close" : ""}`} onClick={onClose} aria-label={t("Close")}>
                <X size={20} />
              </button>
            )}
          </div>

          <button type="button" className="us-mini-profile" onClick={() => openTab("overview")}>
            <span className="us-mini-avatar">
              <Avatar
                name={me?.username || t("User")}
                size={glassShell && isMobile ? 56 : 40}
                user={{ ...me, avatarUrl: avatarUrl || me?.avatarUrl }}
              />
              {glassShell && isMobile ? <StatusBadge status={myStatus || "online"} /> : null}
            </span>
            <div className="us-mini-meta">
              <strong style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
                <span className="us-mini-name">{displayName || me?.username || t("User")}</span>
                <AdminBadge user={me} variant="inline" />
              </strong>
              <span>
                @{me?.username?.toLowerCase() || "user"}
                {glassShell && isMobile ? (
                  <>
                    {" · "}
                    <em className="us-descoin">◈ {Number(me?.descoinBalance || 0).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")} DesCoin</em>
                  </>
                ) : null}
              </span>
            </div>
            {isMobile && <ChevronRight size={16} className="us-chevron" />}
          </button>
        </div>

        <nav className="us-nav" aria-label={t("Settings sections")}>
          {navGroups.map((group) => (
            <div key={group.label} className="us-nav-group">
              <div className="us-nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id && (!isMobile || mobileDetail);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`us-nav-item ${active ? "active" : ""}`}
                    data-nav={item.id}
                    onClick={() => openTab(item.id)}
                  >
                    <span className="us-nav-ico">
                      <Icon size={18} />
                    </span>
                    <span className="us-nav-copy">
                      <span className="us-nav-label">{item.label}</span>
                      {isMobile && <span className="us-nav-hint">{item.hint}</span>}
                    </span>
                    {isMobile && glassShell && item.id === "language" ? (
                      <span className="us-nav-value">{locale === "tr" ? "Türkçe" : "English"}</span>
                    ) : isMobile ? (
                      <ChevronRight size={16} className="us-chevron" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="us-sidebar-foot">
          <button type="button" className="us-logout" onClick={handleLogoutClick}>
            <LogOut size={16} />
            {t("settings.logOut")}
          </button>
        </div>
      </aside>

      {/* Detail pane */}
      <section ref={detailPaneRef} className={`us-main ${showDetail ? "visible" : "hidden"}`}>
        <header className="us-main-header">
          {glassProfileEdit ? (
            <button type="button" className="g-profile-cancel" onClick={backToMenu}>
              {t("Cancel")}
            </button>
          ) : isMobile ? (
            <button type="button" className="us-icon-btn" onClick={backToMenu} aria-label={t("Back")}>
              <ChevronLeft size={22} />
            </button>
          ) : (
            <div className="us-main-heading">
              <h3>{tabTitles[activeTab]}</h3>
            </div>
          )}
          {isMobile && <h3 className="us-mobile-title">{tabTitles[activeTab]}</h3>}
          {glassProfileEdit ? (
            <button
              type="button"
              className="g-profile-save"
              onClick={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? t("Saving…") : profileSaved ? t("Saved") : t("Save")}
            </button>
          ) : (
            <button type="button" className={`us-icon-btn${glassShell && isMobile ? " g-settings-close" : ""}`} onClick={onClose} aria-label={t("Close settings")}>
              <X size={20} />
            </button>
          )}
        </header>

        {glassShell && isMobile && activeTab === "shop" && mobileDetail ? (
          <div className="g-shop-chrome" />
        ) : null}

        <div className="us-main-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="us-main-scroll"
            >
              {!isMobile && activeTab !== "overview" && (
                <h3 className="us-page-title">{tabTitles[activeTab]}</h3>
              )}
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </motion.div>
    <AnimatePresence>
      {avatarCropSrc ? (
        <ImageCropModal
          key="avatar-crop"
          imageSrc={avatarCropSrc}
          aspect={1}
          cropShape="round"
          title={t("Adjust profile photo")}
          confirmLabel={t("Save photo")}
          outputMimeType="image/jpeg"
          outputFileName="avatar.jpg"
          maxOutputSize={1024}
          onCancel={() => setAvatarCropSrc("")}
          onConfirm={persistAvatarFile}
        />
      ) : null}
      {bannerCropSrc ? (
        <ImageCropModal
          key="banner-crop"
          imageSrc={bannerCropSrc}
          aspect={3}
          cropShape="rect"
          title={t("Adjust banner")}
          confirmLabel={t("Save banner")}
          outputMimeType="image/jpeg"
          outputFileName="banner.jpg"
          maxOutputSize={1500}
          onCancel={() => setBannerCropSrc("")}
          onConfirm={persistBannerFile}
        />
      ) : null}
      {usernameModalOpen && !usernameLocked ? (
        <UsernameChangeModal
          key="username-change"
          currentUsername={me?.username || ""}
          onClose={() => setUsernameModalOpen(false)}
          onChanged={handleUsernameChanged}
        />
      ) : null}
    </AnimatePresence>
    </motion.div>
  );
});

export default UserPanel;
