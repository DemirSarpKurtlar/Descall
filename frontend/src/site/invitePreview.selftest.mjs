/**
 * Invite link previews on the Cloudflare Pages worker (public/_worker.js + public/invite-preview.js).
 * WhatsApp, Instagram, Telegram, X and iMessage read the head of /servers/join/:code,
 * /invite/:code, /i/:code and /s/:slug: each must carry the invite's own Open Graph /
 * Twitter card, escaped, noindex, and fall back to the plain shell on any failure.
 * No network: fetch, the edge cache and HTMLRewriter are stand-ins.
 * Run: node src/site/invitePreview.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---- HTMLRewriter stand-in: the selector forms and element methods invite-preview.js uses.
const VOID = new Set(["meta", "link"]);
function parseSelector(sel) {
  const m = /^([a-z]+)((?:\[[^\]]+\])*)$/i.exec(sel);
  assert.ok(m, `unsupported selector in stand-in: ${sel}`);
  const conds = [...m[2].matchAll(/\[([a-z-]+)(?:(\^?=)"([^"]*)")?\]/gi)].map((c) => ({ name: c[1], op: c[2] || "", value: c[3] }));
  return { tag: m[1].toLowerCase(), conds };
}
function attrsOf(openTag) {
  const out = {};
  for (const a of openTag.matchAll(/([a-z:-]+)="([^"]*)"/gi)) out[a[1].toLowerCase()] = a[2];
  return out;
}
function matches(attrs, conds) {
  return conds.every(({ name, op, value }) => {
    if (!(name in attrs)) return false;
    if (op === "=") return attrs[name] === value;
    if (op === "^=") return attrs[name].startsWith(value);
    return true;
  });
}
function applyRule(html, selector, handlers) {
  const { tag, conds } = parseSelector(selector);
  const re = VOID.has(tag) ? new RegExp(`<${tag}\\b[^>]*>`, "gi") : new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  const hits = [...html.matchAll(re)].filter((m) => matches(attrsOf(m[0].match(/^<[^>]*>/)[0]), conds));
  for (const m of hits.reverse()) {
    let removed = false;
    let appended = "";
    const el = {
      getAttribute: (n) => attrsOf(m[0])[n] ?? null,
      remove: () => {
        removed = true;
      },
      append: (content, { html: isHtml = false } = {}) => {
        appended += isHtml ? content : String(content).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      },
    };
    handlers.element(el);
    let next = m[0];
    if (removed) next = "";
    else if (appended) next = VOID.has(tag) ? next + appended : next.replace(new RegExp(`</${tag}>$`, "i"), `${appended}</${tag}>`);
    html = html.slice(0, m.index) + next + html.slice(m.index + m[0].length);
  }
  return html;
}
globalThis.HTMLRewriter = class {
  constructor() {
    this.rules = [];
  }
  on(selector, handlers) {
    this.rules.push([selector, handlers]);
    return this;
  }
  transform(response) {
    const rules = this.rules;
    const stream = new ReadableStream({
      async start(controller) {
        let html = await response.text();
        // The real rewriter never re-parses inserted markup: run removals before inserts.
        const ordered = [...rules.filter(([s]) => s !== "head"), ...rules.filter(([s]) => s === "head")];
        for (const [selector, handlers] of ordered) html = applyRule(html, selector, handlers);
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
    return new Response(stream, { status: response.status, headers: response.headers });
  }
};

// ---- Edge cache stand-in.
const cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const hit = cacheStore.get(new URL(req.url).toString());
      return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
    },
    async put(req, res) {
      cacheStore.set(new URL(req.url).toString(), { body: await res.text(), headers: Object.fromEntries(res.headers) });
    },
  },
};

// ---- Backend stand-in: every outgoing request is recorded; anything unknown fails the test.
const calls = [];
let backendDown = false;
let slowBackend = false;
const SERVER_REPLY = {
  invite: { code: "AbCd1234", url: "https://descall.com/servers/join/AbCd1234", expiresAt: null, inviter: { username: "x" } },
  server: {
    id: "srv-1",
    name: 'Night <Owls> & "Friends"',
    iconUrl: "https://cdn.descall.com/icons/srv-1.png",
    bannerUrl: null,
    description: "We play late. <script>alert(1)</script>",
    memberCount: 1234,
    onlineCount: 56,
    isMember: false,
  },
};
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  calls.push({ url: url.toString(), headers: init.headers || {} });
  if (url.origin !== "https://des-call.onrender.com" && url.origin !== "https://api.example.test") {
    throw new Error(`unexpected network request: ${url}`);
  }
  if (backendDown) return new Response("{}", { status: 503 });
  if (slowBackend) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 5000);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.pathname === "/api/servers/invites/AbCd1234") return json(SERVER_REPLY);
  if (url.pathname === "/api/servers/invites/NoIcon99") {
    return json({ ...SERVER_REPLY, server: { ...SERVER_REPLY.server, name: "Plain", iconUrl: "/media/x.png", description: null, memberCount: 1, onlineCount: null } });
  }
  if (url.pathname === "/api/servers/vanity/night-owls") return json({ vanity: { slug: "night-owls" }, server: { ...SERVER_REPLY.server, name: "Owls" } });
  if (url.pathname === "/api/groups/invite-links/grp42") {
    return json({ invite: { code: "grp42" }, group: { id: "g1", name: "Weekend Squad", avatarUrl: null, memberCount: 7 }, alreadyMember: false });
  }
  if (url.pathname.startsWith("/api/servers/invites/")) return json({ error: "Invite invalid or expired.", code: "INVITE_INVALID" }, 404);
  return json({ error: "not found" }, 404);
};

const { default: worker } = await import("../../public/_worker.js");
const ip = await import("../../public/invite-preview.js");
const { APP_STORE_URL } = await import("./appStoreLink.js");
const { OG_INVITE_IMAGES } = await import("./ogImages.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHELL = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<body[\s\S]*$/i, "<body><div id=\"root\"></div></body></html>");
assert.match(SHELL, /<meta property="og:title"/, "test shell is the real index.html head");
assert.match(SHELL, /<meta name="apple-itunes-app" content="app-id=6820558264" \/>/, "index.html carries the Smart App Banner");

const env = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/index.html") return new Response(null, { status: 308, headers: { location: "/" } });
      if (pathname === "/") return new Response(SHELL, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response("missing", { status: 404 });
    },
  },
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };

async function get(p, headers = {}, e = env) {
  const res = await worker.fetch(new Request(`https://descall.com${p}`, { headers }), e, ctx);
  await Promise.all(waits.splice(0));
  return { res, html: await res.text() };
}
const meta = (html, attr, key) => html.match(new RegExp(`<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" content="([^"]*)"`))?.[1] ?? null;
const countOf = (html, re) => (html.match(re) || []).length;
const BOT = { "user-agent": "WhatsApp/2.23.20.0 A" };

// 1. Server invite, English: per-invite card, escaped, noindex, one of each tag.
{
  const { res, html } = await get("/servers/join/AbCd1234?utm_source=x", BOT);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, follow");
  assert.equal(res.headers.get("cache-control"), "no-cache", "the shell itself is never cached");
  assert.match(res.headers.get("vary") || "", /accept-language/i);
  const title = "Join Night &lt;Owls&gt; &amp; &quot;Friends&quot; on Descall";
  assert.equal(meta(html, "property", "og:title"), title);
  assert.equal(meta(html, "name", "twitter:title"), title);
  assert.ok(html.includes(`<title>${title}</title>`), "document title is the invite title");
  assert.equal(countOf(html, /<title>/g), 1, "exactly one <title>");
  const desc = meta(html, "property", "og:description");
  assert.ok(desc.startsWith("1,234 members, 56 online · We play late."), desc);
  assert.ok(!/<script>alert/.test(html) && desc.includes("&lt;script&gt;"), "description is escaped");
  assert.equal(meta(html, "property", "og:url"), "https://descall.com/servers/join/AbCd1234", "og:url has no tracking query");
  assert.equal(meta(html, "property", "og:image"), "https://cdn.descall.com/icons/srv-1.png", "server icon is the image");
  assert.equal(meta(html, "property", "og:image:width"), null, "icon size is not claimed as 1200x630");
  assert.equal(meta(html, "name", "twitter:card"), "summary_large_image");
  assert.equal(meta(html, "name", "robots"), "noindex, follow");
  assert.equal(meta(html, "property", "og:locale"), "en_US");
  assert.equal(meta(html, "name", "apple-itunes-app"), "app-id=6820558264, app-argument=https://descall.com/servers/join/AbCd1234");
  for (const key of ["og:title", "og:description", "og:url", "og:image", "og:type", "og:site_name", "og:locale"]) {
    assert.equal(countOf(html, new RegExp(`property="${key}"`, "g")), 1, `one ${key}`);
  }
  for (const key of ["twitter:card", "twitter:title", "twitter:image", "description", "robots", "apple-itunes-app"]) {
    assert.equal(countOf(html, new RegExp(`name="${key}"`, "g")), 1, `one ${key}`);
  }
  assert.ok(!/rel="canonical"/.test(html), "no homepage canonical on an invite page");
  assert.ok(!/hreflang=/.test(html), "no homepage hreflang set on an invite page");
  assert.ok(html.includes('<div id="root"></div>'), "still the app shell");
  const call = calls.find((c) => c.url.endsWith("/api/servers/invites/AbCd1234"));
  assert.ok(call, "asked the public invite endpoint");
  assert.equal(call.url, "https://des-call.onrender.com/api/servers/invites/AbCd1234");
  assert.equal(call.headers.authorization, undefined, "never sends credentials: logged-out data only");
}

// 2. Edge cache: the second request for the same code does not reach the backend.
{
  const before = calls.length;
  const { html } = await get("/invite/s/AbCd1234", { ...BOT, "accept-language": "tr-TR,tr;q=0.9,en;q=0.8" });
  assert.equal(calls.length, before, "served from the edge cache");
  assert.equal(meta(html, "property", "og:title"), "Descall'da Night &lt;Owls&gt; &amp; &quot;Friends&quot; sunucusuna katıl".replace(/'/g, "&#39;"));
  assert.ok(meta(html, "property", "og:description").startsWith("1.234 üye, 56 çevrimiçi"), "Turkish copy and number format");
  assert.equal(meta(html, "property", "og:locale"), "tr_TR");
  assert.equal(meta(html, "property", "og:url"), "https://descall.com/invite/s/AbCd1234");
  const cached = [...cacheStore.values()].find((v) => v.body.includes("Night"));
  const stored = JSON.parse(cached.body);
  assert.deepEqual(Object.keys(stored), ["server"], "no invite / inviter data in the cache");
  assert.deepEqual(Object.keys(stored.server).sort(), ["description", "iconUrl", "memberCount", "name", "onlineCount"], "the cache keeps only the preview fields");
  assert.match(cached.headers["cache-control"], /max-age=300/, "five minute edge cache");
}

// 3. No icon: the default invite card (per language), sized 1200x630.
{
  const { html } = await get("/servers/join/NoIcon99", BOT);
  assert.equal(meta(html, "property", "og:image"), `https://descall.com${OG_INVITE_IMAGES.en}`, "relative icon URLs are not used");
  assert.equal(meta(html, "property", "og:image:width"), "1200");
  assert.equal(meta(html, "property", "og:description"), "1 member · Voice chat, servers and screen share. Free to join.");
  const tr = await get("/servers/join/NoIcon99", { ...BOT, "accept-language": "tr" });
  assert.equal(meta(tr.html, "property", "og:image"), `https://descall.com${OG_INVITE_IMAGES.tr}`);
  for (const file of Object.values(OG_INVITE_IMAGES)) assert.ok(fs.existsSync(path.join(root, "public", file)), `${file} exists`);
}

// 4. Group invite (/invite/:code and /i/:code) and server vanity (/s/:slug).
{
  const { html } = await get("/i/grp42", BOT);
  assert.equal(meta(html, "property", "og:title"), "Join Weekend Squad on Descall");
  assert.equal(meta(html, "property", "og:description"), "7 members · You&#39;re invited to a group chat on Descall. Free to join.");
  assert.equal(meta(html, "property", "og:url"), "https://descall.com/i/grp42");
  assert.ok(calls.some((c) => c.url === "https://des-call.onrender.com/api/groups/invite-links/grp42"));
  const tr = await get("/invite/grp42", { "accept-language": "de-DE, tr;q=0.7, en;q=0.5" });
  assert.equal(meta(tr.html, "property", "og:title"), "Descall&#39;da Weekend Squad grubuna katıl");
  // The iOS app routes /invite/:code as a server invite (src/lib/deepLinks.js): no app-argument.
  assert.equal(meta(html, "name", "apple-itunes-app"), "app-id=6820558264", "group invite: plain Smart App Banner");
  const vanity = await get("/s/Night-Owls", BOT);
  assert.equal(meta(vanity.html, "property", "og:title"), "Join Owls on Descall");
  assert.equal(meta(vanity.html, "name", "apple-itunes-app"), "app-id=6820558264", "vanity: plain Smart App Banner");
  assert.ok(calls.some((c) => c.url === "https://des-call.onrender.com/api/servers/vanity/night-owls"));
  const unknownGroup = await get("/invite/nope99", BOT);
  assert.equal(meta(unknownGroup.html, "property", "og:title"), "Descall | Voice Chat, Servers &amp; Screen Share", "unknown group code: generic card");
  assert.equal(meta(unknownGroup.html, "name", "apple-itunes-app"), "app-id=6820558264", "unknown group code: banner kept, no argument");
}

// 5. Fallbacks: unknown code, malformed code, backend down, timeout: the plain shell.
for (const [label, p, setup] of [
  ["unknown code", "/servers/join/Gone0000", () => {}],
  ["backend down", "/servers/join/Down0000", () => { backendDown = true; }],
  ["timeout", "/servers/join/Slow0000", () => { slowBackend = true; }],
]) {
  setup();
  const started = Date.now();
  const { res, html } = await get(p, {});
  backendDown = false;
  slowBackend = false;
  assert.equal(res.status, 200, `${label}: still the app shell`);
  assert.equal(meta(html, "property", "og:title"), "Descall | Voice Chat, Servers &amp; Screen Share", `${label}: generic card`);
  assert.equal(meta(html, "name", "apple-itunes-app"), `app-id=6820558264, app-argument=https://descall.com${p}`, `${label}: banner opens the invite`);
  assert.equal(countOf(html, /name="apple-itunes-app"/g), 1);
  if (label === "timeout") assert.ok(Date.now() - started < 2000, "a visitor waits at most the short timeout");
}
{
  const before = calls.length;
  await get("/servers/join/Gone0000", {});
  assert.equal(calls.length, before, "an unknown code is cached briefly (no backend hammering)");
  await get("/servers/join/%3Cscript%3E", {});
  await get("/invite/a", {});
  assert.equal(calls.length, before, "malformed codes never reach the backend");
}

// 6. Other app paths: no Smart App Banner (marketing pages only), head otherwise untouched.
for (const p of ["/app", "/login", "/register", "/direct/x", "/servers"]) {
  const { res, html } = await get(p, BOT);
  assert.equal(res.status, 200);
  assert.ok(!/apple-itunes-app/.test(html), `${p}: no Smart App Banner on the app shell`);
  assert.equal(meta(html, "property", "og:title"), "Descall | Voice Chat, Servers &amp; Screen Share", `${p}: head unchanged`);
}

// 7. API origin override and visitor IP forwarding.
{
  const { html } = await get("/servers/join/AbCd1234", { ...BOT, "cf-connecting-ip": "203.0.113.9" }, { ...env, API_ORIGIN: "https://api.example.test" });
  assert.ok(html.includes("Night"), "cached preview still served");
  cacheStore.clear();
  await get("/servers/join/AbCd1234", { ...BOT, "cf-connecting-ip": "203.0.113.9" }, { ...env, API_ORIGIN: "https://api.example.test" });
  const call = calls.at(-1);
  assert.equal(call.url, "https://api.example.test/api/servers/invites/AbCd1234");
  assert.equal(call.headers["x-forwarded-for"], "203.0.113.9", "the backend rate-limits per visitor, not per edge");
}

// 8. Pure helpers.
assert.equal(ip.previewLang(""), "en");
assert.equal(ip.previewLang("tr"), "tr");
assert.equal(ip.previewLang("en-US,en;q=0.9,tr;q=0.8"), "en");
assert.equal(ip.previewLang("fr-FR"), "en", "unsupported languages fall back to English");
assert.equal(ip.inviteTarget("/servers/join/abc"), null, "server codes are 4-32 characters");
assert.equal(ip.inviteTarget("/servers/join/AbCd1234/extra"), null);
assert.deepEqual(ip.inviteTarget("/invite/s/AbCd1234"), { kind: "server", code: "AbCd1234", apiPath: "/api/servers/invites/AbCd1234" });
assert.equal(ip.inviteTarget("/s/ab"), null);
assert.ok(ip.isPreviewBot("facebookexternalhit/1.1") && ip.isPreviewBot("TelegramBot (like TwitterBot)") && !ip.isPreviewBot("Mozilla/5.0 (iPhone)"));
assert.equal(ip.cleanText("a\u0000b\u202ec  d"), "a b c d");
assert.equal(ip.cleanText("x".repeat(150), 100).length, 100);
assert.equal(ip.normalizePreview("server", { server: { name: "  " } }), null, "nameless reply is no preview");
assert.equal(ip.normalizePreview("server", { server: { name: "S", iconUrl: "javascript:alert(1)" } }).iconUrl, null, "only https images");
assert.equal(ip.escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
assert.ok(APP_STORE_URL.endsWith(`id${ip.APP_STORE_ID}`), "worker App Store id matches src/site/appStoreLink.js");
for (const [lang, file] of Object.entries(OG_INVITE_IMAGES)) {
  const html = ip.inviteHeadHtml({ kind: "server", name: "S", iconUrl: null, memberCount: 0, onlineCount: null, description: "" }, { lang, url: "https://descall.com/s/abc" });
  assert.ok(html.includes(`content="https://descall.com${file}"`), `invite-preview.js default image for ${lang} matches ogImages.js`);
}

// 9. CI runs this file in the release selftest job.
const workflow = fs.readFileSync(path.join(root, "..", ".github/workflows/selftests.yml"), "utf8");
assert.ok(workflow.includes("node src/site/invitePreview.selftest.mjs"), "selftests.yml runs this selftest");

console.log("invitePreview selftest ok");
