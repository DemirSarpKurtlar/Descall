import { useState } from "react";
import { Megaphone } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import AnnouncementsSheet, { useAnnouncements } from "../announcements/AnnouncementsSheet.jsx";

/**
 * Megaphone button of the Activity toolbar / sidebar: the same announcements
 * window as the chats sidebar (components/announcements), with the unread badge.
 */
export default function AnnouncementsButton({ className = "icon-btn", iconSize = 18 }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const { unread } = useAnnouncements();
  const label = unread ? t("annc.u.buttonUnread", { n: unread }) : t("Announcements");
  return (
    <>
      <button type="button" className={`${className} ann-btn-host`.trim()} title={label} aria-label={label} onClick={() => setOpen(true)}>
        <Megaphone size={iconSize} />
        {unread ? <span className="ann-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      <AnnouncementsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
