import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User, MessageSquare, Copy, Ban, Flag, UserMinus, LogOut, ShieldCheck } from "../ui/Icon.jsx";
import GlassConfirm from "../ui/GlassConfirm";
import ReportUserModal from "../social/ReportUserModal";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { copyText } from "../../lib/copyText";
import { confirmToggleBlock, useBlockedUserIds } from "../../lib/blockedUsers";
import { resolveDisplayName } from "../../lib/userProfile";
import { canRemoveGroupMember, groupRoleOf } from "../../lib/groupMembers";
import { memberEventSegments, removedBannerBody } from "../../lib/groupMemberEvents";
import { removeGroupMember, setGroupMemberRole } from "../../api/groups";
import { formatMessageClock, intlLocaleTag, parseAppDate } from "../../lib/datetime";
import { getLocale } from "../../i18n/runtime";
import { hapticSelection } from "../../lib/fluid/haptics";
import "./GroupMemberRemoval.css";

/**
 * Group member removal UI (owner decisions 25.10.2026, mockups in
 * ui-group-kick/): the member context menu, the confirm with an optional
 * reason, the centered system row and the banner the removed person sees
 * in place of the composer. Same components on desktop, iPhone web,
 * Electron and the Capacitor app.
 */

export const REASON_MAX = 140;
const MENU_WIDTH = 208;
const GAP = 12;

export function clockLabel(iso) {
  const d = parseAppDate(iso);
  if (!d) return "";
  try {
    return formatMessageClock(d, intlLocaleTag(getLocale()));
  } catch {
    return "";
  }
}

/** Where the menu goes: left of the row as drawn, kept inside the window. */
export function placeMemberMenu(rect, { width = MENU_WIDTH, height = 300, vw = 1024, vh = 768 } = {}) {
  // Desktop: beside the row, on its left (as drawn).
  let x = rect.left - width - 4;
  if (x >= GAP) {
    const y = Math.max(GAP, Math.min(rect.top + 4, vh - height - GAP));
    return { x, y };
  }
  // Narrow (iPhone sheet): under the row so the tapped member stays visible,
  // above it when there is no room below.
  x = Math.max(GAP, Math.min(rect.left + 8, vw - width - GAP));
  const below = (rect.bottom ?? rect.top + (rect.height || 0)) + 4;
  let y = below + height <= vh - GAP ? below : rect.top - height - 4;
  y = Math.max(GAP, Math.min(y, vh - height - GAP));
  return { x, y };
}

