/**
 * The info band users see while an admin has an emergency lock on (Güvenlik Merkezi,
 * "Kullanıcılara bilgi bandı göster"): "DM gönderimi geçici olarak kapalı. Yaklaşık
 * 22:40 açılacak." Top center, dismissible per lock (session), polite live region.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { activeNotice, noticeKey, noticeModeFor, usePlatformNotice } from "../../lib/platformNotice.js";
import "../../styles/platform-notice.css";

const DISMISS_KEY = "descall:platform-notice-dismissed";

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return "";
  }
}

export default function PlatformNoticeBanner({ enabled = true }) {
  const { t, locale } = useLocale();
  const notice = usePlatformNotice();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (!notice?.until) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [notice]);

  const live = activeNotice(notice, now);
  const mode = noticeModeFor(live, { signedIn: true });
  const key = noticeKey(live);
  if (!enabled || !mode || dismissed === key || typeof document === "undefined") return null;

  let when = t("secCenter.notice.soon");
  if (live.until) {
    try {
      when = t("secCenter.notice.until", { time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(live.until)) });
    } catch {
      when = t("secCenter.notice.soon");
    }
  }

  return createPortal(
    <div className="pn-band" role="status" aria-live="polite" data-testid="platform-notice">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        {t(`secCenter.notice.${mode}`)} {when}
      </span>
      <button
        type="button"
        className="pn-x"
        aria-label={t("secCenter.notice.dismiss")}
        onClick={() => {
          setDismissed(key);
          try {
            sessionStorage.setItem(DISMISS_KEY, key);
          } catch {
            /* private mode */
          }
        }}
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}
