import { useState } from "react";
import { Compass, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import "../../styles/server-directory.css";

const DISMISS_KEY = "descall:dir-suggest-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Non-blocking nudge for someone in no server yet (item 8): one card under the empty
 * server list that opens Discover. "Not now" hides it on this device.
 */
export default function DirectorySuggestCard({ onDiscover }) {
  const t = useT();
  const [hidden, setHidden] = useState(readDismissed);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode: hidden for this session only */
    }
  };
  return (
    <section className="dir-suggest" aria-labelledby="dir-suggest-title">
      <span className="dir-suggest-icon" aria-hidden="true">
        <Compass size={20} />
      </span>
      <div className="dir-suggest-copy">
        <h4 id="dir-suggest-title">{t("dir.suggest.title")}</h4>
        <p>{t("dir.suggest.body")}</p>
        <button type="button" className="server-primary-btn sm" onClick={onDiscover}>
          {t("dir.suggest.cta")}
        </button>
      </div>
      <button type="button" className="icon-btn dir-suggest-close" onClick={dismiss} aria-label={t("dir.suggest.dismiss")} title={t("dir.suggest.dismiss")}>
        <X size={16} />
      </button>
    </section>
  );
}