function GroupMemberMenu({ state, group, meId, friendIds, onClose, onAction }) {
  const t = useT();
  const ref = useRef(null);
  const blockedIds = useBlockedUserIds();
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  const member = state.member;
  const isSelf = member.id === meId;
  const name = resolveDisplayName(member) || member.username;
  const canRemove = canRemoveGroupMember(group, meId, member.id);
  const isOwnerMe = groupRoleOf(group, meId) === "owner";
  const targetRole = groupRoleOf(group, member.id);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !state.rect) return;
    const next = placeMemberMenu(state.rect, {
      width: el.offsetWidth || MENU_WIDTH,
      height: el.offsetHeight || 300,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
    setPos(next);
  }, [state]);

  useEffect(() => {
    ref.current?.querySelector("button")?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(ref.current?.querySelectorAll("button") || [])];
      const i = items.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
      e.preventDefault();
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);

  const item = (key, Icon, label, extra = "") => (
    <button
      type="button"
      role="menuitem"
      className={`server-dropdown-item${extra}`}
      onClick={() => onAction(key, member)}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      className="server-member-menu gk-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      aria-label={t("gk.menuLabel", { name })}
    >
      <div className="gk-menu-head">
        {name}
        {member.username ? <span>@{member.username}</span> : null}
      </div>
      {item("profile", User, t("gk.viewProfile"))}
      {!isSelf && (!friendIds || friendIds.has(String(member.id)))
        ? item("message", MessageSquare, t("gk.sendMessage"))
        : null}
      {item("copy", Copy, t("gk.copyUsername"))}
      {!isSelf ? (
        <>
          <div className="gk-sep" role="separator" />
          {item("block", Ban, blockedIds.has(String(member.id)) ? t("gk.unblock") : t("gk.block"))}
          {item("report", Flag, t("gk.report"))}
        </>
      ) : null}
      {!isSelf && (canRemove || (isOwnerMe && targetRole !== "owner")) ? (
        <>
          <div className="gk-sep" role="separator" />
          {isOwnerMe && targetRole !== "owner"
            ? item("role", ShieldCheck, targetRole === "admin" ? t("gk.removeAdmin") : t("gk.makeAdmin"))
            : null}
          {canRemove ? item("remove", UserMinus, t("gk.remove"), " danger gk-kick") : null}
        </>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * Menu + confirm + report state for one group's member list. Rows call
 * `openFor(member, event)`; render `layer` once next to the list.
 */
export function useGroupMemberMenu({ group, me, friends = null, onOpenProfile, onStartDm, onRemoved, onRoleChanged, onClose }) {
  const t = useT();
  const { toast } = useToast();
  const [menu, setMenu] = useState(null); // { member, rect, x, y }
  const [confirm, setConfirm] = useState(null); // member
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const meId = me?.id || null;
  const friendIds = Array.isArray(friends)
    ? new Set(friends.map((f) => String(f?.id || f?.friend_id || f?.user?.id || "")).filter(Boolean))
    : null;

  const openFor = useCallback((member, event) => {
    if (!member?.id) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const rowEl = event?.currentTarget?.closest?.(".member-row, .group-info-member") || event?.currentTarget;
    const rect = rowEl?.getBoundingClientRect?.() || { left: 400, top: 120, right: 400, bottom: 160 };
    const pos = placeMemberMenu(rect, { vw: window.innerWidth, vh: window.innerHeight });
    try { hapticSelection(); } catch { /* optional */ }
    setMenu({ member, rect, ...pos });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const onAction = useCallback(async (key, member) => {
    setMenu(null);
    const name = resolveDisplayName(member) || member.username;
    if (key === "profile") {
      onClose?.();
      onOpenProfile?.(member);
    }
    else if (key === "message") {
      onStartDm?.(member);
      onClose?.();
    } else if (key === "copy") {
      try {
        await copyText(member.username ? `@${member.username}` : name);
        toast(t("Copied"), "success");
      } catch {
        toast(t("Something went wrong."), "error");
      }
    } else if (key === "block") {
      try {
        const next = await confirmToggleBlock({ userId: String(member.id), username: member.username, t });
        if (next !== null) toast(next ? t("User blocked.") : t("User unblocked."), "success");
      } catch (err) {
        toast(err?.message || t("Something went wrong."), "error");
      }
    } else if (key === "report") {
      onClose?.();
      setReportTarget({ id: String(member.id), username: member.username || "" });
    } else if (key === "role") {
      const role = groupRoleOf(group, member.id) === "admin" ? "member" : "admin";
      try {
        await setGroupMemberRole(group.id, member.id, role);
        onRoleChanged?.(group.id, member.id, role);
        toast(t(role === "admin" ? "gk.madeAdmin" : "gk.unmadeAdmin", { name }), "success");
      } catch {
        toast(t("gk.errRole"), "error");
      }
    } else if (key === "remove") {
      setError("");
      setConfirm(member);
    }
  }, [group, onClose, onOpenProfile, onRoleChanged, onStartDm, t, toast]);

  const submitRemove = useCallback(async (draft) => {
    if (!confirm || busy) return;
    const reason = String(draft || "").trim();
    if ([...reason].length > REASON_MAX) {
      setError(t("gk.errReason"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await removeGroupMember(group.id, confirm.id, reason);
      onRemoved?.(group.id, confirm.id, res);
      setConfirm(null);
    } catch (err) {
      const byCode = {
        RATE_LIMITED: "gk.errRate",
        REASON_TOO_LONG: "gk.errReason",
        NOT_ALLOWED: "gk.errNotAllowed",
        CANNOT_REMOVE_OWNER: "gk.errNotAllowed",
      };
      setError(t(byCode[err?.code] || "gk.errGeneric"));
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, group, onRemoved, t]);

  const confirmName = confirm ? resolveDisplayName(confirm) || confirm.username : "";
  const layer = (
    <>
      {menu && group ? (
        <GroupMemberMenu state={menu} group={group} meId={meId} friendIds={friendIds} onClose={closeMenu} onAction={onAction} />
      ) : null}
      {confirm ? (
        <GlassConfirm
          title={t("gk.confirmTitle", { name: confirmName })}
          message={t("gk.confirmBody", { name: confirmName })}
          confirmLabel={t("gk.confirm")}
          cancelLabel={t("gk.cancel")}
          danger
          busy={busy}
          error={error}
          input={{
            label: t("gk.reasonLabel"),
            placeholder: t("gk.reasonPlaceholder"),
            defaultValue: "",
            maxLength: REASON_MAX,
          }}
          onConfirm={submitRemove}
          onCancel={() => {
            if (!busy) setConfirm(null);
          }}
        />
      ) : null}
      <ReportUserModal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.id}
        targetUsername={reportTarget?.username}
        contextType="group"
        contextId={group?.id || null}
      />
    </>
  );

  return { openFor, menuMemberId: menu?.member?.id || null, layer };
}

/** Centered system row: "Demir, Can’ı gruptan çıkardı 21:58". */
export function GroupMemberEventRow({ event, timestamp }) {
  const t = useT();
  if (!event) return null;
  const segments = memberEventSegments(event, t);
  const Icon = event.type === "member_left" ? LogOut : UserMinus;
  return (
    <div className="gk-event" role="status">
      <span className={`gk-event-pill${event.targetIsMe ? " is-me" : ""}`}>
        <Icon size={13} aria-hidden="true" />
        <span>
          {segments.map((s, i) => (s.bold ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>))}
        </span>
        {timestamp ? <time className="tnum" dateTime={timestamp}>{clockLabel(timestamp)}</time> : null}
      </span>
    </div>
  );
}

/** In place of the composer for the removed person. */
export function GroupRemovedBanner({ group, onDismiss, busy = false }) {
  const t = useT();
  const removed = group?.removed;
  if (!removed) return null;
  const actor = (group.members || []).find((m) => m?.id === removed.by);
  const actorName = (actor && resolveDisplayName(actor)) || removed.byName || removed.byUsername || "?";
  return (
    <div className="gk-removed-slot">
      <div className="gk-removed" role="status">
        <div className="gk-removed-ico" aria-hidden="true"><UserMinus size={18} /></div>
        <div className="gk-removed-copy">
          <b>{t("gk.bannerTitle")}</b>
          <span>{removedBannerBody({ actorName, time: clockLabel(removed.removedAt) }, t)}</span>
          {removed.reason ? (
            <span className="gk-removed-reason">{t("gk.bannerReason", { reason: removed.reason })}</span>
          ) : null}
        </div>
        <button type="button" className="gk-removed-btn" onClick={onDismiss} disabled={busy}>
          {t("gk.bannerDismiss")}
        </button>
      </div>
    </div>
  );
}
