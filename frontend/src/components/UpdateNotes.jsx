import { useEffect } from "react";
import { useToast } from "../context/ToastContext";
import { useT } from "../context/LocaleContext";

const NOTES = [
  {
    version: "2.9.5",
    body: "Updates download in the background without stealing focus.",
  },
  {
    version: "2.9.6",
    body: "Your session is remembered so you stay signed in.",
  },
];

function cmpVer(a, b) {
  const pa = String(a || "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * After a desktop update, stack dismissible Descall cards for missed versions.
 * Does not focus the window. First install stores the current version silently.
 */
export default function UpdateNotes() {
  const { toast } = useToast();
  const t = useT();

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return undefined;
    let cancelled = false;

    (async () => {
      let current = "";
      try {
        current = (await window.electronAPI.getVersion?.()) || "";
      } catch {
        current = "";
      }
      if (!current || cancelled) return;
      const key = "descall:last-seen-version";
      let last = "";
      try {
        last = localStorage.getItem(key) || "";
      } catch {
        last = "";
      }
      if (!last) {
        try { localStorage.setItem(key, current); } catch { /* ignore */ }
        return;
      }
      const missed = NOTES.filter((n) => cmpVer(n.version, last) > 0 && cmpVer(n.version, current) <= 0);
      if (!missed.length) {
        try { localStorage.setItem(key, current); } catch { /* ignore */ }
        return;
      }
      missed.forEach((n) => {
        toast(
          `${t("What's new in {version}", { version: n.version })} — ${t(n.body)}`,
          "info",
          { duration: 0 },
        );
      });
      try { localStorage.setItem(key, current); } catch { /* ignore */ }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  return null;
}
