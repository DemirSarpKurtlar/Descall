import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import Modal from "./ui/Modal";
import pkg from "../../package.json";

/**
 * User-facing release notes (EN keys; TR via locale files).
 * Keep copy simple, no internal/Demir notes, no emoji spam.
 * Every new semver should add an entry here.
 */
export const UPDATE_NOTES = [
  {
    version: "2.9.37",
    titleKey: "updateNotes.v2937.title",
    bodyKey: "updateNotes.v2937.body",
  },
  {
    version: "2.9.38",
    titleKey: "updateNotes.v2938.title",
    bodyKey: "updateNotes.v2938.body",
  },
  {
    version: "2.9.39",
    titleKey: "updateNotes.v2939.title",
    bodyKey: "updateNotes.v2939.body",
  },
  {
    version: "2.9.48",
    titleKey: "updateNotes.v2948.title",
    bodyKey: "updateNotes.v2948.body",
  },
];

/**
 * 3.0.1: the "what's new in 3.0" list opened on demand by the App Store
 * in-app event deep link (descall://whats-new, /app/whats-new). Same copy as
 * the 3.0.0 App Store "What's New". Not part of the first-open popup.
 */
export const RELEASE_3_0_VERSION = "3.0";
export const RELEASE_3_0_NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
  version: RELEASE_3_0_VERSION,
  titleKey: `updateNotes.v300.n${n}.title`,
  bodyKey: `updateNotes.v300.n${n}.body`,
}));

export const OPEN_WHATS_NEW_EVENT = "descall:open-whats-new";

/** Open the 3.0 notes (deep link target). */
export function openWhatsNew() {
  if (typeof window === "undefined") return;
  try {
    window.__descallWhatsNewPending = true;
    window.dispatchEvent(new CustomEvent(OPEN_WHATS_NEW_EVENT));
  } catch {
    /* ignore */
  }
}

const LAST_SEEN_KEY = "descall:last-seen-version";

export function cmpVer(a, b) {
  const pa = String(a || "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

async function resolveAppVersion() {
  try {
    if (typeof window !== "undefined" && window.electronAPI?.getVersion) {
      const v = await window.electronAPI.getVersion();
      if (v) return String(v).replace(/^v/i, "");
    }
  } catch {
    /* fall through */
  }
  try {
    const fromPkg = pkg?.version;
    if (fromPkg) return String(fromPkg).replace(/^v/i, "");
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * First-open what's-new on Electron + desktop web + mobile web.
 * If the user skipped versions, show ALL missed notes in ONE polished modal.
 * One-shot per version via localStorage lastSeenVersion.
 */
export default function UpdateNotes() {
  const t = useT();
  const [missed, setMissed] = useState([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [release, setRelease] = useState(false);
  const releaseRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const show = () => {
      window.__descallWhatsNewPending = false;
      releaseRef.current = true;
      setRelease(true);
      setMissed(RELEASE_3_0_NOTES);
      setOpen(true);
    };
    window.addEventListener(OPEN_WHATS_NEW_EVENT, show);
    if (window.__descallWhatsNewPending) show();
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, show);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;

    (async () => {
      const ver = await resolveAppVersion();
      if (!ver || cancelled) return;
      setCurrent(ver);

      let last = "";
      try {
        last = localStorage.getItem(LAST_SEEN_KEY) || "";
      } catch {
        last = "";
      }

      if (!last) {
        try {
          localStorage.setItem(LAST_SEEN_KEY, ver);
        } catch {
          /* ignore */
        }
        return;
      }

      const list = UPDATE_NOTES.filter(
        (n) => cmpVer(n.version, last) > 0 && cmpVer(n.version, ver) <= 0,
      );
      if (!list.length) {
        try {
          localStorage.setItem(LAST_SEEN_KEY, ver);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!cancelled && !releaseRef.current) {
        setMissed(list);
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    if (release) return t("updateNotes.v300.title");
    if (missed.length === 1) {
      return t("What's new in {version}", { version: missed[0].version });
    }
    return t("updateNotes.stackedTitle", {
      count: missed.length,
      version: current || missed[missed.length - 1]?.version || "",
    });
  }, [missed, current, release, t]);

  const dismiss = () => {
    setOpen(false);
    releaseRef.current = false;
    setRelease(false);
    try {
      if (current) localStorage.setItem(LAST_SEEN_KEY, current);
    } catch {
      /* ignore */
    }
  };

  if (!missed.length) return null;

  return (
    <Modal open={open} onClose={dismiss} title={title} wide className="update-notes-dialog">
      <div className="update-notes-modal">
        <p className="update-notes-lead">{t(release ? "updateNotes.v300.lead" : "updateNotes.lead")}</p>
        <ol className="update-notes-list">
          {missed.map((n) => (
            <li key={n.titleKey} className="update-notes-item">
              {release ? null : <div className="update-notes-version">v{n.version}</div>}
              <div className="update-notes-item-title">{t(n.titleKey)}</div>
              <p className="update-notes-item-body">{t(n.bodyKey)}</p>
            </li>
          ))}
        </ol>
        <div className="update-notes-actions">
          <button type="button" className="update-notes-done" onClick={dismiss}>
            {t("updateNotes.gotIt")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
