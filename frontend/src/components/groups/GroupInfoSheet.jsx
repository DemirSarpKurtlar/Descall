import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { X, Link2, UserRoundPlus, Edit3, ImagePlus, LogOut, Crown } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import GroupIcon from "./GroupIcon";
import { getPresenceStatus, isVisiblyOnline } from "../../lib/presence";
import { resolveDisplayName } from "../../lib/userProfile";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { sortGroupMembers, GROUP_INFO_ACTIONS, shouldDismissSheet } from "../../lib/groupInfo";
import "./GroupInfoSheet.css";

const ICONS = { invite: Link2, add: UserRoundPlus, rename: Edit3, photo: ImagePlus };

/**
 * Group info sheet (tap the group title card in a group chat).
 * Phone: bottom sheet with spring presentation and interactive drag-to-dismiss
 * (offset or velocity). Desktop: centred glass card. Same action handlers as
 * the sidebar swipe actions / row menu (`onAction(action)`).
 */
export default function GroupInfoSheet({ open, group, onClose, onAction, onlineUsers = [], onOpenProfile, t }) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const dismissV = useRef(0);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose?.();
    };
    // Capture: the composer / chat shortcuts must not swallow Esc while the sheet is up.
    window.addEventListener("keydown", onKey, true);
    const id = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(id);
    };
  }, [open, onClose]);

  const members = useMemo(
    () => sortGroupMembers(group?.members, {
      ownerId: group?.created_by ?? group?.createdBy ?? null,
      isOnline: (id) => isVisiblyOnline(onlineUsers, id),
      nameOf: resolveDisplayName,
    }),
    [group?.members, group?.created_by, group?.createdBy, onlineUsers],
  );
  const memberCount = group?.memberCount || members.length || 0;

  const dismiss = (velocity = 0) => {
    dismissV.current = Number.isFinite(velocity) ? velocity : 0;
    onClose?.();
  };
  const act = (action) => {
    onClose?.();
    // Let the sheet start leaving before a dialog/picker appears on top.
    setTimeout(() => onAction?.(action), action === "photo" ? 0 : 120);
  };

  const tree = (
    <AnimatePresence custom={dismissV.current}>
      {open && group ? (
        <motion.div
          className="group-info-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? REDUCED_MOTION_FADE : { duration: 0.2 }}
          onClick={() => dismiss(0)}
        >
          <motion.div
            key={group.id}
            className="group-info-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={group.name}
            data-testid="group-info-sheet"
            custom={dismissV.current}
            variants={{
              initial: reduceMotion ? { opacity: 0 } : { y: 48, opacity: 0, scale: 0.98 },
              animate: reduceMotion
                ? { opacity: 1, transition: REDUCED_MOTION_FADE }
                : { y: 0, opacity: 1, scale: 1, transition: framerSpring(SPRINGS.sheet) },
              exit: (velocity) => (reduceMotion
                ? { opacity: 0, transition: REDUCED_MOTION_FADE }
                : { y: 520, opacity: 0, transition: { ...framerSpring(SPRINGS.sheet, Number.isFinite(velocity) ? velocity : undefined), restDelta: 4, restSpeed: 40, opacity: { duration: 0.18 } } }),
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
              if (shouldDismissSheet(info.offset.y, info.velocity.y)) {
                hapticImpactLight();
                dismiss(info.velocity.y);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="group-info-hero"
              onPointerDown={(event) => {
                if (reduceMotion) return;
                if (event.target.closest("button, a, input")) return;
                dragControls.start(event);
              }}
            >
              <div className="group-info-grabber" aria-hidden="true" />
              <button ref={closeRef} type="button" className="group-info-close" onClick={() => dismiss(0)} aria-label={t("Close")}>
                <X size={16} />
              </button>
              <button
                type="button"
                className="group-info-photo"
                onClick={() => act("photo")}
                aria-label={t("Change Group Photo")}
                title={t("Change Group Photo")}
              >
                <GroupIcon group={group} size={104} radius={32} />
                <span className="group-info-photo-badge" aria-hidden="true"><ImagePlus size={14} /></span>
              </button>
              <h2 className="group-info-name">{group.name}</h2>
              <div className="group-info-sub">{t("{count} members", { count: memberCount })}</div>
            </div>

            <div className="group-info-body">
              <div className="group-info-actions" role="group" aria-label={t("Group actions")}>
                {GROUP_INFO_ACTIONS.filter((a) => a.id !== "leave").map((a) => {
                  const Icon = ICONS[a.id];
                  return (
                    <button key={a.id} type="button" className={`group-info-action is-${a.id}`} onClick={() => act(a.id)}>
                      <span className="group-info-action-icon"><Icon size={18} /></span>
                      <span className="group-info-action-label">{t(a.label)}</span>
                    </button>
                  );
                })}
              </div>

              <section className="group-info-members" aria-label={t("Members")}>
                <h3 className="group-info-section-title">
                  {t("Members")} <span>{memberCount}</span>
                </h3>
                <div className="group-info-member-list">
                  {members.map((m) => {
                    const status = getPresenceStatus(onlineUsers, m.id);
                    return (
                      <button
                        key={m.id || m.username}
                        type="button"
                        className="group-info-member"
                        onClick={() => {
                          if (!onOpenProfile) return;
                          onClose?.();
                          onOpenProfile(m);
                        }}
                      >
                        <span className="group-info-member-avatar">
                          <Avatar name={resolveDisplayName(m)} size={40} user={m} />
                          <StatusBadge status={status} />
                        </span>
                        <span className="group-info-member-text">
                          <span className="group-info-member-name">{resolveDisplayName(m)}</span>
                          <span className="group-info-member-role">
                            {m._isOwner ? (<><Crown size={11} /> {t("Owner")}</>) : t("Member")}
                            {m._online ? <i className="is-on"> · {t("Online")}</i> : null}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {members.length === 0 ? <p className="group-info-empty">{t("No members")}</p> : null}
                </div>
              </section>

              <button type="button" className="group-info-leave" onClick={() => act("leave")}>
                <LogOut size={16} />
                <span>{t("Leave Group")}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return tree;
  return createPortal(tree, document.body);
}
