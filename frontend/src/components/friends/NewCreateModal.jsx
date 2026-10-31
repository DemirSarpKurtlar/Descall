import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AtSign, UsersThree, ChevronRight, ChevronLeft, Link2, Copy, Check, UserPlus, RefreshCw,
  Loader2, UsersRound, Camera, Plus, Search, X,
} from "../ui/Icon.jsx";
import CloseButton from "../ui/CloseButton";
import ImageCropModal from "../ui/ImageCropModal";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";
import { resolveDisplayName } from "../../lib/userProfile";
import { getPresenceStatus, STATUS_META } from "../../lib/presence";
import { buildFriendInviteUrl, toPublicShareUrl } from "../../lib/referral";
import { copyText } from "../../lib/copyText";
import { readFileAsDataUrl } from "../../lib/cropImage";
import { AVATAR_ACCEPT, needsCrop, validateAvatarFile } from "../../lib/avatarFile";
import { foldTr } from "../../lib/slashCommands";
import { framerSpring, SPRINGS } from "../../lib/fluid/springs";
import "../../styles/new-create.css";

/** Server cap (backend/routes/groups.js MAX_GROUP_SIZE): the creator counts too. */
export const GROUP_MAX = 15;
export const GROUP_MAX_PICK = GROUP_MAX - 1;

/** "https://descall.com/register?ref=x" -> "descall.com/register?ref=x" for the card. */
export function shortInviteUrl(url) {
  return String(url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** Friends matching the search, Turkish-insensitive, by display name or username. */
export function filterFriends(friends, query) {
  const list = Array.isArray(friends) ? friends : [];
  const q = foldTr(String(query || "").trim());
  if (!q) return list;
  return list.filter((f) => foldTr(`${resolveDisplayName(f)} ${f?.username || ""}`).includes(q));
}

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0)).join("").toLocaleUpperCase("tr");
}

/**
 * "Yeni" (3.7.14, owner pick: draft A). Screen 1: add by username, Create group
 * card, invite link card, people you may know. Screen 2: create a group (photo,
 * name, member chips, search, check list, "N kişi seçildi" footer).
 * All state and the network handlers stay in ServerSidebar; this only renders.
 */
