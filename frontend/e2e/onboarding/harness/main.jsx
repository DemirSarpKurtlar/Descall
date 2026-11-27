/* "Başla panosu" harness (growth phase 2A). The real onboarding components inside a small
   stand-in of the app shell; every /api request is answered by capture.cjs (Playwright
   routes), the socket is a local echo. Synthetic data only. */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/styles/design-tokens.css";
import { LocaleProvider } from "../../../src/context/LocaleContext.jsx";
import { setToken } from "../../../src/lib/storage.js";
import { OnboardingProvider } from "../../../src/components/onboarding/OnboardingContext.jsx";
import PhoneStart from "../../../src/components/onboarding/PhoneStart.jsx";
import { FriendsFinder } from "../../../src/components/onboarding/FriendsCard.jsx";
import { OnbJoinedSlot, OnbMainSlot, OnbListSlot } from "../../../src/components/onboarding/slots.jsx";
import OnboardingCard from "../../../src/components/admin/growth/OnboardingCard.jsx";
import "../../../src/styles/admin-growth.css";
import { Compass, Headphones, Mic, MessageSquare, Phone, Plus, Server, Settings, UserPlus, Users, Zap, Search, Hash, ChevronLeft } from "../../../src/components/ui/Icon.jsx";

const q = new URLSearchParams(location.search);
try {
  localStorage.setItem("descall_language", q.get("lang") || "tr");
  localStorage.removeItem("descall:onb:inactive");
} catch {
  /* ignore */
}
setToken("harness-token");
const theme = q.get("theme") === "light" ? "light" : "dark";
const mode = q.get("mode") || "desk";
document.documentElement.setAttribute("data-theme", theme);
document.body.style.margin = "0";
document.body.style.fontFamily = 'Inter, "Segoe UI", system-ui, sans-serif';
document.body.style.background =
  theme === "light"
    ? "radial-gradient(900px 600px at 20% -10%, rgba(88,122,245,.18), transparent 60%), #eef0f6"
    : "radial-gradient(700px 420px at 30% -10%, rgba(88,122,245,.24), transparent 70%), radial-gradient(600px 400px at 100% 100%, rgba(140,92,246,.14), transparent 70%), #0d0f18";
document.body.style.color = theme === "light" ? "#14161c" : "#fff";

/** Local socket: echoes a sent channel message with an id, then the server's reward event. */
function makeSocket() {
  const handlers = new Map();
  const fire = (ev, p) => (handlers.get(ev) || []).slice().forEach((fn) => fn(p));
  const sock = {
    connected: true,
    sent: [],
    on(ev, fn) {
      handlers.set(ev, [...(handlers.get(ev) || []), fn]);
    },
    off(ev, fn) {
      handlers.set(ev, (handlers.get(ev) || []).filter((x) => x !== fn));
    },
    emit(ev, p) {
      sock.sent.push({ ev, p });
      window.__onbSent = sock.sent;
      if (ev === "server:channel:message") {
        setTimeout(() => fire("server:channel:message", { serverId: p.serverId, channelId: p.channelId, tempId: p.tempId, message: { id: "00000000-0000-4000-8000-00000000abcd", content: p.content } }), 250);
        if (q.get("reward") !== "0") setTimeout(() => fire("onboarding:first-hello", { amount: 50, badge: { id: "ilkselam", serial: 291 } }), 1600);
      }
    },
  };
  window.__onbSocket = sock;
  return sock;
}

const ME = { id: "00000000-0000-4000-8000-000000000001", username: "ece.yildiz", displayName: "Ece", avatarUrl: null };

function Rail() {
  const items = [Compass, MessageSquare, Users, Server, UserPlus, Zap, Phone];
  return (
    <nav className="h-rail" aria-hidden="true">
      <span className="h-logo"><img src="/brand/descall-icon-small.svg" alt="" /></span>
      {items.map((I, i) => (
        <span key={i} className={`h-rb${i === 1 ? " on" : ""}`}><I size={21} /></span>
      ))}
      <span style={{ flex: 1 }} />
      <span className="h-rb"><Plus size={21} /></span>
      <span className="h-rb"><Settings size={21} /></span>
    </nav>
  );
}

function Me() {
  return (
    <div className="h-me">
      <span className="h-av">E<i /></span>
      <div><b>Ece</b><small>@ece.yildiz</small></div>
      <span className="h-ic"><Mic size={17} /><Headphones size={17} /></span>
    </div>
  );
}

function Desk() {
  return (
    <div className="h-win">
      <div className="h-bar"><i /><i /><i /><span>Descall</span></div>
      <div className="h-app">
        <Rail />
        <aside className="h-side">
          <div className="h-side-in"><OnbListSlot isMobile={false} /></div>
          <Me />
        </aside>
        <main className="h-main"><OnbMainSlot isMobile={false} fallback={<div className="h-empty" data-testid="h-empty">Sohbetlerin burada</div>} /></main>
      </div>
    </div>
  );
}

