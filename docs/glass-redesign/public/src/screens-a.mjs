// Marketing core pages: Home, Features, Download, FAQ, Security, Status, About, Who owns, Contact, 404
import { page, tile, checks, pills, crumbs, faqList, device, kicker, dot, appStore, clean, I, L, GH, seo } from "./shared.mjs";
const S = {};
const RELATED = ["Discord alternative", "Descall vs Discord", "Features", "Download", "FAQ", "Guides & blog", "How calls are secured"];
const chip = (cls, ic, txt, style) => `<div class="float-chip glass heavy" style="${style}"><span class="gi ${cls}" style="display:flex;align-items:center;justify-content:center;color:#fff">${ic}</span>${txt}</div>`;

// ── Home ──
S["01-home"] = page(`
  <section class="hero">
    <div>
      ${kicker(`<span class="beta">Beta</span>Voice${dot}Servers${dot}<span>LFG</span>`)}
      <h1 class="display grad">Talk together</h1>
      <p class="lead">A lighter home for friends and squads — real servers, HD calls, screen share, and <a>LFG</a>.</p>
      <div class="ctas"><a class="b lg tint-brand">Start free</a><a class="b lg soft">${I.download}Download Desktop</a></div>
    </div>
    ${device("02-dm", "Descall UI — servers, chat, voice, and LFG in one app",
      chip("c-green", I.mic, "Voice · Lobby", "left:-18px;bottom:22%") + chip("c-blue", I.monitor, "Screen share", "right:-10px;top:12%"))}
  </section>

  <section class="section">
    <div class="sec-head"><div><div class="eyebrow">Why Descall</div><h2 class="sec" style="margin-top:8px">Why Choose Descall?</h2></div>
      <p class="lead">Servers, chat, calls, and screen share in one quieter app — built for friends, gamers, and communities.</p></div>
    <div class="grid g3">
      ${tile("servers", "c-blue", "Servers & channels", "Text, voice, and stage channels with categories — a lighter home for real communities")}
      ${tile("shield", "c-violet", "Roles & permissions", "Role hierarchy, staff rooms, and per-channel overrides ready for real communities")}
      ${tile("layers", "c-teal", "Advanced templates", "Gaming, Valorant, friends, community, study & streaming — roles and channels pre-built")}
      ${tile("chat", "c-sky", "Real-time Chat", "DMs that feel instant — typing, replies, and media without a Nitro wall")}
      ${tile("mic", "c-green", "Voice & video", "Crystal-clear group and server calls")}
      ${tile("monitor", "c-pink", "Screen share", "Share your screen in calls with quality presets")}
    </div>
    <div class="ctas" style="margin-top:28px"><a class="b tint-brand">Create free account</a><a class="b ghost">Compare with Discord</a><a class="b soft">See all features</a></div>
  </section>

  <section class="section">
    <div class="panel2 glass panel split">
      <div>
        <div class="eyebrow">Servers</div>
        <h2 class="sec" style="margin-top:8px">Servers ready to run</h2>
        <p class="lead" style="font-size:17px">Create a server from scratch or pick an advanced template. Roles, text &amp; voice channels, and permission overrides come fully prepared.</p>
        <div style="display:flex;flex-direction:column;gap:18px;margin-top:28px">
          ${[["hash", "c-blue", "Channels that match the job", "Announcements, LFG, clips, VIP lounges, staff ops — topics and slowmode included in templates."],
             ["shield", "c-violet", "Roles that actually work", "Admin, Moderator, Helper, VIP and more — with kick, ban, timeout, and audit logs."],
             ["mic", "c-green", "Voice built into the server", "Lobby, scrim, focus, and stage rooms so your crew can hop in without leaving the app."]]
            .map(([ic, c, t, d]) => `<div style="display:flex;gap:14px"><div class="ico ${c}" style="width:40px;height:40px;border-radius:12px;flex-shrink:0">${I[ic]}</div><div><h3 style="font-size:16.5px">${t}</h3><p style="font-size:14.5px;color:var(--t2);margin-top:3px;line-height:1.5">${d}</p></div></div>`).join("")}
        </div>
        <div class="ctas" style="margin-top:28px"><a class="b tint-brand">Explore server features</a><a class="b ghost">For communities</a></div>
      </div>
      <div class="device-wrap"><div class="device glass" style="transform:none"><div class="scr"><img src="../../assets/shots/06-server.webp" alt=""/></div></div></div>
    </div>
  </section>
  ${pills("Keep exploring", RELATED)}
`);

