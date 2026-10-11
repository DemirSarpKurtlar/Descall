// Auth overlays (MarketingAuthModal), forgot password, 2FA, social signup, invite landings,
// server-rendered confirm/unsubscribe, sitemap.html, cookie banner, mobile menu sheet.
import { page, crumbs, kicker, dot, I, L, GOOGLE, header, LOGO } from "./shared.mjs";
const S = {};
const vp = { vpFixed: true };
// Home hero as the blurred backdrop behind overlays (same as live: modal opens over the current marketing page).
const heroBg = `<section class="hero"><div>${kicker(`<span class="beta">Beta</span>Voice${dot}Servers${dot}LFG`)}<h1 class="display grad">Talk together</h1>
  <p class="lead">A lighter home for friends and squads — real servers, HD calls, screen share, and <a>LFG</a>.</p>
  <div class="ctas"><a class="b lg tint-brand">Start free</a><a class="b lg soft">${I.download}Download Desktop</a></div></div>
  <figure class="device-wrap"><div class="device glass"><div class="scr"><img src="../../assets/shots/02-dm.webp"/></div></div></figure></section>`;
const modal = (inner, w = 440, cls = "") => `<div class="scrim2"></div><div class="dlg glass heavy ${cls}" role="dialog" style="--w:${w}px"><span class="grab"></span><span class="x" title="Close">${I.x}</span>${inner}</div>`;
const logoRow = `<img class="dlogo" src="${LOGO}" alt="Descall"/>`;
const pwd = (ph = "Password", filled = true) => `<div class="fi">${I.lock}${filled ? `<span class="v" style="letter-spacing:0.16em">••••••••••••</span>` : `<span>${ph}</span>`}<span class="end" title="Show password">${I.eye}</span></div>`;
const terms = `<div class="cbx"><span class="bx tint-brand">${I.check}</span><p>I have read and agree to the <b>Terms of Service</b> and <b>Privacy Policy</b>.<br/><span style="color:var(--t3)">Descall has zero tolerance for objectionable content and abusive users.</span></p></div>`;
const birth = `<div class="flabel" style="margin:14px 4px 8px">Date of birth</div><div class="dsel"><div class="fi"><span class="v">14</span><span class="end">${I.chevD}</span></div><div class="fi"><span class="v">March</span><span class="end">${I.chevD}</span></div><div class="fi"><span class="v">2004</span><span class="end">${I.chevD}</span></div></div>`;

// ── /login → Welcome Back ──
S["21-login"] = page(heroBg, { ...vp, overlay: modal(`${logoRow}<h2>Welcome Back</h2><p class="sub">Sign in to your account</p>
  <div class="gbtn" style="margin-top:20px">${GOOGLE}Continue with Google</div>
  <div class="or">or</div>
  <div class="fi focus">${I.user}<span class="v">demir</span><span class="caret" style="margin-left:-8px"></span></div>
  ${pwd()}
  <div style="display:flex;justify-content:flex-end;margin:12px 4px 0"><span style="font-size:14px;color:var(--brand-hi);font-weight:600">Forgot your password?</span></div>
  <a class="b lg tint-brand" style="width:100%;margin-top:16px">Sign in</a>
  <div class="switch">Need an account? <b>Register</b></div>`) });

// ── /register (and ?ref= invite) → Create Account ──
S["22-register"] = page(heroBg, { ...vp, overlay: modal(`<div class="hd">${logoRow}<div><h2>Create Account</h2><p class="sub">Join ayse on Descall — free chat, voice, and calls.</p></div></div>
  <div class="invite-banner glass-chip"><div class="av" style="--s:28px;background:linear-gradient(145deg,#ff7a7f,#e5484d);font-size:12px">A</div>Invited by @ayse</div>
  <div class="gbtn" style="margin-top:14px">${GOOGLE}Sign up with Google</div>
  <p class="fhint" style="text-align:center">Fastest path: continue with Google, then you’re in.</p>
  <div class="or" style="margin:12px 4px">or</div>
  <div class="fi">${I.user}<span class="v">demir</span></div>
  ${pwd()}
  <div class="pstr"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div>
  ${birth}
  <div class="fi" style="margin-top:10px">${I.mail}<span>Email (optional)</span></div>
  <p class="fhint">Adding an email unlocks account recovery, sign-in codes, and two-factor authentication. You can also add it later in Settings.</p>
  ${terms}
  <a class="b lg tint-brand" style="width:100%;margin-top:16px">Create account</a>
  <div class="switch">Already have an account? <b>Sign in</b></div>`, 460, "compact") }).replace('<html lang="en" class="vp-fixed">', '<html lang="en" class="vp-fixed tall-sheet">');

