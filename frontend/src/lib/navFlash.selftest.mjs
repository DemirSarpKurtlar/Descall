// Desktop glass: no dark flash when a panel is swapped on navigation.
//   1. The Activity list (lazy) left the sidebar column empty, the dark window
//      background showing through, until React's retry render landed, even
//      when the chunk had been preloaded: a plain lazy() always suspends once.
//   2. The conversation scroll edge (a dark frosted band across the top of the
//      chat panel) faded in and out on every DM / channel switch.
// Run: node src/lib/navFlash.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { preloadableLazy } from "./preloadableLazy.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");

// 1a. preloadableLazy: suspends only until the chunk is in, then renders at once.
{
  let loads = 0;
  const Panel = (props) => createElement("aside", { className: "panel" }, props.label);
  const C = preloadableLazy(() => {
    loads += 1;
    return Promise.resolve({ default: Panel });
  });
  const tree = () => createElement(Suspense, { fallback: createElement("i", null, "fallback") }, createElement(C, { label: "ok" }));
  assert.equal(C.isLoaded(), false);
  assert.match(renderToString(tree()), /fallback/, "not loaded yet: the boundary shows its fallback");
  await C.preload();
  await C.preload();
  assert.equal(loads, 1, "the chunk is requested once");
  assert.equal(C.isLoaded(), true);
  const html = renderToString(tree());
  assert.doesNotMatch(html, /fallback/, "after preload the first render does not suspend");
  assert.match(html, /<aside class="panel">ok<\/aside>/);

  // A failed load can be retried.
  let fail = true;
  const D = preloadableLazy(() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve({ default: Panel })));
  await assert.rejects(D.preload(), /offline/);
  fail = false;
  await D.preload();
  assert.equal(D.isLoaded(), true, "preload retries after a failed chunk load");
}

// 1b. AppLayout uses it for the lazy panels, and the Activity column keeps a
//     frosted panel while the chunk is still loading.
{
  const layout = read("components/layout/AppLayout.jsx");
  assert.match(layout, /const ActivitySidebar = preloadableLazy\(\(\) => import\("\.\.\/activity\/ActivitySidebar"\)\)/);
  assert.match(layout, /const UserPanel = preloadableLazy\(\(\) => import\("\.\/UserPanel"\)\)/);
  assert.match(layout, /preloadWhenIdle\(\[ActivitySidebar\.preload, UserPanel\.preload\]\)/);
  const activity = layout.slice(layout.indexOf('activeView === "activity" ?'), layout.indexOf("<ActivitySidebar"));
  assert.match(activity, /<Suspense fallback=\{<aside className="sidebar-secondary activity-sidebar" aria-busy="true" \/>\}>/,
    "the Activity column falls back to an empty frosted panel, never to nothing");
  const sidebar = read("components/activity/ActivitySidebar.jsx");
  assert.match(sidebar, /<aside className="sidebar-secondary activity-sidebar">/, "fallback uses the panel's own classes");
}

// 2. Scroll edge: decided before paint with no transition on a fresh chrome,
//    and a loading skeleton never counts as "under the pills".
{
  const panel = read("components/layout/ChatPanel.jsx");
  const start = panel.indexOf("Scroll-edge layer shows only once");
  const effect = panel.slice(start, panel.indexOf("}, [floatingHeader, headerConversationKey", start));
  assert.match(effect, /useLayoutEffect\(\(\) => \{/, "first edge decision before paint");
  assert.match(effect, /chrome\.dataset\.edgeInit = "1";\s*sync\(\);/, "the first decision is written with transitions off");
  assert.match(effect, /delete chrome\.dataset\.edgeInit/);
  assert.match(effect, /querySelector\("\.is-loading-skeleton"\)/);
  assert.match(effect, /const under = !loading && scroller\.scrollTop > 2;/);
  assert.match(effect, /new MutationObserver\(schedule\)/, "skeleton -> messages re-checks the edge");
  const list = read("components/chat/MessageList.jsx");
  assert.match(list, /className="message-list is-loading-skeleton"/, "the class ChatPanel looks for");
  const css = read("styles/glass-desktop/floatingHeader.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.chat-top-chrome\[data-edge-init="1"\] \.chat-scroll-edge \{\s*transition: none;\s*\}/);
}

console.log("nav flash selftest ok");