// ── Features ──
const FEAT = [
  ["servers", "c-blue", "Servers & channels", "Full server structure with categories, text, voice, and stage channels — topics, slowmode, and NSFW flags included."],
  ["shield", "c-violet", "Roles & permissions", "Role hierarchy with hoist/mention, plus per-channel allow/deny overrides for staff rooms, announcements, and VIP spaces."],
  ["layers", "c-teal", "Templates that ship ready", "Gaming, Valorant, Community, Study, Friends, and Streaming templates with roles and staff rooms preconfigured."],
  ["chat", "c-sky", "Real-time messaging", "DMs and server chat with typing indicators, reactions, replies, and media — without Nitro walls on core chat."],
  ["mic", "c-green", "Voice chat", "WebRTC voice for DMs, groups, and server lobbies with noise controls when you need them."],
  ["video", "c-pink", "HD video calls", "Group video for hangouts, watch parties, and squad briefings — browser or desktop."],
  ["monitor", "c-orange", "Screen share quality", "Share games, VODs, or docs with quality presets tuned for smooth capture while you play."],
  ["gamepad", "c-red", "LFG", "Create and join ranked LFG lobbies, share party codes, and link Riot Name#TAG for rank on profile.", "Learn more"],
  ["users", "c-sky", "Friends & presence", "Friend requests, online presence, and quick invites so your squad can jump into chat or voice."],
  ["hash", "c-slate", "Moderation tools", "Kick, ban, timeout, audit logs, and community rules for servers that need staff workflows."],
  ["scroll", "c-blue", "Desktop & Android", "Windows installer plus Android builds — or use the full web app in the browser."],
  ["sparkles", "c-orange", "Optional cosmetics", "DesCoin cosmetics stay optional. Chat, servers, voice, and screen share remain free."],
];
S["02-features"] = page(`
  ${crumbs(["Home", "Features"])}
  <section style="padding-top:28px">
    ${kicker("Product", true)}
    <h1 class="page grad">Features of a modern Discord alternative</h1>
    <p class="lead">Servers with roles and channels, messaging, calls, screen share, and LFG — everything friend groups and communities need, without turning your PC into a second operating system.</p>
  </section>
  <section class="section tight"><div class="grid g3">${FEAT.map((f) => tile(...f)).join("")}</div>
    <div class="ctas" style="margin-top:28px"><a class="b tint-brand">Download</a><a class="b soft">Discord alternative</a><a class="b ghost">FAQ</a></div></section>
  ${pills("Explore by use case", RELATED)}
`, { active: "/features" });

