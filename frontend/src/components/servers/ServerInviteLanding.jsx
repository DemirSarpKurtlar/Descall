import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Server, Loader2, LogIn, CheckCircle2, AlertTriangle, UserPlus, RefreshCw } from "../ui/Icon.jsx";
import { previewServerInvite, joinServerByInvite } from "../../api/servers";
import { getToken } from "../../lib/storage";
import { useT } from "../../context/LocaleContext";
import { ServerIcon } from "./ServerIcon";
import { SkeletonLine } from "../ui/Skeleton";
import {
  savePendingServerInvite,
  clearPendingServerInvite,
  serverInviteErrorKey,
  isFinalInviteError,
} from "../../lib/serverInviteRoute";
import "../../site/glass-public.css";
import "../../site/glass-public-frames.css";

/**
 * 3.7.31: landing for server invite links (descall.com/servers/join/:code).
 * Works logged out (public preview), logged in, and right after login /
 * sign-up (the code is kept in a pending slot by savePendingServerInvite).
 */
export default function ServerInviteLanding({ code, me, onJoined, onNeedAuth, onDismiss }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await previewServerInvite(code);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setLoadError(err || {});
          if (isFinalInviteError(err)) clearPendingServerInvite();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // me?.id: refetch after login so isMember is right.
  }, [code, attempt, me?.id]);

  const needAuth = useCallback(
    (mode) => {
      savePendingServerInvite(code);
      onNeedAuth?.(mode, code);
    },
    [code, onNeedAuth]
  );

  const handleJoin = async () => {
    if (!me || !getToken()) {
      needAuth("login");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const res = await joinServerByInvite(code);
      clearPendingServerInvite();
      onJoined?.(res.server, res);
    } catch (err) {
      if (Number(err?.status) === 401) {
        needAuth("login");
        return;
      }
      setJoinError(err || {});
      if (isFinalInviteError(err)) clearPendingServerInvite();
    } finally {
      setJoining(false);
    }
  };

  const server = preview?.server;
  const inviter = preview?.invite?.inviter;
  const inviterName = inviter?.displayName || inviter?.username || "";
  const finalLoadError = loadError && isFinalInviteError(loadError);

  return (
    <div className="invite-landing" data-testid="server-invite-landing">
      <motion.div
        className="invite-landing-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="invite-landing-brand">Descall</div>
        <h1>
          {inviterName && server
            ? t("{name} invited you to a server", { name: inviterName })
            : t("You've been invited to join a server")}
        </h1>

        {loading ? (
          <div className="invite-landing-preview" aria-busy="true" aria-label={t("Loading invite…")}>
            <div className="skeleton-line invite-landing-avatar" />
            <div>
              <SkeletonLine width="46%" height={16} />
              <SkeletonLine width="62%" height={12} />
            </div>
          </div>
        ) : loadError ? (
          <div className="invite-landing-state error" role="alert" data-testid="server-invite-error">
            <AlertTriangle size={28} />
            <strong>{t(serverInviteErrorKey(loadError))}</strong>
            {finalLoadError ? (
              <span>{t("Ask the person who sent it for a new invite.")}</span>
            ) : null}
            <div className="invite-landing-actions">
              {!finalLoadError ? (
                <button type="button" className="invite-landing-btn ghost" onClick={() => setAttempt((n) => n + 1)}>
                  <RefreshCw size={16} />
                  {t("Try again")}
                </button>
              ) : null}
              <button type="button" className="invite-landing-btn primary" onClick={onDismiss}>
                {me ? t("Go to Descall") : t("Go to home page")}
              </button>
            </div>
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
                <strong data-testid="server-invite-name">{server?.name || t("Server")}</strong>
                <span>
                  {server?.onlineCount != null
                    ? `${t("{count} online", { count: server.onlineCount })} · `
                    : ""}
                  {t("{count} members", { count: server?.memberCount ?? 0 })}
                  {server?.isMember ? ` · ${t("Already a member")}` : ""}
                </span>
              </div>
            </div>
            {server?.description ? <p className="invite-landing-desc">{server.description}</p> : null}
            {joinError ? (
              <p className="invite-landing-error" role="alert" data-testid="server-invite-join-error">
                {t(serverInviteErrorKey(joinError))}
              </p>
            ) : null}
            <div className="invite-landing-actions">
              {me ? (
                <>
                  <button type="button" className="invite-landing-btn ghost" onClick={onDismiss}>
                    {t("Not now")}
                  </button>
                  <button
                    type="button"
                    className="invite-landing-btn primary"
                    disabled={joining || (joinError && isFinalInviteError(joinError))}
                    onClick={handleJoin}
                  >
                    {joining ? (
                      <Loader2 size={18} className="spin" />
                    ) : server?.isMember ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <LogIn size={18} />
                    )}
                    {joining ? t("Joining…") : server?.isMember ? t("Open server") : t("Accept Invite")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="invite-landing-btn ghost" onClick={() => needAuth("login")}>
                    <LogIn size={18} />
                    {t("Log in")}
                  </button>
                  <button type="button" className="invite-landing-btn primary" onClick={() => needAuth("register")}>
                    <UserPlus size={18} />
                    {t("Sign up and join")}
                  </button>
                </>
              )}
            </div>
            {!me ? <p className="invite-landing-hint">{t("Your invite is kept while you log in or sign up.")}</p> : null}
          </>
        )}
      </motion.div>
    </div>
  );
}
