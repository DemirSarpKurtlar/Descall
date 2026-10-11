// SEO landings (SeoLandingShell family), blog, legal documents.
import { page, tile, checks, pills, crumbs, faqList, device, kicker, dot, clean, I, L, GH, seo, legal } from "./shared.mjs";
const S = {};
const BLOGB = (await import("/workspace/Descall/frontend/src/site/seo/blogBodies.js")).BLOG_BODIES;
const NICHE = seo.__niche.NICHE_LANDINGS;

/** SeoLandingShell: breadcrumbs → hero (kicker, H1, lead, CTAs, preview) → body → FAQ → bottom CTA. */
function shell({ crumbsList, kick, title, lead, primary = "Start free", secondary = "Compare with Discord", preview = null, body = "", faq = [], tr = false, center = false }) {
  const bottomT = tr ? ["Daha hafif bir Discord alternatifi denemeye hazır mısın?", "Ücretsiz Descall hesabı oluştur — sohbet, ses, ekran paylaşımı ve LFG tek yerde.", "Ücretsiz kayıt ol", "Descall’ı indir", "Özellikleri keşfet", "Sık sorulan sorular"]
    : ["Ready to try a lighter Discord alternative?", "Create a free Descall account — chat, voice, screen share, and LFG in one place.", primary, "Download Descall", "Explore features", "Frequently asked questions"];
  const bottomPrimary = tr ? bottomT[2] : (primary || "Start free");
  return `${crumbs(crumbsList)}
  <header class="${preview ? "hero seo" : ""}" style="padding-top:${preview ? 36 : 28}px;${preview ? "min-height:0" : ""}">
    <div>
      ${kicker(kick, true)}
      <h1 class="page grad">${clean(title)}</h1>
      <p class="lead">${clean(lead)}</p>
      ${primary === null ? "" : `<div class="ctas" style="margin-top:28px"><a class="b lg tint-brand">${primary}</a>${secondary ? `<a class="b lg ghost">${secondary}</a>` : ""}</div>`}
    </div>
    ${preview || ""}
  </header>
  ${body}
  ${faq.length ? `<section class="section"><h2 class="sec" style="margin-bottom:24px">${bottomT[5]}</h2>${faqList(faq, 0)}</section>` : ""}
  <section class="section"><div class="panel2 glass heavy" style="text-align:center;background-image:radial-gradient(60% 120% at 50% 0%, rgba(88,122,246,0.30), transparent 70%)">
    <img src="../../assets/brand/descall-icon.png" style="width:64px;height:64px;border-radius:19px;box-shadow:0 12px 30px rgba(88,122,246,0.45)"/>
    <h2 class="sec" style="margin-top:18px">${bottomT[0]}</h2><p class="lead" style="margin:12px auto 0">${clean(bottomT[1])}</p>
    <div class="ctas" style="justify-content:center;margin-top:24px"><a class="b lg tint-brand">${bottomPrimary}</a><a class="b lg soft">${I.download}${bottomT[3]}</a><a class="b lg ghost">${bottomT[4]}</a></div>
  </div></section>`;
}
const sec = (title, inner, lead = "") => `<section class="section"><h2 class="sec">${clean(title)}</h2>${lead ? `<p class="lead" style="margin-top:12px">${clean(lead)}</p>` : ""}<div style="margin-top:28px">${inner}</div></section>`;
const table = (rows, a = "Capability") => `<div class="tbl glass"><table><thead><tr><th>${a}</th><th class="us">Descall</th><th>Discord</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${clean(r.feature)}</td><td class="us">${clean(r.descall)}</td><td>${clean(r.discord)}</td></tr>`).join("")}</tbody></table></div>`;
const ICONS = [["servers", "c-blue"], ["shield", "c-violet"], ["users", "c-green"], ["headphones", "c-pink"], ["sparkles", "c-orange"], ["monitor", "c-sky"]];

// ── Discord alternative (pillar) ──
S["13-discord-alternative"] = page(shell({
  crumbsList: ["Home", "Discord alternative"], kick: "Discord alternative · 2026",
  title: "The best free Discord alternative for friends & gamers",
  lead: "Descall is a free Discord alternative with real servers (roles, channels, templates), real-time chat, crystal-clear voice/video, screen share, and built-in Valorant LFG — without Nitro paywalls for the features you actually use.",
  preview: device("06-server", "Descall UI — servers, chat, voice, and LFG in one app"),
  faq: seo.ALTERNATIVE_HUB_FAQ,
  body: `
  ${sec("Switch in three steps", `<div class="steps">${[["Create a free account", "Sign in with Google or email — no installer required to try the web app."], ["Spin up a server", "Pick a template (friends, gaming, Valorant) or start empty. Roles and channels ship ready."], ["Invite the squad", "Share a link, hop into voice, and keep Discord only if you still need the giant bot stack."]]
    .map(([h, p], i) => `<div class="step glass"><span class="n tint-brand">${i + 1}</span><h3>${h}</h3><p>${clean(p)}</p></div>`).join("")}</div>`)}
  ${sec("Why people search for a Discord alternative", `<div class="panel2 glass" style="padding:28px 32px">${checks(["Servers with roles, text & voice channels", "Advanced templates (gaming, Valorant, community…)", "Free chat, voice, video, and screen share", "Valorant LFG in a dedicated Play tab", "Windows desktop + web + Android", "Cosmetics via DesCoin — core stays free"])}</div>`,
    "Discord is powerful — and heavy. Friend groups and communities often want a lighter Discord alternative: real servers with roles and channels, fewer Nitro prompts, faster calls, and gaming LFG without installing a dozen bots. Descall is built for that.")}
  ${sec("What makes Descall a stronger Discord alternative", `<div class="grid g3">${seo.ALTERNATIVE_PILLARS.map((p, i) => tile(ICONS[i][0], ICONS[i][1], p.title, p.body)).join("")}</div>`)}
  ${sec("Descall vs Discord at a glance", `${table(seo.COMPARE_ROWS)}<p style="margin-top:16px"><a class="inl">Read the full Descall vs Discord comparison →</a></p>`)}
  ${sec("Who should switch to this Discord alternative?", `<div class="grid g4">${[["users", "c-blue", "Friend groups", "DMs plus a ready-made friends server — lounge chat, plans, and always-on voice."], ["gamepad", "c-red", "Gamers & LFG", "Gaming / Valorant server templates, ranked LFG channels, and the Play tab in one app."], ["monitor", "c-violet", "Communities & creators", "Announcements, support, events, stage, and a full staff ladder — without Nitro pressure."], ["zap", "c-orange", "Anyone tired of Nitro pressure", "Keep premium cosmetics optional. Servers, chat, and calls stay free."]].map((x) => tile(...x)).join("")}</div>`)}
  ${pills("Related Discord alternative guides", ["All Discord alternatives — hub", "Apps like Discord", "Discord replacement", "Best Discord alternative for gamers", "Discord alternative for LFG", "For communities", "Voice chat alternative", "For friends", "Discord alternatifi (Türkiye)", "Descall blog"])}`,
}));

// ── Compare Discord ──
S["14-compare-discord"] = page(shell({
  crumbsList: ["Home", "Descall vs Discord"], kick: "Descall vs Discord",
  title: "Discord vs Descall — which fits your group in 2026?",
  lead: "An honest Descall vs Discord comparison for servers, roles, channels, chat, voice, video, screen share, LFG, desktop apps, and pricing. Use this when evaluating Descall as a Discord alternative in 2026.",
  primary: "Try Descall free", secondary: "Discord alternative overview",
  faq: seo.COMPARE_FAQ,
  body: `
  <section class="section tight"><div class="glass heavy" style="border-radius:28px;padding:26px 30px;display:flex;gap:18px;align-items:flex-start">
    <span class="ico c-green" style="flex-shrink:0">${I.checkCircle}</span><div><div class="eyebrow">Quick verdict</div><p style="font-size:18px;line-height:1.55;margin-top:6px"><b>Descall</b> ${clean("wins if you want a lighter Discord alternative with real servers (roles, channels, templates), friends voice, screen share, and Valorant LFG — with free core features.")}</p></div></div>
    <div style="margin-top:28px">${device("09-server-voice", "Descall vs Discord — product preview").replace('class="device glass"', 'class="device glass" style="transform:none;max-width:920px;margin:0 auto"')}</div></section>
  ${sec("Feature-by-feature comparison", table(seo.COMPARE_ROWS, "Feature"))}
  <section class="section"><div class="grid g2">
    <div class="panel2 glass" style="padding:28px"><div style="display:flex;gap:12px;align-items:center"><span class="gi c-blue" style="width:34px;height:34px;border-radius:11px">${I.star}</span><h3 style="font-size:21px">Where Descall is the better Discord alternative</h3></div><div style="margin-top:18px">${checks(["Real servers with roles, channels, and ready-made templates", "Friend-group chat and voice without Nitro friction", "Built-in Valorant LFG instead of fragile bot setups", "Screen-share quality controls tuned for calls", "Modern UI focused on speed — servers without endless chrome"]).replace('class="checks"', 'class="checks" style="grid-template-columns:1fr"')}</div></div>
    <div class="panel2 glass" style="padding:28px"><div style="display:flex;gap:12px;align-items:center"><span class="gi c-slate" style="width:34px;height:34px;border-radius:11px">${L("scale")}</span><h3 style="font-size:21px">Where Discord still leads</h3></div><ul class="checks" style="grid-template-columns:1fr;margin-top:18px">${["Massive bot / integration ecosystem", "Huge public communities with decades of ecosystem tooling", "Broader native client coverage historically"].map((x) => `<li><span class="ck" style="color:var(--t2);background:rgba(255,255,255,0.08)">${I.minus}</span><span>${x}</span></li>`).join("")}</ul></div>
  </div></section>
  ${sec("How to migrate a friend group", `<div class="glass" style="border-radius:24px;padding:10px">${["Create a Descall server from a template (or start from scratch) and invite your core squad.", "Assign roles and tune channel permissions for staff / announcements.", "Pin the Download link for Windows / Android users.", "Move nightly voice + LFG to Descall for two weeks.", "Keep Discord only for bot-heavy communities you still need."].map((x, i) => `<div style="display:flex;gap:16px;align-items:center;padding:14px 16px;${i ? "border-top:0.5px solid rgba(255,255,255,0.08)" : ""}"><span class="n tint-brand" style="width:30px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-weight:750;font-size:14px;flex-shrink:0">${i + 1}</span><span style="font-size:16px">${x}</span></div>`).join("")}</div><p style="margin-top:16px"><a class="inl">Read the full migration guide →</a></p>`)}
  ${pills("More comparisons", ["Discord alternatives hub", "Apps like Discord", "Discord competitors 2026", "Discord vs Descall article", "Discord replacement", "Descall features"])}`,
}));

// ── Alternatives list ──
const OPTS = [["Descall", "Best free Discord alternative for friend groups and Valorant LFG — chat, voice, video, screen share, Windows + Android.", true], ["Discord", "Still the default for huge communities and bots. Heavy for small groups that only need calls and LFG."], ["Guilded", "Servers + calendars with a gaming tilt. More structure than friend DMs need; Descall stays lighter for daily voice."], ["TeamSpeak / Mumble", "Voice-first classics. Weak for modern chat, presence, mobile, and productized LFG workflows."], ["Telegram", "Great messengers and channels. Not a drop-in Discord alternative for persistent group voice + screen share habits."], ["Slack", "Work-first chat. Huddles exist, but gamers looking for a Discord alternative usually want evenings, not tickets."]];
const altSrc = (await import("fs")).readFileSync("/workspace/Descall/frontend/src/site/pages/AlternativesPage.jsx", "utf8");
S["15-alternatives"] = page(shell({
  crumbsList: ["Home", "Alternatives"], kick: "Discord alternatives · 2026",
  title: "Discord alternatives compared — pick by what you actually need",
  lead: "Searching for Discord alternatives? Most lists recycle the same voice apps. Here’s a clearer take — and why Descall wins for friends, LFG, and free core chat/calls.",
  primary: "Why Descall", secondary: "Download", faq: seo.ALTERNATIVES_FAQ,
  body: `
  ${sec("How to choose a Discord alternative", `<div class="steps">${["List must-have features (voice, screen share, LFG, mobile).", "Check whether core chat/calls are free or paywalled.", "Try a week with your actual friend group — not a demo account."].map((p, i) => `<div class="step glass"><span class="n tint-brand">${i + 1}</span><p style="margin-top:14px;color:var(--t1);font-size:16px">${p}</p></div>`).join("")}</div>`,
    "Start with your real job-to-be-done: friend DMs, group voice, screen share, or gaming LFG. If you need mega-servers and bot ecosystems, Discord still leads. If you want a lighter Discord alternative that keeps communication free, Descall is built for you.")}
  ${sec("Top Discord alternatives compared", `<div class="grid g3">${OPTS.map(([n, b, hl]) => `<article class="tile2 glass ${hl ? "heavy" : ""}" style="${hl ? "box-shadow:inset 0 0 0 1.5px rgba(143,166,255,0.55),0 18px 48px rgba(88,122,246,0.25)!important" : ""}">
    <div style="display:flex;align-items:center;gap:12px">${hl ? `<img src="../../assets/brand/descall-icon.png" style="width:44px;height:44px;border-radius:13px"/>` : `<div class="ico c-slate" style="font-size:17px;font-weight:750">${n[0]}</div>`}<h3 style="margin:0">${n}</h3></div>
    <p style="margin-top:12px">${clean(b)}</p><span class="more">Learn more${I.chevR}</span></article>`).join("")}</div>`)}
  ${pills("Deep dives", ["Why Descall", "Best for gamers", "LFG guide", "Leave Nitro guide", "Türkiye / Turkish"])}`,
}));

// ── Niche landing template (communities; same template: for-lfg, for-voice-chat, for-friends, apps-like-discord, discord-replacement, gamers) ──
const N = NICHE["/discord-alternative-for-communities"];
S["16-niche-communities"] = page(shell({
  crumbsList: ["Home", "Discord alternative for communities"], kick: N.kicker, title: N.h1, lead: N.lead, secondary: "Download",
  preview: device("09-server-voice", N.h1), faq: N.faq,
  body: `
  <section class="section"><div class="panel2 glass panel split" style="align-items:start">
    <div><h2 class="sec">${clean(N.answerTitle)}</h2><p class="lead" style="margin-top:14px;font-size:17px">${clean(N.answer)}</p></div>
    <div class="glass-chip" style="border-radius:24px;padding:24px">${checks(N.bullets).replace('class="checks"', 'class="checks" style="grid-template-columns:1fr"')}</div>
  </div></section>
  <section class="section"><div class="grid g3">${N.sections.map((s, i) => `<article class="tile2 glass"><div class="ico ${ICONS[i][1]}">${I[ICONS[i][0]]}</div><h3>${clean(s.h)}</h3><p>${clean(s.p)}</p></article>`).join("")}</div></section>`,
}));

// ── Turkey (TR copy) ──
S["17-turkey"] = page(shell({
  tr: true, crumbsList: ["Ana sayfa", "Discord alternatifi", "Türkiye"], kick: "Türkiye · Discord alternatifi",
  title: "Türkiye için en iyi Discord alternatifi: Descall",
  lead: "Discord alternatifi arayan Türk oyuncu ve arkadaş grupları için Descall: gerçek sunucular (roller, kanallar, şablonlar), ücretsiz sohbet, sesli/görüntülü arama, ekran paylaşımı ve Valorant LFG — Nitro zorunluluğu olmadan.",
  primary: "Ücretsiz kayıt ol", secondary: "Windows / Android indir", preview: device("02-dm", ""), faq: seo.TURKEY_FAQ,
  body: `
  ${sec("Neden Türkiye’de Discord alternatifi aranıyor?", "", "Birçok ekip Discord’u seviyor ama Nitro baskısı, ağır arayüz ve LFG için bot karmaşası istemiyor. Descall, Türkçe arayüz seçeneği, hazır sunucu şablonları ve oyuncu odaklı Play sekmesiyle daha hafif bir Discord alternatifi sunar. Özellikle 5–100 kişilik klanlar, okul grupları ve Valorant partileri için roller + kanallar + ses odası ister — bot labirenti olmadan.")}
  ${sec("Descall ile neler yaparsın?", `<div class="panel2 glass" style="padding:28px 32px">${checks(["Sunucular: yazı / ses / stage kanalları, kategoriler ve yavaş mod", "Roller ve kanal izinleri (Admin, Mod, VIP…)", "Hazır şablonlar: oyun, Valorant, arkadaş, topluluk, ders, yayıncı", "Anlık mesajlaşma ve DM’ler", "Sesli / görüntülü arama + ekran paylaşımı", "Valorant LFG lobileri ve parti kodları", "Windows masaüstü, web ve Android", "Ücretsiz temel özellikler — kozmetikler DesCoin ile isteğe bağlı"])}</div>`)}
  <section class="section prose" style="max-width:820px"><h2 class="sec" style="font-size:40px;margin:0">Türkiye’de Discord alternatifi seçerken nelere bak?</h2>
    <p>Ücretsiz ses/görüntü, sunucu rolleri, Türkçe arayüz, mobil erişim ve davetle hızlı ekip toplama çoğu grup için yeterlidir. Dev bot ekosistemi veya on binlerce üyeli kamu sunucuları için Discord hâlâ güçlüdür; Descall klan, sınıf ve oyuncu toplulukları için tasarlandı.</p>
    <p>${clean("Discord benzeri uygulamalar veya bir Discord muadili arıyorsan önce işe bak: sadece mesaj mı, yoksa ses + ekran paylaşımı + sunucu mu? Descall ikinci grup içindir — klan, sınıf ve Valorant partileri için Türkçe arayüzlü, ücretsiz bir Discord alternatifi.")}</p>
    <p>Hemen denemek için <a>ücretsiz hesap aç</a>; masaüstü istersen <a>Windows kurulumunu</a> kullan.</p></section>
  ${pills("İlgili sayfalar", ["English: Discord alternative", "Descall vs Discord", "Gamers / LFG", "Discord alternatives (English list)", "Türkçe ana sayfa"])}`,
}), { lang: "tr", tr: true });

// ── Blog index ──
const fmt = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
S["18-blog"] = page(shell({
  crumbsList: ["Home", "Blog"], kick: "Blog", title: "Descall blog — Discord alternatives & LFG",
  lead: "Practical guides on Discord alternatives, Valorant LFG, voice chat, and moving friend groups to Descall.",
  primary: null, secondary: "",
  body: `<section class="section tight"><div class="grid g3">${seo.BLOG_POSTS.map((p, i) => `<article class="post-card glass ${i === 0 ? "feat heavy" : ""}">
    <div class="tags">${p.tags.map((t) => `<span class="tagc">${clean(t)}</span>`).filter((x) => !/>\s*</.test(x)).join("")}</div>
    <h3>${clean(p.title)}</h3><p>${clean(p.description)}</p>
    <div class="meta">${L("calendar", "sm")}${fmt(p.date)}<span style="margin-left:auto;color:var(--brand-hi);font-weight:650;display:flex;align-items:center;gap:4px">Read${I.chevR.replace('class="i', 'class="i sm')}</span></div></article>`).join("")}</div></section>`,
}));

// ── Blog post ──
const post = seo.BLOG_POSTS.find((p) => p.slug === "discord-vs-descall");
S["19-blog-post"] = page(`
  ${crumbs(["Home", "Blog", clean(post.title)])}
  <article style="max-width:780px;margin:0 auto">
    <header style="padding-top:28px">
      <div class="tags" style="display:flex;gap:6px">${post.tags.map((t) => `<span class="tagc">${t}</span>`).join("")}</div>
      <h1 class="page grad" style="font-size:52px">${post.title}</h1>
      <p class="lead">${post.description}</p>
      <div style="display:flex;align-items:center;gap:12px;margin-top:22px;font-size:14px;color:var(--t3)">
        <img src="../../assets/brand/descall-icon.png" style="width:36px;height:36px;border-radius:11px"/><div><b style="color:var(--t1);display:block;font-size:14.5px">Descall</b>Published: ${post.date}${post.updated && post.updated !== post.date ? ` · Updated: ${post.updated}` : ""}</div>
        <span style="flex:1"></span><a class="b sm tint-brand">Try Descall</a><a class="b sm ghost">Discord alternative</a></div>
    </header>
    <div class="glass" style="border-radius:28px;padding:12px 36px 32px;margin-top:32px">
      <div class="prose" style="max-width:none">${BLOGB[post.slug].sections.map((s) => `<h2>${clean(s.h)}</h2><p>${clean(s.p)}</p>`).join("")}</div>
    </div>
    <section class="section tight"><h2 style="font-size:24px;font-weight:700;margin-bottom:14px">Frequently asked questions</h2>${faqList(seo.BLOG_FAQ_BY_SLUG[post.slug] || [], 0)}</section>
    ${pills("Related guides", seo.BLOG_RELATED.map((x) => x.label))}
    <p style="margin-top:24px"><a class="inl">← Back to blog</a></p>
  </article>
