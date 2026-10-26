// List headers must not paint a square frosted strip. Run:
// node frontend/src/styles/glass-desktop/headerBand.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function css(name) {
  return readFileSync(join(root, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const chat = css("chat.css");
const header = block(chat, "html.glass-desktop .sidebar-header {");
assert.match(header, /backdrop-filter:\s*none/);
assert.match(header, /background:\s*transparent/);
assert.equal(/container-type:\s*inline-size/.test(header), false);
assert.match(block(chat, "html.glass-desktop .sidebar-inner {"), /container-type:\s*inline-size/);
assert.match(block(chat, "html.glass-desktop .sidebar-header .sidebar-title:not(.server-shell-title) {"), /border-radius:\s*(?:18px|var\(--r-lg\))/);
assert.match(block(chat, "html.glass-desktop .sidebar-header .sidebar-title:not(.server-shell-title) {"), /backdrop-filter:\s*none/);
assert.equal(/backdrop-filter:\s*blur/.test(block(chat, "html.glass-desktop .sidebar-header .sidebar-title:not(.server-shell-title) {")), false);
assert.match(block(chat, "html.glass-desktop .sidebar-actions::before {"), /border-radius:\s*(?:18px|var\(--r-lg\))/);
assert.match(block(chat, "html.glass-desktop .sidebar-actions::before {"), /backdrop-filter:\s*none/);
assert.match(block(chat, "html.glass-desktop .sidebar-actions {"), /backdrop-filter:\s*none/);

const community = css("community.css");
const server = block(community, "html.glass-desktop .server-shell-header {");
assert.match(server, /backdrop-filter:\s*none/);
assert.equal(/container-type:\s*inline-size/.test(server), false);

const surfaces = css("surfaces.css");
const shell = css("shell.css");
assert.match(surfaces, /html\.glass-desktop \.sidebar-secondary,\s*html\.glass-desktop \.sidebar-inner \{[^}]*contain:\s*none !important/);
const liteAt = shell.indexOf("html.glass-desktop.electron-app.gd-lite .nav-rail");
assert.notEqual(liteAt, -1);
const liteSelectors = shell.slice(liteAt, shell.indexOf("{", liteAt));
assert.equal(liteSelectors.includes("sidebar-actions"), false);
assert.equal(liteSelectors.includes("header-identity"), false);
assert.equal(liteSelectors.includes("header-right"), false);
const slabSelectors = surfaces.slice(
  surfaces.indexOf("html.glass-desktop .sidebar-header,"),
  surfaces.indexOf("{", surfaces.indexOf("html.glass-desktop .sidebar-header,")),
);
const slab = block(surfaces, "html.glass-desktop .sidebar-header,");
assert.match(slab, /background:\s*transparent/);
assert.match(slab, /backdrop-filter:\s*none/);
assert.match(slab, /box-shadow:\s*none/);
assert.match(slab, /contain:\s*none !important/);
assert.match(slab, /isolation:\s*auto !important/);
assert.match(slab, /container-type:\s*normal/);
const wrappers = [
  "sidebar-header",
  "sidebar-actions",
  "server-shell-header",
  "activity-view-toolbar",
  "activity-view-header",
  "activity-view-header-left",
  "activity-view-header-actions",
  "members-panel-header",
  "us-main-header",
  "chat-top-chrome",
  "panel-header",
  "header-left",
  "voice-call-header",
];
for (const name of wrappers) {
  assert.ok(slabSelectors.includes(`.${name}`), `wrapper missing from empty-header slab: ${name}`);
}

const convPills = block(chat, "html.glass-desktop .header-identity,");
assert.match(convPills, /border-radius:\s*(?:26px|var\(--r-xl\))/);
assert.match(convPills, /backdrop-filter:\s*none/);
assert.equal(/backdrop-filter:\s*blur/.test(convPills), false);
assert.match(convPills, /box-shadow:\s*inset/);
assert.equal(/0\s+12px\s+32px/.test(convPills), false);
assert.match(block(chat, "html.glass-desktop .header-identity {"), /width:\s*fit-content/);

const wrapperSet = new Set(wrappers);
const pillSet = new Set([
  "header-identity",
  "header-right",
  "sidebar-title",
  "us-icon-btn",
]);

function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === sep || i === text.length) && depth === 0) {
      const part = text.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  return parts;
}

function rulesOf(source) {
  const rules = [];
  function walk(text) {
    let i = 0;
    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length) break;
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const selector = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (selector.startsWith("@media") || selector.startsWith("@supports")) walk(body);
      else if (selector && !selector.startsWith("@")) rules.push({ selector, body });
      i = j;
    }
  }
  walk(source);
  return rules;
}

