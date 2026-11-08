import { ActivityTypeIcon } from "../../lib/shopIcons";
import { useLocale, useT } from "../../context/localeContextInstance";
import { formatActivityRange } from "../../../backend/lib/activitySessions.mjs";
import { parseActivityLabel } from "../../lib/activityStats.js";

const TYPE_COLOR = {
  game: "#23a55a",
  music: "#1db954",
  dev: "#587af5",
  creative: "#eb459e",
  browser: "#4f9ef8",
  media: "#f0b232",
  manual: "#587af5",
  app: "#747f8d",
};

/** "Playing X" / "Using X" / ... in the reader's language; a custom status stays as typed. */
export function localizeActivityLabel(label, t) {
  if (typeof t !== "function") return label || "";
  const { verb, name } = parseActivityLabel(label);
  return verb ? t(`act.label.${verb}`, { name }) : (label || "");
}

function formatDuration(seconds) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelativeTime(dateStr, t) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return t("{count}d ago", { count: d });
  if (h > 0) return t("{count}h ago", { count: h });
  if (m > 0) return t("{count}m ago", { count: m });
  return t("just now");
}

export default function ActivityHistoryRow({ entry }) {
  const t = useT();
  const { locale } = useLocale();
  const accentColor = TYPE_COLOR[entry.app_type] || "#747f8d";
  const label = localizeActivityLabel(entry.display_name || entry.displayName, t);
  const range = formatActivityRange(entry.started_at, entry.ended_at, locale);
  const relative = formatRelativeTime(entry.started_at, t);
  const when = range ? `${relative} · ${range}` : relative;

  return (
    <div className="activity-history-row">
      <div className="activity-history-icon" style={{ color: accentColor }}>
        <ActivityTypeIcon type={entry.app_type} size={18} />
      </div>
      <div className="activity-history-info">
        <span className="activity-history-name">{label}</span>
        <span className="activity-history-time" title={when}>{when}</span>
      </div>
      <div className="activity-history-duration">
        {formatDuration(entry.duration_sec)}
      </div>
    </div>
  );
}
