/* Bug Avcısı harness (27 Nov 2026). The real components: Admin > Geri Bildirim (AdminFeedbackV3
   with BugHunterPanel), a profile card with the Bug Hunter chip and tooltip, and the sender's
   feedback window with the thread card + live toast. Every /api request is answered by
   capture.cjs (Playwright routes); the socket is a local stub. Synthetic data only. */
import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/styles/design-tokens.css";
import "../../../src/styles/special-badges.css";
import "../../../src/styles/overlay.css";
import "../../../src/styles/frost.css";
import "../../../src/styles/feedback-a.css";
import { LocaleProvider } from "../../../src/context/LocaleContext.jsx";
import { setToken } from "../../../src/lib/storage.js";
import AdminFeedbackV3 from "../../../src/components/admin/feedback3/AdminFeedbackV3.jsx";
import { ProfileBadgeRow } from "../../../src/components/badges/BadgeVault.jsx";
import QuickFeedbackModal from "../../../src/components/feedback/QuickFeedbackModal.jsx";
import { BadgeToast, showBadgeToast } from "../../../src/components/badges/BadgeToast.jsx";
import { bugHuntToast } from "../../../src/components/badges/bugHuntToast.js";
import { useLocale } from "../../../src/context/LocaleContext.jsx";

const q = new URLSearchParams(location.search);
try { localStorage.setItem("descall_language", q.get("lang") || "tr"); } catch { /* ignore */ }
setToken("harness-token");
const theme = q.get("theme") === "light" ? "light" : "dark";
const view = q.get("view") || "admin";
document.documentElement.setAttribute("data-theme", theme);
document.body.style.margin = "0";
document.body.style.fontFamily = 'Inter, "Segoe UI", system-ui, sans-serif';
document.body.style.minHeight = "100vh";
document.body.style.background = theme === "light"
  ? "radial-gradient(900px 600px at 20% -10%, rgba(88,122,245,.18), transparent 60%), #eef0f6"
  : "radial-gradient(700px 420px at 30% -10%, rgba(88,122,245,.24), transparent 70%), radial-gradient(600px 400px at 100% 100%, rgba(140,92,246,.14), transparent 70%), #0d0f18";
document.body.style.color = theme === "light" ? "#14161c" : "#fff";

function makeSocket() {
  const handlers = new Map();
  const sock = {
    on(ev, fn) { handlers.set(ev, [...(handlers.get(ev) || []), fn]); },
    off(ev, fn) { handlers.set(ev, (handlers.get(ev) || []).filter((x) => x !== fn)); },
    emit() {},
    fire(ev, p) { (handlers.get(ev) || []).slice().forEach((fn) => fn(p)); },
  };
  window.__bhSocket = sock;
  return sock;
}

const AYSE = { id: "00000000-0000-4000-8000-000000000010", username: "ayse.k", displayName: "Ayşe", avatarUrl: null, equippedCountry: null,
  equippedSpecialBadge: { id: "bughunter", serial: 2, level: 2, bugs: 12, also: 1, severity: { critical: 2, high: 4, medium: 5, low: 1 }, since: "2026-11-03T10:00:00.000Z" } };

function Profile() {
  return (
    <div className="hp-wrap">
      <div className="hp-card">
        <div className="hp-banner" />
        <div className="hp-av">A</div>
        <div className="hp-name"><b>Ayşe</b><span>@ayse.k</span></div>
        <ProfileBadgeRow user={AYSE} me={{ id: "me" }} />
        <div className="hp-sec"><small>HAKKINDA</small><p>Gece sesli kanallarda ders çalışıyorum. Hata görürsem bildiririm.</p></div>
        <div className="hp-sec"><small>ÜYELİK</small><p>3 Mar 2026</p></div>
      </div>
    </div>
  );
}

function User() {
  const { t } = useLocale();
  useEffect(() => {
    const id = setTimeout(() => {
      const p = { feedbackId: "00000000-0000-4000-8000-000000000501", entry: { event: "confirmed", level: 2, badge: "up" }, reward: 100 };
      showBadgeToast({ ...bugHuntToast(p, t, () => t("badges.names.bughunter")), action: { label: t("bhunt.open"), run: () => {} } });
    }, 900);
    return () => clearTimeout(id);
  }, [t]);
  return (
    <>
      <QuickFeedbackModal isOpen onClose={() => {}} initialTab="mine" initialId="00000000-0000-4000-8000-000000000501" />
      <BadgeToast />
    </>
  );
}

function App() {
  const socket = useMemo(makeSocket, []);
  return (
    <LocaleProvider meLanguage={q.get("lang") || "tr"}>
      {view === "profile" ? <Profile /> : view === "user" ? <User /> : (
        <AdminFeedbackV3 socket={socket} layout={q.get("layout") || "desktop"} onClose={() => {}} onGoto={() => {}} onOpenProfile={() => {}} />
      )}
    </LocaleProvider>
  );
}

const css = document.createElement("style");
css.textContent = `
.hp-wrap{min-height:100vh;display:grid;place-items:center}
.hp-card{width:380px;border-radius:22px;overflow:visible;padding:0 0 18px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03)),rgba(24,25,36,.9);box-shadow:0 24px 64px rgba(0,0,0,.55),inset 0 0 0 .5px rgba(255,255,255,.12);position:relative}
html[data-theme=light] .hp-card{background:#fff;box-shadow:0 24px 64px rgba(20,22,40,.18)}
.hp-banner{height:104px;border-radius:22px 22px 0 0;background:linear-gradient(120deg,#587af5,#9b6cf0 60%,#e06cb5)}
.hp-av{width:84px;height:84px;border-radius:50%;margin:-44px 0 0 18px;display:grid;place-items:center;font-size:34px;font-weight:800;color:#fff;background:linear-gradient(140deg,#ff8fb3,#e8457a);box-shadow:0 0 0 6px rgba(24,25,36,1)}
html[data-theme=light] .hp-av{box-shadow:0 0 0 6px #fff}
.hp-name{padding:10px 18px 8px;display:flex;flex-direction:column}.hp-name b{font-size:20px}.hp-name span{opacity:.6;font-size:13px}
.hp-card .bp-row{padding:0 18px;display:flex;gap:6px;align-items:center}
.hp-sec{margin:14px 18px 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.05)}
html[data-theme=light] .hp-sec{background:rgba(20,22,40,.04)}
.hp-sec small{font-size:11px;font-weight:700;opacity:.55;letter-spacing:.04em}.hp-sec p{margin:4px 0 0;font-size:13.5px;line-height:1.4}
.fbk-overlay{position:fixed!important;inset:0!important;display:grid!important;place-items:center!important}
.feedback-modal.fbk{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03)),rgba(24,25,36,.94);box-shadow:0 24px 64px rgba(0,0,0,.55)}
html[data-theme=light] .feedback-modal.fbk{background:#fff;--fbk-ink:#14161c;--fbk-ink-2:rgba(20,22,28,.7);--fbk-ink-3:rgba(20,22,28,.5);--fbk-fill:rgba(20,22,40,.05);--fbk-fill-2:rgba(20,22,40,.07);--fbk-hair:rgba(20,22,40,.08)}
`;
document.head.appendChild(css);
createRoot(document.getElementById("root")).render(<App />);
