import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Ban, Clock, Coins, Flag, Globe, History, Lock, LockOpen,
  LogOut, Monitor, RefreshCw, Shield, Smartphone, Sparkles, Timer, UserX,
  Wallet,
} from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import RippleButton from "../ui/RippleButton";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import { SkeletonLine } from "../ui/Skeleton";

function sourceLabel(key, t) {
  if (!key) return t("common.unknown");
  const map = {
    google_ads: t("admin.googleAds"),
    google_organic: t("admin.googleOrganic"),
    discord: t("admin.discord"),
    reddit: t("admin.reddit"),
    youtube: t("admin.youtube"),
    instagram: t("admin.instagram"),
    twitter: t("admin.twitter"),
    referral: t("admin.referral"),
    direct: t("admin.direct"),
    other: t("admin.other"),
  };
  return map[key] || key;
}

function authLabel(key, t) {
  if (key === "google") return t("admin.googleAuth");
  if (key === "email") return t("admin.emailAuth");
  return t("admin.otherAuth");
}

function when(value, locale, t) {
  if (!value) return t("admin.notYet");
  return formatAppDateTime(value, locale) || String(value);
}

function riskTone(level) {
  if (level === "critical") return "critical";
  if (level === "high") return "high";
  if (level === "watch") return "watch";
  return "low";
}

