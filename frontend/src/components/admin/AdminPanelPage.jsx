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
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    document.title = "Descall Yönetici";
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
      .catch(() => setMe(null));
    return () => ctrl.abort();
  }, []);

  const isFullAdmin = Boolean(me?.is_admin || me?.username === "admin");

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

  if (me === undefined) {
    return <div className="adm adm-desktop is-standalone adm-state" role="status">{t("Loading...")}</div>;
  }
  if (!isFullAdmin) {
    return (
      <div className="adm adm-desktop is-standalone adm-state" role="alert">
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