// ── Forgot password: step 1 (request) and step 2 (code + new password) ──
S["23a-forgot-request"] = page(heroBg, { ...vp, overlay: modal(`${logoRow}<h2>Forgot your password?</h2><p class="sub">Reset your password with a secure email code</p>
  <p style="font-size:14.5px;color:var(--t2);margin-top:18px;line-height:1.5">Enter your username or email. We’ll send a 6-digit code to the email on your account.</p>
  <div class="fi focus" style="margin-top:14px">${I.mail}<span class="v">demir</span><span class="caret" style="margin-left:-8px"></span></div>
  <a class="b lg tint-brand" style="width:100%;margin-top:16px">Send reset code</a>
  <a class="backlink">${I.back}Back to login</a>`) });
S["23b-forgot-reset"] = page(heroBg, { ...vp, overlay: modal(`${logoRow}<h2>Reset password</h2><p class="sub">Enter the code we sent to d•••@icloud.com</p>
  <div class="okb">${I.checkCircle}We sent a 6-digit code to your email.</div>
  <div class="flabel" style="margin:16px 4px 0">6-digit code</div>
  <div class="otp" style="margin-top:8px"><span>4</span><span>8</span><span>1</span><span class="on">2</span><span></span><span></span></div>
  <div class="fi" style="margin-top:14px">${I.lock}<span>New password</span><span class="end">${I.eye}</span></div>
  <div class="fi">${I.lock}<span>Confirm new password</span><span class="end">${I.eye}</span></div>
  <p class="fhint">Password must be at least 10 characters.</p>
  <a class="b lg tint-brand" style="width:100%;margin-top:14px">Reset password</a>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><a class="backlink">${I.back}Back to login</a><span style="margin-top:16px;font-size:14px;color:var(--t3);font-variant-numeric:tabular-nums">Resend code · 0:42</span></div>`) });
S["23c-forgot-done"] = page(heroBg, { ...vp, overlay: modal(`<div style="text-align:center;padding-top:8px"><div class="ico c-green" style="width:64px;height:64px;border-radius:32px;margin:0 auto">${I.check}</div>
  <h2>Password updated</h2><p class="sub">You can now sign in with your new password.</p>
  <a class="b lg tint-brand" style="width:100%;margin-top:22px">Back to login</a></div>`, 400) });

// ── Two-factor verification ──
S["24-two-factor"] = page(heroBg, { ...vp, overlay: modal(`<div class="ico c-blue" style="width:56px;height:56px;border-radius:17px">${L("shield-check")}</div><h2>Two-Factor Verification</h2><p class="sub">Enter the code we sent to d•••@icloud.com</p>
  <div class="otp"><span>7</span><span>3</span><span>0</span><span>9</span><span>1</span><span class="on"></span></div>
  <div class="err">${I.alert}Incorrect code.</div>
  <a class="b lg tint-brand" style="width:100%;margin-top:16px">Verify</a>
  <a class="backlink">${I.back}Back to login</a>`) });

// ── Social signup step (new Google account needs Terms + birth date) ──
S["25-social-signup"] = page(heroBg, { ...vp, overlay: modal(`${logoRow}<h2>Create Account</h2><p class="sub">Finish creating your account</p>
  <div class="glass-chip" style="margin-top:16px;border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:12px"><span style="width:36px;height:36px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center">${GOOGLE}</span><div style="font-size:14px"><b style="display:block">Google</b><span class="muted">demir@gmail.com</span></div><span style="margin-left:auto;color:var(--ok)">${I.checkCircle}</span></div>
  ${birth}
  ${terms}
  <a class="b lg tint-brand" style="width:100%;margin-top:16px">Create Account</a>
  <a class="backlink">${I.back}Back to login</a>`) });

// ── Group invite landing (/invite/:code, /i/:code) ──
const inv = (inner) => `<div class="inv"><div class="inv-card glass heavy">${inner}</div></div>`;
S["26-group-invite"] = page(inv(`<div class="brandrow"><img src="${LOGO}"/>Descall</div>
  <h1>You've been invited to join a group</h1>
  <div class="inv-target glass-chip"><div class="av sq" style="--s:76px;background:linear-gradient(145deg,#6c86ff,#8a5cf6);font-size:26px">AE</div><strong>Akşam Ekibi</strong><span>${I.users}8 members</span></div>
  <a class="b lg tint-brand" style="margin-top:20px">${I.login}Log in to join</a>
  <a class="b lg ghost" style="margin-top:10px">Back</a>`), { chrome: false, ...vp });
// ── Server vanity landing (/s/:slug) ──
S["27-server-invite"] = page(inv(`<div class="brandrow"><img src="${LOGO}"/>Descall</div>
  <h1>You've been invited to join a server</h1>
  <div class="inv-target glass-chip"><div class="av sq" style="--s:76px;background:linear-gradient(145deg,#33c4a8,#2a7fd8);font-size:26px">GL</div><strong>Gece Lobisi</strong><span>${I.users}124 members</span></div>
  <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:20px"><a class="b lg ghost">Not now</a><a class="b lg tint-brand">${I.login}Log in to join</a></div>
  <div class="hint" style="margin-top:16px">States: Loading invite… (skeleton) · Server not found · Already a member → Open server · Joining…</div>`), { chrome: false, ...vp });