// ── Download ── (App Store badge: planned iOS listing; placement reserved)
const plat = (on, ic, name, file) => `<div class="${on ? "lens" : ""}" style="flex:1;border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:6px;${on ? "" : "background:rgba(255,255,255,0.04);box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.10)"}">
  <div style="display:flex;align-items:center;justify-content:space-between"><span class="ico ${on ? "c-blue" : "c-slate"}" style="width:40px;height:40px;border-radius:12px">${ic}</span>${on ? `<span style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center" class="tint-brand">${L("check", "sm")}</span>` : ""}</div>
  <strong style="font-size:17px;margin-top:8px">${name}</strong><span style="font-size:13px;color:var(--t3);font-family:var(--mono)">${file}</span></div>`;
S["03-download"] = page(`
  ${crumbs(["Home", "Download"])}
  <section class="hero seo" style="padding-top:36px">
    <div>
      ${kicker(`${I.sparkles}Download${dot}<span style="font-variant-numeric:tabular-nums">v2.10.0 available</span>`)}
      <h1 class="display grad" style="font-size:68px">Download Descall</h1>
      <p class="lead">Windows installer plus Android builds — or use the full web app in the browser.</p>
      <div class="ctas"><a class="b lg tint-brand">${I.download}Download for Windows</a><a class="b lg soft">Start free</a><a class="b link">${I.globe}Open the web app</a></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:22px" class="as-row">${appStore()}<span class="hint" style="max-width:260px;font-size:12.5px">iPhone — App Store badge shows when the iOS listing link is set.</span></div>
    </div>
    <div class="glass heavy" style="border-radius:32px;padding:22px">
      <div class="eyebrow" style="padding:0 4px">Platform</div>
      <div style="display:flex;gap:12px;margin-top:14px">${plat(true, I.monitor, "Windows", "Descall-Setup.exe")}${plat(false, I.smartphone, "Android", "Descall-APK.apk")}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px 14px;border-radius:16px;background:rgba(0,0,0,0.22);box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.08)">
        <span class="pulse" style="width:10px;height:10px"></span><span style="font-size:14px;color:var(--t2);font-variant-numeric:tabular-nums">v2.10.0 available</span><span style="margin-left:auto;font-size:13px;color:var(--t3)">GitHub releases/latest</span></div>
      <a class="b w tint-brand" style="margin-top:14px;width:100%;height:50px;border-radius:25px">${I.download}Download for Windows</a>
    </div>
  </section>
  <div class="pills" style="margin-top:48px;justify-content:center">
    ${[[I.shield, "TLS"], [L("zap"), "Free"], [I.globe, "Web"], [I.monitor, "Windows"], [I.smartphone, "Android"], [GH, "GitHub"], [I.star, "Beta"]].map(([ic, t]) => `<span class="pill glass-chip" style="height:38px">${ic.replace('class="i', 'class="i sm')}${t}</span>`).join("")}
  </div>
  <section class="section">
    <div class="sec-head"><div><h2 class="sec">Why Choose Descall?</h2></div><p class="lead">Servers, chat, calls, and screen share in one quieter app — built for friends, gamers, and communities.</p></div>
    <div class="grid g4">
      ${tile("chat", "c-sky", "Real-time Chat", "Instant messaging with typing indicators")}
      ${tile("mic", "c-green", "Voice Messages", "Crystal clear voice recordings")}
      ${tile("video", "c-pink", "Video Calls", "HD video calling with screen share")}
      ${tile("users", "c-violet", "Group Chats", "Create groups with unlimited members")}
    </div>
    <div class="panel2 glass" style="margin-top:16px;padding:24px 28px">${checks(["No Nitro paywall on core chat & calls", "Servers, roles, channels, and <a class=inl>LFG</a>", "<a class=inl>Discord alternative</a>"])}</div>
    <div class="ctas" style="margin-top:28px"><a class="b tint-brand">${I.download}Download for Windows</a><a class="b soft">See all features</a></div>
  </section>
  ${pills("Keep exploring", ["Discord alternative", "Descall vs Discord", "Features", "Download", "FAQ"])}
