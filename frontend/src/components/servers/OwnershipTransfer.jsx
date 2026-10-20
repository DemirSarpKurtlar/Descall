import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Crown, Search, Trash2, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import {
  getOwnershipTransferInfo,
  getServerMembers,
  getServerRoles,
  transferServerOwnership,
} from "../../api/servers";
import { Avatar } from "../ui/Avatar";
import usePressFeedback from "../../hooks/usePressFeedback";
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from "../../lib/fluid/haptics";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { project } from "../../lib/fluid/physics";
import { trDative, trGenitive } from "../../lib/trSuffix";

/**
 * O3 ownership transfer UI (2.12.2, approved mockup
 * server-audit-2026-10-18/o3-mockup): the owner-only "Tehlikeli bölge" in
 * Server Settings, the transfer dialog, and the sheet an owner gets when
 * pressing "Sunucudan ayrıl". Every surface is heavy frosted glass
 * (.o3-transfer / .o3-leave-sheet are in styles/frost.css), the same on web,
 * Electron and iOS. Backend: POST /servers/:id/ownership/transfer.
 */

const ADMINISTRATOR = 1n << 3n;
const SHEET_DISMISS_PX = 140;

function PressButton({ className, children, disabled, ...rest }) {
  const press = usePressFeedback({ disabled });
  return (
    <button type="button" className={className} disabled={disabled} {...rest} {...press}>
      {children}
    </button>
  );
}

function lowerTr(s) {
  return String(s || "").toLocaleLowerCase("tr");
}

function memberName(m) {
  return m?.nickname || m?.displayName || m?.username || "?";
}

function roleHex(color) {
  const n = Math.max(0, Math.min(0xffffff, Number(color) || 0));
  return n ? `#${n.toString(16).padStart(6, "0")}` : null;
}

