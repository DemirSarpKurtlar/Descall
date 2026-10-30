/**
 * Ayarlar › Gizlilik › Verilerin (3.6.0, KVKK md. 11): download a copy of
 * everything Descall keeps about the account as one JSON file. The server asks
 * for the password again (or the authenticator code when there is no
 * password); at most 3 exports a day. Server: backend/routes/dataExport.js.
 */
import { useEffect, useState } from "react";
import { authedRequest } from "../../api/authedHttp";
import { getTwoFactorStatus } from "../../api/security";
import { saveJsonFile } from "../../lib/saveFile";
import { useLocale } from "../../context/LocaleContext";
import { Download, FileText } from "../ui/Icon.jsx";
import "../../styles/data-export.css";

export default function DataExportCard({ username }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [needs, setNeeds] = useState(null); // "password" | "code" | "none"
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!open || needs) return;
    getTwoFactorStatus()
      .then((s) => setNeeds(s?.hasPassword ? "password" : s?.totpEnabled ? "code" : "none"))
      .catch(() => setNeeds("password"));
  }, [open, needs]);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = needs === "password" ? { password: secret } : needs === "code" ? { code: secret } : {};
      const data = await authedRequest("/api/me/data-export", { method: "POST", body });
      const day = new Date().toISOString().slice(0, 10);
      const name = `descall-verilerim-${String(username || data?.account?.username || "hesap").replace(/[^A-Za-z0-9_.-]/g, "_")}-${day}.json`;
      const how = await saveJsonFile(name, data);
      if (how !== "cancelled") {
        setMsg({ ok: true, text: t("dex.done") });
        setSecret("");
        setOpen(false);
      }
    } catch (e) {
      setMsg({ ok: false, text: e?.message || t("dex.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="us-card stack dex-card">
      <div className="us-row">
        <div className="us-row-text">
          <span className="us-row-icon" aria-hidden>
            <FileText size={16} />
          </span>
          <div className="us-row-copy">
            <span className="us-row-title">{t("dex.title")}</span>
            <span className="us-row-desc">{t("dex.desc")}</span>
          </div>
        </div>
        {!open ? (
          <button type="button" className="us-btn" onClick={() => setOpen(true)}>
            <Download size={15} /> {t("dex.start")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="dex-confirm">
          {needs === "password" || needs === "code" ? (
            <label className="dex-field">
              <span>{needs === "password" ? t("dex.password") : t("dex.code")}</span>
              <input
                type={needs === "password" ? "password" : "text"}
                inputMode={needs === "code" ? "numeric" : undefined}
                autoComplete={needs === "password" ? "current-password" : "one-time-code"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && secret) run();
                }}
              />
            </label>
          ) : needs === "none" ? (
            <p className="us-row-desc">{t("dex.noSecret")}</p>
          ) : (
            <p className="us-row-desc">{t("Loading...")}</p>
          )}
          <p className="us-row-desc">{t("dex.contents")}</p>
          <div className="dex-actions">
            <button type="button" className="us-btn ghost" disabled={busy} onClick={() => { setOpen(false); setSecret(""); }}>
              {t("Cancel")}
            </button>
            <button type="button" className="us-btn primary" disabled={busy || !needs || ((needs === "password" || needs === "code") && !secret)} onClick={run}>
              <Download size={15} /> {busy ? t("dex.preparing") : t("dex.download")}
            </button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p className={msg.ok ? "dex-ok" : "dex-err"} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