`, { active: "/download" });

// ── FAQ ──
import fs from "fs";
const faqSrc = fs.readFileSync("/workspace/Descall/frontend/src/site/faqData.js", "utf8");
const FAQ = [...faqSrc.matchAll(/group: "(\w+)",\s*q: "([^"]+)",\s*a: "([^"]+)"/g)].map((m) => ({ g: m[1], q: m[2], a: m[3] }));
const GROUPS = [["product", "Product", "sparkles", "c-blue"], ["servers", "Servers & LFG", "servers", "c-violet"], ["download", "Download & accounts", "download", "c-teal"], ["privacy", "Support", "mail", "c-green"]];
S["04-faq"] = page(`
  ${crumbs(["Home", "FAQ"])}
  <section style="padding-top:28px;display:grid;grid-template-columns:320px minmax(0,1fr);gap:48px;align-items:start" class="faq-layout">
    <div style="position:sticky;top:100px">
      <h1 class="page grad" style="font-size:64px">FAQ</h1>
      <p class="lead" style="font-size:17px">Frequently asked questions about Descall — accounts, desktop download, calls, screen share, and privacy.</p>
      <div class="glass-chip only-d" style="border-radius:22px;padding:8px;margin-top:24px">
        ${GROUPS.map(([id, t, ic, c], i) => `<div style="display:flex;align-items:center;gap:12px;height:44px;padding:0 10px;border-radius:14px;${i === 0 ? "background:rgba(88,122,246,0.22);box-shadow:inset 0 0 0 0.5px rgba(143,166,255,0.4)" : ""}"><span class="gi ${c}">${I[ic]}</span><span style="flex:1;font-size:14.5px;font-weight:600">${t}</span><span class="muted" style="font-size:13px;font-variant-numeric:tabular-nums">${FAQ.filter((x) => x.g === id).length}</span></div>`).join("")}
      </div>
      <a class="b soft only-d" style="margin-top:16px">${I.mail}Contact</a>
    </div>
    <div>
      ${GROUPS.map(([id, t, ic, c], gi) => `<div style="margin-top:${gi ? 36 : 8}px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><span class="gi ${c}">${I[ic]}</span><h2 style="font-size:22px;font-weight:700;letter-spacing:-0.022em">${t}</h2></div>${faqList(FAQ.filter((x) => x.g === id), gi === 0 ? 0 : -1)}</div>`).join("")}
      <a class="b soft only-m" style="margin-top:24px">${I.mail}Contact</a>
    </div>
  </section>
  <style>@media (max-width:1024px){.faq-layout{grid-template-columns:1fr!important;gap:24px!important}.faq-layout>div:first-child{position:static!important}}</style>
`, { active: "/faq" });

// ── Security ──
const secRow = (ic, c, h, p) => `<article class="lsec glass"><h2><span class="gi ${c}">${I[ic] ?? L(ic)}</span>${h}</h2><p>${p}</p></article>`;
S["05-security"] = page(`
  ${crumbs(["Home", "Security"])}
  <section style="padding-top:28px">
    ${kicker(`${I.shield}Security`)}
    <h1 class="page grad">Security at Descall</h1>
    <p class="lead">How Descall protects your chats and calls — encryption in transit, account security, and honest limits about what we do not claim.</p>
  </section>
  <section class="section tight" style="max-width:860px">
    ${secRow("lock", "c-blue", "Transport encryption (not default E2E)", "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server — messages are encrypted in transit and stored so your devices can load chat history.")}
    ${secRow("headphones", "c-green", "Voice &amp; video", "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control.")}
    ${secRow("user", "c-violet", "Accounts", "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers.")}
    ${secRow("flag", "c-orange", "Report an issue", `Email <a class="inl">contact@descall.com</a> or open an issue on GitHub. Include enough detail for a safe investigation.`)}
  </section>
