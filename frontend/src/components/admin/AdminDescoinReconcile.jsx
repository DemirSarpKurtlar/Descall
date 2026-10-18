import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Scale, XCircle } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { useT } from "../../context/LocaleContext";

/**
 * DesCoin reconciliation (2.11.2). Read-only: shows the daily comparison of each user's
 * balance with the sum of their descoin_ledger rows. It never changes a balance; an admin
 * corrects drift by hand with "Grant / revoke DesCoin" below if needed.
 */
export default function AdminDescoinReconcile() {
  const t = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminFetch("/descoin/reconciliation"));
    } catch (e) {
      setError(e.message || t("Failed to load reconciliation."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      await adminFetch("/descoin/reconciliation/run", { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      setError(e.message || t("Reconciliation failed."));
    } finally {
      setRunning(false);
    }
  };

  const latest = data?.latest || null;
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : "-");

  return (
    <div className="admin-card admin-descoin-reconcile" data-testid="descoin-reconcile">
      <div className="activity-header">
        <h3><Scale size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} /> {t("DesCoin reconciliation")}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <RippleButton type="button" onClick={load} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} /> {t("Refresh")}
          </RippleButton>
          <RippleButton type="button" onClick={runNow} disabled={running} className="refresh-btn">
            <Scale size={16} /> {running ? t("Running…") : t("Run now")}
          </RippleButton>
        </div>
      </div>
      <p className="activity-subtitle">
        {t("Daily read-only check: each balance vs. the sum of its ledger rows. Balances are never changed automatically.")}
      </p>
      {error && (
        <div className="admin-feedback-error-banner"><XCircle size={15} /><span>{error}</span></div>
      )}
      {data?.notInstalled && <p className="activity-subtitle">{t("Reconciliation table is not installed yet.")}</p>}
      {latest && (
        <>
          <div className="admin-descoin-reconcile-summary" style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "8px 0" }}>
            {latest.error ? (
              <span style={{ color: "var(--danger, #ef4444)" }}><XCircle size={14} /> {t("Last run failed")}: {latest.error}</span>
            ) : latest.mismatch_count > 0 ? (
              <span style={{ color: "var(--warning, #f59e0b)" }}><AlertTriangle size={14} /> {t("{n} mismatched balance(s)", { n: latest.mismatch_count })}</span>
            ) : (
              <span style={{ color: "var(--success, #22c55e)" }}><CheckCircle2 size={14} /> {t("All balances match the ledger")}</span>
            )}
            <span>{t("Last run")}: {when(latest.started_at)} ({latest.trigger})</span>
            <span>{t("Users checked")}: {latest.users_checked}</span>
            <span>{t("Ledger rows")}: {latest.ledger_rows}</span>
            <span>{t("Total drift")}: {latest.abs_drift} DC</span>
          </div>
          {latest.mismatches?.length > 0 && (
            <div className="admin-table-wrap" style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("User")}</th><th>{t("Balance")}</th><th>{t("Ledger sum")}</th>
                    <th>{t("Drift")}</th><th>{t("Ledger rows")}</th><th>{t("Last balance_after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.mismatches.map((m) => (
                    <tr key={m.user_id}>
                      <td title={m.user_id}>{m.user?.username || m.user_id}{m.user?.descoin_frozen ? " (frozen)" : ""}</td>
                      <td>{m.balance}</td><td>{m.ledger_sum}</td>
                      <td style={{ color: m.drift > 0 ? "var(--warning, #f59e0b)" : "var(--danger, #ef4444)" }}>{m.drift > 0 ? `+${m.drift}` : m.drift}</td>
                      <td>{m.ledger_rows}</td><td>{m.last_balance_after ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.history?.length > 1 && (
            <details style={{ marginTop: 8 }}>
              <summary>{t("Previous runs")}</summary>
              <ul className="admin-descoin-reconcile-history">
                {data.history.slice(1).map((r) => (
                  <li key={r.id}>{when(r.started_at)}: {r.error ? `${t("failed")} (${r.error})` : t("{n} mismatched balance(s)", { n: r.mismatch_count })} · {r.trigger}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {!latest && !data?.notInstalled && !loading && <p className="activity-subtitle">{t("No reconciliation run yet.")}</p>}
    </div>
  );
}
