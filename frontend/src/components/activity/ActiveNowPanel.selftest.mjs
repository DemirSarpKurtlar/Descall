// Run: node src/components/activity/ActiveNowPanel.selftest.mjs
// "Şu an aktif" panel: elapsed labels, wiring into the chat home, theme material.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "ActiveNowPanel.jsx"), "utf8");
const chat = readFileSync(join(here, "../layout/ChatPanel.jsx"), "utf8");
const css = readFileSync(join(here, "../../styles/active-now.css"), "utf8");
const tr = readFileSync(join(here, "../../i18n/locales/tr.js"), "utf8");
const en = readFileSync(join(here, "../../i18n/locales/en.js"), "utf8");

// activeFor is pure; evaluate it without React.
const body = src.slice(src.indexOf("export function activeFor"), src.indexOf("function useMinuteClock"));
const activeFor = new Function(`${body.replace("export function", "function")}; return activeFor;`)();
const t = (k, v = {}) => `${k}|${Object.values(v).join(",")}`;
const now = Date.parse("2026-10-30T12:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
assert.equal(activeFor(ago(0.2), now, t), "activeNow.justNow|");
assert.equal(activeFor(ago(12), now, t), "activeNow.minutes|12");
assert.equal(activeFor(ago(60), now, t), "activeNow.hours|1");
assert.equal(activeFor(ago(83), now, t), "activeNow.hoursMinutes|1,23");
assert.equal(activeFor(null, now, t), "");
assert.equal(activeFor(new Date(now + 60000).toISOString(), now, t), "", "future start shows nothing");

// Same lists as the Activity sidebar, so the two never disagree.
assert.match(src, /useOnlinePresenceLists\(friends, friendPresence, onlineUsers\)/);
// Chat home only, desktop/web only, never over an open conversation.
assert.match(chat, /const showActiveNow = !isMobile && !activeDmUser && !activeGroup/);
assert.match(chat, /<ActiveNowPanel[\s\S]*?onSelect=\{onStartDm\}/);
// Theme material = the chat list / user panel glass under glass-desktop, opaque fallbacks.
assert.match(css, /html\.glass-desktop \.active-now \{[\s\S]*?var\(--gd-glass-fill\)/);
assert.match(css, /html\.a11y-solid \.active-now/);
assert.match(css, /@container chat-home \(max-width: 599\.98px\) \{\s*\.active-now \{ display: none; \}/);

for (const k of ["title", "emptyTitle", "emptyBody", "justNow", "minutes", "hours", "hoursMinutes", "more"]) {
  assert.ok(tr.includes(`"${k}":`) && en.includes(`"${k}":`), `locale activeNow.${k}`);
}
console.log("ActiveNowPanel.selftest ok");
