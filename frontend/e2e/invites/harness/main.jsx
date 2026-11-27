/* Davet Merkezi harness (growth phase 4, 4A). The real invite components; every /api request
   is answered by capture.cjs (Playwright routes) with synthetic data. ?view=center|landing|
   welcome|admin, ?mode=desk|phone, ?theme=dark|light, ?lang=tr. */
import { createRoot } from "react-dom/client";
import "../../../src/styles.css";
import "../../../src/styles/design-tokens.css";
import { LocaleProvider } from "../../../src/context/LocaleContext.jsx";
import { ToastProvider } from "../../../src/context/ToastContext.jsx";
import { setToken } from "../../../src/lib/storage.js";
import InviteCenter from "../../../src/components/invites/InviteCenter.jsx";
import FriendInviteLanding from "../../../src/components/invites/FriendInviteLanding.jsx";
import InviteWelcome from "../../../src/components/invites/InviteWelcome.jsx";
import AdminInvites from "../../../src/components/admin/invites/AdminInvites.jsx";
import ProfileModalHost from "../../../src/components/social/UserProfileModal.jsx";
import { getInviteWelcome } from "../../../src/api/invites.js";
import { useEffect, useState } from "react";
import "../../../src/styles/invites.css";

const q = new URLSearchParams(location.search);
try {
  localStorage.setItem("descall_language", q.get("lang") || "tr");
} catch {
  /* ignore */
}
setToken("harness-token");
const theme = q.get("theme") === "light" ? "light" : "dark";
const view = q.get("view") || "center";
const phone = q.get("mode") === "phone";
document.documentElement.setAttribute("data-theme", theme);
Object.assign(document.body.style, {
  margin: "0",
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif',
  WebkitFontSmoothing: "antialiased",
  background:
    theme === "light"
      ? "radial-gradient(900px 600px at 20% -10%, rgba(88,122,245,.18), transparent 60%), #eef0f6"
      : "radial-gradient(900px 520px at 6% -8%, rgba(88,122,245,.24), transparent 70%), radial-gradient(760px 480px at 100% 6%, rgba(124,92,255,.15), transparent 70%), #0a0b10",
  color: theme === "light" ? "#14161c" : "#fff",
  minHeight: "100vh",
});
window.__nav = [];
const navigate = (p) => window.__nav.push(p);

function Welcome() {
  const [data, setData] = useState(null);
  useEffect(() => {
    getInviteWelcome().then(setData).catch(() => setData({ invited: false }));
  }, []);
  if (!data) return null;
  return <InviteWelcome data={data} mobile={phone} onClose={() => (window.__welcomeClosed = true)} onNavigate={navigate} />;
}

function App() {
  if (view === "landing") {
    return (
      <FriendInviteLanding
        username={q.get("u") || "ece"}
        search={location.search.includes("k=") ? `?k=${q.get("k")}` : ""}
        onSignup={(method, extra) => (window.__signup = { method, extra })}
        onLogin={() => (window.__login = true)}
        onDismiss={() => navigate("/")}
      />
    );
  }
  if (view === "welcome") return <Welcome />;
  if (view === "profile") {
    return <ProfileModalHost open userId="00000000-0000-4000-8000-000000000010" username="ece" displayName="Ece Yıldız" me={{ id: "00000000-0000-4000-8000-000000000001", username: "can" }} friends={[]} onlineUsers={[]} onClose={() => {}} />;
  }
  if (view === "admin") {
    return (
      <div style={{ padding: 16 }}>
        <AdminInvites onOpenUser={(id) => (window.__dossier = id)} />
      </div>
    );
  }
  return (
    <div className={`dvt-layer ${phone ? "is-phone" : "is-desk"}`}>
      <div className={`dvt-window ${phone ? "is-phone" : ""}`} role="dialog" aria-modal="true">
        <InviteCenter mobile={phone} onClose={() => (window.__closed = true)} onNavigate={navigate} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </LocaleProvider>
);