function isAdminRole(role) {
  try {
    return (BigInt(role?.permissions || "0") & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

/** Danger zone for Server Settings › Overview. Render only for the owner. */
export function ServerDangerZone({ server, onTransfer, onDelete, disabled = false }) {
  const t = useT();
  if (!server?.isOwner) return null;
  return (
    <section className="o3-zone-wrap" aria-labelledby="o3-zone-title">
      <h4 id="o3-zone-title" className="o3-zone-title">{t("o3.dangerZone")}</h4>
      <div className="o3-zone">
        <div className="o3-zone-row">
          <div className="o3-zone-copy">
            <strong>{t("o3.transferTitle")}</strong>
            <small>{t("o3.transferHint")}</small>
          </div>
          <PressButton className="o3-btn is-warn" onClick={onTransfer} disabled={disabled}>
            {t("o3.transferBtn")}
          </PressButton>
        </div>
        <div className="o3-zone-row">
          <div className="o3-zone-copy">
            <strong>{t("o3.deleteTitle")}</strong>
            <small>{t("o3.deleteHint")}</small>
          </div>
          <PressButton className="o3-btn is-warn" onClick={onDelete} disabled={disabled}>
            {t("o3.deleteBtn")}
          </PressButton>
        </div>
      </div>
    </section>
  );
}

function useEscape(onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onEscape?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onEscape, enabled]);
}

function errorText(t, err, targetName) {
  const code = err?.code || "";
  if (err?.status === 429) return t("o3.errRate");
  if (code === "PASSWORD_REQUIRED") return t("o3.errPassword");
  if (code === "CONFIRM_NAME_REQUIRED") return t("o3.errName");
  if (code === "TARGET_NOT_MEMBER") return t("o3.errNotMember", { name: targetName });
  if (code === "TARGET_MAX_OWNED_SERVERS") return t("o3.errMaxOwned", { name: targetName });
  if (code === "OWNER_CHANGED") return t("o3.errChanged");
  return err?.message || t("o3.errGeneric");
}

/**
 * Transfer dialog: member search with role chips, irreversible warning,
 * server name confirmation, password, "<isim>'e devret".
 * leaveAfter = opened from the owner-leave sheet: the owner leaves once the
 * transfer succeeds (onTransferred receives { result, target, leaveAfter }).
 */
export function OwnershipTransferModal({ server, leaveAfter = false, onClose, onTransferred }) {
  const t = useT();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [members, setMembers] = useState(null);
  const [roles, setRoles] = useState(Array.isArray(server?.roles) ? server.roles : []);
  const [loadError, setLoadError] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  const serverName = String(server?.name || "");

  useEffect(() => {
    if (!server?.id) return undefined;
    let alive = true;
    getServerMembers(server.id)
      .then((data) => alive && setMembers(Array.isArray(data?.members) ? data.members : []))
      .catch((err) => {
        if (!alive) return;
        setMembers([]);
        setLoadError(err?.message || t("o3.loadFailed"));
      });
    getServerRoles(server.id)
      .then((data) => alive && Array.isArray(data?.roles) && setRoles(data.roles))
      .catch(() => {});
    getOwnershipTransferInfo(server.id)
      .then((data) => alive && setPasswordRequired(data?.passwordRequired !== false))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [server?.id, t]);

  useEffect(() => {
    hapticWarning();
  }, []);

  useEscape(() => !busy && onClose?.(), true);

  const rolesById = useMemo(() => new Map((roles || []).map((r) => [String(r.id), r])), [roles]);

  const candidates = useMemo(() => {
    const list = (members || []).filter((m) => !m.isOwner);
    list.sort((a, b) => (b.highestPosition || 0) - (a.highestPosition || 0) || lowerTr(memberName(a)).localeCompare(lowerTr(memberName(b)), "tr"));
    return list;
  }, [members]);

  const visible = useMemo(() => {
    const q = lowerTr(query.trim());
    if (!q) return candidates;
    return candidates.filter((m) =>
      [m.nickname, m.displayName, m.username].some((v) => v && lowerTr(v).includes(q))
    );
  }, [candidates, query]);

  const selected = candidates.find((m) => String(m.userId) === String(selectedId)) || null;
  const targetName = selected ? memberName(selected) : "";
  const nameMatches = confirmName.trim().toLocaleLowerCase("tr") === serverName.trim().toLocaleLowerCase("tr") && serverName.length > 0;
  const canSubmit = Boolean(selected) && nameMatches && (!passwordRequired || password.length > 0) && !busy;

  const chipsFor = (m) => {
    const list = (m.roleIds || [])
      .map((id) => rolesById.get(String(id)))
      .filter((r) => r && !r.isEveryone)
      .sort((a, b) => (b.position || 0) - (a.position || 0));
    return list;
  };

  const submittingRef = useRef(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit || !server?.id || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await transferServerOwnership(server.id, {
        userId: selected.userId,
        confirmName: confirmName.trim(),
        password: passwordRequired ? password : undefined,
      });
      hapticSuccess();
      toast(t("o3.done", { name: targetName, nameDat: trDative(targetName) }), "success");
      await onTransferred?.({ result, target: selected, leaveAfter });
    } catch (err) {
      hapticError();
      setError(errorText(t, err, targetName));
      if (err?.code === "PASSWORD_REQUIRED") setPassword("");
      setBusy(false);
      submittingRef.current = false;
    }
  };

  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  const cardFrom = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04 };
  const cardTo = reduce ? { opacity: 1 } : { opacity: 1, scale: 1 };

  if (typeof document === "undefined") return null;

  const warning = selected
    ? leaveAfter
      ? t("o3.warnLeave", { name: targetName })
      : t("o3.warnStay", { name: targetName, nameGen: trGenitive(targetName) })
    : t("o3.warnGeneric");

  return createPortal(
    <motion.div
      className="o3-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2, ease: "easeOut" }}
    >
      <motion.form
        className="o3-transfer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="o3-transfer-title"
        initial={cardFrom}
        animate={cardTo}
        exit={cardFrom}
        transition={transition}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="o3-head">
          <div>
            <h2 id="o3-transfer-title">{t("o3.transferTitle")}</h2>
            <p className="o3-sub">
              {t("o3.sub", { server: serverName, serverGen: trGenitive(serverName) })}
            </p>
          </div>
          <PressButton className="o3-icon-btn" onClick={onClose} disabled={busy} aria-label={t("o3.close")}>
            <X size={16} />
          </PressButton>
        </header>

        <div className="o3-body">
          <label className="o3-search">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("o3.search")}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("o3.search")}
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>

          <div className="o3-list" role="radiogroup" aria-label={t("o3.newOwner")}>
            {members === null ? (
              [0, 1, 2].map((i) => <div key={i} className="o3-row is-skeleton" aria-hidden />)
            ) : visible.length === 0 ? (
              <p className="o3-empty">
                {loadError || (candidates.length === 0 ? t("o3.noOthers") : t("o3.noMatch"))}
              </p>
            ) : (
              visible.map((m) => {
                const sel = String(m.userId) === String(selectedId);
                const chips = chipsFor(m);
                return (
                  <PressButton
                    key={m.userId}
                    className={`o3-row${sel ? " is-selected" : ""}`}
                    role="radio"
                    aria-checked={sel}
                    onClick={() => {
                      if (!sel) hapticSelection();
                      setSelectedId(m.userId);
                      setError("");
                    }}
                  >
                    <span className="o3-radio" aria-hidden>{sel ? <Check size={11} strokeWidth={3} /> : null}</span>
                    <Avatar
                      size={36}
                      name={memberName(m)}
                      user={{ id: m.userId, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl }}
                      animate="never"
                    />
                    <span className="o3-row-copy">
                      <b>{memberName(m)}</b>
                      <small>
                        {m.username ? <span className="o3-handle">@{m.username}</span> : null}
                        {chips.length === 0 ? (
                          <span className="o3-chip">{t("o3.member")}</span>
                        ) : (
                          <>
                            {chips.slice(0, 2).map((r) => {
                              const hex = roleHex(r.color);
                              return (
                                <span
                                  key={r.id}
                                  className={`o3-chip${isAdminRole(r) ? " is-admin" : ""}`}
                                  style={hex && !isAdminRole(r) ? { "--o3-chip": hex } : undefined}
                                >
                                  {r.name}
                                </span>
                              );
                            })}
                            {chips.length > 2 ? <span className="o3-chip">+{chips.length - 2}</span> : null}
                          </>
                        )}
                      </small>
                    </span>
                  </PressButton>
                );
              })
            )}
          </div>

          <div className="o3-note" role="note">
            <b>{t("o3.irreversible")}</b> {warning}
          </div>

          <label className="o3-field">
            <span>{t("o3.confirmLabel")}</span>
            <input
              className={nameMatches ? "is-ok" : ""}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={serverName}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>

          {passwordRequired ? (
            <label className="o3-field">
              <span>{t("o3.password")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </label>
          ) : null}

          {error ? <p className="o3-error" role="alert">{error}</p> : null}
        </div>

        <footer className="o3-actions">
          <PressButton className="o3-btn" onClick={onClose} disabled={busy}>
            {t("o3.cancel")}
          </PressButton>
          <PressButton type="submit" className="o3-btn is-danger" disabled={!canSubmit}>
            {busy
              ? t("o3.busy")
              : selected
                ? t("o3.transferTo", { name: targetName, nameDat: trDative(targetName) })
                : t("o3.transfer")}
          </PressButton>
        </footer>
      </motion.form>
    </motion.div>,
    document.body
  );
}

