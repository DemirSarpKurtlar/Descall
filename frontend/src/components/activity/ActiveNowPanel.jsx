/**
 * "Şu an aktif" (3.1): the friends who are online right now, top right of the
 * chat home (no conversation open). Friends doing something (game, music, app)
 * come first with what they are doing; the rest of the online friends follow.
 * Desktop/web only; phones keep the Activity tab. Same lists as ActivitySidebar
 * (useOnlinePresenceLists), so the two never disagree.
 */
import { useEffect, useState } from "react";
import { Zap } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { ActivityTypeIcon } from "../../lib/shopIcons";
import { getPresenceStatus, STATUS_META } from "../../lib/presence";
import { useT } from "../../context/LocaleContext";
import { localizeActivityLabel } from "./ActivityHistoryRow";
import { useOnlinePresenceLists } from "./ActivitySidebar";
import "../../styles/active-now.css";

const IDLE_LIMIT = 8;

/** "12 dk" / "1 sa 5 dk" since startedAt; "" when unknown or in the future. */
export function activeFor(startedAt, now, t) {
  const start = Date.parse(startedAt || "");
  if (!Number.isFinite(start) || start > now) return "";
  const min = Math.floor((now - start) / 60000);
  if (min < 1) return t("activeNow.justNow");
  if (min < 60) return t("activeNow.minutes", { m: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t("activeNow.hoursMinutes", { h, m }) : t("activeNow.hours", { h });
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function nameOf(friend) {
  return friend.displayName || friend.display_name || friend.username || "";
}

export default function ActiveNowPanel({ friends, friendPresence, onlineUsers, onSelect }) {
  const t = useT();
  const now = useMinuteClock();
  const { active, idle, onlineCount } = useOnlinePresenceLists(friends, friendPresence, onlineUsers);
  const idleShown = idle.slice(0, IDLE_LIMIT);
  const idleMore = idle.length - idleShown.length;

  return (
    <aside className="active-now" aria-label={t("activeNow.title")}>
      <header className="active-now-head">
        <h3>{t("activeNow.title")}</h3>
        {onlineCount > 0 ? <span className="active-now-count tnum">{onlineCount}</span> : null}
      </header>

      {onlineCount === 0 ? (
        <div className="active-now-empty">
          <span className="active-now-empty-icon" aria-hidden="true"><Zap size={20} /></span>
          <b>{t("activeNow.emptyTitle")}</b>
          <span>{t("activeNow.emptyBody")}</span>
        </div>
      ) : (
        <div className="active-now-scroll">
          {active.length > 0 ? (
            <ul className="active-now-list">
              {active.map(({ friend, presence }) => {
                const since = activeFor(presence.startedAt, now, t);
                return (
                  <li key={friend.id}>
                    <button type="button" className="active-now-card" onClick={() => onSelect?.(friend)}>
                      <span className="active-now-av">
                        <Avatar name={nameOf(friend)} user={friend} size={40} animate="none" />
                        <StatusBadge status={getPresenceStatus(onlineUsers, friend.id)} />
                      </span>
                      <span className="active-now-tx">
                        <b>{nameOf(friend)}</b>
                        <span className="active-now-app">
                          <ActivityTypeIcon type={presence.appType} size={14} />
                          <span>{localizeActivityLabel(presence.displayName, t)}</span>
                        </span>
                        {since ? <span className="active-now-since">{since}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {idleShown.length > 0 ? (
            <>
              <div className="active-now-label">{t("Online, {count}", { count: idle.length })}</div>
              <ul className="active-now-idle">
                {idleShown.map(({ friend }) => {
                  const status = getPresenceStatus(onlineUsers, friend.id);
                  return (
                    <li key={friend.id}>
                      <button type="button" className="active-now-row" onClick={() => onSelect?.(friend)}>
                        <span className="active-now-av is-small">
                          <Avatar name={nameOf(friend)} user={friend} size={30} animate="none" />
                          <StatusBadge status={status} />
                        </span>
                        <b>{nameOf(friend)}</b>
                        <span className="active-now-st">{t((STATUS_META[status] || STATUS_META.online).label)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {idleMore > 0 ? <div className="active-now-more">{t("activeNow.more", { n: idleMore })}</div> : null}
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}
