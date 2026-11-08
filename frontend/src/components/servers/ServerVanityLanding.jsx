import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Server, Loader2, LogIn, CheckCircle2, AlertTriangle, UserPlus, Ban } from "../ui/Icon.jsx";
import { savePendingLanding, clearPendingLanding, serverInviteErrorKey } from "../../lib/serverInviteRoute";
import { previewServerVanity, joinServerByVanity } from "../../api/servers";
import { getToken } from "../../lib/storage";
import { useT } from "../../context/LocaleContext";
import { ServerIcon } from "./ServerIcon";
import { SkeletonLine } from "../ui/Skeleton";
import "../../site/glass-public.css";
import "../../site/glass-public-frames.css";
import InviteLandingBrand from "./InviteLandingBrand";

/**
 * Landing page for /s/:vanitySlug server vanity URLs.
 *
 * Logged out: one "Join with a free account" button (sign-up keeps the slug). Back signed in
 * from that flow (autoJoin), the server is joined right away.
 */
export default function ServerVanityLanding({ slug, me, autoJoin = false, onJoined, onNeedLogin, onDismiss }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await previewServerVanity(slug);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(Number(err?.status) === 404 ? t("Server not found") : t(serverInviteErrorKey(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // me?.id: refetch after login so isMember / banned are right.
  }, [slug, t, me?.id]);

  const handleJoin = async (mode = "login") => {
    if (!me || !getToken()) {
      // 3.7.32: same pending slot + /login flow as server invites.
      savePendingLanding("vanity", slug);
      onNeedLogin?.(mode, slug);
      return;
    }
    setJoining(true);
    setError("");
    try {
      const res = await joinServerByVanity(slug);
      clearPendingLanding("vanity");
      onJoined?.(res.server);
    } catch (err) {
      if (Number(err?.status) === 401) {
        handleJoin("login");
        return;
      }
      setError(t(serverInviteErrorKey(err)));
    } finally {
      setJoining(false);
    }
  };

  const server = preview?.server;
  const banned = Boolean(server?.banned && !server?.isMember);

  const joinRef = useRef(null);
  joinRef.current = handleJoin;
  const autoTried = useRef(false);
  useEffect(() => {
    if (!autoJoin || !me || loading || !server || banned || autoTried.current) return;
    autoTried.current = true;
    joinRef.current?.();
  }, [autoJoin, me, loading, server, banned]);

  return (
    <div className="invite-landing">
      <motion.div
        className="invite-landing-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <InviteLandingBrand />
        <h1>{t("You've been invited to join a server")}</h1>

        {loading ? (
          <div className="invite-landing-preview" aria-busy="true" aria-label={t("Loading invite…")}>
            <div className="skeleton-line invite-landing-avatar" />
            <div>
              <SkeletonLine width="46%" height={16} />
              <SkeletonLine width="62%" height={12} />
            </div>
          </div>
        ) : !server ? (
          // Nothing to show (error or an empty reply): never a fake "Sunucu · 0 üye" row.
          <div className="invite-landing-state error" role="alert">
            <AlertTriangle size={28} />
            <strong>{t("Invite not found")}</strong>
            <button type="button" className="invite-landing-btn ghost" onClick={onDismiss}>
              {t("Dismiss")}
            </button>
          </div>
        ) : (
          <>
            <div className="invite-landing-preview">
              <ServerIcon
                server={server}
                className="invite-landing-avatar"
                fallback={
                  <div className="invite-landing-avatar fallback">
                    <Server size={28} />
                  </div>
                }
              />
              <div>
                <strong>{server.name || t("Server")}</strong>
                <span>
                  {[
                    Number.isFinite(Number(server.memberCount)) && server.memberCount != null
                      ? t("{count} members", { count: Number(server.memberCount) })
                      : null,
                    server.isMember ? t("Already a member") : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            {banned ? (
              <p className="invite-landing-error" role="alert" data-testid="server-invite-banned">
                <Ban size={16} aria-hidden="true" />
                {t("You are banned from this server.")}
              </p>
            ) : null}
            {error && !banned ? <p className="invite-landing-error" role="alert">{error}</p> : null}
            <div className="invite-landing-actions">
              <button type="button" className="invite-landing-btn ghost" onClick={onDismiss}>
                {t("Not now")}
              </button>
              {!me ? (
                <>
                  <button type="button" className="invite-landing-btn ghost" onClick={() => handleJoin("login")}>
                    <LogIn size={18} />
                    {t("invl.haveAccount")}
                  </button>
                  <button
                    type="button"
                    className="invite-landing-btn primary"
                    data-testid="server-vanity-join-free"
                    onClick={() => handleJoin("register")}
                  >
                    <UserPlus size={18} />
                    {t("invl.joinFree")}
                  </button>
                </>
              ) : null}
              {me && !banned ? (
              <button
                type="button"
                className="invite-landing-btn primary"
                disabled={joining}
                onClick={() => handleJoin("login")}
              >
                {joining ? (
                  <Loader2 size={18} className="spin" />
                ) : server.isMember ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <LogIn size={18} />
                )}
                {joining
                  ? t("Joining…")
                  : server.isMember
                    ? t("Open server")
                    : t("Accept Invite")}
              </button>
              ) : null}
            </div>
            {!me ? <p className="invite-landing-hint">{t("Your invite is kept while you log in or sign up.")}</p> : null}
          </>
        )}
      </motion.div>
    </div>
  );
}
