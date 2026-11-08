#!/usr/bin/env node
/**
 * Renders the social preview images (Open Graph / Twitter, 1200x630 PNG) in public/:
 *
 *   og-default.png, og-default-<lang>.png   one default per site language (src/site/ogImages.js)
 *   og-discord.png                          the comparison / niche pages; led by the Descall
 *                                           name, no competitor name in the image
 *   og-invite.png, og-invite-tr.png         invite link previews without a server icon
 *
 *   node scripts/generate-og-images.mjs --only=invite-tr   one invite image
 *   node scripts/generate-og-images.mjs            write every image
 *   node scripts/generate-og-images.mjs --only=tr  one language (or "discord")
 *
 * Each image is an HTML template (COPY below) rendered by Playwright Chromium. Not part of the build:
 * run it when the copy or the brand changes and commit the PNGs. Brand: base #1B1D26,
 * surface #393C4D, accent #587AF5, the mark from public/brand/descall-symbol.svg and the
 * wordmark from public/brand/descall-wordmark-white.svg. Text uses Inter (falls back to
 * Noto Sans / system sans; Inter and Noto both cover Turkish and Cyrillic).
 *
 * Playwright is not a project dependency. The script loads it from PLAYWRIGHT_MODULE, the
 * project's node_modules, or /opt/node22/lib/node_modules/playwright, and uses Chromium
 * from OG_CHROMIUM or /opt/pw-browsers/chromium when that exists (else Playwright's own).
 * Each PNG must stay under MAX_BYTES so link previews load fast.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { OG_DEFAULT_IMAGES, OG_DISCORD_IMAGE, OG_INVITE_IMAGES } from "../src/site/ogImages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pub = path.join(root, "public");
const MAX_BYTES = 120 * 1024;

const CHIPS = (free, web = "Web") => [free, "Windows", "iPhone", "Android", web];

/** Text per image; keys are site locale ids (file from OG_DEFAULT_IMAGES), plus "discord". */
const COPY = {
  en: {
    headline: "Voice chat, servers and screen share",
    tagline: "For friend groups, gaming squads and communities",
    chips: CHIPS("Free"),
  },
  tr: {
    headline: "Sesli sohbet, sunucular ve ekran paylaşımı",
    tagline: "Arkadaş grupları, oyun ekipleri ve topluluklar için",
    chips: CHIPS("Ücretsiz"),
  },
  de: {
    headline: "Sprachchat, Server und Bildschirmfreigabe",
    tagline: "Für Freundesgruppen, Gaming-Teams und Communitys",
    chips: CHIPS("Kostenlos"),
  },
  es: {
    headline: "Chat de voz, servidores y pantalla compartida",
    tagline: "Para grupos de amigos, equipos de juego y comunidades",
    chips: CHIPS("Gratis"),
  },
  fr: {
    headline: "Chat vocal, serveurs et partage d’écran",
    tagline: "Pour les groupes d’amis, les équipes de jeu et les communautés",
    chips: CHIPS("Gratuit"),
  },
  "pt-BR": {
    headline: "Chat de voz, servidores e compartilhamento de tela",
    tagline: "Para grupos de amigos, equipes de jogo e comunidades",
    chips: CHIPS("Grátis"),
  },
  ru: {
    headline: "Голосовой чат, серверы и демонстрация экрана",
    tagline: "Для друзей, игровых команд и сообществ",
    chips: CHIPS("Бесплатно", "Браузер"),
  },
  discord: {
    lang: "en",
    headline: "Free voice, video and servers",
    tagline: "Group calls, screen share and roles. No membership needed to talk.",
    chips: CHIPS("Free"),
  },
  // Invite links whose server or group has no icon (public/invite-preview.js).
  "invite-en": {
    lang: "en",
    headline: "You're invited to join a community",
    tagline: "Voice chat, servers and screen share with your friends",
    chips: CHIPS("Free to join"),
  },
  "invite-tr": {
    lang: "tr",
    headline: "Bir topluluğa katılmaya davet edildin",
    tagline: "Arkadaşlarınla sesli sohbet, sunucular ve ekran paylaşımı",
    chips: CHIPS("Katılmak ücretsiz"),
  },
};

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean);
  for (const id of tries) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_MODULE to the playwright package directory.");
}

