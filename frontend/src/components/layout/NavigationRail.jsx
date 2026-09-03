import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Check } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { STATUS_META } from "../../lib/presence";
import { getToken, getUser, setUser } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { normalizeUser, resolveAvatarUrl, resolveDisplayName } from "../../lib/userProfile";
import { useT } from "../../context/LocaleContext";
import DescallBrand from "../brand/DescallBrand";
import {
  buildMainNavItems,
  buildToolNavItems,
  NAV_ICON_SIZE,
  NAV_ICON_STROKE,
} from "./navConfig";

const STATUS_OPTIONS = ["online", "idle", "dnd", "invisible"];
const STATUS_EMOJIS = ["💬", "😀", "🎮", "🎵", "💼", "📚", "☕", "🌙"];

function splitStatusEmoji(value) {
  const raw = String(value || "").trim();
  if (!raw) return { emoji: "💬", text: "" };
  const chars = Array.from(raw);
  const first = chars[0];
  if (STATUS_EMOJIS.includes(first) || /\p{Extended_Pictographic}/u.test(first)) {
    const rest = chars.slice(1).join("").replace(/^\s+/, "");
    return { emoji: first, text: rest };
  }
  return { emoji: "💬", text: raw };
}


function canUseHoverTooltips() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function RailButton({
  active = false,
  className = "",
  label,
  onClick,
  dismissToken,
  children,
  ...rest
}) {
  const btnRef = useRef(null);
  const [tip, setTip] = useState(null);

  const hideTip = () => setTip(null);

  const showTip = () => {
    // Touch synthesizes mouseenter after tap and never mouseleave. The tooltip
    // is portaled to document.body, so it stays on LFG/DimaAI after the drawer
    // slides away. Only real hover pointers get a label.
    if (!canUseHoverTooltips()) return;
    const el = btnRef.current;
    if (!el || !label) return;
    const rect = el.getBoundingClientRect();
    setTip({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  useEffect(() => {
    hideTip();
  }, [active, dismissToken]);

  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => hideTip();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [tip]);

  const handleClick = (event) => {
    hideTip();
    event.currentTarget.blur();
    onClick?.(event);
  };

  return (
    <>
      <motion.button
        ref={btnRef}
        type="button"
        className={`rail-btn ${active ? "active" : ""} ${className}`.trim()}
        {...rest}
        onClick={handleClick}
        onPointerDown={(event) => {
          rest.onPointerDown?.(event);
          if (event.pointerType !== "mouse") hideTip();
        }}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={() => {
          if (canUseHoverTooltips()) showTip();
        }}
        onBlur={hideTip}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        data-tooltip={label}
      >
        <span className="rail-btn-inner">{children}</span>
      </motion.button>
      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <motion.div
            className="rail-tooltip"
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {label}
          </motion.div>,
          document.body
        )}
    </>
  );
}