function useNarrow() {
  const query = "(max-width: 600px)";
  const [narrow, setNarrow] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

/**
 * What an owner sees on "Sunucudan ayrıl": transfer first, or delete and leave.
 * Phone widths get a bottom sheet (drag down to dismiss: 1:1 tracking, release
 * velocity projected, spring back otherwise); wider screens a centered card.
 */
export function OwnerLeaveSheet({ server, onTransferFirst, onDeleteAndLeave, onCancel }) {
  const t = useT();
  const reduce = useReducedMotion();
  const narrow = useNarrow();
  useEscape(onCancel, true);
  useEffect(() => {
    hapticWarning();
  }, []);

  if (typeof document === "undefined") return null;

  const sheetMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: REDUCED_MOTION_FADE }
    : narrow
      ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: framerSpring(SPRINGS.sheet) }
      : {
          initial: { opacity: 0, scale: 1.04 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.04 },
          transition: framerSpring(SPRINGS.materialize),
        };

  const drag = narrow && !reduce
    ? {
        drag: "y",
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0.06, bottom: 0.9 },
        dragMomentum: false,
        onDragEnd: (_e, info) => {
          const landing = info.offset.y + project(info.velocity.y);
          if (landing > SHEET_DISMISS_PX && info.velocity.y >= 0) onCancel?.();
        },
      }
    : {};

  return createPortal(
    <motion.div
      className={`o3-scrim${narrow ? " is-sheet" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2, ease: "easeOut" }}
      onClick={onCancel}
    >
      <motion.div
        className={`o3-leave-sheet${narrow ? " is-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="o3-leave-title"
        onClick={(e) => e.stopPropagation()}
        {...sheetMotion}
        {...drag}
      >
        {narrow ? <div className="o3-grab" aria-hidden /> : null}
        <h2 id="o3-leave-title">{t("o3.leaveTitle")}</h2>
        <p className="o3-sub">{t("o3.leaveSub", { name: server?.name || "" })}</p>
        <PressButton className="o3-opt is-primary" onClick={onTransferFirst}>
          <span className="o3-opt-ic" aria-hidden><Crown size={18} /></span>
          <span className="o3-opt-copy">
            <strong>{t("o3.leaveTransfer")}</strong>
            <small>{t("o3.leaveTransferHint")}</small>
          </span>
        </PressButton>
        <PressButton className="o3-opt is-red" onClick={onDeleteAndLeave}>
          <span className="o3-opt-ic" aria-hidden><Trash2 size={18} /></span>
          <span className="o3-opt-copy">
            <strong>{t("o3.leaveDelete")}</strong>
            <small>{t("o3.leaveDeleteHint")}</small>
          </span>
        </PressButton>
        <div className="o3-actions">
          <PressButton className="o3-btn" onClick={onCancel}>
            {t("o3.cancel")}
          </PressButton>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