`);

// ── Status ──
const dlRow = (ic, c, k, v, lnk = false) => `<div class="r"><span class="gi ${c}">${ic}</span><span class="k">${k}</span><span class="v ${lnk ? "lnk" : ""}">${v}</span></div>`;
S["06-status"] = page(`
  ${crumbs(["Home", "Status"])}
  <section style="padding-top:28px;max-width:860px">
    ${kicker("Status", true)}
    <h1 class="page grad">Descall service status</h1>
    <p class="lead">Descall is an independent beta product. Core chat, servers, and voice are free while we grow with real communities. Last updated: August 25, 2026.</p>
    <div class="stat glass heavy" style="margin-top:32px" role="status"><span class="pulse"></span><div style="flex:1"><div style="font-size:18px;font-weight:700;letter-spacing:-0.02em">API / realtime</div><div style="font-size:15px;color:var(--ok);margin-top:2px;font-weight:600">Operational — API reachable</div></div><span class="hint">Live probe · GET /api/status</span></div>
    <div class="hint" style="margin:10px 6px 0">Other states: <b style="color:var(--t2)">Checking…</b> (grey pulse) · <b style="color:var(--idle)">Degraded — HTTP 5xx</b> (amber) · <b style="color:#ff6961">Unreachable from this browser — Timed out / Network error</b> (red)</div>
    <div class="dl glass" style="margin-top:24px">
      ${dlRow(I.star, "c-blue", "Product stage", "Beta")}
      ${dlRow(I.lock, "c-green", "Transport security", "TLS / DTLS-SRTP")}
      ${dlRow(I.user, "c-violet", "Operator", "Demir Sarp Kurtlar · Türkiye")}
      ${dlRow(I.mail, "c-orange", "Support", "contact@descall.com", true)}
      ${dlRow(GH, "c-slate", "GitHub", "github.com/DemirSarpKurtlar/Descall", true)}
    </div>
    <p style="margin-top:18px;font-size:14.5px"><a class="inl">Security details</a> <span class="muted">·</span> <a class="inl">Contact</a></p>
  </section>
`);

// ── About ──
S["10-about"] = page(`
  ${crumbs(["Home", "About"])}
  <section style="padding-top:28px;display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:48px;align-items:start" class="about-grid">
    <div class="prose" style="max-width:none">
      <div class="glass-chip" style="display:inline-flex;align-items:center;gap:8px;border-radius:16px;padding:7px 14px 7px 7px;font-size:13px;color:var(--t2)"><span class="beta">Beta</span>Descall is an independent beta product. Core chat, servers, and voice are free while we grow with real communities.</div>
      <h1 class="page grad">About Descall</h1>
      <p class="lead" style="color:var(--t1);font-weight:550">Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall.</p>
      <p class="lead" style="margin-top:12px">Descall is an independent messaging and voice platform for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls.</p>
      <h2>Who owns Descall?</h2>
      <p>Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar. <a>Read the ownership record</a></p>
      <h2>What we build</h2>
      <p>${clean("Real-time messaging, Discord-style servers, WebRTC voice/video, screen share, and Valorant LFG — with privacy policies and security docs you can actually read.")}</p>
      <p class="muted" style="font-size:14px">Last updated: August 25, 2026</p>
      <div class="ctas" style="margin-top:24px"><a class="b soft">Security</a><a class="b soft">Contact</a><a class="b tint-brand">Download</a></div>
    </div>
    <aside class="glass heavy" style="border-radius:28px;padding:22px;margin-top:52px">
      <div style="display:flex;align-items:center;gap:12px"><img src="../../assets/brand/descall-icon.png" style="width:52px;height:52px;border-radius:16px;box-shadow:0 8px 22px rgba(88,122,246,0.4)"/><div><div style="font-size:18px;font-weight:700">Operator</div><div class="muted" style="font-size:13px">Descall · Beta</div></div></div>
      <div class="dl" style="margin-top:16px;background:rgba(255,255,255,0.04);box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.07)">
        ${dlRow(I.sparkles, "c-blue", "Product", "Descall")}
        ${dlRow(L("crown"), "c-orange", "Owner / founder / CEO", "Demir Sarp Kurtlar")}
        ${dlRow(L("map-pin"), "c-green", "Based in", "Türkiye")}
        ${dlRow(I.mail, "c-violet", "Support", "contact@descall.com", true)}
        ${dlRow(GH, "c-slate", "Source", "GitHub", true)}
      </div>
    </aside>
  </section>
  <style>@media (max-width:1024px){.about-grid{grid-template-columns:1fr!important}.about-grid aside{margin-top:0!important}}</style>