function subjectOf(selector) {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) last = i + 1;
  }
  return selector.slice(last).trim();
}

function classesOf(subject) {
  return [...subject.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

function decls(body) {
  return splitTop(body, ";").map((part) => {
    const colon = part.indexOf(":");
    if (colon < 0) return null;
    return {
      prop: part.slice(0, colon).trim().toLowerCase(),
      value: part.slice(colon + 1).replace(/!important/gi, "").trim().toLowerCase(),
    };
  }).filter(Boolean);
}

function isClear(value) {
  return /^(transparent|none|unset|initial|inherit|revert|revert-layer)$/.test(value);
}

function shadowsAreInsetOnly(value) {
  if (isClear(value)) return true;
  return splitTop(value, ",").every((part) => part === "none" || part.startsWith("inset"));
}

const files = ["chat.css", "shell.css", "surfaces.css", "community.css", "light.css", "themes.css", "a11y.css", "menus.css", "calls.css", "social.css", "titlebar.css", "auth.css", "material.css", "palette.css", "tokens.css"];
const failures = [];
for (const file of files) {
  for (const rule of rulesOf(css(file))) {
    for (const selector of splitTop(rule.selector, ",")) {
      const subject = subjectOf(selector);
      const classes = classesOf(subject);
      const pseudo = /::(before|after)\b/.test(subject);
      const wrapper = classes.find((name) => wrapperSet.has(name));
      const pill = classes.find((name) => pillSet.has(name));
      const iconPill = classes.includes("sidebar-actions") && /::before\b/.test(subject);
      const isPill = Boolean(pill || iconPill);
      const isWrapper = Boolean(wrapper) && !isPill;
      if (!isWrapper && !isPill) continue;
      for (const { prop, value } of decls(rule.body)) {
        const where = `${file} ${selector.trim()} { ${prop}: ${value} }`;
        if (isWrapper) {
          if ((prop === "background" || prop === "background-color" || prop === "background-image") && !isClear(value)) {
            failures.push(`wrapper background: ${where}`);
          }
          if ((prop === "backdrop-filter" || prop === "-webkit-backdrop-filter") && value !== "none") {
            failures.push(`wrapper backdrop-filter: ${where}`);
          }
          if (prop === "box-shadow" && !isClear(value)) {
            failures.push(`wrapper box-shadow: ${where}`);
          }
          if (pseudo && prop === "content" && value !== "none" && value !== "\"\"" && value !== "''") {
            failures.push(`wrapper pseudo: ${where}`);
          }
        }
        if (isPill) {
          if ((prop === "backdrop-filter" || prop === "-webkit-backdrop-filter") && value !== "none") {
            failures.push(`pill backdrop-filter: ${where}`);
          }
          if (prop === "box-shadow" && !shadowsAreInsetOnly(value)) {
            failures.push(`pill drop-shadow: ${where}`);
          }
        }
      }
    }
  }
}
assert.deepEqual(failures, []);

// 2.11.14 floating conversation header (spec splash-header-2026-10-18 §2).
// The pill blur is allowed only here, and only because the panel frost moved
// to .chat-panel-bg: no ancestor of the pills is a backdrop root any more.
const fh = css("floatingHeader.css");
const index = readFileSync(join(root, "index.css"), "utf8");
assert.ok(index.indexOf('@import "./floatingHeader.css"') > index.indexOf('@import "./surfaces.css"'), "floatingHeader.css loads after surfaces.css");
const slotOff = block(fh, "html.glass-desktop .app-main-slot:has(> .chat-panel-shell > .main-panel.is-floating-header),");
assert.match(slotOff, /backdrop-filter:\s*none !important/);
assert.match(slotOff, /background:\s*transparent !important/);
const panelOff = block(fh, "html.glass-desktop .main-panel.is-floating-header,");
assert.match(panelOff, /backdrop-filter:\s*none !important/);
assert.match(panelOff, /isolation:\s*isolate/);
const bg = block(fh, "html.glass-desktop .main-panel.is-floating-header > .chat-panel-bg {");
assert.match(bg, /backdrop-filter:\s*blur\(var\(--gd-blur-panel\)\)/);
assert.match(bg, /z-index:\s*-1/);
const chrome = block(fh, "html.glass-desktop .main-panel.is-floating-header > .chat-top-chrome {");
assert.match(chrome, /position:\s*absolute/);
const head = block(fh, "html.glass-desktop .main-panel.is-floating-header .panel-header {");
assert.match(head, /border:\s*0 !important/);
assert.equal(/background|box-shadow/.test(head), false, "no band behind the pills");
assert.match(block(fh, "html.glass-desktop .main-panel.is-floating-header > .messages-container {"), /padding-top:\s*var\(--fh-top-space\)/);
const pills = block(fh, "html.glass-desktop .main-panel.is-floating-header .panel-header .header-identity,");
assert.match(pills, /height:\s*var\(--fh-pill-h\)/);
assert.match(pills, /0 8px 24px rgba\(0, 0, 0, 0\.26\)/);
const frost = block(fh, "html.glass-desktop .main-panel.is-floating-header .panel-header .header-identity::before,");
assert.match(frost, /backdrop-filter:\s*blur\(44px\) saturate\(190%\) brightness\(0\.96\)/);
assert.match(frost, /clip-path:\s*inset\(0 round/);
const edge = block(fh, "html.glass-desktop .main-panel.is-floating-header .chat-scroll-edge {");
assert.match(edge, /height:\s*96px/);
assert.match(edge, /backdrop-filter:\s*blur\(18px\) saturate\(160%\)/);
assert.match(edge, /mask-image:\s*linear-gradient\(180deg, #000 0%, #000 38%, rgba\(0, 0, 0, 0\.55\) 66%, transparent 100%\)/);
assert.equal(/border(?!-radius)/.test(edge), false);
assert.match(fh, /--fh-inset:\s*14px/);
// 2.13.1 (Demir, 19 Oct): capsules 48 → 50px so the identity pill holds a 40px
// avatar with an even inset; both capsules keep one shared height.
assert.match(fh, /--fh-pill-h:\s*50px/);
assert.match(fh, /--fh-avatar:\s*40px/);
assert.match(fh, /--fh-avatar-inset:\s*calc\(\(var\(--fh-pill-h\) - var\(--fh-avatar\)\) \/ 2\)/);
const idPill = fh.split("html.glass-desktop .main-panel.is-floating-header .panel-header .header-identity {").slice(1).map((part) => part.slice(0, part.indexOf("}"))).find((body) => /padding:/.test(body)) || "";
assert.match(idPill, /padding:\s*0 20px 0 var\(--fh-avatar-inset\)/);
const avSlot = block(fh, "html.glass-desktop .main-panel.is-floating-header .header-identity .header-avatar,");
assert.match(avSlot, /width:\s*var\(--fh-avatar\)/);
assert.match(avSlot, /height:\s*var\(--fh-avatar\)/);
const avDisc = block(fh, "html.glass-desktop .main-panel.is-floating-header .header-identity .header-avatar .ui-avatar {");
assert.match(avDisc, /width:\s*var\(--fh-avatar\) !important/, "disc size = slot size, never the 40px !important default in a smaller slot");
assert.match(block(fh, "html.glass-desktop .main-panel.is-floating-header .header-identity .header-avatar img,"), /object-fit:\s*cover/);
assert.match(block(fh, "html.glass-desktop .main-panel.is-floating-header .header-identity .header-title-text,"), /text-overflow:\s*ellipsis/);
assert.match(fh, /\.header-block-btn\.active \{\s*color:\s*#ff8a80/);
assert.match(fh, /html\.glass-desktop\.gd-lite \.main-panel\.is-floating-header \.panel-header \.header-identity,[^{]*\{\s*background:\s*var\(--gd-solid\) !important/);
assert.match(fh, /html\.glass-desktop\.gd-contrast \{[^}]*0\.80/);
assert.match(fh, /prefers-contrast:\s*more/);
const panelJsx = readFileSync(join(root, "../../components/layout/ChatPanel.jsx"), "utf8");
assert.match(panelJsx, /"main-panel is-floating-header"/);
assert.match(panelJsx, /<div className="chat-panel-bg" aria-hidden="true" \/>/);
assert.match(panelJsx, /<div className="chat-scroll-edge" aria-hidden="true" \/>/);
assert.match(panelJsx, /chrome\.dataset\.scrolled/);
// Mockup #29/#30: DM header is one pill (search, pin, call, video, block) with no "⋯".
assert.equal((panelJsx.match(/className="header-actions-sep"/g) || []).length, 1);
assert.match(panelJsx, /\{headerDm \? null : <span className="header-actions-sep"/);
assert.doesNotMatch(panelJsx, /header-more-btn|dm-header-more/);
assert.match(panelJsx, /className=\{`icon-btn header-block-btn\$\{dmBlockedByMe \? " active" : ""\}`\}/);
assert.match(panelJsx, /\(headerDm \|\| headerGroup \|\| \(activeView === "servers"/);

console.log("headerBand.selftest ok");
