import { useEffect, useMemo, useState } from "react";
import { useT } from "../context/LocaleContext";
import Modal from "./ui/Modal";
import pkg from "../../package.json";

/**
 * User-facing release notes (EN keys; TR via locale files).
 * Keep copy simple — no internal/Demir notes, no emoji spam.
 * Every new semver should add an entry here.
 */
export const UPDATE_NOTES = [
  {
    version: "2.9.36",
    titleKey: "updateNotes.v2936.title",
    bodyKey: "updateNotes.v2936.body",
  },
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
    version: "2.9.40",
    titleKey: "updateNotes.v2940.title",
    bodyKey: "updateNotes.v2940.body",
  },
  {
    version: "2.9.41",
    titleKey: "updateNotes.v2941.title",
    bodyKey: "updateNotes.v2941.body",
  },
  {
    version: "2.9.42",
    titleKey: "updateNotes.v2942.title",
    bodyKey: "updateNotes.v2942.body",
  },
  {
    version: "2.9.43",
    titleKey: "updateNotes.v2943.title",
    bodyKey: "updateNotes.v2943.body",
  },
  {
    version: "2.9.44",
    titleKey: "updateNotes.v2944.title",
    bodyKey: "updateNotes.v2944.body",
  },
  {
    version: "2.9.45",
    titleKey: "updateNotes.v2945.title",
    bodyKey: "updateNotes.v2945.body",
  },
  {
    version: "2.9.46",
    titleKey: "updateNotes.v2946.title",
    bodyKey: "updateNotes.v2946.body",
  },
  {
    version: "2.9.47",
    titleKey: "updateNotes.v2947.title",
    bodyKey: "updateNotes.v2947.body",
  },
];

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
      if (!cancelled) {
        setMissed(list);
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    if (missed.length === 1) {
      return t("What's new in {version}", { version: missed[0].version });
    }
    return t("updateNotes.stackedTitle", {
      count: missed.length,
      version: current || missed[missed.length - 1]?.version || "",
    });
  }, [missed, current, t]);

  const dismiss = () => {
    setOpen(false);
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
        <p className="update-notes-lead">{t("updateNotes.lead")}</p>
        <ol className="update-notes-list">
          {missed.map((n) => (
            <li key={n.version} className="update-notes-item">
              <div className="update-notes-version">v{n.version}</div>
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
