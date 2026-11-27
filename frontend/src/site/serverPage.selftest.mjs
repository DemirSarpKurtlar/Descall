/**
 * Public server page "Vitrin" on the Cloudflare Pages worker (public/_worker.js +
 * public/server-page.js + server-page-copy.js), UI-BRIEF draft A:
 *   - page on: /s/<slug> is indexable server-rendered HTML (canonical, hreflang, OG with the
 *     generated versioned card, Twitter, JSON-LD Organization + Breadcrumb + Event), every
 *     value escaped, the join button and QR box, the client script, nothing executable inline
 *   - page off / backend slow: the invite landing exactly as before (noindex)
 *   - /og/*.png proxied from the backend with v / lang only, edge-cached, static fallback
 *   - /sitemap-servers.xml proxied, valid XML even when the backend is down
 *   - copy: all 7 languages complete, category / language names equal dir.<lang>.js
 * No network: fetch, the edge cache and the asset store are stand-ins.
 * Run: node src/site/serverPage.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

globalThis.HTMLRewriter = class {
  on() {
    return this;
  }
  transform(response) {
    return response;
  }
};
const cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const hit = cacheStore.get(new URL(req.url).toString());
      return hit ? new Response(hit.body, { status: hit.status || 200, headers: hit.headers }) : undefined;
    },
    async put(req, res) {
      cacheStore.set(new URL(req.url).toString(), { body: Buffer.from(await res.arrayBuffer()), headers: Object.fromEntries(res.headers), status: res.status });
    },
  },
};

const PAGE = {
  slug: "anadolucraft",
  url: "https://descall.com/s/anadolucraft",
  name: 'Anadolu <Craft> & "Co"',
  iconUrl: "https://abc.supabase.co/storage/v1/object/public/i.png",
  bannerUrl: "https://abc.supabase.co/storage/v1/object/public/b.png",
  description: "Sakin survival.\n<script>alert(1)</script>",
  category: "gaming-minecraft",
  language: "tr",
  tags: ["survival", "sezon-7"],
  counts: { members: 4812, online: 637, voice: 41 },
  channels: { text: [{ id: "c1", name: "genel-sohbet" }], voice: [{ id: "v1", name: "Lobi", count: 12 }], total: 2 },
  events: [{ id: "e1", title: "Sezon 7 açılışı", startsAt: "2026-11-29T18:00:00.000Z", endsAt: null, place: "Lobi" }],
  rules: ["Küfür yok", "Grief yasak"],
  pin: "Kayıt adımları #duyurular kanalında.",
  seo: { title: "Anadolu Craft · Türkçe Minecraft survival sunucusu", description: "" },
  version: "AbCdEf1234",
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"><path d="M0 0h7v7H0z"/></svg>',
};

const calls = [];
let pageOn = true;
let backendDown = false;
let slow = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  calls.push({ url: url.toString(), headers: init.headers || {} });
  if (url.origin !== "https://des-call.onrender.com") throw new Error(`unexpected network request: ${url}`);
  if (backendDown) return new Response("{}", { status: 503 });
  if (slow) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 5000);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      });
    });
  }
  if (url.pathname === "/api/public-pages/s/anadolucraft") {
    return pageOn ? Response.json({ page: PAGE }) : Response.json({ code: "PUBLIC_PAGE_OFF" }, { status: 404 });
  }
  if (url.pathname === "/api/public-pages/s/evilqr") return Response.json({ page: { ...PAGE, slug: "evilqr", qrSvg: '<svg onload="alert(1)"></svg>' } });
  if (url.pathname.startsWith("/api/public-pages/s/")) return Response.json({ code: "PUBLIC_PAGE_OFF" }, { status: 404 });
  if (url.pathname === "/api/servers/vanity/anadolucraft") return Response.json({ server: { name: "Anadolu", memberCount: 5, onlineCount: 1 } });
  if (url.pathname.startsWith("/api/public-pages/og/")) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
  if (url.pathname === "/api/public-pages/sitemap-servers.xml") return new Response('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://descall.com/s/anadolucraft</loc></url></urlset>', { headers: { "content-type": "application/xml" } });
  return new Response("{}", { status: 404 });
};

const worker = (await import("../../public/_worker.js")).default;
const sp = await import("../../public/server-page.js");
const copy = await import("../../public/server-page-copy.js");

const SHELL = `<!doctype html><html><head><title>Descall | Voice Chat, Servers &amp; Screen Share</title><meta name="robots" content="index, follow" /></head><body><div id="root"></div></body></html>`;
const env = {
  ASSETS: {
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === "/") return new Response(SHELL, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      if (pathname === "/og-invite.png") return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
      return new Response("missing", { status: 404 });
    },
  },
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
async function get(p, headers = {}) {
  const res = await worker.fetch(new Request(`https://descall.com${p}`, { headers }), env, ctx);
  await Promise.all(waits.splice(0));
  return { res, text: await res.clone().text(), res2: res };
}
const meta = (html, attr, key) => html.match(new RegExp(`<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" content="([^"]*)"`))?.[1] ?? null;
const GOOGLEBOT = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };

// 1. Page on: indexable server-rendered HTML.
{
  const { res, text: html } = await get("/s/anadolucraft?utm_source=x", GOOGLEBOT);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), null, "no noindex header on a public page");
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("cache-control"), /s-maxage=60/);
  assert.ok(res.headers.get("content-security-policy"), "site security headers");
  assert.equal(meta(html, "name", "robots"), "index, follow, max-image-preview:large");
  assert.ok(html.includes('<link rel="canonical" href="https://descall.com/s/anadolucraft">'), "canonical without the query");
  assert.ok(html.includes('hreflang="tr" href="https://descall.com/s/anadolucraft"') && html.includes('hreflang="x-default"'), "self hreflang");
  assert.ok(html.startsWith("<!doctype html>\n<html lang=\"tr\""), "server language");
  assert.equal(meta(html, "property", "og:title"), "Anadolu Craft · Türkçe Minecraft survival sunucusu");
  assert.equal(meta(html, "property", "og:image"), "https://descall.com/og/s/anadolucraft.png?v=AbCdEf1234&amp;lang=tr", "generated, versioned card");
  assert.equal(meta(html, "property", "og:image:width"), "1200");
  assert.equal(meta(html, "name", "twitter:card"), "summary_large_image");
  assert.equal(meta(html, "name", "apple-itunes-app"), "app-id=6820558264, app-argument=https://descall.com/s/anadolucraft");
  assert.equal(meta(html, "property", "og:description"), "Sakin survival. &lt;script&gt;alert(1)&lt;/script&gt;", "description from the server text, escaped");
  assert.ok(!/<script>alert/.test(html), "no injected script");
  assert.ok(html.includes("Anadolu &lt;Craft&gt; &amp; &quot;Co&quot;"), "name escaped");
  // Scripts: JSON-LD + JSON data + one same-origin file (the site CSP forbids inline scripts).
  const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(/type="application\/(ld\+)?json"/.test(s) || / src="\/server-page-client\.js"/.test(s), `script tag allowed by CSP: ${s}`);
  assert.ok(fs.existsSync(path.join(root, "public/server-page-client.js")));
  // JSON-LD.
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const types = ld["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["Organization", "BreadcrumbList", "Event"]);
  const ev = ld["@graph"][2];
  assert.equal(ev.startDate, "2026-11-29T18:00:00.000Z");
  assert.equal(ev.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
  assert.equal(ev.location["@type"], "VirtualLocation");
  assert.equal(ld["@graph"][0].interactionStatistic.userInteractionCount, 4812);
  assert.equal(ld["@graph"][1].itemListElement.length, 3);
  // Body: draft A pieces.
  for (const needle of ["Sunucuya katıl", "Ücretsiz · Uygulama varsa doğrudan açılır", "Kanallar", "genel-sohbet", "12 kişi", "Yaklaşan etkinlik", "Kurallar özeti", "Sabit duyuru", "Telefonda aç", "Topluluklar", "/tr/topluluklar/minecraft", "<b>637</b> çevrimiçi", "<b>4.812</b> üye", "<b>41</b> kişi seste", "#survival", "Bu sayfayı bildir", "data-join", "data-share"]) {
    assert.ok(html.includes(needle), `page shows ${needle}`);
  }
  const data = JSON.parse(html.match(/<script type="application\/json" id="sp-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.slug, "anadolucraft");
  assert.equal(data.api, "https://des-call.onrender.com");
  const call = calls.find((c) => c.url.endsWith("/api/public-pages/s/anadolucraft"));
  assert.ok(call.headers["x-descall-ua"].includes("Googlebot"), "crawler UA passed for 'last crawled'");
}

// 2. Edge cache and an unsafe QR from a bad backend.
{
  const before = calls.length;
  await get("/s/anadolucraft", {});
  assert.equal(calls.filter((c, i) => i >= before && c.url.includes("/public-pages/s/")).length, 0, "page data cached at the edge");
  const { text } = await get("/s/evilqr", {});
  assert.ok(!text.includes("onload"), "a QR SVG with handlers is dropped");
}

// 3. Page off / backend down / slow: the invite landing (noindex), as before.
{
  cacheStore.clear();
  pageOn = false;
  const { res, text } = await get("/s/anadolucraft", {});
  assert.equal(res.headers.get("x-robots-tag"), "noindex, follow", "off: noindex");
  assert.ok(text.includes('<div id="root"></div>'), "off: the app shell");
  pageOn = true;
  cacheStore.clear();
  backendDown = true;
  const down = await get("/s/anadolucraft", {});
  backendDown = false;
  assert.ok(down.text.includes('<div id="root"></div>'), "backend down: the app shell");
  cacheStore.clear();
  slow = true;
  const t0 = Date.now();
  const s = await get("/s/anadolucraft", {});
  slow = false;
  assert.ok(Date.now() - t0 < 4500, "a visitor never waits long");
  assert.ok(s.text.includes('<div id="root"></div>'));
  cacheStore.clear();
}

// 4. Generated cards: only v / lang go upstream, cached, fallback when the backend fails.
{
  const before = calls.length;
  const { res } = await get("/og/s/anadolucraft.png?v=abc&lang=tr&evil=1", {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const up = calls.slice(before).find((c) => c.url.includes("/og/"));
  assert.equal(up.url, "https://des-call.onrender.com/api/public-pages/og/s/anadolucraft.png?v=abc&lang=tr");
  const n = calls.length;
  await get("/og/s/anadolucraft.png?v=abc&lang=tr", {});
  assert.equal(calls.length, n, "second fetch served from the edge cache");
  for (const p of ["/og/invite/GOODCODE.png", "/og/group/grpcode1.png", "/og/invalid.png?lang=de"]) {
    assert.equal((await get(p, {})).res.status, 200, p);
  }
  const n2 = calls.length;
  assert.equal((await get("/og/s/a%2F..%2Fx.png", {})).res.status, 404, "malformed card path: plain 404");
  assert.equal(calls.length, n2, "malformed card paths never reach the backend");
  backendDown = true;
  const fb = await get("/og/s/other.png?v=zzz", {});
  backendDown = false;
  assert.equal(fb.res.status, 200, "backend down: static invite card");
  assert.match(fb.res.headers.get("cache-control"), /max-age=60/);
}

// 5. Sitemap of public pages.
{
  const { res, text } = await get("/sitemap-servers.xml", {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /xml/);
  assert.ok(text.includes("https://descall.com/s/anadolucraft"));
  cacheStore.clear();
  backendDown = true;
  const down = await get("/sitemap-servers.xml", {});
  backendDown = false;
  assert.ok(down.text.includes("<urlset") && !down.text.includes("<url>"), "down: an empty, valid sitemap");
}

// 6. Renderer helpers: languages, meta fallbacks, hidden sections, preview mode.
{
  assert.equal(sp.langForRequest({ language: "de" }, "tr").lang, "de");
  assert.deepEqual(sp.langForRequest({ language: "other" }, "fr-FR,fr;q=0.9"), { lang: "fr", vary: true });
  assert.equal(copy.acceptLang("pt-PT"), "pt-BR");
  assert.equal(copy.pageLang("xx"), "en");
  const bare = { ...PAGE, seo: { title: "", description: "" }, description: "", category: null, language: null, counts: null, channels: null, events: [], rules: [], pin: "", tags: [], qrSvg: null, bannerUrl: null, iconUrl: null };
  const m = sp.pageMeta(bare, "en");
  assert.equal(m.title, 'Anadolu <Craft> & "Co" · Join on Descall');
  assert.ok(m.description.includes("Free to join"));
  const html = sp.renderServerPage(bare, { lang: "en" });
  for (const gone of ['data-s="count"', 'data-s="chan"', 'data-s="ev"', 'data-s="rules"', 'data-s="pin"', 'data-s="tags"', 'class="box qrbox"', 'data-s="desc"']) {
    assert.ok(!html.includes(gone), `hidden section absent: ${gone}`);
  }
  assert.ok(html.includes("<span>A</span>"), "initial when there is no icon");
  const preview = sp.renderServerPage(PAGE, { lang: "tr", preview: true });
  assert.ok(preview.includes('content="noindex, nofollow"') && !preview.includes("server-page-client.js"), "desk preview: no script, noindex");
  assert.equal(sp.safeJson({ a: "</script><b>" }), '{"a":"\\u003c/script\\u003e\\u003cb\\u003e"}');
  assert.equal(sp.ogImageUrl("invalid", null, { lang: "en" }), "https://descall.com/og/invalid.png");
}

// 7. Copy: every language has every key; category / language names match the app.
{
  const keys = Object.keys(copy.PAGE_COPY.tr).sort();
  for (const lang of copy.PAGE_LANGS) {
    assert.deepEqual(Object.keys(copy.PAGE_COPY[lang]).sort(), keys, `${lang} has every key`);
    for (const [k, v] of Object.entries(copy.PAGE_COPY[lang])) assert.ok(String(v).trim(), `${lang}.${k} not empty`);
    const file = path.join(root, `src/i18n/locales/dir.${lang}.js`);
    const mod = await import(file);
    const dir = Object.values(mod).find((o) => o && o.cat && o.lang);
    assert.deepEqual(copy.CATEGORY_LABELS[lang], dir.cat, `${lang} category names = dir.${lang}.js`);
    assert.deepEqual(copy.LANGUAGE_LABELS[lang], dir.lang, `${lang} language names = dir.${lang}.js`);
  }
  const all = JSON.stringify(copy.PAGE_COPY);
  assert.ok(!/valorant|takım bul|takim bul/i.test(all), "no retired feature names");
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(all), "no emoji");
}

console.log("serverPage selftest ok");
