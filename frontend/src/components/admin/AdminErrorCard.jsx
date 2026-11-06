/**
 * Inline glass error card for the admin panel: one icon tile, title, one line and
 * "Tekrar dene". Used when a section fails to load (Genel Bakış) and as the fallback of
 * the per-section ErrorBoundary, so the side menu always stays in place.
 */
import { AlertCircle, RefreshCw } from "../ui/Icon.jsx";
import ErrorBoundary from "../ErrorBoundary";
import { useLocale } from "../../context/LocaleContext";

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

/** One admin section that crashes shows the card in place; the panel keeps working. */
export function AdminSectionBoundary({ resetKey, children }) {
  const { t } = useLocale();
  return (
    <ErrorBoundary
      scope="pane"
      resetKey={resetKey}
      fallback={({ retry, supportCode }) => (
        <AdminErrorCard
          title={t("admin.sectionErrorTitle")}
          body={t("admin.sectionErrorBody")}
          code={supportCode}
          onRetry={retry}
          retryLabel={t("common.retry")}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
