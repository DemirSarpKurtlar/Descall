import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users, Loader2, LogIn, CheckCircle2, AlertTriangle, UserPlus } from "../ui/Icon.jsx";
import { savePendingLanding } from "../../lib/serverInviteRoute";
import { previewGroupInvite, joinGroupByInvite } from "../../api/groups";
import { getToken } from "../../lib/storage";
import { Avatar } from "../ui/Avatar";
import { SkeletonLine } from "../ui/Skeleton";
import "../../site/glass-public.css";
import "../../site/glass-public-frames.css";
import { useT } from "../../context/LocaleContext";
import InviteLandingBrand from "../servers/InviteLandingBrand";

/**
 * Discord-style invite landing, shown for /invite/:code
 *
 * Logged out: one "Join with a free account" button (sign-up keeps the code). Back signed in
 * from that flow (autoJoin), the invite is redeemed right away.
 */
export default function GroupInviteLanding({
  code,
  me,
  autoJoin = false,
  onJoined,
  onNeedLogin,
  onDismiss,
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await previewGroupInvite(code);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(err.message || t("Invite not found"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, t]);

  const handleJoin = async (mode = "login") => {
    if (!me || !getToken()) {
      // 3.7.32: kept through login / sign-up (web opens /login, not the home page).
      savePendingLanding("group", code);
      onNeedLogin?.(mode, code);
      return;
    }
    setJoining(true);
    setError("");
    try {
      const res = await joinGroupByInvite(code);
      onJoined?.(res.group);
    } catch (err) {
      setError(err.message || t("Could not join group"));
    } finally {
      setJoining(false);
    }
  };

  const joinRef = useRef(null);
  joinRef.current = handleJoin;
  const autoTried = useRef(false);
  useEffect(() => {
    if (!autoJoin || !me || loading || !preview?.group || autoTried.current) return;
    autoTried.current = true;
    joinRef.current?.();
  }, [autoJoin, me, loading, preview]);

  return (
    <div className="invite-landing">
      <motion.div
        className="invite-landing-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <InviteLandingBrand />
        <h1>{t("You've been invited to join a group")}</h1>

        {loading ? (
          <div className="invite-landing-group" aria-busy="true" aria-label={t("Loading invite…")}>
            <div className="skeleton-line" style={{ width: 72, height: 72, borderRadius: "50%" }} />
            <div style={{ width: "70%", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <SkeletonLine width="48%" height={16} />
              <SkeletonLine width="62%" height={12} />
            </div>
          </div>
        ) : !preview?.group ? (
          <div className="invite-landing-state is-error">
            <AlertTriangle size={28} />
            <strong>{t("Invite not found")}</strong>
            <button type="button" className="invite-landing-secondary" onClick={onDismiss}>
              {t("Back to Descall")}
            </button>
          </div>
        ) : (
          <>
            <div className="invite-landing-group">
              <Avatar
                name={preview?.group?.name || t("Group")}
                size={72}
                user={{ avatarUrl: preview?.group?.avatarUrl, username: preview?.group?.name }}
              />
              <div>
                <strong>{preview?.group?.name}</strong>
                <span>
                  <Users size={14} />
                  {t("{count} members", { count: preview?.group?.memberCount ?? 0 })}
                </span>
              </div>
            </div>

            {preview?.alreadyMember ? (
              <div className="invite-landing-banner is-ok">
                <CheckCircle2 size={16} />
                {t("You're already a member of this group")}
              </div>
            ) : null}

            {error ? <div className="invite-landing-error">{error}</div> : null}

            <button
              type="button"
              className="invite-landing-join"
              data-testid={me ? undefined : "group-invite-join-free"}
              onClick={() => handleJoin(me ? "login" : "register")}
              disabled={joining}
            >
              {joining ? (
                <Loader2 size={18} className="spin" />
              ) : me ? (
                preview?.alreadyMember ? t("Open group") : t("Accept invite")
              ) : (
                <>
                  <UserPlus size={18} />
                  {t("invl.joinFree")}
                </>
              )}
            </button>

            {!me ? (
              <button type="button" className="invite-landing-secondary" onClick={() => handleJoin("login")}>
                <LogIn size={16} />
                {t("invl.haveAccount")}
              </button>
            ) : null}
            {!me ? <p className="invite-landing-hint">{t("Your invite is kept while you log in or sign up.")}</p> : null}
            <button type="button" className="invite-landing-secondary" onClick={onDismiss}>
              {me ? t("Maybe later") : t("Back")}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