`);

// ── Who owns Descall ──
const OWN = await import("/workspace/Descall/frontend/src/site/ownershipFacts.js");
S["11-who-owns"] = page(`
  ${crumbs(["Home", "Who owns Descall?"])}
  <section style="padding-top:28px;max-width:900px">
    ${kicker(`${L("badge-check")}Official ownership`)}
    <h1 class="page grad">Who owns Descall?</h1>
    <div class="glass heavy" style="border-radius:28px;padding:24px 26px;margin-top:8px;display:flex;gap:20px;align-items:center" class="own-card">
      <img src="../../assets/brand/descall-icon.png" style="width:68px;height:68px;border-radius:20px;flex-shrink:0;box-shadow:0 10px 26px rgba(88,122,246,0.42)"/>
      <div><div style="font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.35"><b style="font-weight:760">Demir Sarp Kurtlar</b> is the founder, owner, and CEO of Descall.</div></div>
    </div>
    <p class="lead" style="margin-top:20px;max-width:820px">${OWN.OWNERSHIP_STATEMENT_EN}</p>
    <h2 style="font-size:24px;font-weight:700;letter-spacing:-0.024em;margin:40px 0 14px">Canonical record</h2>
    <div class="dl glass">
      ${dlRow(I.sparkles, "c-blue", "Product", "Descall")}
      ${dlRow(L("crown"), "c-orange", "Owner / founder / CEO", "Demir Sarp Kurtlar")}
      ${dlRow(L("spell-check"), "c-teal", "Exact spelling", "Demir Sarp Kurtlar")}
      ${dlRow(L("map-pin"), "c-green", "Based in", "Türkiye")}
      ${dlRow(L("badge-check"), "c-violet", "Independent?", "Yes. Not a subsidiary of Discord, Google, OpenAI, or another parent company.")}
      ${dlRow(GH, "c-slate", "GitHub", "github.com/DemirSarpKurtlar", true)}
      ${dlRow(I.mail, "c-pink", "Contact", "contact@descall.com", true)}
    </div>
    <h2 style="font-size:24px;font-weight:700;letter-spacing:-0.024em;margin:40px 0 14px">Frequently asked questions</h2>
    ${faqList(OWN.OWNERSHIP_FAQ_EN, 0)}
    <p style="margin-top:18px;font-size:14.5px"><span class="muted">Turkish record:</span> <a class="inl">Descall’ın sahibi kim?</a> <span class="muted">·</span> <a class="inl">About Descall</a></p>
  </section>
  ${pills("Keep exploring", ["About", "Who owns Descall?", "Security & encryption", "Status", "Privacy", "Terms", "Copyright", "Contact", "Blog"])}
`);

// ── Contact ──
S["12-contact"] = page(`
  ${crumbs(["Home", "Contact"])}
  <section style="padding-top:28px">
    <h1 class="page grad">Contact</h1>
    <p class="lead">Get in touch with the Descall team — support, feedback, and press.</p>
  </section>
  <section class="section tight"><div class="grid g3">
    <article class="tile2 glass heavy"><div class="ico c-blue">${I.mail}</div><h3>Support &amp; feedback</h3><p>Email the Descall team:</p><a class="b tint-brand" style="margin-top:16px">${I.mail}contact@descall.com</a></article>
    <article class="tile2 glass"><div class="ico c-violet">${I.user}</div><h3>Operator</h3><p>Demir Sarp Kurtlar · Türkiye</p></article>
    <article class="tile2 glass"><div class="ico c-orange">${I.shield}</div><h3>Security</h3><p>For security reports, contact us by email and include enough detail for us to investigate safely.</p></article>
  </div></section>
`);

// ── 404 ──
S["20-not-found"] = page(`
  <section class="nf">
    <div class="num">404</div>
    <div class="nf-glass glass">
      <p class="lead" style="margin:0 auto;font-size:19px">This page does not exist on Descall.</p>
      <div class="ctas" style="justify-content:center;margin-top:22px"><a class="b lg tint-brand">${L("house")}Home</a><a class="b lg ghost">${I.download}Download</a></div>
    </div>
  </section>
`);
export default S;
