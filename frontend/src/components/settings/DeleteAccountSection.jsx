import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { deleteAccount } from "../../api/security";
import { hapticError, hapticWarning } from "../../lib/fluid/haptics";
import useGlassUi from "../../hooks/useGlassUi";
import GlassConfirm from "../ui/GlassConfirm";

/**
 * Settings → Security → Delete account (App Store Guideline 5.1.1(v)).
 * The account closes immediately; it is permanently deleted after 14 days
 * unless the user signs in again.
 */
export default function DeleteAccountSection({ onDeleted }) {
  const t = useT();
  const glass = useGlassUi();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open && !glass) hapticWarning();
  }, [open, glass]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!secret.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteAccount({ password: secret, confirmUsername: secret });
      onDeleted?.();
    } catch (err) {
      hapticError();
      setError(err?.message || t("Could not delete your account. Try again."));
      setBusy(false);
    }
  };

  return (
    <section className="us-section">
      <h4 className="us-section-label">{t("Danger zone")}</h4>
      <div className="us-card stack" style={{ padding: 14 }}>
        <p className="us-muted" style={{ margin: "0 0 10px" }}>
          {t("Deleting your account signs you out everywhere right away. After 14 days your profile, email, friends and private data are permanently deleted. Messages you sent in shared chats stay as \u201cDeleted user\u201d. Signing in again within 14 days cancels the deletion.")}
        </p>
        {!open ? (
          <button type="button" className="us-danger-btn" onClick={() => setOpen(true)}>
            <Trash2 size={14} /> {t("Delete account")}
          </button>
        ) : glass ? (
          <GlassConfirm
            title={t("Delete account")}
            message={t("Deleting your account signs you out everywhere right away. After 14 days your profile, email, friends and private data are permanently deleted. Messages you sent in shared chats stay as \u201cDeleted user\u201d. Signing in again within 14 days cancels the deletion.")}
            confirmLabel={busy ? t("Deleting…") : t("Permanently delete my account")}
            cancelLabel={t("Cancel")}
            danger
            busy={busy}
            error={error}
            confirmDisabled={!secret.trim()}
            onConfirm={() => submit()}
            onCancel={() => {
              if (busy) return;
              setOpen(false);
              setSecret("");
              setError("");
            }}
          >
            <label htmlFor="delete-account-confirm">
              {t("Enter your password to confirm (Google or Apple accounts: type your username)")}
              <input
                id="delete-account-confirm"
                type="password"
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
          </GlassConfirm>
        ) : (
          <form onSubmit={submit} className="us-field" style={{ display: "grid", gap: 8 }}>
            <label htmlFor="delete-account-confirm">
              {t("Enter your password to confirm (Google or Apple accounts: type your username)")}
            </label>
            <input
              id="delete-account-confirm"
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={busy}
            />
            {error && <p className="us-inline-notice" role="alert">{error}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="us-danger-btn" disabled={busy || !secret.trim()}>
                <Trash2 size={14} /> {busy ? t("Deleting…") : t("Permanently delete my account")}
              </button>
              <button type="button" className="us-btn ghost sm" onClick={() => { setOpen(false); setSecret(""); setError(""); }} disabled={busy}>
                {t("Cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
