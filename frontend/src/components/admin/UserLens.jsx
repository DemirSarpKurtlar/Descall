import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, CheckCircle, ChevronDown, ChevronRight, Crown, Eye, EyeOff, Hash,
  Info, RefreshCw, Server, Users, Volume2, X, XCircle,
} from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import "../../styles/admin-lens.css";

/**
 * Kullanıcının gözünden (3.7.2). Opened from the dossier: what this account can
 * and cannot do right now (bans, platform switches) and, per server, which
 * channels it sees, can write in or join. No message content.
 * Data: GET /admin/people/:id/lens (lib/userLens.js).
 */
export const STATUS_ORDER = { blocked: 0, warn: 1, info: 2, ok: 3 };

export function sortChecks(checks) {
  return [...(checks || [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

/** "9 / 12" style summary plus whether anything is hidden. */
export function serverSummary(server) {
  const c = server?.counts || { total: 0, visible: 0, hidden: 0 };
  return { visible: c.visible, total: c.total, hasHidden: c.hidden > 0 };
}

const STATUS_ICON = { ok: CheckCircle, blocked: XCircle, warn: AlertTriangle, info: Info };

function CheckRow({ c, t, locale }) {
  const Icon = STATUS_ICON[c.status] || Info;
  let detail = "";
  if (c.id === "timeout" && c.until) detail = t("admin.lensUntil", { when: formatAppDateTime(c.until, locale) });
  if (c.id === "accessBan" && c.ban) detail = `${c.ban.label}${c.ban.expiresAt ? ` · ${t("admin.lensUntil", { when: formatAppDateTime(c.ban.expiresAt, locale) })}` : ""}`;
  if (c.id === "rateLimits") {
    const parts = [];
    if (c.slowModeSeconds) parts.push(t("admin.lensSlow", { n: c.slowModeSeconds }));
    if (c.perMinute) parts.push(t("admin.lensPerMinute", { n: c.perMinute }));
    detail = parts.join(" · ");
  }
  return (
    <li className={`ulx-check is-${c.status}`}>
      <Icon size={16} />
      <span className="ulx-check-text">
        <strong>{t(`admin.lens_${c.id}_${c.status}`)}</strong>
        {detail ? <em>{detail}</em> : null}
      </span>
    </li>
  );
}

function ServerRow({ s, t, locale }) {
  const [open, setOpen] = useState(false);
  const sum = serverSummary(s);
  return (
    <li className="ulx-server">
      <button type="button" className="ulx-server-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="ulx-server-name">
          {s.owner ? <Crown size={13} className="ulx-crown" /> : null}
          {s.name}
        </span>
        <span className={`ulx-count ${sum.hasHidden ? "has-hidden" : ""}`}>
          {t("admin.lensSees", { visible: sum.visible, total: sum.total })}
        </span>
      </button>
      <div className="ulx-server-meta">
        {s.roles?.length ? s.roles.map((r) => (
          <span key={r.id} className="ulx-role" style={r.color ? { "--role": r.color } : undefined}>{r.name}</span>
        )) : <span className="ulx-role is-none">{t("admin.lensNoRoles")}</span>}
        {s.timeoutUntil ? <span className="ulx-role is-bad">{t("admin.lensServerTimeout", { when: formatAppDateTime(s.timeoutUntil, locale) })}</span> : null}
      </div>
      {open ? (
        <ul className="ulx-channels">
          {s.channels.map((c) => {
            if (c.type === "category") return <li key={c.id} className="ulx-cat">{c.name}</li>;
            const voice = /voice|stage/.test(c.type);
            const Kind = voice ? Volume2 : Hash;
            let note = "";
            if (!c.view) note = t("admin.lensHidden");
            else if (voice && !c.connect) note = t("admin.lensNoConnect");
            else if (!voice && !c.send) note = t("admin.lensReadOnly");
            return (
              <li key={c.id} className={`ulx-ch ${c.view ? "" : "is-hidden"}`}>
                <Kind size={13} />
                <span>{c.name}</span>
                {c.view ? <Eye size={13} className="ulx-eye" /> : <EyeOff size={13} className="ulx-eye" />}
                {note ? <em>{note}</em> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export default function UserLens({ userId, onClose }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setErr("");
    adminFetch(`/people/${encodeURIComponent(userId)}/lens`)
      .then(setData)
      .catch((e) => setErr(e?.message || t("admin.loadError")))
      .finally(() => setLoading(false));
  };
  useEffect(load, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const u = data?.user;
  const social = data?.social;
  const notif = social?.notifications;
  return (
    <OverlayPortal>
      <div className="ulx-scrim" onClick={onClose} role="presentation">
        <aside className="ulx-drawer" role="dialog" aria-modal="true" aria-label={t("admin.lensTitle")} onClick={(e) => e.stopPropagation()}>
          <header className="ulx-head">
            {u ? <Avatar user={{ ...u, avatar_url: u.avatarUrl }} name={u.username} size={40} /> : <span className="ulx-ph" />}
            <div>
              <h3>{t("admin.lensTitle")}</h3>
              <p>{u ? `@${u.username}` : ""}{data?.generatedAt ? ` · ${formatAppDateTime(data.generatedAt, locale)}` : ""}</p>
            </div>
            <button type="button" className="ulx-icon" onClick={load} aria-label={t("Refresh")} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
            <button type="button" className="ulx-icon" onClick={onClose} aria-label={t("Close")}><X size={18} /></button>
          </header>
          <p className="ulx-note">{t("admin.lensNote")}</p>
          {err ? <p className="admin-inline-error">{err}</p> : null}
          {loading && !data ? <p className="muted ulx-pad">{t("Loading...")}</p> : null}
          {data ? (
            <>
              <section className="ulx-sec">
                <h4>{t("admin.lensNow")}</h4>
                <ul className="ulx-checks">
                  {sortChecks(data.checks).map((c) => <CheckRow key={c.id} c={c} t={t} locale={locale} />)}
                </ul>
              </section>
              <section className="ulx-sec">
                <h4><Server size={14} /> {t("admin.lensServers", { n: data.servers?.list?.length || 0 })}</h4>
                {data.servers?.available === false ? <p className="muted">{t("admin.lensUnavailable")}</p> : null}
                {data.servers?.list?.length ? (
                  <ul className="ulx-servers">
                    {data.servers.list.map((s) => <ServerRow key={s.id} s={s} t={t} locale={locale} />)}
                  </ul>
                ) : data.servers?.available ? <p className="muted">{t("admin.lensNoServers")}</p> : null}
                {data.servers?.truncated ? <p className="muted">{t("admin.lensTruncated")}</p> : null}
              </section>
              <section className="ulx-sec">
                <h4><Users size={14} /> {t("admin.lensSocial")}</h4>
                {social?.available ? (
                  <dl className="ulx-facts">
                    <div><dt>{t("admin.lensFriends")}</dt><dd>{social.friends}</dd></div>
                    <div><dt>{t("admin.lensRequests")}</dt><dd>{social.requestsIn} / {social.requestsOut}</dd></div>
                    <div><dt>{t("admin.lensBlocks")}</dt><dd>{social.blocks}</dd></div>
                    <div><dt>{t("admin.lensBlockedBy")}</dt><dd>{social.blockedBy ?? "-"}</dd></div>
                    <div><dt>{t("admin.lensSessions")}</dt><dd>{data.sessions}</dd></div>
                  </dl>
                ) : <p className="muted">{t("admin.lensUnavailable")}</p>}
                {notif ? (
                  <p className="ulx-notif">
                    <Bell size={13} />
                    {["dm", "groups", "calls", "mentions", "friend_requests"].map((k) => (
                      <span key={k} className={notif[k] === false ? "is-off" : ""}>{t(`admin.lensNotif_${k}`)}</span>
                    ))}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </OverlayPortal>
  );
}