export default function NavigationRail({
  activeView,
  onViewChange,
  onAdminClick,
  onUserClick,
  onAddClick,
  onVoiceClick,
  me,
  isAdmin,
  myStatus = "online",
  onStatusChange,
  onProfileUpdated,
}) {
  const t = useT();
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [statusEmoji, setStatusEmoji] = useState("💬");
  const [statusDraft, setStatusDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const avatarBtnRef = useRef(null);
  const menuRef = useRef(null);

  const mainItems = useMemo(() => buildMainNavItems(t), [t]);
  const toolItems = useMemo(() => buildToolNavItems(t, { isAdmin }), [t, isAdmin]);

  const statusKey = STATUS_META[myStatus] ? myStatus : "online";

  // Prefer live `me`, fall back to persisted session user so the rail never
  // flashes the letter placeholder when profile state briefly lags.
  const storedUser = getUser();
  const railUser = me?.avatarUrl || me?.avatar_url
    ? me
    : (storedUser && (!me?.id || storedUser.id === me.id) ? { ...me, ...storedUser } : me);
  const railAvatarUrl =
    resolveAvatarUrl(railUser) ||
    resolveAvatarUrl(storedUser) ||
    me?.avatarUrl ||
    me?.avatar_url ||
    storedUser?.avatarUrl ||
    storedUser?.avatar_url ||
    null;

  const placeMenu = () => {
    const el = avatarBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 260;
    const gap = 10;
    let left = rect.right + gap;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, rect.left - menuWidth - gap);
    }
    const estimatedHeight = 360;
    let top = rect.bottom - estimatedHeight;
    if (top < 8) top = 8;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - estimatedHeight - 8);
    }
    setMenuPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!statusOpen) return undefined;
    placeMenu();
    const onReposition = () => placeMenu();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [statusOpen]);

  useEffect(() => {
    if (!statusOpen) return undefined;
    const onDoc = (e) => {
      if (avatarBtnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setStatusOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setStatusOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [statusOpen]);

  useEffect(() => {
    if (!statusOpen) {
      setEmojiOpen(false);
      return undefined;
    }
    const current = me?.customStatus || me?.custom_status || "";
    const split = splitStatusEmoji(current);
    setStatusEmoji(split.emoji);
    setStatusDraft(split.text);
    return undefined;
  }, [statusOpen, me?.customStatus, me?.custom_status]);

  const revertCustomStatus = () => {
    const current = me?.customStatus || me?.custom_status || "";
    const split = splitStatusEmoji(current);
    setStatusEmoji(split.emoji);
    setStatusDraft(split.text);
    setEmojiOpen(false);
  };

  const saveCustomStatus = async () => {
    const text = statusDraft.trim();
    const customStatus = text ? `${statusEmoji} ${text}`.trim() : "";
    setStatusSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customStatus }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const updated = normalizeUser(data.user || { ...me, customStatus, custom_status: customStatus });
        if (updated) {
          setUser(updated);
          onProfileUpdated?.(updated);
        }
        setStatusOpen(false);
      }
    } catch {
      /* keep picker open so the user can retry */
    } finally {
      setStatusSaving(false);
    }
  };

  const handleToolAction = (action) => {
    if (action === "add") onAddClick?.();
    else if (action === "settings") onUserClick?.();
    else if (action === "admin") onAdminClick?.();
  };

  const statusMenu = (
    <AnimatePresence>
      {statusOpen && (
        <motion.div
          ref={menuRef}
          className="status-picker status-picker-portal"
          style={{ top: menuPos.top, left: menuPos.left }}
          role="menu"
          aria-label={t("Status")}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.14 }}
        >
          <div className="status-picker-header">{t("Set status")}</div>
          {STATUS_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={statusKey === key}
              className={`status-picker-item ${statusKey === key ? "active" : ""}`}
              onClick={() => {
                onStatusChange?.(key);
                setStatusOpen(false);
              }}
            >
              <span
                className={`status-picker-dot status-${key}`}
                style={{ background: STATUS_META[key]?.color || "var(--text-muted)" }}
              />
              <span className="status-picker-label">
                {t(key === "dnd" ? "Do Not Disturb" : STATUS_META[key]?.label || key)}
              </span>
            </button>
          ))}
          <div className="status-picker-divider" />
          <div className="status-picker-custom">
            <div className="status-picker-custom-label">{t("Custom status")}</div>
            <div className="status-picker-input-wrap">
              <button
                type="button"
                className="status-picker-emoji-btn"
                aria-label={t("Custom status")}
                onClick={() => setEmojiOpen((v) => !v)}
              >
                {statusEmoji}
              </button>
              <input
                className="status-picker-input"
                value={statusDraft}
                maxLength={60}
                placeholder={t("What's on your mind?")}
                onChange={(e) => setStatusDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveCustomStatus();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    revertCustomStatus();
                    setStatusOpen(false);
                  }
                }}
              />
            </div>
            {emojiOpen && (
              <div className="status-picker-emoji-grid" role="listbox" aria-label={t("Custom status")}>
                {STATUS_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`status-picker-emoji-choice${statusEmoji === em ? " active" : ""}`}
                    onClick={() => {
                      setStatusEmoji(em);
                      setEmojiOpen(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
            <div className="status-picker-actions">
              <button
                type="button"
                className="status-picker-btn primary"
                onClick={saveCustomStatus}
                disabled={statusSaving}
              >
                <Check size={14} />
                {statusSaving ? t("Saving…") : t("Save")}
              </button>
              <button
                type="button"
                className="status-picker-btn ghost"
                onClick={() => {
                  revertCustomStatus();
                  setStatusOpen(false);
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
          <div className="status-picker-divider" />
          <button
            type="button"
            role="menuitem"
            className="status-picker-item"
            onClick={() => {
              setStatusOpen(false);
              onUserClick?.();
            }}
          >
            <Settings size={15} strokeWidth={NAV_ICON_STROKE} />
            <span className="status-picker-label">{t("settings.title")}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <nav className="nav-rail" aria-label={t("Primary navigation")}>
      <div className="nav-rail-brand">
        <div className="nav-rail-logo" aria-hidden="true">
          <DescallBrand compact />
        </div>
      </div>

      <div className="nav-rail-main">
        <div className="nav-rail-group" role="group" aria-label={t("nav.chats")}>
          {mainItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <RailButton
                key={item.id}
                active={isActive}
                dismissToken={activeView}
                label={item.label}
                onClick={() => onViewChange(item.id)}
              >
                <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
              </RailButton>
            );
          })}
        </div>

        <div className="nav-rail-divider" role="separator" aria-hidden="true" />

        <div className="nav-rail-group" role="group" aria-label={t("settings.title")}>
          {toolItems.map((item) => {
            const Icon = item.icon;
            return (
              <RailButton
                key={item.id}
                className={item.action === "admin" ? "admin-btn" : ""}
                dismissToken={activeView}
                label={item.label}
                onClick={() => handleToolAction(item.action)}
              >
                <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
              </RailButton>
            );
          })}
        </div>
      </div>

      <div className="nav-rail-bottom">
        <button
          type="button"
          ref={avatarBtnRef}
          className="rail-user-panel"
          onClick={() => setStatusOpen((v) => !v)}
          title={`${t(statusKey === "dnd" ? "Do Not Disturb" : STATUS_META[statusKey]?.label || "Online")} — ${t("change status")}`}
          aria-label={`${resolveDisplayName(railUser || me) || t("You")} — ${t("change status")}`}
          aria-haspopup="menu"
          aria-expanded={statusOpen}
        >
          <div className="rail-user-avatar-wrap">
            <Avatar
              name={resolveDisplayName(railUser || me)}
              size={36}
              user={railUser}
              imageUrl={railAvatarUrl}
              animate="always"
              loading="eager"
            />
            <span className={`rail-user-status-dot status-${statusKey}`} />
          </div>
        </button>
      </div>

      {typeof document !== "undefined" ? createPortal(statusMenu, document.body) : null}
    </nav>
  );
}
