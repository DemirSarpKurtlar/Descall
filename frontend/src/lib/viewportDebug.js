/**
 * On-device viewport readout for mobile web (?vpdebug=1, ?vpdebug=0 to turn
 * off). Shows what the tab bar logic sees on a real iPhone: innerHeight, the
 * visual viewport, the fixed-box bottom, dvh/lvh/svh, the keyboard classes and
 * where the tab bar actually is. Read-only, pointer-events: none.
 */
const KEY = "descall:vpdebug";

export function viewportDebugWanted(search = "", store = null) {
  const m = /[?&]vpdebug=([01])/.exec(String(search || ""));
  try {
    if (m && store) {
      if (m[1] === "1") store.setItem(KEY, "1");
      else store.removeItem(KEY);
    }
    if (m) return m[1] === "1";
    return store?.getItem?.(KEY) === "1";
  } catch {
    return Boolean(m && m[1] === "1");
  }
}

function probe(css) {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;${css}`;
  document.body.appendChild(el);
  return el;
}

export function installViewportDebug() {
  if (typeof document === "undefined" || !document.body || document.querySelector("[data-vpdebug]")) return;
  const panel = document.createElement("div");
  panel.dataset.vpdebug = "";
  panel.setAttribute("aria-hidden", "true");
  panel.style.cssText = [
    "position:fixed", "z-index:2147483000", "pointer-events:none",
    "top:calc(env(safe-area-inset-top, 0px) + 4px)", "left:8px", "right:8px",
    "padding:8px 10px", "border-radius:14px",
    "background:rgba(12,14,20,0.86)",
    "-webkit-backdrop-filter:blur(40px) saturate(160%)", "backdrop-filter:blur(40px) saturate(160%)",
    "box-shadow:inset 0 0 0 0.5px rgba(255,255,255,0.22)",
    "color:#e8ecf4", "font:11px/1.35 ui-monospace,Menlo,monospace", "white-space:pre-wrap",
  ].join(";");
  document.body.appendChild(panel);
  const fixedBox = probe("bottom:0");
  const dvh = probe("height:100dvh");
  const lvh = probe("height:100lvh");
  const svh = probe("height:100svh");
  const bundle = [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-/.test(s)) || "?";

  const tick = () => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const bar = document.querySelector(".g-tabbar, .mobile-tab-bar");
    const a = document.activeElement;
    let barLine = "tabbar: not in DOM";
    if (bar) {
      const r = bar.getBoundingClientRect();
      const bs = getComputedStyle(bar);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      barLine = `tabbar: ${Math.round(r.top)}-${Math.round(r.bottom)} disp=${bs.display} op=${bs.opacity} z=${bs.zIndex}` +
        ` hit=${hit ? (bar.contains(hit) ? "bar" : String(hit.className || hit.tagName).slice(0, 24)) : "none"}`;
    }
    panel.textContent = [
      `bundle ${bundle.split("/").pop()}`,
      `inner ${window.innerWidth}x${window.innerHeight} vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} top=${Math.round(vv.offsetTop)}` : "none"}`,
      `fixed ${Math.round(fixedBox.getBoundingClientRect().bottom)} dvh ${Math.round(dvh.offsetHeight)} lvh ${Math.round(lvh.offsetHeight)} svh ${Math.round(svh.offsetHeight)}`,
      `--vv-height ${cs.getPropertyValue("--vv-height").trim() || "-"} lift ${cs.getPropertyValue("--g-vv-lift").trim() || "-"}`,
      `classes ${["kb-open", "kb-bar-hidden", "native-tabbar", "native-app", "glass-ui"].filter((c) => root.classList.contains(c)).join(" ") || "-"}`,
      `focus ${a && a !== document.body ? `${a.tagName}${a.isContentEditable ? "[ce]" : ""}` : "none"}`,
      barLine,
    ].join("\n");
  };
  tick();
  setInterval(tick, 300);
}
