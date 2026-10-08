import { useState } from "react";
import { Ban } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { confirmToggleBlock, useIsBlocked } from "../../lib/blockedUsers";

/** Block / Unblock toggle used in the profile popout and the DM header. */
export default function BlockUserButton({ userId, username, className = "user-profile-report-btn", iconSize = 13, compact = false, onChange }) {
  const t = useT();
  const blocked = useIsBlocked(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!userId) return null;
  const label = blocked ? t("Unblock") : t("Block");
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-pressed={blocked}
        title={label}
        aria-label={label}
        onClick={async () => {
          setError("");
          setBusy(true);
          try {
            const next = await confirmToggleBlock({ userId, username, t });
            if (next !== null) onChange?.(next);
          } catch (err) {
            setError(err?.message || t("Something went wrong."));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Ban size={iconSize} />
        {compact ? null : <> {label}</>}
      </button>
      {error && !compact ? (
        <p className="auth-field-hint" role="alert" style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}
    </>
  );
}