export default function NewCreateModal({
  open,
  onClose,
  glassShell = false,
  screen = "start",
  onScreen,
  focusUsername = false,
  me,
  friends,
  onlineUsers,
  friendUsername,
  setFriendUsername,
  onAddFriend,
  addLoading,
  addError,
  addSuccess,
  onClearMessages,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  onRefreshSuggestions,
  sentUsernames,
  onQuickAdd,
  groupName,
  setGroupName,
  selectedMembers,
  onToggleMember,
  onCreateGroup,
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const userInputRef = useRef(null);
  const fileRef = useRef(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [cropSrc, setCropSrc] = useState("");
  const [photoError, setPhotoError] = useState("");

  const handle = me?.username || "";
  const inviteUrl = handle ? toPublicShareUrl(buildFriendInviteUrl(handle)) : "";
  const selected = Array.isArray(selectedMembers) ? selectedMembers : [];
  const atCap = selected.length >= GROUP_MAX_PICK;
  const visibleFriends = useMemo(() => filterFriends(friends, query), [friends, query]);
  const nameOk = String(groupName || "").trim().length >= 2;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopied(false);
      setPhotoError("");
      setCropSrc("");
      setPhoto((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
        return null;
      });
    }
  }, [open]);

  useEffect(() => {
    if (open && screen === "start" && focusUsername) {
      const id = setTimeout(() => userInputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open, screen, focusUsername]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  const go = (next) => {
    onClearMessages?.();
    setQuery("");
    onScreen?.(next);
  };

  const shareInvite = async () => {
    if (!inviteUrl) return;
    if (glassShell && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Descall", text: t("profile.shareText", { username: handle }), url: inviteUrl });
        return;
      } catch (err) {
        if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
      }
    }
    if (await copyText(inviteUrl)) setCopied(true);
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem === "type") return setPhotoError(t("Avatar must be JPG, PNG, WebP, or GIF."));
    if (problem === "size") return setPhotoError(t("Avatar must be 8 MB or smaller."));
    setPhotoError("");
    if (!needsCrop(file)) {
      setPhoto((p) => {
        if (p?.url) URL.revokeObjectURL(p.url);
        return { file, url: URL.createObjectURL(file) };
      });
      return;
    }
    try {
      setCropSrc(await readFileAsDataUrl(file));
    } catch {
      setPhotoError(t("Failed to read image."));
    }
  };

  const create = () => {
    if (!nameOk || addLoading) return;
    onCreateGroup?.(photo?.file || null);
  };

  const sheetMotion = glassShell
    ? { initial: { y: 28, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 28, opacity: 0 }, transition: framerSpring(SPRINGS.sheet) }
    : { initial: { scale: 0.96, opacity: 0, y: 12 }, animate: { scale: 1, opacity: 1, y: 0 }, exit: { scale: 0.96, opacity: 0, y: 12 }, transition: { type: "spring", damping: 28, stiffness: 340 } };
  const paneMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, x: screen === "group" ? 24 : -24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: screen === "group" ? -24 : 24 },
        transition: { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] },
      };

  const message = addError ? (
    <div className="nc-msg is-error" role="alert">{addError}</div>
  ) : addSuccess ? (
    <div className="nc-msg is-ok" role="status"><Check size={14} weight="bold" /> {addSuccess}</div>
  ) : null;

  const reasonOf = (s) => {
    if (s.reason === "mutual") return t("nc.mutualFriends", { count: s.mutualFriends });
    if (s.reason === "group") return t("nc.sharedGroups", { count: s.sharedGroups });
    return t("nc.suggested");
  };

  const start = (
    <motion.div key="start" className="nc-pane" {...paneMotion}>
      <header className="nc-head">
        <h3 className="nc-title">{t("nc.title")}</h3>
        <CloseButton onClick={onClose} label={t("Close")} className="nc-close" />
      </header>
      <div className="nc-body">
        <form
          className="nc-field nc-user"
          onSubmit={(e) => { e.preventDefault(); if (friendUsername.trim() && !addLoading) onAddFriend?.(); }}
        >
          <AtSign size={18} aria-hidden="true" />
          <input
            ref={userInputRef}
            value={friendUsername}
            onChange={(e) => setFriendUsername(e.target.value)}
            placeholder={t("nc.usernamePlaceholder")}
            aria-label={t("nc.usernamePlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <button type="submit" className="nc-inline-btn" disabled={addLoading || !friendUsername.trim()}>
            {addLoading ? <Loader2 size={15} className="spin" /> : null}
            {t("nc.add")}
          </button>
        </form>
        {message}

        <button type="button" className="nc-card" onClick={() => go("group")}>
          <span className="nc-tile is-brand" aria-hidden="true"><UsersThree size={22} weight="fill" /></span>
          <span className="nc-card-copy">
            <b>{t("nc.groupTitle")}</b>
            <small>{t("nc.groupSub")}</small>
          </span>
          <ChevronRight size={16} className="nc-chev" aria-hidden="true" />
        </button>

        {inviteUrl ? (
          <div className="nc-card is-static">
            <span className="nc-tile is-green" aria-hidden="true"><Link2 size={22} weight="bold" /></span>
            <span className="nc-card-copy">
              <b>{t("nc.inviteTitle")}</b>
              <small className="nc-url" title={inviteUrl}>{shortInviteUrl(inviteUrl)}</small>
            </span>
            <button type="button" className={`nc-chip-btn${copied ? " is-done" : ""}`} onClick={shareInvite}>
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
              {copied ? t("nc.copied") : t("nc.copy")}
            </button>
          </div>
        ) : null}

        <div className="nc-sec-row">
          <span className="nc-sec">{t("nc.peopleTitle")}</span>
          <button type="button" className="nc-link" onClick={onRefreshSuggestions} disabled={suggestionsLoading}>
            <RefreshCw size={13} className={suggestionsLoading ? "spin" : undefined} /> {t("nc.refresh")}
          </button>
        </div>
        {suggestionsLoading && !suggestions?.length ? (
          <div className="nc-state"><Loader2 size={20} className="spin" /><span>{t("Finding people you may know...")}</span></div>
        ) : suggestionsError ? (
          <div className="nc-state">
            <span>{suggestionsError}</span>
            <button type="button" className="nc-chip-btn" onClick={onRefreshSuggestions}><RefreshCw size={13} /> {t("Try again")}</button>
          </div>
        ) : !suggestions?.length ? (
          <div className="nc-state"><UsersRound size={24} /><span>{t("nc.peopleEmpty")}</span></div>
        ) : (
          <ul className="nc-list" aria-label={t("nc.peopleTitle")}>
            {suggestions.map((s) => {
              const sent = sentUsernames?.has?.(s.username);
              return (
                <li key={s.id} className="nc-row">
                  <Avatar user={s} size={38} />
                  <span className="nc-row-copy">
                    <b>{s.displayName || s.username}</b>
                    <small>{reasonOf(s)}</small>
                  </span>
                  {sent ? (
                    <span className="nc-pill is-sent"><Check size={13} weight="bold" /> {t("nc.sent")}</span>
                  ) : (
                    <button type="button" className="nc-pill" onClick={() => onQuickAdd?.(s.username)}>
                      <UserPlus size={14} /> {t("nc.add")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </motion.div>
  );

  const group = (
    <motion.div key="group" className="nc-pane" {...paneMotion}>
      <header className="nc-head">
        <button type="button" className="nc-back" onClick={() => go("start")} aria-label={t("nc.back")}>
          <ChevronLeft size={18} weight="bold" />
        </button>
        <h3 className="nc-title is-sub">{t("nc.groupTitle")}</h3>
        <CloseButton onClick={onClose} label={t("Close")} className="nc-close" />
      </header>
      <div className="nc-body">
        <div className="nc-group-top">
          <button
            type="button"
            className={`nc-gav${photo ? " has-photo" : ""}`}
            onClick={() => fileRef.current?.click()}
            aria-label={photo ? t("nc.changePhoto") : t("nc.addPhoto")}
          >
            {photo ? <img src={photo.url} alt="" /> : nameOk ? <span className="nc-gav-ini">{initialsOf(groupName)}</span> : <Camera size={24} />}
            <i aria-hidden="true">{photo ? <Camera size={12} /> : <Plus size={13} weight="bold" />}</i>
          </button>
          <input ref={fileRef} type="file" accept={AVATAR_ACCEPT} hidden onChange={pickPhoto} />
          <label className="nc-name">
            <span className="nc-sec">{t("nc.groupName")}</span>
            <span className="nc-field">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t("e.g. Gaming Squad")}
                maxLength={50}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              />
            </span>
          </label>
        </div>
        {photoError ? <div className="nc-msg is-error">{photoError}</div> : null}

        {selected.length ? (
          <div className="nc-chips" aria-label={t("nc.selected")}>
            {selected.map((m) => (
              <button key={m.id} type="button" className="nc-member-chip" onClick={() => onToggleMember?.(m)} aria-label={t("nc.removeMember", { name: resolveDisplayName(m) })}>
                <Avatar user={m} size={22} />
                <span>{resolveDisplayName(m)}</span>
                <X size={12} weight="bold" />
              </button>
            ))}
          </div>
        ) : null}

        <label className="nc-field nc-search">
          <Search size={17} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("nc.searchFriends")} aria-label={t("nc.searchFriends")} />
        </label>

        {!Array.isArray(friends) || friends.length === 0 ? (
          <div className="nc-state"><UsersRound size={24} /><span>{t("No friends to add. Add friends first.")}</span></div>
        ) : visibleFriends.length === 0 ? (
          <div className="nc-state"><span>{t("nc.noMatch")}</span></div>
        ) : (
          <ul className="nc-list nc-friends" role="listbox" aria-multiselectable="true" aria-label={t("nc.members")}>
            {visibleFriends.map((f) => {
              const on = selected.some((m) => m.id === f.id);
              const disabled = !on && atCap;
              const status = getPresenceStatus(onlineUsers, f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`nc-row nc-friend${on ? " is-on" : ""}`}
                    disabled={disabled}
                    onClick={() => onToggleMember?.(f)}
                  >
                    <Avatar user={f} size={32} />
                    <span className="nc-row-copy">
                      <b>{resolveDisplayName(f)}</b>
                      <small>{t(STATUS_META[status]?.label || "Offline")}</small>
                    </span>
                    <span className={`nc-check${on ? " is-on" : ""}`} aria-hidden="true">{on ? <Check size={13} weight="bold" /> : null}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {message}
      </div>
      <footer className="nc-foot">
        <small>{t("nc.selectedCount", { count: selected.length, max: GROUP_MAX })}</small>
        <button type="button" className="nc-primary" onClick={create} disabled={addLoading || !nameOk}>
          {addLoading ? <Loader2 size={16} className="spin" /> : null}
          {addLoading ? t("Creating...") : t("nc.createGroup")}
        </button>
      </footer>
    </motion.div>
  );

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`add-modal-backdrop nc-scrim${glassShell ? " g-scrim g-add-scrim" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <motion.div
              className={`nc-sheet${glassShell ? " is-phone" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={screen === "group" ? t("nc.groupTitle") : t("nc.title")}
              data-screen={screen}
              onClick={(e) => e.stopPropagation()}
              {...sheetMotion}
            >
              {glassShell ? <div className="g-grabber" aria-hidden="true" /> : null}
              <AnimatePresence mode="wait" initial={false}>
                {screen === "group" ? group : start}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cropSrc ? (
          <ImageCropModal
            key="nc-photo-crop"
            imageSrc={cropSrc}
            aspect={1}
            cropShape="rect"
            title={t("Adjust group photo")}
            confirmLabel={t("Save photo")}
            outputMimeType="image/jpeg"
            outputFileName="group.jpg"
            maxOutputSize={1024}
            onCancel={() => setCropSrc("")}
            onConfirm={(file) => {
              setCropSrc("");
              setPhoto((p) => {
                if (p?.url) URL.revokeObjectURL(p.url);
                return { file, url: URL.createObjectURL(file) };
              });
            }}
          />
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  );
}