function chromiumPath() {
  const fromEnv = process.env.OG_CHROMIUM;
  if (fromEnv) return fromEnv;
  return fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inner <path> markup of an SVG file, recoloured. */
function svgInner(file, fill) {
  const raw = fs.readFileSync(path.join(pub, "brand", file), "utf8");
  const viewBox = /viewBox="([^"]+)"/.exec(raw)[1];
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/fill="#[0-9A-Fa-f]{3,6}"/g, `fill="${fill}"`);
  return { viewBox, inner };
}

const MARK = svgInner("descall-symbol.svg", "#587AF5");
const WORDMARK = svgInner("descall-wordmark-white.svg", "#FFFFFF");

function template({ lang, headline, tagline, chips }) {
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative; overflow: hidden;
    background: #1B1D26;
    font-family: Inter, "Noto Sans", "Segoe UI", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* Flat shapes, no blurred gradients: smooth gradients dither and double the PNG size. */
  .glow { position: absolute; width: 620px; height: 620px; left: -130px; top: 5px;
    border-radius: 50%; background: #21253A; }
  .glow2 { position: absolute; width: 420px; height: 420px; right: -150px; bottom: -230px;
    border-radius: 50%; background: #1F2233; }
  .wrap { position: absolute; left: 96px; right: 96px; top: 0; bottom: 0;
    display: flex; align-items: center; gap: 56px; }
  .tile { flex: none; width: 184px; height: 184px; border-radius: 44px; background: #393C4D;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.06) inset; }
  .tile svg { width: 116px; height: 116px; }
  .text { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
  .wordmark { height: 84px; width: 363px; display: block; align-self: flex-start; }
  .headline { color: #FFFFFF; font-size: 46px; line-height: 1.12; font-weight: 700; letter-spacing: -0.01em; }
  .tagline { color: #C3C8DB; font-size: 30px; line-height: 1.3; font-weight: 500; }
  .chips { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
  .chip { color: #DCE3FF; background: #393C4D; border-radius: 999px; padding: 9px 20px;
    font-size: 22px; font-weight: 600; }
  .chip.accent { background: #587AF5; color: #FFFFFF; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: #587AF5; }
</style></head>
<body>
  <div class="glow"></div><div class="glow2"></div>
  <div class="wrap">
    <div class="tile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}">${MARK.inner}</svg></div>
    <div class="text">
      <svg class="wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK.viewBox}" role="img" aria-label="Descall">${WORDMARK.inner}</svg>
      <div class="headline">${esc(headline)}</div>
      ${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ""}
      <div class="chips">${chips.map((c, i) => `<span class="chip${i === 0 ? " accent" : ""}">${esc(c)}</span>`).join("")}</div>
    </div>
  </div>
  <div class="bar"></div>
</body></html>`;
}

function jobs(only) {
  const list = Object.entries(COPY).map(([key, copy]) => ({
    key,
    lang: copy.lang || key,
    file: key === "discord" ? OG_DISCORD_IMAGE : key.startsWith("invite-") ? OG_INVITE_IMAGES[key.slice(7)] : OG_DEFAULT_IMAGES[key],
    ...copy,
  }));
  for (const key of Object.keys(OG_DEFAULT_IMAGES)) if (!COPY[key]) throw new Error(`no image copy for ${key}`);
  for (const key of Object.keys(OG_INVITE_IMAGES)) if (!COPY[`invite-${key}`]) throw new Error(`no image copy for invite-${key}`);
  return only ? list.filter((j) => j.key === only) : list;
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || null;
  const todo = jobs(only);
  if (!todo.length) throw new Error(`nothing to render for --only=${only}`);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  let failed = 0;
  try {
    for (const job of todo) {
      await page.setContent(template(job), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const out = path.join(pub, job.file.replace(/^\//, ""));
      await page.screenshot({ path: out, type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
      const bytes = fs.statSync(out).size;
      const over = bytes > MAX_BYTES;
      if (over) failed += 1;
      console.log(`${over ? "TOO BIG" : "ok"}  ${job.file}  ${(bytes / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    console.error(`generate-og-images: ${failed} image(s) over ${MAX_BYTES / 1024} KB`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
