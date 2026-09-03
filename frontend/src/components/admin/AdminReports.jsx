import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Flag, RefreshCw, Timer, FolderOpen } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import RippleButton from "../ui/RippleButton";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import AdminUserDossier from "./AdminUserDossier";

export default function AdminReports({ onOpenDossier, selectedUserId, onSelectUser }) {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState("open");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoOpened, setAutoOpened] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await adminFetch(`/reports?status=${encodeURIComponent(status)}`);
      setPayload(data);
    } catch (err) {
      setError(err.message || t("admin.reportsLoadError"));
    } finally {
      setBusy(false);
    }
  }, [status, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const id = payload?.autoOpenUserId;
    if (!id || autoOpened === id) return;
    setAutoOpened(id);
    onSelectUser?.(id);
    onOpenDossier?.(id);
  }, [payload?.autoOpenUserId, autoOpened, onSelectUser, onOpenDossier]);

  const act = async (fn, success) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await fn();
      setOk(success);
      await load();
    } catch (err) {
      setError(err.message || t("admin.dossierActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const groups = payload?.groups || [];
  const hot = payload?.autoOpenUserId;

  return (
    <section className="admin-section admin-section-full reports-suite">
      <div className="mod-suite-head">
        <div>
          <h2>{t("admin.reportsTitle")}</h2>
          <p className="muted">{t("admin.reportsSubtitle")}</p>
        </div>
        <RippleButton type="button" onClick={() => load()} disabled={busy} className="refresh-btn">
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          {t("common.refresh")}
        </RippleButton>
      </div>

      <div className="mod-panel-tabs">
        {["open", "actioned", "dismissed", "all"].map((id) => (
          <button
            key={id}
            type="button"
            className={`mod-panel-tab ${status === id ? "active" : ""}`}
            onClick={() => setStatus(id)}
          >
            {t(`admin.reportStatus.${id}`)}
            {id === "open" && payload?.openCount ? ` · ${payload.openCount}` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <div className="admin-error-banner">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : null}
      {ok ? <div className="dossier-ok">{ok}</div> : null}

      {hot && status === "open" ? (
        <div className="reports-auto-banner">
          <Flag size={16} />
          {t("admin.reportsAutoOpen")}
        </div>
      ) : null}

      {groups.length === 0 && !busy ? (
        <div className="people-empty">
          <Flag size={28} />
          <h3>{t("admin.reportsEmptyTitle")}</h3>
          <p>{t("admin.reportsEmptyBody")}</p>
        </div>
      ) : (
        <div className="reports-layout">
          <div className="reports-queue">
            {groups.map((g) => (
              <article key={g.targetId} className={`report-group ${g.targetId === selectedUserId ? "active" : ""} ${g.openCount >= 3 ? "hot" : ""}`}>
                <header>
                  <button type="button" className="report-group-id" onClick={() => onSelectUser?.(g.targetId)}>
                    <Avatar
                      name={g.targetDisplayName || g.targetUsername || "?"}
                      size={36}
                      user={{ avatarUrl: g.targetAvatarUrl, username: g.targetUsername }}
                    />
                    <div>
                      <strong>@{g.targetUsername || "?"}</strong>
                      <span>
                        {g.openCount} {t("admin.open")} · {g.totalCount} {t("admin.total")}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="dossier-act slate"
                    onClick={() => {
                      onSelectUser?.(g.targetId);
                      onOpenDossier?.(g.targetId);
                    }}
                  >
                    <FolderOpen size={14} /> {t("admin.openDossier")}
                  </button>
                </header>
                <ul>
                  {(g.reports || []).map((r) => (
                    <li key={r.id}>
                      <div className="report-meta">
                        <strong>@{r.reporterUsername || "?"}</strong>
                        <span>{r.reasonLabel}</span>
                        <time>{formatAppDateTime(r.createdAt, locale) || r.createdAt}</time>
                      </div>
                      {r.snippet ? <blockquote>“{r.snippet}”</blockquote> : null}
                      {r.note ? <p className="muted">{r.note}</p> : null}
                      {r.status === "open" ? (
                        <div className="report-actions">
                          <button
                            type="button"
                            className="dossier-act slate"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => adminFetch(`/reports/${r.id}/dismiss`, { method: "POST", body: JSON.stringify({}) }),
                                t("admin.reportDismissed")
                              )
                            }
                          >
                            <Check size={13} /> {t("admin.dismiss")}
                          </button>
                          <button
                            type="button"
                            className="dossier-act amber"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => adminFetch(`/reports/${r.id}/timeout`, { method: "POST", body: JSON.stringify({ presetId: "1h" }) }),
                                t("User timed out")
                              )
                            }
                          >
                            <Timer size={13} /> {t("Timeout")}
                          </button>
                          <button
                            type="button"
                            className="dossier-act red"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => adminFetch(`/reports/${r.id}/ban`, { method: "POST", body: JSON.stringify({ presetId: "permanent" }) }),
                                t("User banned")
                              )
                            }
                          >
                            <Ban size={13} /> {t("Ban")}
                          </button>
                        </div>
                      ) : (
                        <span className={`st ${r.status}`}>{r.status}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          {selectedUserId ? (
            <AdminUserDossier userId={selectedUserId} onRefreshInbox={load} />
          ) : null}
        </div>
      )}
    </section>
  );
}
