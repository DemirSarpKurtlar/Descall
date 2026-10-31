import { Video, VideoOff, Phone, PhoneMissed, Users, Clock } from "../ui/Icon.jsx";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatCallWhen } from "../../lib/callHistoryCache";
import { intlLocaleTag } from "../../lib/datetime";
import {
  formatSummaryDuration,
  summaryDurationSeconds,
  summaryParticipantCount,
} from "../../lib/callSummary";

/**
 * WhatsApp-style ended call summary bubble rendered inside the message list.
 */
export default function CallSummaryBubble({ summary }) {
  const t = useT();
  const { locale } = useLocale();
  if (!summary) return null;

  const isVideo = summary.callType === "video";
  const failed = summary.status === "missed" || summary.status === "declined";
  const durationLabel = formatSummaryDuration(summaryDurationSeconds(summary)) || t("< 1s");
  const participantCount = summaryParticipantCount(summary);

  const statusLabel =
    summary.status === "missed"
      ? t("Missed")
      : summary.status === "declined"
        ? t("Declined")
        : summary.status === "cancelled"
          ? t("Cancelled")
          : null;

  const timeLabel = formatCallWhen(summary.endedAt, {
    locale: intlLocaleTag(locale),
    todayLabel: t("Today"),
    yesterdayLabel: t("Yesterday"),
  });

  return (
    <div className="call-summary-wrap">
      <div className={`call-summary-card${failed ? " is-missed" : ""}`}>
        {/* A call that never connected: white glyph on a solid red tile (red on red was unreadable, 3.7.13). */}
        <div className="call-summary-icon">
          {failed
            ? isVideo
              ? <VideoOff size={22} weight="bold" />
              : <PhoneMissed size={22} weight="bold" />
            : isVideo
              ? <Video size={22} />
              : <Phone size={22} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="call-summary-title">
            {isVideo ? t("Video call") : t("Voice call")}
          </div>
          <div className="call-summary-meta">
            {statusLabel ? (
              <span>{statusLabel}</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={11} />
                <span>{durationLabel}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Users size={11} />
              <span>
                {t("{count} participants joined", { count: participantCount })}
              </span>
            </div>
          </div>
          {summary.initiatorUsername && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              {t("Started by {name}", { name: summary.initiatorUsername })}
            </div>
          )}
        </div>

        {timeLabel && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "flex-end", flexShrink: 0 }}>
            {timeLabel}
          </span>
        )}
      </div>
    </div>
  );
}