export default function AdminUserDossier({ userId, onRefreshInbox, highlightReportId = null }) {
  const { t, locale } = useLocale();
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch(`/people/${userId}/dossier`);
      setDossier(data);
    } catch (err) {
      setError(err.message || t("admin.dossierLoadError"));
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const act = async (fn, success) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await fn();
      setOk(success);
      setAction(null);
      setMessage("");
      await load();
      onRefreshInbox?.();
    } catch (err) {
      setError(err.message || t("admin.dossierActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const identity = dossier?.identity || {};
  const signup = dossier?.signup || {};
  const risk = dossier?.risk || { score: 0, level: "low", flags: [] };
  const wallet = dossier?.wallet || { balance: 0, frozen: false, ledger: [] };
  const reports = dossier?.reports || { against: [], filed: [], openCount: 0 };
  const moderation = dossier?.moderation || { history: [] };
  const dima = dossier?.dima || {};

  const flagLabels = useMemo(() => ({
    repeat_reports: t("admin.riskRepeatReports"),
    open_reports: t("admin.riskOpenReports"),
    report_history: t("admin.riskReportHistory"),
    banned: t("admin.riskBanned"),
    timeout: t("admin.riskTimeout"),
    suspicious_signup: t("admin.riskSuspicious"),
    prior_sanctions: t("admin.riskSanctions"),
  }), [t]);

  if (!userId) return null;

  return (
    <div className="dossier">
      {loading && !dossier ? (
        <div className="dossier-skeleton" aria-busy="true">
          <SkeletonLine width="40%" height={22} />
          <SkeletonLine width="70%" height={14} />
          <div className="dossier-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dossier-card">
                <SkeletonLine width="32%" height={10} />
                <SkeletonLine width="78%" height={14} />
                <SkeletonLine width="54%" height={14} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="admin-error-banner">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : null}
      {ok ? <div className="dossier-ok">{ok}</div> : null}

      {dossier ? (
        <>
          <header className="dossier-hero">
            <div className="dossier-hero-id">
              <Avatar
                name={identity.displayName || identity.username || "?"}
                size={56}
                user={{ avatarUrl: identity.avatarUrl, username: identity.username, displayName: identity.displayName }}
              />
              <div>
                <div className="dossier-name-row">
                  <h2>{identity.displayName || identity.username}</h2>
                  <span className={`dossier-risk dossier-risk-${riskTone(risk.level)}`}>
                    {t(`admin.risk.${risk.level}`)} · {risk.score}
                  </span>
                </div>
                <p className="muted">
                  @{identity.username}
                  {identity.email ? ` · ${identity.email}` : ""}
                  {identity.isAdmin ? ` · ${t("admin.adminBadge")}` : ""}
                </p>
                <p className="dossier-presence">
                  <span className={`dossier-dot ${identity.presence?.status === "offline" ? "off" : "on"}`} />
                  {identity.presence?.status === "offline"
                    ? `${t("admin.lastSeen")}: ${when(identity.lastSeen, locale, t)}`
                    : t("Online Now")}
                </p>
              </div>
            </div>
            <div className="dossier-hero-actions">
              <RippleButton type="button" className="refresh-btn" onClick={() => load()} disabled={busy}>
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                {t("common.refresh")}
              </RippleButton>
              <button type="button" className="dossier-act amber" disabled={busy} onClick={() => setAction("timeout")}>
                <Timer size={14} /> {t("Timeout")}
              </button>
              <button type="button" className="dossier-act red" disabled={busy} onClick={() => setAction("ban")}>
                <Ban size={14} /> {t("Ban")}
              </button>
              <button
                type="button"
                className="dossier-act slate"
                disabled={busy}
                onClick={() =>
                  act(
                    () => adminFetch(`/users/${userId}/kick`, { method: "POST", body: JSON.stringify({}) }),
                    t("User kicked")
                  )
                }
              >
                <UserX size={14} /> {t("Kick")}
              </button>
              <button
                type="button"
                className={`dossier-act ${wallet.frozen ? "green" : "violet"}`}
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      adminFetch(`/people/${userId}/wallet-freeze`, {
                        method: "POST",
                        body: JSON.stringify({ frozen: !wallet.frozen }),
                      }),
                    wallet.frozen ? t("admin.walletUnfrozen") : t("admin.walletFrozen")
                  )
                }
              >
                {wallet.frozen ? <LockOpen size={14} /> : <Lock size={14} />}
                {wallet.frozen ? t("admin.unfreezeWallet") : t("admin.freezeWallet")}
              </button>
              <button
                type="button"
                className="dossier-act slate"
                disabled={busy || identity.isAdmin}
                onClick={() =>
                  act(
                    () => adminFetch(`/people/${userId}/revoke-sessions`, { method: "POST", body: JSON.stringify({}) }),
                    t("admin.sessionsRevoked")
                  )
                }
              >
                <LogOut size={14} /> {t("admin.signOutSessions")}
              </button>
            </div>
          </header>

          {risk.flags?.length ? (
            <div className="dossier-flags">
              {risk.flags.map((f) => (
                <span key={f} className="dossier-flag">{flagLabels[f] || f}</span>
              ))}
            </div>
          ) : null}

          {action ? (
            <div className="dossier-sanction">
              <strong>{action === "ban" ? t("Ban") : t("Timeout")}</strong>
              <input
                className="admin-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("Optional message the user will see")}
              />
              <div className="dossier-sanction-row">
                <RippleButton
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        adminFetch(`/users/${userId}/${action}`, {
                          method: "POST",
                          body: JSON.stringify({
                            category: reports.against[0]?.reason || "other",
                            message: message.trim() || undefined,
                            presetId: action === "ban" ? "permanent" : "1h",
                          }),
                        }),
                      action === "ban" ? t("User banned") : t("User timed out")
                    )
                  }
                >
                  {action === "ban" ? t("Ban") : t("Timeout")} · {action === "ban" ? t("Permanent") : "1h"}
                </RippleButton>
                <button type="button" className="dossier-act slate" onClick={() => setAction(null)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="dossier-grid">
            <section className="dossier-card">
              <h3><Globe size={15} /> {t("admin.dossierIdentity")}</h3>
              <dl>
                <div><dt>{t("admin.signupDate")}</dt><dd>{when(signup.at || identity.createdAt, locale, t)}</dd></div>
                <div><dt>{t("admin.authMethod")}</dt><dd>{authLabel(signup.authMethod, t)}</dd></div>
                <div><dt>{t("admin.firstSource")}</dt><dd>{sourceLabel(signup.firstSource, t)}</dd></div>
                <div><dt>{t("admin.campaign")}</dt><dd>{signup.campaign || t("common.unknown")}</dd></div>
                <div><dt>{t("admin.device")}</dt><dd>{[signup.device, signup.os, signup.browser].filter(Boolean).join(" · ") || t("common.unknown")}</dd></div>
                <div><dt>{t("admin.country")}</dt><dd>{signup.country || t("common.unknown")}</dd></div>
              </dl>
            </section>

            <section className="dossier-card">
              <h3><Monitor size={15} /> {t("admin.dossierSessions")}</h3>
              <p className="muted">{t("admin.liveSockets", { count: dossier.sockets?.length || 0 })}</p>
              {(dossier.sessions || []).length === 0 ? (
                <p className="muted">{t("admin.noSessions")}</p>
              ) : (
                <ul className="dossier-list">
                  {(dossier.sessions || []).map((s) => (
                    <li key={s.id}>
                      <Smartphone size={13} />
                      <div>
                        <strong>{s.device || t("common.unknown")}</strong>
                        <span>{s.ip || "—"} · {when(s.lastActiveAt || s.createdAt, locale, t)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dossier-card">
              <h3><Wallet size={15} /> {t("admin.dossierWallet")}</h3>
              <p className="dossier-balance">
                <Coins size={16} /> {Number(wallet.balance || 0).toLocaleString()}
                {wallet.frozen ? <span className="dossier-frozen">{t("admin.frozen")}</span> : null}
              </p>
              {(wallet.ledger || []).length === 0 ? (
                <p className="muted">{t("admin.noLedger")}</p>
              ) : (
                <ul className="dossier-list compact">
                  {wallet.ledger.slice(0, 8).map((row) => (
                    <li key={row.id}>
                      <span className={row.amount >= 0 ? "pos" : "neg"}>
                        {row.amount >= 0 ? "+" : ""}{row.amount}
                      </span>
                      <div>
                        <strong>{row.reason}</strong>
                        <span>{when(row.created_at, locale, t)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dossier-card">
              <h3><Sparkles size={15} /> {t("admin.dossierDima")}</h3>
              {dima.unavailable ? (
                <p className="muted">{t("admin.dimaUnavailable")}</p>
              ) : (
                <dl>
                  <div><dt>{t("admin.dimaChats")}</dt><dd>{dima.conversationCount || 0}</dd></div>
                  <div><dt>{t("admin.dimaMessages")}</dt><dd>{dima.messageCount || 0}</dd></div>
                  <div><dt>{t("admin.dimaLast")}</dt><dd>{when(dima.lastUsedAt, locale, t)}</dd></div>
                </dl>
              )}
            </section>

            <section className="dossier-card span-2">
              <h3><Flag size={15} /> {t("admin.dossierReports")} ({reports.openCount || 0} {t("admin.open")})</h3>
              {(reports.against || []).length === 0 ? (
                <p className="muted">{t("admin.noReportsAgainst")}</p>
              ) : (
                <ul className="dossier-report-list">
                  {reports.against.map((r) => (
                    <li key={r.id} className={highlightReportId === r.id ? "hot" : ""}>
                      <div>
                        <strong>@{r.reporterUsername || "?"}</strong>
                        <span className={`st ${r.status}`}>{r.status}</span>
                        <span className="muted">{r.reasonLabel}</span>
                      </div>
                      {r.snippet ? <blockquote>“{r.snippet}”</blockquote> : null}
                      <span className="muted">{when(r.createdAt, locale, t)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dossier-card span-2">
              <h3><History size={15} /> {t("admin.dossierModeration")}</h3>
              {moderation.banned ? (
                <p className="dossier-active-ban"><Shield size={14} /> {t("admin.currentlyBanned")}</p>
              ) : null}
              {moderation.timeout ? (
                <p className="dossier-active-to"><Clock size={14} /> {t("admin.currentlyTimedOut")} · {when(moderation.timeout.until, locale, t)}</p>
              ) : null}
              {(moderation.history || []).length === 0 ? (
                <p className="muted">{t("admin.noModHistory")}</p>
              ) : (
                <ul className="dossier-list">
                  {moderation.history.map((h) => (
                    <li key={h.id}>
                      <div>
                        <strong>{h.action_type}</strong>
                        <span>{h.categoryLabel || h.category} · {h.actorUsername || "—"} · {when(h.created_at, locale, t)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