S["27b-invite-error"] = page(inv(`<div class="brandrow"><img src="${LOGO}"/>Descall</div>
  <h1>You've been invited to join a group</h1>
  <div class="inv-target glass-chip" style="padding:26px"><span class="ico c-red" style="width:56px;height:56px;border-radius:28px">${I.alert}</span><strong style="font-size:18px">Invite not found</strong></div>
  <a class="b lg soft" style="margin-top:20px">Back to Descall</a>`), { chrome: false, ...vp });

// ── /api/marketing/confirm & /api/marketing/unsubscribe (server-rendered HTML) ──
const plain = (ic, c, h, p) => `<div class="plain"><div class="plain-card glass heavy"><div class="brandrow" style="display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:var(--t2)"><img src="${LOGO}" style="width:26px;height:26px;border-radius:8px"/>Descall</div>
  <div class="big ${c}" style="margin-top:24px">${ic}</div><h1>${h}</h1><p>${p}</p><a class="b lg soft" style="margin-top:22px">Go to descall.com</a>
  <p style="font-size:12.5px;color:var(--t3);margin-top:20px">© 2026 Demir Sarp Kurtlar</p></div></div>`;
S["28a-email-confirmed"] = page(plain(L("mail-check"), "c-green", "Descall", "You are confirmed. You can unsubscribe any time."), { chrome: false, ...vp });
S["28b-unsubscribed"] = page(plain(L("mail-x"), "c-slate", "Descall", "You are unsubscribed. We will not send you product emails."), { chrome: false, ...vp });
S["28c-link-invalid"] = page(plain(I.alert, "c-orange", "Descall", "This link is invalid or has already been used."), { chrome: false, ...vp });

// ── /sitemap.html (Express, buildSitemapHtml.js) — content from the live page ──
import fs from "fs";
import { clean } from "./shared.mjs";
const SMAP = JSON.parse(fs.readFileSync(new URL("../data/sitemap.json", import.meta.url)));
S["29-sitemap"] = page(`<div style="display:flex;align-items:center;gap:8px;margin-top:48px;flex-wrap:wrap"><span class="pill glass-chip">${L("house", "sm")}Home</span><span class="pill glass-chip">XML index</span><span class="pill glass-chip">Pages XML</span><span class="pill glass-chip">robots.txt</span></div>
  <section style="padding-top:24px"><h1 class="page grad">Sitemap</h1><p class="lead">Every public Descall page in one place — product, Discord alternative guides, blog, and legal. Private app routes are intentionally excluded.</p></section>
  ${SMAP.map((sec, i) => `<section class="section tight"><div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="gi ${["c-blue", "c-violet", "c-orange", "c-green"][i]}">${I[["sparkles", "servers", "file", "user"][i]]}</span><h2 style="font-size:24px;font-weight:700;letter-spacing:-0.022em">${sec.title.replace("&amp;", "&")}</h2><span class="tagc">${sec.cards.length}</span></div>
    <div class="grid g3">${sec.cards.map((c) => `<a class="glass" style="border-radius:20px;padding:18px 20px;display:block"><div style="font-size:15.5px;font-weight:650;letter-spacing:-0.012em">${clean(c.t)}</div><div style="font-family:var(--mono);font-size:12px;color:var(--brand-hi);margin-top:4px">${c.p}</div><div style="font-size:13.5px;line-height:1.5;color:var(--t3);margin-top:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${clean(c.d)}</div></a>`).join("")}</div></section>`).join("")}`);

// ── Cookie consent (first visit, any marketing page) ──
S["30-cookie-consent"] = page(heroBg, { ...vp, overlay: `<div class="cookie glass heavy" role="dialog"><span class="ci">${L("cookie")}</span><div class="ct"><b>Cookie preferences</b><span>Optional analytics only. Essentials stay on.</span> <a>Privacy</a></div><div class="acts" style="display:flex;gap:8px"><a class="b sm ghost">Reject</a><a class="b sm tint-brand">Accept</a></div></div>` });

// ── Mobile header menu (≤1024) ──
S["31-mobile-menu"] = page(heroBg, { ...vp, overlay: `<div class="sheet glass heavy">
  <a class="row2">${L("layout-grid")}Features<span class="chev">${I.chevR}</span></a><a class="row2">${I.download}Download<span class="chev">${I.chevR}</span></a><a class="row2">${L("circle-help")}FAQ<span class="chev">${I.chevR}</span></a>
  <div style="height:0.5px;background:rgba(255,255,255,0.12);margin:8px 14px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px"><a class="b ghost">Sign In</a><a class="b tint-brand">Start free</a></div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px"><span style="font-size:15px;font-weight:600;color:var(--t2)">Language</span><div class="lang glass-chip"><span>TR</span><span class="lens">EN</span></div></div>
</div><!-- data-only="mobile" -->` }).replace('<div class="site">', '<div class="site menu-dim">').replace(`<a class="menu-btn glass-chip" title="Open menu">${L("menu")}</a>`, `<a class="menu-btn glass-chip" title="Close menu" style="z-index:300">${I.x}</a>`);
export default S;
