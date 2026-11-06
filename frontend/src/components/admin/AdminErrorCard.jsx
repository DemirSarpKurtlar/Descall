/**
 * Inline glass error card for the admin panel: one icon tile, title, one line and
 * "Tekrar dene". Used when a section fails to load (Genel Bakış) and as the fallback of
 * the per-section ErrorBoundary, so the side menu always stays in place.
 */
import { AlertCircle, RefreshCw } from "../ui/Icon.jsx";
import ErrorBoundary from "../ErrorBoundary";
import { t } from "../../i18n/runtime";

export default function AdminErrorCard({ title, body, onRetry, retryLabel, busy = false, code = "" }) {
  return (
    <div className="adm-error-card" role="alert">
      <span className="adm-error-icon" aria-hidden="true">
        <AlertCircle size={22} />
      </span>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {code ? <p className="adm-error-ref tnum">{code}</p> : null}
      {onRetry ? (
        <button type="button" className="adm-error-retry" onClick={onRetry} disabled={busy}>
          <RefreshCw size={15} className={busy ? "spin" : ""} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * One admin section that crashes shows the card in place; the panel keeps working.
 * Extends the app ErrorBoundary (same Sentry + /api/errors report, same pane reset on
 * resetKey) and only swaps the crash screen for the inline card, so nothing is added
 * to the marketing first paint.
 */
export class AdminSectionBoundary extends ErrorBoundary {
  render() {
    if (!this.state.hasError) return super.render();
    return (
      <AdminErrorCard
        title={t("admin.sectionErrorTitle")}
        body={t("admin.sectionErrorBody")}
        code={this.state.supportCode || ""}
        onRetry={this.handleRetry}
        retryLabel={t("common.retry")}
      />
    );
  }
}

