/**
 * Localized server content (draft C) for readers: the small language marker on text shown
 * translated, the per-message / per-topic "Show original" toggle (remembered for the
 * session, lib/serverL10n.js), and the official message body that uses both. User chat is
 * never translated, so these only appear on the official content of opted-in servers.
 */
import { useSyncExternalStore } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { displayName } from "../../../i18n/format.js";
import { channelTopicL10n, markerCode, messageL10n, originalsVersion, subscribeOriginals, toggleShowingOriginal } from "../../../lib/serverL10n.js";
import MessageContent from "../../chat/MessageContent.jsx";
import "./serverL10n.css";

export function useOriginalsVersion() {
  return useSyncExternalStore(subscribeOriginals, originalsVersion, originalsVersion);
}

/** "PT" pill; its title says the text is a translation and of which original language. */
export function L10nMarker({ locale, sourceLocale, className = "" }) {
  const { t, locale: ui } = useLocale();
  if (!locale) return null;
  const from = sourceLocale ? displayName(sourceLocale, ui, "language") : "";
  const label = from ? t("srvLoc.translatedFrom", { from }) : t("srvLoc.translated");
  return (
    <span className={`sl10n-mark ${className}`.trim()} title={label} aria-label={label} data-testid="sl10n-marker" data-locale={locale}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h9M8.5 3v2M6 5c.6 3.4 2.6 6 5.5 7.5M11 5c-.7 3.6-3 6.6-6.5 8" />
        <path d="M13 21l4-9 4 9M14.4 18h5.2" />
      </svg>
      <span>{markerCode(locale)}</span>
    </span>
  );
}

/** "Show original" / "Show translation" for one message or topic. */
export function ShowOriginalToggle({ info, className = "" }) {
  const { t } = useLocale();
  if (!info?.canToggle) return null;
  return (
    <button
      type="button"
      className={`sl10n-toggle ${className}`.trim()}
      aria-pressed={info.showingOriginal}
      data-testid="sl10n-toggle"
      onClick={(e) => {
        e.stopPropagation();
        toggleShowingOriginal(info.key);
      }}
    >
      {info.showingOriginal ? t("srvLoc.showTranslation") : t("srvLoc.showOriginal")}
    </button>
  );
}

/**
 * The marker of a translated channel topic as a button: tapping it shows the original
 * topic (and back). Renders nothing for a topic that is not translated.
 */
export function TopicMarkerToggle({ channel, sourceLocale }) {
  useOriginalsVersion();
  const { t, locale: ui } = useLocale();
  const info = channelTopicL10n(channel);
  if (!info?.canToggle) return null;
  const from = sourceLocale ? displayName(sourceLocale, ui, "language") : "";
  const label = info.showingOriginal ? t("srvLoc.showTranslation") : t("srvLoc.showOriginal");
  const hint = from ? `${t("srvLoc.translatedFrom", { from })} · ${label}` : label;
  return (
    <button
      type="button"
      className={`sl10n-mark sl10n-mark-btn${info.showingOriginal ? " is-subtle" : ""}`}
      title={hint}
      aria-label={hint}
      aria-pressed={info.showingOriginal}
      data-testid="sl10n-topic-toggle"
      data-locale={info.locale}
      onClick={(e) => {
        e.stopPropagation();
        toggleShowingOriginal(info.key);
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h9M8.5 3v2M6 5c.6 3.4 2.6 6 5.5 7.5M11 5c-.7 3.6-3 6.6-6.5 8" />
        <path d="M13 21l4-9 4 9M14.4 18h5.2" />
      </svg>
      <span>{info.showingOriginal ? markerCode(sourceLocale) || markerCode(info.locale) : markerCode(info.locale)}</span>
    </button>
  );
}

/** Topic paragraph (conversation start): text, marker and "Show original". */
export function TopicWithToggle({ channel, sourceLocale, fallback }) {
  useOriginalsVersion();
  const info = channelTopicL10n(channel);
  if (!info) return fallback;
  return (
    <span className="sl10n-topic-block" data-testid="sl10n-topic">
      <span>{info.text}</span>
      {info.translated ? <L10nMarker locale={info.locale} sourceLocale={sourceLocale} /> : null}
      <ShowOriginalToggle info={info} />
    </span>
  );
}

/**
 * Body of an official message of a localized server: the reader's language version with
 * the marker and the toggle under it. Returns null when the message has no translation,
 * so the caller renders the plain body.
 */
export function OfficialMessageBody({ message, serverL10n, highlight = "", fallback = null }) {
  useOriginalsVersion();
  const { locale } = useLocale();
  const info = messageL10n(message, serverL10n ? { l10n: serverL10n } : null, { readerLocale: locale });
  if (!info) return fallback;
  return (
    <div className="sl10n-msg" data-testid="sl10n-message" data-showing={info.showingOriginal ? "original" : "translation"}>
      <MessageContent text={info.text} highlight={highlight} />
      <div className="sl10n-msg-foot">
        {info.translated ? <L10nMarker locale={info.locale} sourceLocale={serverL10n?.sourceLocale} /> : null}
        <ShowOriginalToggle info={info} />
      </div>
    </div>
  );
}