function PhoneChannel({ channel, onBack }) {
  return (
    <div className="h-chan">
      <div className="h-chan-top">
        <button type="button" onClick={onBack} className="h-gbtn" aria-label="geri"><ChevronLeft size={18} /></button>
        <span className="h-gpill"><span className="h-si">DK</span><Hash size={14} />tanışma<span className="h-live">7</span></span>
        <span className="h-gbtn"><Users size={17} /></span>
      </div>
      <div className="h-msgs">
        {[["D", "Defne", "13:44", "Ben Defne, 11. sınıf, eşit ağırlık. Hedef hukuk"], ["A", "Arda", "14:09", "Hoş geldin Mert! Hangi alandasın?"], ["M", "Mert", "14:09", "Sayısal, 12. sınıf"]].map(([a, n, t, x]) => (
          <div key={n} className="h-m"><span className="h-av sm">{a}</span><div><b>{n}</b> <time>{t}</time><p>{x}</p></div></div>
        ))}
        <div className="h-m mine"><span className="h-av sm pink">E</span><div><b>Ece</b> <time>14:11</time><p>{(window.__onbSent || []).find((s) => s.ev === "server:channel:message")?.p?.content}</p></div></div>
      </div>
      <OnbJoinedSlot channelId={channel} />
      <div className="h-comp"><Plus size={20} /><span>#tanışma kanalına yaz</span></div>
    </div>
  );
}

function PhoneShell() {
  const [tab, setTab] = useState(mode === "friends" ? "friends" : "chat");
  const [channel, setChannel] = useState(null);
  const api = useMemo(() => ({ channel, setChannel }), [channel]);
  window.__onbPhone = api;
  return (
    <div className="h-phone">
      <div className="h-sbar"><span>9:41</span><span className="h-isl" /><span>5G</span></div>
      {channel ? (
        <PhoneChannel channel={channel} onBack={() => setChannel(null)} />
      ) : (
        <div className="h-scroll">
          <div className="h-top"><span className="h-av">E<i /></span><span style={{ flex: 1 }} /><span className="h-gpill"><span className="onb-coin" />10</span><span className="h-gbtn"><Search size={17} /></span></div>
          <h1 className="h-title">{tab === "friends" ? "Arkadaşlar" : "Başla"}</h1>
          {tab === "friends" ? <FriendsFinder /> : <PhoneStart withTitle={false} />}
        </div>
      )}
      <nav className="h-tabs">
        {[["chat", MessageSquare], ["friends", Users], ["servers", Server], ["add", UserPlus], ["act", Zap], ["calls", Phone]].map(([id, I]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => id === "chat" || id === "friends" ? (setChannel(null), setTab(id)) : null}><I size={21} /></button>
        ))}
      </nav>
    </div>
  );
}

function Admin() {
  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 20px" }} className="admin-section agr">
      <OnboardingCard days={30} />
    </div>
  );
}

function App() {
  const socket = useMemo(makeSocket, []);
  if (mode === "admin") return <LocaleProvider><Admin /></LocaleProvider>;
  const phone = mode !== "desk";
  return (
    <LocaleProvider>
      <OnboardingProvider
        me={ME}
        socket={socket}
        isMobile={phone}
        servers={[]}
        onServerJoined={(s) => { window.__onbJoined = s; }}
        onOpenChannel={(serverId, channelId) => { window.__onbOpened = { serverId, channelId }; window.__onbPhone?.setChannel(channelId); }}
        onLeaveServer={async (id) => { window.__onbLeft = id; }}
        onOpenDm={(u) => { window.__onbDm = u; }}
        onRefreshServers={() => {}}
      >
        {phone ? <PhoneShell /> : <Desk />}
      </OnboardingProvider>
    </LocaleProvider>
  );
}