`);

// ── Legal documents (LegalDocument: hero, intro, "At a glance" cards, sticky TOC, sections, contact) ──
const SICON = [["shield", "c-blue"], ["file", "c-violet"], ["user", "c-green"], ["folder", "c-orange"], ["sliders", "c-sky"], ["hash", "c-pink"], ["lock", "c-teal"], ["bag", "c-slate"]];
function legalDoc(type, { maxSections = 99 } = {}) {
  const d = legal[type];
  const slug = (h, i) => (d.cards.find((c) => c.heading === h) || {}).id;
  return page(`
  ${crumbs(["Home", d.title])}
  <article style="padding-top:28px">
    <header class="legal-hero"><div><div class="eyebrow" style="color:var(--brand-hi)">Descall</div><h1 class="page grad" style="margin-top:8px">${d.title}</h1>
      <span class="glass-chip" style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 14px;border-radius:16px;font-size:13px;color:var(--t2)">${L("calendar", "sm")}${d.updated}</span></div></header>
    <p class="lead" style="margin-top:22px;max-width:860px">${d.intro}</p>
    ${d.cards.length ? `<section class="section tight"><div class="eyebrow" style="margin-bottom:14px">${d.brief}</div><div class="brief">${d.cards.map((c) => `<a class="glass">${`<span>${c.label}</span><strong>${c.heading}</strong><em>${c.excerpt}</em>`}</a>`).join("")}</div></section>` : ""}
    <section class="section tight legal">
      <nav class="toc glass panel"><p class="eyebrow">${d.toc}</p><ol>${d.sections.map((s, i) => `<li class="${i === (type === "copyright" ? 0 : 1) ? "on" : ""}">${s.heading}</li>`).join("")}</ol></nav>
      <div>${d.sections.slice(0, maxSections).map((s, i) => `<section class="lsec glass ${/right/i.test(s.heading) ? "rights" : ""}"><h2><span class="gi ${SICON[i % 8][1]}">${I[SICON[i % 8][0]]}</span>${s.heading}</h2>${s.paragraphs.map((p) => `<p>${clean(p)}</p>`).join("")}</section>`).join("")}
        ${d.sections.length > maxSections ? `<div class="hint" style="text-align:center;margin:18px 0">… ${d.sections.length - maxSections} more sections continue in the same card style (mockup truncated; full text is in legalContent.js) …</div>` : ""}
        <section class="lsec glass heavy" style="margin-top:12px"><h2><span class="gi c-blue">${I.mail}</span>${d.contact.heading}</h2><p>${d.contact.before} <a class="inl">contact@descall.com</a>${d.contact.after}</p></section>
      </div>
    </section>
  </article>`);
}
S["07-privacy"] = legalDoc("privacy", { maxSections: 6 });
S["08-terms"] = legalDoc("terms", { maxSections: 5 });
S["09-copyright"] = legalDoc("copyright");
export default S;
