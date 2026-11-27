import { useEffect, useState } from "react";
import { fetchLiveSnippets } from "../../../api/adaptiveSignup.js";

const REFRESH_MS = 60 * 1000;
let lastGood = null; // survives a remount (card -> 2FA -> back)

/**
 * Live snippets around the sign-up card (GET /api/public-pages/live). Loaded after the card
 * is on screen (never delays it), refreshed every minute while the page is visible, the last
 * good answer kept when offline. null until the first answer; { servers: [], ... } when
 * there is nothing public to show.
 */
export default function useLiveSnippets({ enabled = true, delayMs = 400, fetcher = fetchLiveSnippets } = {}) {
  const [data, setData] = useState(lastGood);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let timer = null;
    let ctl = null;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(load, REFRESH_MS);
        return;
      }
      ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      try {
        const next = await fetcher({ signal: ctl?.signal });
        if (alive && next && typeof next === "object") {
          lastGood = { servers: Array.isArray(next.servers) ? next.servers : [], platform: next.platform || {}, builtAt: next.builtAt || null };
          setData(lastGood);
        }
      } catch {
        /* keep the last answer */
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };
    timer = setTimeout(load, delayMs);
    return () => {
      alive = false;
      clearTimeout(timer);
      ctl?.abort();
    };
  }, [enabled, delayMs, fetcher]);
  return data;
}

/** Tests only. */
export function __resetLiveSnippets() {
  lastGood = null;
}
