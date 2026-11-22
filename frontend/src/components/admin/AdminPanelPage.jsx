/**
 * /admin/panel: the standalone page the Electron "Descall Yönetici" window loads
 * (main.jsx boots only this, not the whole app). The main Descall window stays
 * usable while it is open. The server still decides who is an admin: every
 * admin route checks the session, this page only picks what to render.
 */
import { useEffect, useState } from "react";
import { getMe } from "../../api/auth";
import { getToken } from "../../lib/storage";
import { createSocket } from "../../socket";
import { useLocale } from "../../context/LocaleContext";
import AdminPanel from "./AdminPanel.jsx";
import "../../styles/admin-shell.css";

function closeWindow() {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  if (api?.closeWindow) api.closeWindow();
  else window.close();
}

export default function AdminPanelPage() {
  const { t } = useLocale();
  const [me, setMe] = useState(undefined);
  const [bootTry, setBootTry] = useState(0);
  const [socket, setSocket] = useState(null);

  const pageTitle = t("adminx.panel.windowTitle");
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    document.documentElement.classList.add("adm-window");
    // Same theme / font as the main window (App.jsx does this for the full app).
    Promise.all([import("../../lib/appearanceSync.js"), import("../../lib/appearancePrefs.js")])
      .then(([sync, prefs]) => sync.applyStoredAppearance({ premium: prefs.readStoredSettings().premiumThemeKey || null }))
      .catch(() => {});
    const token = getToken();
    if (!token) {
      setMe(null);
      return undefined;
    }
    const ctrl = new AbortController();
    getMe(token, { signal: ctrl.signal })
      .then((res) => setMe(res?.user || res || null))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        // A network blip is not "signed out": offer a retry (polish admin-b-12).
        const status = Number(err?.status) || 0;
        if (status === 401 || status === 403) setMe(null);
        else setMe("error");
      });
    return () => ctrl.abort();
  }, [bootTry]);

  const isFullAdmin = me !== "error" && Boolean(me?.is_admin || me?.username === "admin");

  // Live admin updates (admin:sync / feedback:new). The panel also works without it.
  useEffect(() => {
    if (!isFullAdmin) return undefined;
    const token = getToken();
    if (!token) return undefined;
    let s = null;
    try {
      s = createSocket(token);
      setSocket(s);
    } catch {
      setSocket(null);
    }
    return () => {
      try { s?.disconnect?.(); } catch { /* window closing */ }
    };
  }, [isFullAdmin]);

  if (me === "error") {
    return (
      <div className="adm adm-desktop is-standalone adm-state" data-tauri-drag-region="deep" role="alert">
        <p>{t("admin.windowOffline")}</p>
        <button type="button" className="adm-state-btn" onClick={() => { setMe(undefined); setBootTry((n) => n + 1); }}>{t("Try again")}</button>
        <button type="button" className="adm-state-btn" onClick={closeWindow}>{t("Close")}</button>
      </div>
    );
  }
  if (me === undefined) {
    return <div className="adm adm-desktop is-standalone adm-state" data-tauri-drag-region="deep" role="status">{t("Loading...")}</div>;
  }
  if (!isFullAdmin) {
    return (
      <div className="adm adm-desktop is-standalone adm-state" data-tauri-drag-region="deep" role="alert">
        <p>{me ? t("admin.windowForbidden") : t("admin.windowSignIn")}</p>
        <button type="button" className="adm-state-btn" onClick={closeWindow}>{t("Close")}</button>
      </div>
    );
  }
  return (
    <AdminPanel
      standalone
      socket={socket}
      viewerUsername={me?.username}
      onClose={closeWindow}
    />
  );
}
