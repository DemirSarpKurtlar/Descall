// Run: node src/styles/presenceToast.selftest.mjs
// Friend-online toast (3.1.2): only on demand, top right under the chat header
// pills, in the theme glass; no permanent "online friends" card on the chat home.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("./presence-toast.css");
const ctx = read("../context/ToastContext.jsx");
const app = read("../App.jsx");
const chat = read("../components/layout/ChatPanel.jsx");

// Own stack, below the header pills (not over them), under the Electron title bar.
assert.match(css, /\.presence-toasts \{[\s\S]*?top: 84px;[\s\S]*?right: 24px;/);
assert.match(css, /body\.electron-app \.presence-toasts \{\s*top: calc\(var\(--electron-titlebar-h, 40px\) \+ 84px\);/);
// Theme material under glass-desktop + opaque fallbacks.
assert.match(css, /html\.glass-desktop \.presence-toast \{[\s\S]*?var\(--gd-glass-fill\)/);
assert.match(css, /html\.a11y-solid \.presence-toast/);
assert.match(css, /prefers-reduced-motion/);
// Not in the generic .toast-item frost list (that dark slab was the "not themed" look).
assert.doesNotMatch(ctx, /className="toast-item toast-presence"/);
assert.match(ctx, /className=\{`presence-toast\$\{open \? " is-actionable" : ""\}`\}/);
assert.match(ctx, /toasts\.filter\(\(t\) => t\.type !== "presence"\)/);
// Click opens the DM with that friend.
assert.match(app, /subtitle: t\("is now online"\),[\s\S]{0,120}onOpen: \(\) => navigate\(directPath\(first\)\)/);
// No permanent card on the chat home any more.
assert.equal(existsSync(new URL("../components/activity/ActiveNowPanel.jsx", import.meta.url)), false);
assert.doesNotMatch(chat, /ActiveNowPanel|has-active-now/);
console.log("presenceToast.selftest ok");