const css = document.createElement("style");
css.textContent = `
.h-win{width:1440px;height:900px;margin:0 auto;display:flex;flex-direction:column;overflow:hidden;position:relative}
.h-bar{height:32px;display:flex;align-items:center;gap:8px;padding:0 14px;background:rgba(10,11,18,.72);border-bottom:.5px solid rgba(255,255,255,.07)}
html[data-theme=light] .h-bar{background:rgba(255,255,255,.7);border-color:rgba(0,0,0,.08)}
.h-bar i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.h-bar i:nth-child(2){background:#febc2e}.h-bar i:nth-child(3){background:#28c840}
.h-bar span{margin:0 auto;font-size:12px;font-weight:600;opacity:.6;transform:translateX(-30px)}
.h-app{flex:1;display:flex;min-height:0}
.h-rail{width:72px;flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0 12px;background:rgba(14,16,24,.72);border-right:.5px solid rgba(255,255,255,.07);color:rgba(232,236,255,.66)}
html[data-theme=light] .h-rail{background:rgba(255,255,255,.6);border-color:rgba(0,0,0,.08);color:#575961}
.h-logo{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#393c4d;margin-bottom:8px}.h-logo img{width:26px}
.h-rb{width:46px;height:46px;border-radius:14px;display:grid;place-items:center}
.h-rb.on{background:linear-gradient(180deg,rgba(120,146,255,.32),rgba(88,122,245,.16));color:#fff;box-shadow:inset 0 0 0 .5px rgba(170,190,255,.42)}
html[data-theme=light] .h-rb.on{color:#2649bc}
.h-side{width:248px;flex:none;display:flex;flex-direction:column;background:rgba(18,20,30,.6);border-right:.5px solid rgba(255,255,255,.07)}
html[data-theme=light] .h-side{background:rgba(255,255,255,.55);border-color:rgba(0,0,0,.08)}
.h-side-in{flex:1;overflow:auto}
.h-main{flex:1;min-width:0;position:relative}
.h-me{display:flex;align-items:center;gap:9px;padding:10px 12px;border-top:.5px solid rgba(255,255,255,.07);background:rgba(10,11,18,.4);font-size:13px}
html[data-theme=light] .h-me{background:rgba(255,255,255,.5);border-color:rgba(0,0,0,.08)}
.h-me b{display:block}.h-me small{opacity:.6;font-size:11.5px}.h-ic{margin-left:auto;display:flex;gap:10px;opacity:.7}
.h-av{width:32px;height:32px;border-radius:50%;display:inline-grid;place-items:center;flex:none;position:relative;font-weight:700;color:#fff;background:linear-gradient(140deg,#ff8fb3,#e8457a)}
.h-av i{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;background:#30d158;box-shadow:0 0 0 2.5px #151722}
.h-av.sm{width:36px;height:36px;background:linear-gradient(140deg,#69d2ff,#1c8fd1)}.h-av.pink{background:linear-gradient(140deg,#ff8fb3,#e8457a)}
.h-phone{width:390px;height:844px;margin:0 auto;position:relative;overflow:hidden;font-size:15px}
.h-sbar{height:50px;display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0 36px;font-weight:650;font-size:15px}
.h-isl{width:120px;height:34px;border-radius:20px;background:#000}
.h-scroll{position:absolute;top:50px;left:0;right:0;bottom:0;overflow:auto;padding-bottom:110px}
.h-top{display:flex;align-items:center;gap:8px;padding:2px 16px 0}
.h-gbtn,.h-gpill{height:40px;min-width:40px;border-radius:20px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18);font-weight:650;border:0;color:inherit}
html[data-theme=light] .h-gbtn,html[data-theme=light] .h-gpill{background:rgba(255,255,255,.8);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.1)}
.h-title{font-size:34px;font-weight:800;letter-spacing:-.035em;margin:8px 16px 4px}
.h-tabs{position:absolute;left:14px;right:14px;bottom:24px;height:64px;border-radius:32px;display:flex;justify-content:space-around;align-items:center;background:rgba(36,38,56,.82);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18);z-index:5}
html[data-theme=light] .h-tabs{background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.1),0 10px 30px -10px rgba(0,0,0,.2)}
.h-tabs button{width:44px;height:44px;border-radius:22px;border:0;background:none;color:inherit;opacity:.7;display:grid;place-items:center}
.h-tabs button.on{opacity:1;background:rgba(88,122,245,.25)}
.h-chan{position:absolute;top:50px;left:0;right:0;bottom:0}
.h-chan-top{display:flex;gap:8px;align-items:center;padding:4px 12px}
.h-gpill .h-si{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:10px;font-weight:800;background:linear-gradient(150deg,#3fe0c5,#119080);color:#fff}
.h-chan-top .h-gpill{flex:1;justify-content:flex-start}
.h-live{margin-left:auto;color:#5be38a;font-size:13px}
.h-msgs{position:absolute;left:0;right:0;top:56px;bottom:250px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:0 14px}
.h-m{display:flex;gap:10px}.h-m b{font-size:15px}.h-m time{font-size:12px;opacity:.5}.h-m p{margin:2px 0 0;opacity:.85;line-height:1.4}
.h-m.mine{background:rgba(88,122,245,.1);border-radius:16px;padding:8px;margin:0 -8px}
.h-comp{position:absolute;left:12px;right:12px;bottom:100px;height:46px;border-radius:23px;display:flex;align-items:center;gap:10px;padding:0 16px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.15);opacity:.9}
html[data-theme=light] .h-comp{background:#fff;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.1)}
.h-empty{position:absolute;inset:0;display:grid;place-items:center;opacity:.5}
.h-chan .onb-joined{--onb-joined-bottom:156px;position:absolute}
`;
document.head.appendChild(css);
createRoot(document.getElementById("root")).render(<App />);
