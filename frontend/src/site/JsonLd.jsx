import { useEffect } from "react";

export {
  buildOrganizationLd,
  buildWebSiteLd,
  buildSoftwareApplicationLd,
  buildFaqLd,
  buildBreadcrumbLd,
  buildArticleLd,
  buildDiscordAlternativeAppLd,
  buildPersonLd,
  buildEntityGraphLd,
  buildOwnershipWebPageLd,
} from "./jsonLdBuilders.js";

const SCRIPT_ID = "descall-jsonld";
const PRERENDERED = 'script[type="application/ld+json"][data-prerendered-jsonld]';

function barePath(pathname) {
  const p = String(pathname || "/");
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/** Inject one or more JSON-LD graphs into <head>. */
export default function JsonLd({ data }) {
  useEffect(() => {
    // SEO 3.7.14: the prerendered page already carries the full JSON-LD for
    // this URL. Adding ours too doubled FAQPage / BreadcrumbList (Search
    // Console duplicate warnings). Keep the prerendered graphs on their own
    // page; after a client navigation they describe another page, so drop them.
    if (typeof document !== "undefined") {
      const here = barePath(window.location.pathname);
      const pre = [...document.querySelectorAll(PRERENDERED)];
      if (pre.length && pre.every((el) => barePath(el.getAttribute("data-prerendered-jsonld")) === here)) {
        document.getElementById(SCRIPT_ID)?.remove();
        return undefined;
      }
      for (const el of pre) el.remove();
    }
    const graphs = Array.isArray(data) ? data : [data];
    const payload = graphs.filter(Boolean);
    let el = document.getElementById(SCRIPT_ID);
    if (!payload.length) {
      el?.remove();
      return undefined;
    }
    if (!el) {
      el = document.createElement("script");
      el.id = SCRIPT_ID;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
    return () => {
      el?.remove();
    };
  }, [data]);

  return null;
}
